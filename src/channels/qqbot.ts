/**
 * QQ 机器人渠道适配器：QQ 开放平台官方 Bot API（WebSocket 网关）。
 * 支持 C2C 私聊与群 @消息（富媒体 v0.1 不桥接，仅文本）。
 * @module dsh-im-gateway/channels/qqbot
 */

import type { ChannelAdapter, ImMessage } from '../core/types.js'

export interface QQBotChannelConfig {
  enabled?: boolean
  /** QQ 开放平台 Bot 的 AppID。 */
  appId?: string
  /** AppSecret。 */
  appSecret?: string
}

interface GatewayPayload {
  op: number
  d?: unknown
  s?: number
  t?: string
}

interface QQMessage {
  id: string
  content?: string
  author?: { id: string; username?: string }
  chat_type?: number // 1 私聊 2 群聊
  group_openid?: string
  user_openid?: string
  timestamp?: number
}

// 官方最新文档（2026）：统一地址 api.bot.qq.com；Authorization 格式为 "QQBot {access_token}"（不带 appid 前缀，
// 旧格式 "QQBot appid.token" 与旧域名 bots.qq.com / api.sgroup.qq.com 会返回 11244 AccessToken无效）。
const TOKEN_URL = 'https://api.bot.qq.com/app/getAppAccessToken'
const API = 'https://api.bot.qq.com'

export function createQQBotChannel(config: QQBotChannelConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const appId = config.appId ?? process.env.DSH_QQ_APP_ID
  const appSecret = config.appSecret ?? process.env.DSH_QQ_APP_SECRET
  if (!appId || !appSecret) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let ws: WebSocket | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let stopped = false
  let seq: number | null = null
  let accessToken = ''
  let statusText = '未连接'

  async function getToken(): Promise<string> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId, clientSecret: appSecret }),
    })
    const data = (await res.json()) as { access_token?: string; expires_in?: number; code?: number; message?: string }
    if (!data.access_token) throw new Error(`qq getAppAccessToken: ${data.message ?? 'no token'}`)
    return data.access_token
  }

  async function qqFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `QQBot ${accessToken}`,
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`qq ${path}: HTTP ${res.status} ${body.slice(0, 200)}`)
    }
    return res.json() as Promise<T>
  }

  async function connect(): Promise<void> {
    accessToken = await getToken()
    const { url } = await qqFetch<{ url: string }>('/gateway/bot')
    ws = new WebSocket(url)
    ws.onopen = () => {
      ws?.send(JSON.stringify({
        op: 2,
        d: { token: `${appId}.${accessToken}`, intents: (1 << 25) | (1 << 30) }, // C2C_EVENT(私聊) + GROUP_AND_C2C_EVENT
      }))
    }
    ws.onmessage = (ev) => {
      const payload = JSON.parse(String(ev.data)) as GatewayPayload
      if (payload.s !== undefined) seq = payload.s
      switch (payload.op) {
        case 10: {
          const hello = payload.d as { heartbeat_interval: number }
          heartbeat = setInterval(() => ws?.send(JSON.stringify({ op: 1, d: seq })), hello.heartbeat_interval)
          statusText = '已连接'
          log('[qqbot] 网关就绪')
          break
        }
        case 0: {
          const t = payload.t
          const d = payload.d as { msg?: QQMessage; group_openid?: string; user_openid?: string }
          if (t === 'C2C_MESSAGE_CREATE' || t === 'GROUP_AT_MESSAGE_CREATE') {
            const msg = d.msg
            if (!msg?.content || !msg.author) return
            const chatId = msg.group_openid ?? msg.user_openid ?? ''
            if (!chatId) return
            void handler?.({
              chatId,
              userId: msg.author.id,
              username: msg.author.username,
              text: msg.content,
              context: { chatType: msg.chat_type },
            })
          }
          break
        }
        case 7:
          statusText = '重连中'
          break
      }
    }
    ws.onclose = (ev) => {
      clearInterval(heartbeat)
      heartbeat = undefined
      statusText = `已断开（code ${ev.code}）`
      if (!stopped) {
        log(`[qqbot] 连接断开（${ev.code}），3s 后重连`)
        setTimeout(() => void connect(), 3000)
      }
    }
    ws.onerror = () => {
      statusText = '连接错误'
    }
  }

  return {
    id: 'qqbot',
    label: 'QQ 机器人',
    maxMessageLength: 2000,
    async start() {
      stopped = false
      await connect()
    },
    async stop() {
      stopped = true
      clearInterval(heartbeat)
      ws?.close(1000, 'shutdown')
      ws = undefined
    },
    async send(chatId, text) {
      // chatId 以 g: 开头为群（group_openid），否则为私聊（user_openid）
      if (chatId.startsWith('g:')) {
        await qqFetch(`/v2/groups/${chatId.slice(2)}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: text, msg_type: 0 }),
        })
      } else {
        await qqFetch(`/v2/users/${chatId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: text, msg_type: 0 }),
        })
      }
    },
    setMessageHandler(h) {
      handler = h
    },
    status() {
      return statusText
    },
  }
}
