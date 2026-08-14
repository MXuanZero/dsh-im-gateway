/**
 * Synology Chat 渠道适配器：
 * - 发送：incoming webhook（POST { text }）
 * - 接收：outgoing webhook → 本地 HTTP server（用户把 Synology Chat 的
 *   outgoing webhook 指向本机公网地址）
 * @module dsh-im-gateway/channels/synology
 */

import type { ChannelAdapter, ImMessage } from '../core/types.js'
import { createServer, type Server } from 'node:http'

export interface SynologyChannelConfig {
  enabled?: boolean
  /** incoming webhook URL（Synology Chat 集成里生成）。 */
  webhookUrl?: string
  /** outgoing webhook 本地监听端口。 */
  port?: number
}

export function createSynologyChannel(config: SynologyChannelConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const webhookUrl = config.webhookUrl ?? process.env.DSH_SYNOLOGY_WEBHOOK_URL
  if (!webhookUrl) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let server: Server | undefined
  let statusText = '未启动'

  return {
    id: 'synology',
    label: 'Synology Chat',
    maxMessageLength: 4000,
    async start() {
      server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
        if (url.pathname !== '/synology-webhook' || req.method !== 'POST') {
          res.writeHead(404).end()
          return
        }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
          try {
            const data = JSON.parse(body) as { text?: string; user_id?: string; username?: string; token?: string }
            if (!data.text) return
            void handler?.({
              chatId: 'synology',
              userId: data.user_id ? String(data.user_id) : data.username,
              username: data.username,
              text: data.text,
            })
          } catch { /* 忽略 */ }
        })
      })
      const port = config.port ?? 8790
      await new Promise<void>((resolve, reject) => {
        server?.listen(port, () => resolve())
        server?.on('error', reject)
      })
      statusText = `webhook 监听 :${port}`
      log('[synology] outgoing webhook 已监听（需要公网可达）')
    },
    async stop() {
      await new Promise<void>((resolve) => server?.close(() => resolve()))
      server = undefined
    },
    async send(_chatId, text) {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error(`synology webhook: HTTP ${res.status}`)
    },
    setMessageHandler(h) {
      handler = h
    },
    status() {
      return statusText
    },
  }
}
