/**
 * WhatsApp 渠道适配器：基于 @whiskeysockets/baileys（可选依赖，动态 import）。
 * 需要扫码配对（配对码写入状态目录 whatsaapp-pairing.txt 并在日志输出）。
 * @module dsh-im-gateway/channels/whatsapp
 */

import type { ChannelAdapter, ImMessage } from '../core/types.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface WhatsAppChannelConfig {
  enabled?: boolean
  stateDir?: string
}

// baileys 类型重且随版本漂移，适配层用宽松类型 + 动态 import
type BaileysSocket = {
  end(error?: Error): void
  logout?(): Promise<void>
  sendMessage(jid: string, content: Record<string, unknown>): Promise<unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ev: { on(event: string, cb: (data: any) => void): void }
}

export function createWhatsAppChannel(config: WhatsAppChannelConfig, log: (line: string) => void, stateDir: string): ChannelAdapter | undefined {
  if (!config.enabled) return undefined
  const dir = config.stateDir ?? stateDir
  const pairingPath = join(dir, 'whatsapp-pairing.txt')

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let sock: BaileysSocket | undefined
  let statusText = '未启动'
  let stopped = false
  let adapter: ChannelAdapter | undefined

  adapter = {
    id: 'whatsapp',
    label: 'WhatsApp',
    maxMessageLength: 4000,
    async start() {
      stopped = false
      let baileys: typeof import('@whiskeysockets/baileys')
      try {
        baileys = await import('@whiskeysockets/baileys')
      } catch {
        statusText = '缺少依赖'
        log('[whatsapp] 需要安装 @whiskeysockets/baileys：`npm i @whiskeysockets/baileys`')
        return
      }
      const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = baileys
      // baileys 版本间类型漂移，宽松化
      const { state: authState } = await useMultiFileAuthState(join(dir, 'whatsapp-auth'))
      const socket = (makeWASocket as unknown as (opts: Record<string, unknown>) => BaileysSocket)({
        auth: authState,
        printQRInTerminal: false,
        browser: ['dsh-im-gateway', 'Chrome', '1.0'],
      })
      sock = socket
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.ev.on('connection.update', (update: Record<string, unknown>) => {
        const qr = update.qr as string | undefined
        const connection = update.connection as string | undefined
        if (qr) {
          statusText = '等待扫码'
          log(`[whatsapp] 请用 WhatsApp 扫码配对（配对码见 ${pairingPath}）`)
          try {
            mkdirSync(dir, { recursive: true })
            writeFileSync(pairingPath, `${qr}\n`)
          } catch { /* 忽略 */ }
        }
        if (connection === 'open') {
          statusText = '已连接'
          log('[whatsapp] 配对成功，已连接')
        }
        if (connection === 'close') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lastDisconnect = update.lastDisconnect as { error?: { output?: { statusCode?: number } } } | undefined
          const code = lastDisconnect?.error?.output?.statusCode
          statusText = code === DisconnectReason.loggedOut ? '已登出' : '已断开'
          if (code !== DisconnectReason.loggedOut && !stopped) {
            log(`[whatsapp] 连接关闭（code ${code}），5s 后重连`)
            setTimeout(() => void adapter?.start(), 5000)
          }
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.ev.on('messages.upsert', (data: Record<string, unknown>) => {
        const messages = data.messages as Array<Record<string, unknown>> | undefined
        for (const raw of messages ?? []) {
          const key = raw.key as { remoteJid?: string; fromMe?: boolean } | undefined
          if (key?.fromMe) continue
          const msg = raw.message as { conversation?: string; extendedTextMessage?: { text?: string } } | undefined
          const remoteJid = key?.remoteJid
          const text = msg?.conversation ?? msg?.extendedTextMessage?.text
          if (!remoteJid || !text) continue
          void handler?.({
            chatId: remoteJid,
            userId: remoteJid.split('@')[0],
            text,
          })
        }
      })
    },
    async stop() {
      stopped = true
      sock?.end()
      sock = undefined
    },
    async send(chatId, text) {
      if (!sock) throw new Error('whatsapp: 未连接')
      await sock.sendMessage(chatId, { text })
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
