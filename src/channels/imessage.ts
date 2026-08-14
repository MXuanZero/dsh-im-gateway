/**
 * iMessage 渠道适配器（macOS only，实验性）：
 * - 发送：AppleScript osascript（零依赖）
 * - 接收：优先使用 imsg 桥（`imsg listen`），未配置时仅发送。
 * @module dsh-im-gateway/channels/imessage
 */

import type { ChannelAdapter, ImMessage } from '../core/types.js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { spawn } from 'node:child_process'

const execFileAsync = promisify(execFile)

export interface IMessageChannelConfig {
  enabled?: boolean
  /** imsg 桥可执行文件（OpenClaw 同款），可选。 */
  imsgPath?: string
}

export function createIMessageChannel(config: IMessageChannelConfig, log: (line: string) => void): ChannelAdapter | undefined {
  if (!config.enabled) return undefined
  const imsg = config.imsgPath ?? process.env.DSH_IMSG_PATH

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let stopped = false
  let imsgProc: ReturnType<typeof spawn> | undefined
  let statusText = '未启动'
  let adapter: ChannelAdapter | undefined

  adapter = {
    id: 'imessage',
    label: 'iMessage（macOS）',
    maxMessageLength: 4000,
    async start() {
      stopped = false
      if (process.platform !== 'darwin') {
        statusText = '仅支持 macOS'
        log('[imessage] 仅支持 macOS')
        return
      }
      if (imsg) {
        imsgProc = spawn(imsg, ['listen'], { stdio: ['ignore', 'pipe', 'pipe'] })
        imsgProc.stdout?.on('data', (chunk: Buffer) => {
          const line = chunk.toString('utf8').trim()
          if (!line) return
          try {
            const data = JSON.parse(line) as { from?: string; text?: string; chatId?: string }
            if (data.text) {
              void handler?.({
                chatId: data.chatId ?? `user:${data.from}`,
                userId: data.from,
                text: data.text,
              })
            }
          } catch {
            log(`[imessage] imsg 输出: ${line.slice(0, 200)}`)
          }
        })
        imsgProc.on('exit', (code) => {
          statusText = `imsg 退出（code ${code}）`
          if (!stopped) {
            log(`[imessage] imsg 退出（${code}），5s 后重启`)
            setTimeout(() => void adapter?.start(), 5000)
          }
        })
        statusText = 'imsg 监听中'
        log('[imessage] imsg listen 已启动')
      } else {
        statusText = '仅发送模式（无 imsg）'
        log('[imessage] 未配置 imsg 桥：仅支持发送（接收需安装 imsg）')
      }
    },
    async stop() {
      stopped = true
      imsgProc?.kill()
      imsgProc = undefined
    },
    async send(chatId, text) {
      const recipient = chatId.startsWith('user:') ? chatId.slice(5) : chatId
      if (imsg) {
        await execFileAsync(imsg, ['send', '--handle', recipient, '--text', text], { timeout: 30000 })
      } else {
        // AppleScript 发送（每条消息单独 osascript，简单可靠）
        const script = `on run argv\n  set targetBuddy to item 1 of argv\n  set targetMessage to item 2 of argv\n  tell application "Messages"\n    set targetService to 1st service whose service type = iMessage\n    set targetBuddy to buddy targetBuddy of targetService\n    send targetMessage to targetBuddy\n  end tell\nend run`
        await execFileAsync('osascript', ['-e', script, recipient, text], { timeout: 30000 })
      }
    },
    setMessageHandler(h) {
      handler = h
    },
    status() {
      return statusText
    },
  }

  return adapter
}
