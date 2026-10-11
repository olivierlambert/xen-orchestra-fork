import assert from 'assert/strict'
import test from 'node:test'
import { hasPrivilegeOn } from '@xen-orchestra/acl'

import {
  computeProjectUsage,
  estimateVmResources,
  formatProjectStamp,
  getExceededQuotas,
  getVdiRecordProject,
  getVmRecordProject,
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
    assert.equal(can(member, 'vm', 'snapshot', ownVm), false)
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
      { instances: 2, vcpus: 6, memory: 12 * GiB, storage: 40 * GiB, snapshots: 1, ips: 0 }
    )
  })

  it('counts the addresses the VIFs are locked to', function () {
    const vms = [
      { id: 'vm', type: 'VM', CPUs: { number: 1 }, memory: { size: 1 } },
      { id: 'snapshot', type: 'VM-snapshot', CPUs: { number: 1 }, memory: { size: 1 } },
    ]
    const vifs = [
      { $VM: 'vm', allowedIpv4Addresses: ['192.0.2.10'] },
      { $VM: 'vm' },
      // the VIF of a snapshot keeps a copy of the address
      { $VM: 'snapshot', allowedIpv4Addresses: ['192.0.2.10'] },
    ]
    assert.equal(computeProjectUsage(vms, [], vifs).ips, 1)
  })
})

describe('getExceededQuotas()', function () {
  const usage = { instances: 2, vcpus: 6, memory: 12 * GiB, storage: 40 * GiB, snapshots: 1, ips: 0 }

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

  it('counts every disk whose user device matches no template disk', function () {
    const vdis = [1, 2, 3].map(() => ({ userdevice: 'autodetect', size: 100 * GiB }))
    assert.equal(estimateVmResources(template, { vdis }).storage, 310 * GiB)
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

describe('ownership stamps', function () {
  const vm = (uuid, stamp, props = {}) => ({
    uuid,
    is_a_template: false,
    is_control_domain: false,
    is_a_snapshot: false,
    other_config: stamp === undefined ? {} : { 'xo:project': stamp },
    ...props,
  })
  const original = vm('vm-1', formatProjectStamp('prj', 'vm-1'))

  it('owns the VM the stamp was written for', function () {
    assert.equal(getVmRecordProject(original), 'prj')
  })

  it('does not own a copy, which carries the stamp of another VM', function () {
    assert.equal(getVmRecordProject(vm('copy', formatProjectStamp('prj', 'vm-1'))), undefined)
  })

  it('owns the snapshots of the VM, not those of a copy', function () {
    const stamp = formatProjectStamp('prj', 'vm-1')
    assert.equal(getVmRecordProject(vm('snap', stamp, { is_a_snapshot: true, $snapshot_of: original })), 'prj')
    const copy = vm('copy', stamp)
    assert.equal(getVmRecordProject(vm('snap-2', stamp, { is_a_snapshot: true, $snapshot_of: copy })), undefined)
  })

  it('never owns templates nor backup snapshots', function () {
    const stamp = formatProjectStamp('prj', 'vm-1')
    assert.equal(getVmRecordProject(vm('vm-1', stamp, { is_a_template: true })), undefined)
    const backupSnapshot = vm('snap', stamp, { is_a_snapshot: true, $snapshot_of: original })
    backupSnapshot.other_config['xo:backup:job'] = 'job'
    assert.equal(getVmRecordProject(backupSnapshot), undefined)
  })

  it('ignores stamps without a VM (previous format)', function () {
    assert.equal(getVmRecordProject(vm('vm-1', 'prj')), undefined)
  })

  it('owns a VDI through a disk VBD of an owned VM, not through a CD', function () {
    const stamp = formatProjectStamp('prj', 'vm-1')
    const vdi = vbds => ({ other_config: { 'xo:project': stamp }, $VBDs: vbds })
    assert.equal(getVdiRecordProject(vdi([{ type: 'Disk', $VM: original }])), 'prj')
    assert.equal(getVdiRecordProject(vdi([{ type: 'CD', $VM: original }])), undefined)
    assert.equal(getVdiRecordProject(vdi([{ type: 'Disk', $VM: vm('copy', stamp) }])), undefined)
    assert.equal(getVdiRecordProject(vdi([])), undefined)

    const snapshotVdi = { ...vdi([]), is_a_snapshot: true, $snapshot_of: vdi([{ type: 'Disk', $VM: original }]) }
    assert.equal(getVdiRecordProject(snapshotVdi), 'prj')
  })
})
