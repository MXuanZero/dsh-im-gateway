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
  author?: {
    id?: string
    user_openid?: string
    member_openid?: string
    username?: string
  }
  group_openid?: string
  timestamp?: string
}

const TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken'
const API = 'https://api.sgroup.qq.com'
const GATEWAY_PATH = '/gateway'
const GROUP_AND_C2C_INTENT = 1 << 25

export function createQQBotChannel(config: QQBotChannelConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const appId = config.appId ?? process.env.DSH_QQ_APP_ID
  const appSecret = config.appSecret ?? process.env.DSH_QQ_APP_SECRET
  if (!appId || !appSecret) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let ws: WebSocket | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let stableTimer: ReturnType<typeof setTimeout> | undefined
  let reconnectAttempts = 0
  let stopped = false
  let seq: number | null = null
  let accessToken = ''
  let statusText = '未连接'

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer) return
    const delay = Math.min(3000 * (2 ** reconnectAttempts), 60_000)
    reconnectAttempts += 1
    log(`[qqbot] ${Math.ceil(delay / 1000)}s 后重连`)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      void connect().catch((err) => {
        statusText = '重连失败'
        log(`[qqbot] 重连失败: ${err instanceof Error ? err.message : String(err)}`)
        scheduleReconnect()
      })
    }, delay)
  }

  async function getToken(): Promise<string> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId, clientSecret: appSecret }),
    })
    const body = await res.text()
    let data: { access_token?: string; expires_in?: number; code?: number; message?: string }
    try {
      data = JSON.parse(body) as typeof data
    } catch {
      throw new Error(`qq getAppAccessToken: HTTP ${res.status} ${body.slice(0, 200)}`)
    }
    if (!res.ok || !data.access_token) {
      throw new Error(`qq getAppAccessToken: HTTP ${res.status} ${data.message ?? 'no token'}`)
    }
    return data.access_token
  }

  async function qqFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `QQBot ${accessToken}`,
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
    if (stopped) return
    accessToken = await getToken()
    if (stopped) return
    const { url } = await qqFetch<{ url: string }>(GATEWAY_PATH)
    if (!url) throw new Error('qq gateway: missing websocket url')
    if (stopped) return

    const socket = new WebSocket(url)
    ws = socket
    statusText = '连接中'
    socket.onopen = () => {
      if (ws === socket) statusText = '等待网关握手'
    }
    socket.onmessage = (ev) => {
      let payload: GatewayPayload
      try {
        payload = JSON.parse(String(ev.data)) as GatewayPayload
      } catch {
        log('[qqbot] 收到无法解析的网关消息')
        return
      }
      if (payload.s !== undefined) seq = payload.s
      switch (payload.op) {
        case 10: {
          const hello = payload.d as { heartbeat_interval: number }
          socket.send(JSON.stringify({
            op: 2,
            d: {
              token: `QQBot ${accessToken}`,
              intents: GROUP_AND_C2C_INTENT,
              shard: [0, 1],
            },
          }))
          clearInterval(heartbeat)
          heartbeat = setInterval(() => {
            if (ws === socket) socket.send(JSON.stringify({ op: 1, d: seq }))
          }, hello.heartbeat_interval)
          statusText = '鉴权中'
          log('[qqbot] 已收到 Hello，正在鉴权')
          break
        }
        case 0: {
          const t = payload.t
          if (t === 'READY') {
            clearTimeout(stableTimer)
            stableTimer = setTimeout(() => { reconnectAttempts = 0 }, 60_000)
            statusText = '已连接'
            log('[qqbot] 网关就绪')
            break
          }
          if (t === 'C2C_MESSAGE_CREATE' || t === 'GROUP_AT_MESSAGE_CREATE') {
            const msg = payload.d as QQMessage
            if (!msg?.content || !msg.author) return
            const isGroup = t === 'GROUP_AT_MESSAGE_CREATE'
            const userId = isGroup
              ? (msg.author.member_openid ?? msg.author.id)
              : (msg.author.user_openid ?? msg.author.id)
            const chatId = isGroup
              ? (msg.group_openid ? `g:${msg.group_openid}` : '')
              : (msg.author.user_openid ?? msg.author.id ?? '')
            if (!chatId || !userId) return
            void handler?.({
              chatId,
              userId,
              username: msg.author.username,
              text: msg.content,
              context: { messageId: msg.id, messageType: isGroup ? 'group' : 'c2c' },
            })
          }
          break
        }
        case 7:
          statusText = '重连中'
          break
      }
    }
    socket.onclose = (ev) => {
      if (ws !== socket) return
      clearInterval(heartbeat)
      heartbeat = undefined
      clearTimeout(stableTimer)
      stableTimer = undefined
      ws = undefined
      statusText = `已断开（code ${ev.code}）`
      if (!stopped) {
        const detail = ev.code === 4004 ? '：鉴权失败，将刷新 AccessToken' : ''
        log(`[qqbot] 连接断开（${ev.code}${detail}）`)
        scheduleReconnect()
      }
    }
    socket.onerror = () => {
      if (ws === socket) statusText = '连接错误'
    }
  }

  return {
    id: 'qqbot',
    label: 'QQ 机器人',
    maxMessageLength: 2000,
    async start() {
      if (!stopped && (ws || reconnectTimer)) return
      stopped = false
      reconnectAttempts = 0
      try {
        await connect()
      } catch (err) {
        statusText = '连接失败'
        log(`[qqbot] 连接失败: ${err instanceof Error ? err.message : String(err)}`)
        scheduleReconnect()
      }
    },
    async stop() {
      stopped = true
      clearInterval(heartbeat)
      clearTimeout(reconnectTimer)
      reconnectTimer = undefined
      clearTimeout(stableTimer)
      stableTimer = undefined
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
