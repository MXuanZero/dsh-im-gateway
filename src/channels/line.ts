/**
 * LINE 渠道适配器：Messaging API。
 * - 发送：REST push（零依赖）
 * - 接收：本地 HTTP server 暴露 webhook，用户需将 LINE webhook URL 指向
 *   本机（公网可达，如 cloudflared tunnel）。
 * @module dsh-im-gateway/channels/line
 */

import type { ChannelAdapter, ImMessage } from '../core/types.js'
import { createServer, type Server } from 'node:http'

export interface LineChannelConfig {
  enabled?: boolean
  channelSecret?: string
  /** Channel access token。 */
  channelToken?: string
  port?: number
  webhookPath?: string
}

interface LineEvent {
  type?: string
  message?: { type?: string; text?: string }
  source?: { userId?: string }
  replyToken?: string
}

interface LineWebhook {
  events?: LineEvent[]
}

export function createLineChannel(config: LineChannelConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const channelToken = config.channelToken ?? process.env.DSH_LINE_TOKEN
  const channelSecret = config.channelSecret ?? process.env.DSH_LINE_SECRET
  if (!channelToken) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let server: Server | undefined
  let statusText = '未启动'
  const path = config.webhookPath ?? '/line-webhook'

  return {
    id: 'line',
    label: 'LINE',
    maxMessageLength: 5000,
    async start() {
      server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
        if (url.pathname !== path || req.method !== 'POST') {
          res.writeHead(404).end()
          return
        }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          // LINE 要求尽快 200
          res.writeHead(200).end()
          try {
            const data = JSON.parse(body) as LineWebhook
            for (const ev of data.events ?? []) {
              if (ev.type !== 'message' || ev.message?.type !== 'text') continue
              if (!ev.message.text) continue
              void handler?.({
                chatId: ev.source?.userId ?? 'line-unknown',
                userId: ev.source?.userId,
                text: ev.message.text,
                context: { replyToken: ev.replyToken },
              })
            }
          } catch { /* 忽略坏请求 */ }
        })
      })
      const port = config.port ?? 8788
      await new Promise<void>((resolve, reject) => {
        server?.listen(port, () => resolve())
        server?.on('error', reject)
      })
      statusText = `webhook 监听 :${port}${path}`
      log(`[line] webhook 已监听 :${port}${path}（请把 LINE webhook URL 指向公网可达的本机地址）`)
    },
    async stop() {
      await new Promise<void>((resolve) => server?.close(() => resolve()))
      server = undefined
    },
    async send(chatId, text) {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { authorization: `Bearer ${channelToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ to: chatId, messages: [{ type: 'text', text }] }),
      })
      if (!res.ok) throw new Error(`line push: HTTP ${res.status}`)
    },
    setMessageHandler(h) {
      handler = h
    },
    status() {
      return statusText
    },
  }
}
