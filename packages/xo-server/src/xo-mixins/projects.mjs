// @ts-check

import { forbiddenOperation, invalidParameters, noSuchObject } from 'xo-common/api-errors.js'

import { Organizations, Projects } from '../models/projects.mjs'
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
 * @typedef {{ pools: string[], templates: string[], networks: string[], srs: string[] }} Scope
 * @typedef {{
 *   id: string,
 *   name: string,
 *   members: Record<string, OrganizationRole>,
 *   adminGroupId: string,
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

const EMPTY_SCOPE = { pools: [], templates: [], networks: [], srs: [] }

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

      app.addConfigManager(
        'organizations',
        () => organizations.get(),
        (/** @type {Organization[]} */ records) => organizations.update(records),
        ['users']
      )
      app.addConfigManager(
        'projects',
        () => projects.get(),
        (/** @type {Project[]} */ records) => projects.update(records),
        ['organizations', 'roles']
      )
    })

    app.hooks.on('clean', () => this.#projects.rebuildIndexes())
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

  // === Project

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
    await this._app.addAclV2GroupRole(organization.adminGroupId, project.roleIds.admin)

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
    return project
  }

  /** @returns {Promise<Project[]>} */
  getProjects() {
    return this.#projects.get()
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
    const role = (await this.getOrganization(id)).members[user.id]
    if (role === undefined || (minRole === 'admin' && role !== 'admin')) {
      throw forbiddenOperation('organization', `requires the ${minRole} role on the organization`)
    }
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
    }
  }

  /**
   * @param {string} id
   */
  async getProjectUsage(id) {
    const project = await this.getProject(id)
    const { vms, vdis } = this.#getProjectObjects(id)
    return { quota: project.quota, usage: computeProjectUsage(vms, vdis) }
  }

  /**
   * Throws if creating this VM in the project would exceed its quota.
   *
   * Should be called inside `withProjectLock` together with the creation.
   *
   * @param {string} id
   * @param {string} templateId XO id of the template
   * @param {{ cpus?: number, memory?: number, vdis?: ({ size?: number, userdevice?: string, destroy?: boolean })[] }} params
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

    const request = estimateVmResources(
      { cpus: template.CPUs.number, memory: template.memory.dynamic?.[1] ?? template.memory.size, templateDisks },
      params
    )
    const { quota, usage } = await this.getProjectUsage(id)
    const exceeded = getExceededQuotas(quota, usage, request)
    if (exceeded.length !== 0) {
      throw forbiddenOperation('create VM', `the project quota would be exceeded: ${exceeded.join(', ')}`)
    }
    return request
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
