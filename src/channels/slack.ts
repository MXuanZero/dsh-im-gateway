/**
 * Slack 渠道适配器：Socket Mode（app-level token 建 WebSocket）+ Web API，
 * 零第三方依赖（原生 WebSocket + fetch）。需要接收 ack（envelope_id）。
 * @module dsh-im-gateway/channels/slack
 */

import type { ChannelAdapter, ImMessage } from '../core/types.js'

export interface SlackChannelConfig {
  enabled?: boolean
  /** Bot token（xoxb-…）；缺省回退 DSH_SLACK_TOKEN。 */
  token?: string
  /** App-level token（xapp-…）；缺省回退 DSH_SLACK_APP_TOKEN。 */
  appToken?: string
}

interface SlackEnvelope {
  envelope_id: string
  type: string
  payload?: {
    type?: string
    event?: {
      type?: string
      text?: string
      user?: string
      channel?: string
      channel_type?: string
      bot_id?: string
    }
  }
}

export function createSlackChannel(config: SlackChannelConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const token = config.token ?? process.env.DSH_SLACK_TOKEN
  const appToken = config.appToken ?? process.env.DSH_SLACK_APP_TOKEN
  if (!token || !appToken) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let ws: WebSocket | undefined
  let stopped = false
  let statusText = '未连接'

  async function openSocket(): Promise<string> {
    const res = await fetch('https://slack.com/api/apps.connections.open', {
      method: 'POST',
      headers: { authorization: `Bearer ${appToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = (await res.json()) as { ok: boolean; url?: string; error?: string }
    if (!data.ok || !data.url) throw new Error(`slack apps.connections.open: ${data.error ?? 'no url'}`)
    return data.url
  }

  async function postMessage(channel: string, text: string): Promise<void> {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ channel, text }),
    })
    const data = (await res.json()) as { ok: boolean; error?: string }
    if (!data.ok) throw new Error(`slack chat.postMessage: ${data.error ?? 'unknown'}`)
  }

  async function connect(): Promise<void> {
    const url = await openSocket()
    ws = new WebSocket(url)
    ws.onopen = () => {
      statusText = '已连接'
      log('[slack] Socket Mode 已连接')
    }
    ws.onmessage = (ev) => {
      let envelope: SlackEnvelope
      try {
        envelope = JSON.parse(String(ev.data)) as SlackEnvelope
      } catch {
        return
      }
      // 所有 envelope 都要 ack，否则 Slack 会重发
      ws?.send(JSON.stringify({ envelope_id: envelope.envelope_id }))
      if (envelope.type === 'hello') return
      const event = envelope.payload?.event
      if (!event || event.type !== 'message') return
      if (!event.text || event.bot_id) return
      void handler?.({
        chatId: event.channel ?? '',
        userId: event.user,
        text: event.text,
        context: { channelType: event.channel_type },
      })
    }
    ws.onclose = (ev) => {
      statusText = `已断开（code ${ev.code}）`
      if (!stopped) {
        log(`[slack] 连接断开（${ev.code}），3s 后重连`)
        setTimeout(() => void connect(), 3000)
      }
    }
    ws.onerror = () => {
      statusText = '连接错误'
    }
  }

  return {
    id: 'slack',
    label: 'Slack',
    maxMessageLength: 40000,
    async start() {
      stopped = false
      await connect()
    },
    async stop() {
      stopped = true
      ws?.close(1000, 'shutdown')
      ws = undefined
    },
    async send(chatId, text) {
      await postMessage(chatId, text)
    },
    setMessageHandler(h) {
      handler = h
    },
    status() {
      return statusText
    },
  }
}
