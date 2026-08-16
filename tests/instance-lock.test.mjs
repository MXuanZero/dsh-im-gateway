import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acquireDshHomeInstanceLock } from '../lib/instance-lock.js'

function withTempHome(run) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-im-gateway-lock-'))
  try {
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('同一 DSH_HOME 拒绝第二个存活进程', () => withTempHome((root) => {
  const first = acquireDshHomeInstanceLock(root, {
    pid: 101,
    token: 'first',
    acquiredAt: '2026-08-16T00:00:00.000Z',
    isProcessAlive: (pid) => pid === 101,
  })

  assert.throws(
    () => acquireDshHomeInstanceLock(root, {
      pid: 202,
      token: 'second',
      isProcessAlive: (pid) => pid === 101,
    }),
    /PID 101.*独立的 DSH_HOME/,
  )

  first.release()
  const second = acquireDshHomeInstanceLock(root, {
    pid: 202,
    token: 'second',
    isProcessAlive: () => false,
  })
  second.release()
}))

test('陈旧锁可回收，旧 owner 不能删除新锁', () => withTempHome((root) => {
  const stale = acquireDshHomeInstanceLock(root, {
    pid: 303,
    token: 'stale',
    isProcessAlive: () => false,
  })
  const current = acquireDshHomeInstanceLock(root, {
    pid: 404,
    token: 'current',
    isProcessAlive: () => false,
  })

  stale.release()
  const owner = JSON.parse(readFileSync(current.path, 'utf8'))
  assert.equal(owner.pid, 404)
  assert.equal(owner.token, 'current')
  current.release()
}))
