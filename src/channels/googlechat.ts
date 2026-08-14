/**
 * Google Chat 渠道适配器（实验性）：
 * - 接收：本地 HTTP server 暴露 webhook（Google Chat 应用需配置到公网）
 * - 发送：REST messages.create（需要服务账号 access token 或 Webhook URL）
 * @module dsh-im-gateway/channels/googlechat
 */

import type { ChannelAdapter, ImMessage } from '../core/types.js'
import { createServer, type Server } from 'node:http'

export interface GoogleChatChannelConfig {
  enabled?: boolean
  /** 本地 webhook 监听端口。 */
  port?: number
  /** 发送用（可选）：Google Chat 空间 webhook URL（仅能回复 webhook 空间）。 */
  webhookUrl?: string
}

export function createGoogleChatChannel(config: GoogleChatChannelConfig, log: (line: string) => void): ChannelAdapter | undefined {
  if (!config.enabled) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let server: Server | undefined
  let statusText = '未启动'

  return {
    id: 'googlechat',
    label: 'Google Chat',
    maxMessageLength: 4000,
    async start() {
      server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
        if (url.pathname !== '/googlechat-webhook' || req.method !== 'POST') {
          res.writeHead(404).end()
          return
        }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          res.writeHead(200).end()
          try {
            const data = JSON.parse(body) as {
              message?: { text?: string; sender?: { name?: string; displayName?: string }; thread?: { name?: string } }
              space?: { name?: string; type?: string }
              type?: string
            }
            if (data.type === 'ADDED_TO_SPACE') {
              log(`[googlechat] 被添加到空间 ${data.space?.name ?? '?'}`)
              return
            }
            const msg = data.message
            if (!msg?.text || data.type === 'REMOVED_FROM_SPACE') return
            void handler?.({
              chatId: data.space?.name ?? '',
              userId: msg.sender?.name?.split('/').pop(),
              username: msg.sender?.displayName,
              text: msg.text,
              context: { threadName: msg.thread?.name },
            })
          } catch { /* 忽略 */ }
        })
      })
      const port = config.port ?? 8789
      await new Promise<void>((resolve, reject) => {
        server?.listen(port, () => resolve())
        server?.on('error', reject)
      })
      statusText = `webhook 监听 :${port}`
      log('[googlechat] webhook 已监听（需要公网可达 + Google Chat 应用配置）')
    },
    async stop() {
      await new Promise<void>((resolve) => server?.close(() => resolve()))
      server = undefined
    },
    async send(chatId, text) {
      if (config.webhookUrl) {
        const res = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        if (!res.ok) throw new Error(`googlechat webhook: HTTP ${res.status}`)
        return
      }
      throw new Error('googlechat: 发送需要配置 webhookUrl（服务账号方式待实现）')
    },
    setMessageHandler(h) {
      handler = h
    },
    status() {
      return statusText
    },
  }
}
