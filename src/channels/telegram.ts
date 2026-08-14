/**
 * Telegram 渠道适配器：Bot API 长轮询，零第三方依赖（纯 fetch）。
 * 每聊天一个 agent 会话由网关统一管理；本适配器只负责收/发。
 * @module dsh-im-gateway/channels/telegram
 */

import type { ChannelAdapter, ImMessage } from '../core/types.js'

export interface TelegramChannelConfig {
  enabled?: boolean
  /** @BotFather 的 bot token；缺省回退 DSH_TELEGRAM_TOKEN 环境变量。 */
  token?: string
  /** 允许私聊的用户 id（字符串化）；空 = 仅 allowAllUsers 时放行。 */
  allowedUserIds?: string[]
  pollingTimeoutSec?: number
}

interface TgUpdate {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; type: string }
    from?: { id: number; username?: string; first_name?: string }
    text?: string
  }
}

const API = 'https://api.telegram.org'

export function createTelegramChannel(config: TelegramChannelConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const token = config.token ?? process.env.DSH_TELEGRAM_TOKEN
  if (!token) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let offset: number | undefined
  let stopped = false
  let errorCount = 0
  let lastError = ''

  async function api<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as { ok: boolean; description?: string; result: T }
    if (!data.ok) throw new Error(`telegram ${method}: ${data.description ?? 'unknown error'}`)
    return data.result
  }

  async function pollLoop(): Promise<void> {
    while (!stopped) {
      try {
        const updates = await api<TgUpdate[]>('getUpdates', {
          offset,
          timeout: config.pollingTimeoutSec ?? 30,
          allowed_updates: ['message'],
        })
        errorCount = 0
        lastError = ''
        for (const update of updates) {
          offset = update.update_id + 1
          const msg = update.message
          if (!msg?.text) continue
          if (msg.chat.type === 'channel') continue
          void handler?.({
            chatId: String(msg.chat.id),
            userId: msg.from ? String(msg.from.id) : undefined,
            username: msg.from?.username ?? msg.from?.first_name,
            text: msg.text,
          })
        }
      } catch (err) {
        errorCount += 1
        lastError = err instanceof Error ? err.message : String(err)
        log(`[telegram] 轮询错误（第 ${errorCount} 次）: ${lastError}`)
        await sleep(Math.min(1000 * errorCount, 10000))
      }
      if (stopped) break
      // 空批次避免空转
      await sleep(50)
    }
  }

  return {
    id: 'telegram',
    label: 'Telegram',
    maxMessageLength: 4096,
    async start() {
      stopped = false
      log('[telegram] 开始长轮询（Bot API）')
      void pollLoop()
    },
    async stop() {
      stopped = true
    },
    async send(chatId, text) {
      await api('sendMessage', { chat_id: Number(chatId), text, parse_mode: 'HTML' }).catch(async () => {
        // HTML 实体非法时回退纯文本
        await api('sendMessage', { chat_id: Number(chatId), text })
      })
    },
    async sendAction(chatId, action) {
      await api('sendChatAction', { chat_id: Number(chatId), action }).catch(() => undefined)
    },
    setMessageHandler(h) {
      handler = h
    },
    status() {
      return stopped ? '已停止' : lastError ? `轮询中（上次错误: ${lastError}）` : '轮询中'
    },
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
