/**
 * IRC 渠道适配器：原生 net.Socket 实现 IRC 客户端（零依赖）。
 * 支持频道消息与私聊 DM；自动 PING/PONG。
 * @module dsh-im-gateway/channels/irc
 */

import type { ChannelAdapter, ImMessage } from '../core/types.js'
import { connect, type Socket } from 'node:net'

export interface IrcChannelConfig {
  enabled?: boolean
  server?: string
  port?: number
  nick?: string
  password?: string
  /** 加入的频道列表（#channel）。 */
  channels?: string[]
  /** 仅响应 @nick 提及（否则频道内所有消息都进 agent）。 */
  mentionOnly?: boolean
}

export function createIrcChannel(config: IrcChannelConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const server = config.server ?? process.env.DSH_IRC_SERVER
  if (!server) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let socket: Socket | undefined
  let stopped = false
  let buffer = ''
  let statusText = '未连接'
  const nick = config.nick ?? 'dsh-agent'
  const channels = config.channels ?? []
  let adapter: ChannelAdapter | undefined

  adapter = {
    id: 'irc',
    label: 'IRC',
    maxMessageLength: 400,
    async start() {
      stopped = false
      socket = connect({ host: server, port: config.port ?? 6667 }, () => {
        if (config.password) socket?.write(`PASS ${config.password}\r\n`)
        socket?.write(`NICK ${nick}\r\n`)
        socket?.write(`USER ${nick} 0 * :dsh-im-gateway agent\r\n`)
        for (const ch of channels) socket?.write(`JOIN ${ch}\r\n`)
        statusText = `已连接 ${server}`
        log(`[irc] 已连接 ${server}，昵称 ${nick}${channels.length ? `，加入 ${channels.join(', ')}` : ''}`)
      })
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8')
        let idx: number
        while ((idx = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          handleLine(line)
        }
      })
      socket.on('close', () => {
        statusText = '已断开'
        if (!stopped) {
          log('[irc] 连接断开，5s 后重连')
          setTimeout(() => void adapter?.start(), 5000)
        }
      })
      socket.on('error', (err) => {
        statusText = `错误: ${err.message}`
        log(`[irc] 错误: ${err.message}`)
      })
    },
    async stop() {
      stopped = true
      for (const ch of channels) socket?.write(`PART ${ch}\r\n`)
      socket?.write('QUIT :dsh-im-gateway shutdown\r\n')
      socket?.end()
      socket = undefined
    },
    async send(chatId, text) {
      const target = chatId.startsWith('#') ? chatId : chatId.startsWith('user:') ? chatId.slice(5) : chatId
      for (const line of text.split('\n')) {
        socket?.write(`PRIVMSG ${target} :${line}\r\n`)
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

  function handleLine(line: string): void {
    if (line.startsWith('PING')) {
      socket?.write(`PONG ${line.slice(5)}\r\n`)
      return
    }
    const m = line.match(/^:([^!\s]+)![^@\s]+@\S+\s+PRIVMSG\s+(\S+)\s+:(.*)$/)
    if (!m) return
    const from = m[1] ?? ''
    const target = m[2] ?? ''
    const text = m[3] ?? ''
    if (from === nick) return
    let chatId: string
    if (target === nick) {
      chatId = `user:${from}` // 私聊
    } else {
      if (config.mentionOnly && !text.includes(`@${nick}`)) return
      chatId = target // 频道
    }
    void handler?.({
      chatId,
      userId: from,
      username: from,
      text: config.mentionOnly ? text.replace(new RegExp(`@${nick}\\b`), '').trim() : text,
    })
  }
}
