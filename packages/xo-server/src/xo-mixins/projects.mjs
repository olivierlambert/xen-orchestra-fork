// @ts-check

import { randomBytes } from 'node:crypto'
import { forbiddenOperation, invalidParameters, noSuchObject } from 'xo-common/api-errors.js'

import { Offerings, Organizations, Projects } from '../models/projects.mjs'
import {
  getProjectRolePrivileges,
  hasProjectRole,
  makeKeyedLock,
  ORGANIZATION_ROLES,
  PROJECT_ROLE_LABELS,
  PROJECT_ROLES,
  QUOTA_KEYS,
  computeProjectUsage,
  estimateVmResources,
  getExceededQuotas,
} from './_projects.mjs'

/**
 * @typedef {typeof PROJECT_ROLES[number]} ProjectRole
 * @typedef {typeof ORGANIZATION_ROLES[number]} OrganizationRole
 * @typedef {Partial<Record<typeof QUOTA_KEYS[number], number>>} Quota
 * @typedef {{
 *   pools: string[],
 *   templates: string[],
 *   networks: string[],
 *   srs: string[],
 *   offerings: string[],
 *   ipPools: string[],
 *   backupJobs: string[],
 * }} Scope
 * @typedef {{
 *   id: string,
 *   name: string,
 *   family: string,
 *   cpus: number,
 *   memory: number,
 *   disk: number,
 *   pricePerHour: number,
 * }} Offering
 * @typedef {{
 *   id: string,
 *   name: string,
 *   members: Record<string, OrganizationRole>,
 *   adminGroupId: string,
 *   suspended?: { at: number, reason: string, projectMembers: Record<string, Record<string, ProjectRole>> },
 * }} Organization
 * @typedef {{
 *   id: string,
 *   organizationId: string,
 *   name: string,
 *   description: string,
 *   quota: Quota,
 *   scope: Scope,
 *   roleIds: Record<ProjectRole, string>,
 * }} Project
 * @typedef {{ id: string, permission: string }} User
 */

/**
 * XO group names are unique, organization names do not have to be
 *
 * @param {{ id: string, name: string }} organization
 */
const adminGroupName = ({ id, name }) => `${name}: organization admins (${id.slice(0, 8)})`

const EMPTY_SCOPE = { pools: [], templates: [], networks: [], srs: [], offerings: [], ipPools: [], backupJobs: [] }

/**
 * @param {unknown} quota
 * @returns {Quota}
 */
function normalizeQuota(quota = {}) {
  /** @type {Quota} */
  const normalized = {}
  for (const key of QUOTA_KEYS) {
    const value = /** @type {Record<string, unknown>} */ (quota)[key]
    if (value === undefined || value === null) {
      continue
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw invalidParameters(`quota.${key} must be a positive integer`)
    }
    normalized[key] = value
  }
  return normalized
}

/**
 * @param {Partial<Scope>} [scope]
 * @returns {Scope}
 */
function normalizeScope(scope = {}) {
  return { ...EMPTY_SCOPE, ...scope }
}

/**
 * Tenant model: an organization (a customer) owns projects, a project owns instances and has a quota.
 *
 * Permissions inside a project are plain ACL v2 roles, generated per project and scoped to the objects owned
 * by the project with a `$project` selector. Organization admins are members of an XO group generated per
 * organization, to which the admin role of every project of the organization is attached. Ownership is recorded by XO in the objects `other_config` when
 * they are created through the project, and cannot be changed by tenants.
 */
export default class Projects_ {
  /** @type {Organizations} */
  // @ts-ignore initialized in core-started
  #organizations

  /** @type {Projects} */
  // @ts-ignore initialized in core-started
  #projects

  /** @type {Offerings} */
  // @ts-ignore initialized in core-started
  #offerings

  #withProjectLock = makeKeyedLock()

  /**
   * @param {any} app
   */
  constructor(app) {
    this._app = app

    app.hooks.on('core started', () => {
      const organizations = new Organizations({
        connection: app._redis,
        namespace: 'organization',
        crypto: app.cryptoCredentials,
      })
      this.#organizations = organizations

      const projects = new Projects({
        connection: app._redis,
        namespace: 'project',
        // @ts-ignore indexes typed as never[]
        indexes: ['organizationId'],
        crypto: app.cryptoCredentials,
      })
      this.#projects = projects

      const offerings = new Offerings({
        connection: app._redis,
        namespace: 'offering',
        crypto: app.cryptoCredentials,
      })
      this.#offerings = offerings

      app.addConfigManager(
        'organizations',
        () => organizations.get(),
        (/** @type {Organization[]} */ records) => organizations.update(records),
        ['users']
      )
      app.addConfigManager(
        'offerings',
        () => offerings.get(),
        (/** @type {Offering[]} */ records) => offerings.update(records)
      )
      app.addConfigManager(
        'projects',
        () => projects.get(),
        (/** @type {Project[]} */ records) => projects.update(records),
        ['organizations', 'roles', 'offerings']
      )
    })

    app.hooks.on('clean', () => this.#projects.rebuildIndexes())
    app.hooks.on('start', () => this.#syncProjectRoles())
  }

  // === Organization

  /**
   * @param {{ name: string }} params
   * @returns {Promise<Organization>}
   */
  async createOrganization({ name }) {
    const organization = await this.#organizations.add({ name, members: {} })
    try {
      const group = await this._app.createGroup({ name: adminGroupName(organization) })
      organization.adminGroupId = group.id
      return await this.#organizations.update(organization)
    } catch (error) {
      await this.#organizations.remove(organization.id)
      throw error
    }
  }

  /**
   * @param {string} id
   * @returns {Promise<Organization>}
   */
  async getOrganization(id) {
    const organization = await this.#organizations.first(id)
    if (organization === undefined) {
      throw noSuchObject(id, 'organization')
    }
    return organization
  }

  /** @returns {Promise<Organization[]>} */
  getOrganizations() {
    return this.#organizations.get()
  }

  /**
   * @param {string} id
   * @param {{ name?: string }} props
   */
  async updateOrganization(id, { name }) {
    const organization = await this.getOrganization(id)
    if (name !== undefined) {
      organization.name = name
      await this._app.updateGroup(organization.adminGroupId, { name: adminGroupName(organization) })
    }
    return this.#organizations.update(organization)
  }

  /**
   * @param {string} id
   */
  async deleteOrganization(id) {
    await this.getOrganization(id)
    if ((await this.#projects.get({ organizationId: id })).length !== 0) {
      throw forbiddenOperation('delete organization', 'the organization still has projects')
    }
    const { adminGroupId } = await this.getOrganization(id)
    await this._app.deleteGroup(adminGroupId)
    await this.#organizations.remove(id)
  }

  /**
   * Adds, changes or removes (with a `null` role) a member of an organization.
   *
   * Removing a member also removes them from all projects of the organization.
   *
   * @param {string} id
   * @param {string} userId
   * @param {OrganizationRole | null} role
   */
  async setOrganizationMember(id, userId, role) {
    if (role !== null && !ORGANIZATION_ROLES.includes(role)) {
      throw invalidParameters(`role must be one of ${ORGANIZATION_ROLES.join(', ')}`)
    }

    const organization = await this.getOrganization(id)
    const wasAdmin = organization.members[userId] === 'admin'
    if (role === null) {
      const projects = await this.#projects.get({ organizationId: id })
      await Promise.all(projects.map(project => this.setProjectMember(project.id, userId, null)))
      delete organization.members[userId]
    } else {
      await this._app.getUser(userId)
      organization.members[userId] = role
    }

    // the admin group carries the admin role of every project of the organization
    if (role === 'admin' && !wasAdmin) {
      await this._app.addUserToGroup(userId, organization.adminGroupId)
    } else if (role !== 'admin' && wasAdmin) {
      await this._app.removeUserFromGroup(userId, organization.adminGroupId)
    }
    await this.#organizations.update(organization)
  }

  /**
   * Called when a user is deleted: their ACL roles and groups are cleaned by XO, the organizations are not.
   *
   * @param {string} userId
   */
  async removeUserFromOrganizations(userId) {
    for (const organization of await this.getOrganizations()) {
      if (organization.members[userId] !== undefined) {
        delete organization.members[userId]
        await this.#organizations.update(organization)
      }
    }
  }

  /**
   * Creates a user who can only access XO through the projects of this organization.
   *
   * @param {string} id
   * @param {{ name: string, password: string, role?: OrganizationRole }} params
   */
  async createOrganizationUser(id, { name, password, role = 'member' }) {
    await this.getOrganization(id)
    const user = await this._app.createUser({ name, password, permission: 'none' })
    await this.setOrganizationMember(id, user.id, role)
    return user
  }

  // === Offering

  /**
   * @param {Omit<Offering, 'id'>} params
   * @returns {Promise<Offering>}
   */
  createOffering({ name, family = 'general', cpus, memory, disk, pricePerHour = 0 }) {
    return this.#offerings.add({ name, family, cpus, memory, disk, pricePerHour })
  }

  /**
   * @param {string} id
   * @returns {Promise<Offering>}
   */
  async getOffering(id) {
    const offering = await this.#offerings.first(id)
    if (offering === undefined) {
      throw noSuchObject(id, 'offering')
    }
    return offering
  }

  /** @returns {Promise<Offering[]>} */
  getOfferings() {
    return this.#offerings.get()
  }

  /**
   * @param {string} id
   * @param {Partial<Omit<Offering, 'id'>>} props
   */
  async updateOffering(id, props) {
    const offering = await this.getOffering(id)
    for (const key of /** @type {const} */ (['name', 'family', 'cpus', 'memory', 'disk', 'pricePerHour'])) {
      if (props[key] !== undefined) {
        // @ts-expect-error same type for each key
        offering[key] = props[key]
      }
    }
    return this.#offerings.update(offering)
  }

  /**
   * Existing instances keep their size, projects stop proposing it.
   *
   * @param {string} id
   */
  async deleteOffering(id) {
    await this.getOffering(id)
    for (const project of await this.getProjects()) {
      if (project.scope.offerings?.includes(id)) {
        await this.updateProject(project.id, { scope: { offerings: project.scope.offerings.filter(_ => _ !== id) } })
      }
    }
    await this.#offerings.remove(id)
  }

  // === Project

  /**
   * Brings the privileges of the generated roles in line with the current role definitions, so that projects
   * created by a previous version get the new privileges.
   */
  async #syncProjectRoles() {
    const app = this._app
    for (const project of await this.getProjects()) {
      for (const role of PROJECT_ROLES) {
        const roleId = project.roleIds[role]
        const expected = getProjectRolePrivileges(project.id, role)
        let current
        try {
          current = await app.getAclV2RolePrivileges(roleId)
        } catch (error) {
          if (noSuchObject.is(error)) {
            continue
          }
          throw error
        }
        const same = (/** @type {any} */ a, /** @type {any} */ b) =>
          a.resource === b.resource && a.action === b.action && a.effect === b.effect && a.selector === b.selector
        for (const privilege of current) {
          if (!expected.some(_ => same(_, privilege))) {
            await app.deleteAclV2Privilege(privilege.id)
          }
        }
        for (const privilege of expected) {
          if (!current.some((/** @type {any} */ _) => same(_, privilege))) {
            await app.createAclV2Privilege({ ...privilege, roleId })
          }
        }
      }
    }
  }

  /**
   * @param {{ organizationId: string, name: string, description?: string, quota?: Quota, scope?: Partial<Scope> }} params
   * @returns {Promise<Project>}
   */
  async createProject({ organizationId, name, description = '', quota, scope }) {
    const organization = await this.getOrganization(organizationId)

    /** @type {Project} */
    const project = await this.#projects.add({
      organizationId,
      name,
      description,
      quota: normalizeQuota(quota),
      scope: normalizeScope(scope),
      roleIds: {},
    })

    // the role names are informative only, the project keeps the role ids
    for (const role of PROJECT_ROLES) {
      const { id: roleId } = await this._app.createAclV2Role({
        name: `${organization.name} / ${name}: ${PROJECT_ROLE_LABELS[role]}`,
        description: `Generated for the project ${project.id}, do not edit`,
      })
      project.roleIds[role] = roleId
      for (const privilege of getProjectRolePrivileges(project.id, role)) {
        await this._app.createAclV2Privilege({ ...privilege, roleId })
      }
    }
    if (organization.suspended === undefined) {
      await this._app.addAclV2GroupRole(organization.adminGroupId, project.roleIds.admin)
    } else {
      organization.suspended.projectMembers[project.id] = {}
      await this.#organizations.update(organization)
    }

    return this.#projects.update(project)
  }

  /**
   * @param {string} id
   * @returns {Promise<Project>}
   */
  async getProject(id) {
    const project = await this.#projects.first(id)
    if (project === undefined) {
      throw noSuchObject(id, 'project')
    }
    // projects created before a scope key existed
    project.scope = normalizeScope(project.scope)
    return project
  }

  /** @returns {Promise<Project[]>} */
  async getProjects() {
    return (await this.#projects.get()).map((/** @type {Project} */ project) => ({
      ...project,
      scope: normalizeScope(project.scope),
    }))
  }

  /**
   * @param {string} id
   * @param {{ name?: string, description?: string, quota?: Quota, scope?: Partial<Scope> }} props
   */
  async updateProject(id, { name, description, quota, scope }) {
    const project = await this.getProject(id)
    if (name !== undefined) {
      project.name = name
    }
    if (description !== undefined) {
      project.description = description
    }
    if (quota !== undefined) {
      project.quota = normalizeQuota(quota)
    }
    if (scope !== undefined) {
      project.scope = normalizeScope({ ...project.scope, ...scope })
    }
    return this.#projects.update(project)
  }

  /**
   * @param {string} id
   */
  async deleteProject(id) {
    const project = await this.getProject(id)
    const { vms, vdis } = this.#getProjectObjects(id)
    if (vms.length !== 0 || vdis.length !== 0) {
      throw forbiddenOperation('delete project', 'the project still owns instances or disks')
    }

    // deleting a role also detaches it from its users
    for (const roleId of Object.values(project.roleIds)) {
      await this._app.deleteAclV2Role(roleId).catch(error => {
        if (!noSuchObject.is(error)) {
          throw error
        }
      })
    }
    await this.#projects.remove(id)
  }

  /**
   * @param {string} id
   * @returns {Promise<{ userId: string, role: ProjectRole }[]>}
   */
  async getProjectMembers(id) {
    const project = await this.getProject(id)
    const members = []
    for (const role of PROJECT_ROLES) {
      const { userIds = [] } = await this._app.getAclV2Role(project.roleIds[role], { bypassAuthorization: true })
      for (const userId of userIds) {
        members.push({ userId, role })
      }
    }
    return members
  }

  /**
   * Gives a role in the project to a member of its organization, or removes it with a `null` role.
   *
   * @param {string} id
   * @param {string} userId
   * @param {ProjectRole | null} role
   */
  async setProjectMember(id, userId, role) {
    if (role !== null && !PROJECT_ROLES.includes(role)) {
      throw invalidParameters(`role must be one of ${PROJECT_ROLES.join(', ')}`)
    }

    const project = await this.getProject(id)
    if (role !== null) {
      const organization = await this.getOrganization(project.organizationId)
      if (organization.suspended !== undefined) {
        throw forbiddenOperation('add project member', 'the organization is suspended')
      }
      if (organization.members[userId] === undefined) {
        throw forbiddenOperation('add project member', 'the user is not a member of the organization')
      }
    }

    const current = await this.getUserProjectRole(userId, id, { directOnly: true })
    if (current === role) {
      return
    }
    if (current !== undefined) {
      await this._app.deleteAclV2UserRole(userId, project.roleIds[current])
    }
    if (role !== null) {
      await this._app.addAclV2UserRole(userId, project.roleIds[role])
    }
  }

  /**
   * Effective role of a user in a project.
   *
   * XO administrators and organization admins are project admins of every project they can see. With
   * `directOnly`, only the role given through the project membership is returned.
   *
   * @param {string} userId
   * @param {string} id
   * @param {{ directOnly?: boolean }} [opts]
   * @returns {Promise<ProjectRole | undefined>}
   */
  async getUserProjectRole(userId, id, { directOnly = false } = {}) {
    const project = await this.getProject(id)

    if (!directOnly) {
      const user = await this._app.getUser(userId)
      if (user.permission === 'admin') {
        return 'admin'
      }
      const organization = await this.getOrganization(project.organizationId)
      if (organization.suspended !== undefined) {
        return
      }
      if (organization.members[userId] === 'admin') {
        return 'admin'
      }
    }

    const userRoleIds = new Set(
      (await this._app.getAclV2UserRoles(userId, { bypassAuthorization: true, fromGroup: false })).map(
        (/** @type {{ id: string }} */ role) => role.id
      )
    )
    for (let i = PROJECT_ROLES.length - 1; i >= 0; i--) {
      const role = PROJECT_ROLES[i]
      if (userRoleIds.has(project.roleIds[role])) {
        return role
      }
    }
  }

  /**
   * Projects a user can access, with their effective role.
   *
   * @param {string} userId
   * @returns {Promise<{ project: Project, role: ProjectRole }[]>}
   */
  async getUserProjects(userId) {
    const result = []
    for (const project of await this.getProjects()) {
      const role = await this.getUserProjectRole(userId, project.id)
      if (role !== undefined) {
        result.push({ project, role })
      }
    }
    return result
  }

  // === Authorization

  /**
   * @param {User} user
   * @param {string} id
   * @param {ProjectRole} minRole
   */
  async assertProjectRole(user, id, minRole) {
    if (!hasProjectRole(await this.getUserProjectRole(user.id, id), minRole)) {
      throw forbiddenOperation('project', `requires the ${minRole} role on the project`)
    }
  }

  /**
   * @param {User} user
   * @param {string} id
   * @param {OrganizationRole} minRole
   */
  async assertOrganizationRole(user, id, minRole) {
    if (user.permission === 'admin') {
      return
    }
    const organization = await this.getOrganization(id)
    if (organization.suspended !== undefined) {
      throw forbiddenOperation('organization', 'the organization is suspended')
    }
    const role = organization.members[user.id]
    if (role === undefined || (minRole === 'admin' && role !== 'admin')) {
      throw forbiddenOperation('organization', `requires the ${minRole} role on the organization`)
    }
  }

  /**
   * Members of a project can use the console of its instances.
   *
   * The console proxy only knows ACL v1, this lets project members through.
   *
   * @param {string} userId
   * @param {string} vmId
   */
  async canUseConsoleThroughProject(userId, vmId) {
    let vm
    try {
      vm = this._app.getObject(vmId, 'VM')
    } catch {
      return false
    }
    return vm.$project !== undefined && hasProjectRole(await this.getUserProjectRole(userId, vm.$project), 'member')
  }

  // === Suspension

  /**
   * Suspends an organization, e.g. for non-payment: its instances are stopped and its members lose every right
   * on its projects until it is resumed. Accounts and data are kept.
   *
   * @param {string} id
   * @param {{ reason?: string }} [opts]
   */
  async suspendOrganization(id, { reason = '' } = {}) {
    const app = this._app
    const organization = await this.getOrganization(id)
    if (organization.suspended !== undefined) {
      return
    }

    /** @type {Record<string, Record<string, ProjectRole>>} */
    const projectMembers = {}
    const projects = await this.#projects.get({ organizationId: id })
    for (const project of projects) {
      projectMembers[project.id] = {}
      for (const { userId, role } of await this.getProjectMembers(project.id)) {
        projectMembers[project.id][userId] = role
        await app.deleteAclV2UserRole(userId, project.roleIds[role])
      }
      await app.deleteAclV2GroupRole(organization.adminGroupId, project.roleIds.admin).catch(() => {})
    }
    organization.suspended = { at: Date.now(), reason, projectMembers }
    await this.#organizations.update(organization)

    // best effort: a VM which cannot be stopped is left running, the members have no access to it anyway
    await Promise.all(
      projects.flatMap(project =>
        this.#getProjectObjects(project.id)
          .vms.filter(vm => vm.type === 'VM' && vm.power_state !== 'Halted')
          .map(async vm => {
            const xapi = app.getXapi(vm)
            try {
              await xapi.callAsync('VM.clean_shutdown', vm._xapiRef)
            } catch {
              await xapi.callAsync('VM.hard_shutdown', vm._xapiRef).catch(() => {})
            }
          })
      )
    )
  }

  /**
   * Gives back the rights the members had when the organization was suspended. Instances are not restarted.
   *
   * @param {string} id
   */
  async resumeOrganization(id) {
    const app = this._app
    const organization = await this.getOrganization(id)
    const { suspended } = organization
    if (suspended === undefined) {
      return
    }

    for (const project of await this.#projects.get({ organizationId: id })) {
      await app.addAclV2GroupRole(organization.adminGroupId, project.roleIds.admin).catch(() => {})
      for (const [userId, role] of Object.entries(suspended.projectMembers[project.id] ?? {})) {
        // members removed while suspended stay removed
        if (organization.members[userId] !== undefined) {
          await app.addAclV2UserRole(userId, project.roleIds[role]).catch(() => {})
        }
      }
    }
    delete organization.suspended
    await this.#organizations.update(organization)
  }

  /**
   * Sets a new random password for a member, for organization admins: there are no invitation emails.
   *
   * Only for accounts which belong to this organization only, never for XO administrators.
   *
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<string>} the new password
   */
  async resetMemberPassword(id, userId) {
    const app = this._app
    const organization = await this.getOrganization(id)
    const user = await app.getUser(userId)
    const otherOrganizations = (await this.getOrganizations()).filter(
      _ => _.id !== id && _.members[userId] !== undefined
    )
    if (organization.members[userId] === undefined || user.permission === 'admin' || otherOrganizations.length !== 0) {
      throw forbiddenOperation('reset password', 'only for accounts which belong to this organization only')
    }
    const password = randomBytes(12).toString('base64url')
    await app.updateUser(userId, { password })
    return password
  }

  // === Usage and quota

  /**
   * @param {string} id
   */
  #getProjectObjects(id) {
    /** @param {string} type */
    const getOwned = type =>
      Object.values(this._app.getObjectsByType(type, { filter: (/** @type {any} */ obj) => obj.$project === id }))

    return {
      vms: [...getOwned('VM'), ...getOwned('VM-snapshot')],
      vdis: [...getOwned('VDI'), ...getOwned('VDI-snapshot')],
      vifs: getOwned('VIF'),
    }
  }

  /**
   * @param {string} id
   */
  async getProjectUsage(id) {
    const project = await this.getProject(id)
    const { vms, vdis, vifs } = this.#getProjectObjects(id)
    return { quota: project.quota, usage: computeProjectUsage(vms, vdis, vifs) }
  }

  /**
   * Throws if creating this VM in the project would exceed its quota.
   *
   * Should be called inside `withProjectLock` together with the creation.
   *
   * @param {string} id
   * @param {string} templateId XO id of the template
   * @param {{ cpus?: number, memory?: number, ips?: number, vdis?: ({ size?: number, userdevice?: string, destroy?: boolean })[] }} params
   */
  async assertProjectQuotaForVm(id, templateId, params) {
    const app = this._app
    const template = app.getObject(templateId, 'VM-template')

    // existing disks of the template, the ones described by default templates are not created by XO
    /** @type {Record<string, number>} */
    const templateDisks = {}
    for (const vbdId of template.$VBDs) {
      const vbd = app.getObject(vbdId, 'VBD')
      if (!vbd.is_cd_drive && vbd.VDI !== undefined) {
        templateDisks[vbd.position] = app.getObject(vbd.VDI).size
      }
    }

    const request = {
      ...estimateVmResources(
        { cpus: template.CPUs.number, memory: template.memory.dynamic?.[1] ?? template.memory.size, templateDisks },
        params
      ),
      ips: params.ips ?? 0,
    }
    await this.assertProjectQuota(id, request)
    return request
  }

  /**
   * Throws if adding these resources to the project would exceed its quota.
   *
   * @param {string} id
   * @param {Quota} request
   */
  async assertProjectQuota(id, request) {
    const { quota, usage } = await this.getProjectUsage(id)
    const exceeded = getExceededQuotas(quota, usage, request)
    if (exceeded.length !== 0) {
      throw forbiddenOperation('create VM', `the project quota would be exceeded: ${exceeded.join(', ')}`)
    }
  }

  /**
   * Runs `fn` while no other quota-checked operation of the project is running, so that two concurrent
   * creations cannot both pass the quota check.
   *
   * @template T
   * @param {string} id
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  withProjectLock(id, fn) {
    return this.#withProjectLock(id, fn)
  }
}
