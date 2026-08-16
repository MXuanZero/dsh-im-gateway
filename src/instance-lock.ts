import { randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

interface LockOwner {
  pid: number
  token: string
  acquiredAt: string
}

export interface DshHomeInstanceLock {
  readonly path: string
  release(): void
}

export interface DshHomeInstanceLockOptions {
  pid?: number
  token?: string
  acquiredAt?: string
  isProcessAlive?: (pid: number) => boolean
}

export function acquireDshHomeInstanceLock(
  dshHome: string,
  options: DshHomeInstanceLockOptions = {},
): DshHomeInstanceLock {
  const pid = options.pid ?? process.pid
  const token = options.token ?? randomUUID()
  const owner: LockOwner = {
    pid,
    token,
    acquiredAt: options.acquiredAt ?? new Date().toISOString(),
  }
  const isProcessAlive = options.isProcessAlive ?? processIsAlive
  const lockDir = join(resolve(dshHome), 'dsh-im-gateway')
  const lockPath = join(lockDir, 'instance.lock')
  const tempPath = join(lockDir, `.instance.lock.${pid}.${token}.tmp`)
  mkdirSync(lockDir, { recursive: true })
  writeOwnerFile(tempPath, owner)

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        linkSync(tempPath, lockPath)
        unlinkSync(tempPath)
        return {
          path: lockPath,
          release: () => releaseOwnedLock(lockPath, owner),
        }
      } catch (error) {
        if (!isNodeError(error) || error.code !== 'EEXIST') throw error
      }

      const current = readOwner(lockPath)
      if (current && isProcessAlive(current.pid)) {
        throw new Error(
          `dsh-im-gateway 检测到另一个 DSH 进程（PID ${current.pid}）正在使用 DSH_HOME "${resolve(dshHome)}"。`
          + ' 多个 DSH 实例共享会话目录会并发写坏 session log；请为测试实例设置独立的 DSH_HOME。',
        )
      }
      try {
        unlinkSync(lockPath)
      } catch (error) {
        if (!isNodeError(error) || error.code !== 'ENOENT') throw error
      }
    }
    throw new Error(`无法获取 DSH_HOME 实例锁：${lockPath}`)
  } finally {
    try {
      unlinkSync(tempPath)
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') throw error
    }
  }
}

function writeOwnerFile(path: string, owner: LockOwner): void {
  const fd = openSync(path, 'wx', 0o600)
  try {
    writeFileSync(fd, `${JSON.stringify(owner)}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function releaseOwnedLock(path: string, owner: LockOwner): void {
  const current = readOwner(path)
  if (!current || current.pid !== owner.pid || current.token !== owner.token) return
  try {
    unlinkSync(path)
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') throw error
  }
}

function readOwner(path: string): LockOwner | undefined {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<LockOwner>
    if (!Number.isInteger(value.pid) || typeof value.token !== 'string' || typeof value.acquiredAt !== 'string') {
      return undefined
    }
    return value as LockOwner
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return isNodeError(error) && error.code === 'EPERM'
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
