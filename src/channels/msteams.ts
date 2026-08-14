/**
 * Microsoft Teams 渠道适配器（实验性）：Bot Framework Activity 协议。
 * - 接收：本地 HTTP server（Teams 的 bot 消息回调，需要公网 + Bot Framework 注册）
 * - 发送：Bot Framework REST（需要 appId/appPassword + conversation 上下文）
 * 由于 Teams Bot 需要 Azure Bot Service 注册与公网回调，v0.1 提供接收骨架
 * 与凭据驱动的 REST 回复。
 * @module dsh-im-gateway/channels/msteams
 */

import type { ChannelAdapter, ImMessage } from '../core/types.js'
import { createServer, type Server } from 'node:http'

export interface MSTeamsChannelConfig {
  enabled?: boolean
  appId?: string
  appPassword?: string
  port?: number
}

export function createMSTeamsChannel(config: MSTeamsChannelConfig, log: (line: string) => void): ChannelAdapter | undefined {
  if (!config.enabled) return undefined
  const appId = config.appId ?? process.env.DSH_TEAMS_APP_ID
  const appPassword = config.appPassword ?? process.env.DSH_TEAMS_APP_PASSWORD

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let server: Server | undefined
  let statusText = '未启动'
  /** conversationId → serviceUrl（回复用） */
  const conversations = new Map<string, { serviceUrl: string; conversationId: string }>()

  return {
    id: 'msteams',
    label: 'Microsoft Teams',
    maxMessageLength: 4000,
    async start() {
      server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
        if (url.pathname !== '/teams-webhook' || req.method !== 'POST') {
          res.writeHead(404).end()
          return
        }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          // Teams 需要 202 且不能处理过慢
          res.writeHead(202).end()
          try {
            const data = JSON.parse(body) as {
              type?: string
              from?: { id?: string; name?: string }
              conversation?: { id?: string }
              text?: string
              serviceUrl?: string
              recipient?: { id?: string }
            }
            if (data.type === 'message' && data.text) {
              if (data.conversation?.id) {
                conversations.set(data.conversation.id, {
                  serviceUrl: data.serviceUrl ?? '',
                  conversationId: data.conversation.id,
                })
              }
              void handler?.({
                chatId: data.conversation?.id ?? '',
                userId: data.from?.id,
                username: data.from?.name,
                text: data.text,
                context: { serviceUrl: data.serviceUrl },
              })
            }
          } catch { /* 忽略 */ }
        })
      })
      const port = config.port ?? 8792
      await new Promise<void>((resolve, reject) => {
        server?.listen(port, () => resolve())
        server?.on('error', reject)
      })
      statusText = `webhook 监听 :${port}（需要 Bot Framework 公网回调）`
      log('[msteams] webhook 已监听（实验性：需要 Azure Bot Service 注册）')
    },
    async stop() {
      await new Promise<void>((resolve) => server?.close(() => resolve()))
      server = undefined
    },
    async send(chatId, text) {
      if (!appId || !appPassword) throw new Error('msteams: 发送需要 appId/appPassword')
      const conv = conversations.get(chatId)
      if (!conv?.serviceUrl) throw new Error('msteams: 缺少会话的 serviceUrl（等待对方先发消息）')
      // 获取 Bot Framework token
      const tokenRes = await fetch(`https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: appId,
          client_secret: appPassword,
          scope: 'https://api.botframework.com/.default',
        }),
      })
      const tokenData = (await tokenRes.json()) as { access_token?: string }
      if (!tokenData.access_token) throw new Error('msteams: 获取 Bot Framework token 失败')
      const res = await fetch(`${conv.serviceUrl}/v3/conversations/${encodeURIComponent(conv.conversationId)}/activities`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenData.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ type: 'message', text }),
      })
      if (!res.ok) throw new Error(`msteams send: HTTP ${res.status}`)
    },
    setMessageHandler(h) {
      handler = h
    },
    status() {
      return statusText
    },
  }
}
