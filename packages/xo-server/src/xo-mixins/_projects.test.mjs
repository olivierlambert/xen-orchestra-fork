import assert from 'assert/strict'
import test from 'node:test'
import { hasPrivilegeOn } from '@xen-orchestra/acl'

import {
  computeProjectUsage,
  estimateVmResources,
  getExceededQuotas,
  getProjectRolePrivileges,
  hasProjectRole,
  makeKeyedLock,
  projectSelector,
} from './_projects.mjs'

const { describe, it } = test

const GiB = 1024 ** 3
const user = { id: 'user', permission: 'none' }

const can = (privileges, resource, action, object) =>
  hasPrivilegeOn({ user, resource, action, objects: object, userPrivileges: privileges })

describe('project roles', function () {
  const projectId = 'b0c3f9e2-6f3a-4c55-9a43-0d4a4c1f1a01'
  const ownVm = { id: 'vm-1', type: 'VM', $project: projectId }
  const otherVm = { id: 'vm-2', type: 'VM', $project: 'another-project' }
  const unownedVm = { id: 'vm-3', type: 'VM' }

  it('only matches objects owned by the project', function () {
    const privileges = getProjectRolePrivileges(projectId, 'viewer')
    assert.equal(can(privileges, 'vm', 'read', ownVm), true)
    assert.equal(can(privileges, 'vm', 'read', otherVm), false)
    assert.equal(can(privileges, 'vm', 'read', unownedVm), false)
  })

  it('does not match a project whose id contains the project id', function () {
    const privileges = getProjectRolePrivileges('prj-1', 'admin')
    assert.equal(can(privileges, 'vm', 'read', { id: 'vm', $project: 'prj-1' }), true)
    assert.equal(can(privileges, 'vm', 'read', { id: 'vm', $project: 'prj-12' }), false)
    assert.equal(can(privileges, 'vm', 'read', { id: 'vm', $project: 'xprj-1' }), false)
  })

  it('escapes regular expression characters in the id', function () {
    assert.equal(projectSelector('a.b'), '$project:/^a\\.b$/')
    const privileges = getProjectRolePrivileges('a.b', 'viewer')
    assert.equal(can(privileges, 'vm', 'read', { id: 'vm', $project: 'axb' }), false)
  })

  it('gives increasing privileges per role', function () {
    const viewer = getProjectRolePrivileges(projectId, 'viewer')
    const member = getProjectRolePrivileges(projectId, 'member')
    const admin = getProjectRolePrivileges(projectId, 'admin')

    assert.equal(can(viewer, 'vm', 'start', ownVm), false)
    assert.equal(can(member, 'vm', 'start', ownVm), true)
    assert.equal(can(member, 'vm', 'snapshot', ownVm), true)
    assert.equal(can(member, 'vm', 'delete', ownVm), false)
    assert.equal(can(admin, 'vm', 'delete', ownVm), true)
  })

  it('never allows operations bypassing the quota or reaching the infrastructure', function () {
    const admin = getProjectRolePrivileges(projectId, 'admin')
    for (const action of ['clone', 'update:cpus', 'update:memory', 'migrate-send', 'export', 'update:resourceSet']) {
      assert.equal(can(admin, 'vm', action, ownVm), false, action)
    }
    assert.equal(can(admin, 'vdi', 'update:size', { id: 'vdi', $project: projectId }), false)
    assert.equal(can(admin, 'pool', 'create:vm', { id: 'pool', $project: projectId }), false)
  })
})

describe('hasProjectRole()', function () {
  it('compares roles', function () {
    assert.equal(hasProjectRole('admin', 'member'), true)
    assert.equal(hasProjectRole('member', 'member'), true)
    assert.equal(hasProjectRole('viewer', 'member'), false)
    assert.equal(hasProjectRole(undefined, 'viewer'), false)
  })
})

describe('computeProjectUsage()', function () {
  it('sums instances, snapshots and the disks of the instances', function () {
    const vm = (type, cpus, memory) => ({ type, CPUs: { number: cpus }, memory: { size: memory } })
    assert.deepEqual(
      computeProjectUsage(
        [
          vm('VM', 2, 4 * GiB),
          // running VM using less than allocated
          { ...vm('VM', 4, 1 * GiB), memory: { size: 1 * GiB, dynamic: [8 * GiB, 8 * GiB] } },
          vm('VM-snapshot', 2, 4 * GiB),
        ],
        [
          { type: 'VDI', size: 20 * GiB },
          { type: 'VDI', size: 20 * GiB },
          // snapshot disks only count in the number of snapshots
          { type: 'VDI-snapshot', size: 20 * GiB },
        ]
      ),
      { instances: 2, vcpus: 6, memory: 12 * GiB, storage: 40 * GiB, snapshots: 1 }
    )
  })
})

describe('getExceededQuotas()', function () {
  const usage = { instances: 2, vcpus: 6, memory: 12 * GiB, storage: 40 * GiB, snapshots: 1 }

  it('ignores undefined quotas', function () {
    assert.deepEqual(getExceededQuotas({}, usage, { vcpus: 1000 }), [])
  })

  it('accepts a request reaching the limit exactly', function () {
    assert.deepEqual(getExceededQuotas({ vcpus: 8 }, usage, { vcpus: 2 }), [])
  })

  it('returns the exceeded keys', function () {
    assert.deepEqual(
      getExceededQuotas({ instances: 3, vcpus: 8, memory: 16 * GiB }, usage, {
        instances: 1,
        vcpus: 4,
        memory: 8 * GiB,
      }),
      ['vcpus', 'memory']
    )
  })
})

describe('estimateVmResources()', function () {
  const template = { cpus: 1, memory: 2 * GiB, templateDisks: { 0: 10 * GiB } }

  it('uses the template by default', function () {
    assert.deepEqual(estimateVmResources(template, {}), {
      instances: 1,
      vcpus: 1,
      memory: 2 * GiB,
      storage: 10 * GiB,
    })
  })

  it('applies the requested sizes and disks', function () {
    assert.deepEqual(
      estimateVmResources(template, {
        cpus: 4,
        memory: 8 * GiB,
        vdis: [{ userdevice: '0', size: 40 * GiB }, { size: 100 * GiB }],
      }),
      { instances: 1, vcpus: 4, memory: 8 * GiB, storage: 140 * GiB }
    )
  })

  it('does not count destroyed disks nor shrink existing ones', function () {
    assert.equal(estimateVmResources(template, { vdis: [{ userdevice: '0', destroy: true }] }).storage, 0)
    assert.equal(estimateVmResources(template, { vdis: [{ userdevice: '0', size: 1 }] }).storage, 10 * GiB)
  })
})

describe('makeKeyedLock()', function () {
  it('serializes calls with the same key, even after a failure', async function () {
    const withLock = makeKeyedLock()
    const events = []
    const task = (name, fail) => async () => {
      events.push(`start ${name}`)
      await new Promise(resolve => setTimeout(resolve, 5))
      events.push(`end ${name}`)
      if (fail) {
        throw new Error(name)
      }
    }

    await Promise.allSettled([withLock('a', task('1', true)), withLock('a', task('2')), withLock('b', task('3'))])

    assert.ok(events.indexOf('end 1') < events.indexOf('start 2'))
    assert.ok(events.indexOf('start 3') < events.indexOf('end 1'))
  })
})
