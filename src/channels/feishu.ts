/**
 * 飞书 / Lark 渠道适配器：官方 Node SDK 的 WebSocket 长连接 + IM API。
 * SDK（@larksuiteoapi/node-sdk）为可选依赖，动态 import；
 * 未安装时给出安装提示。默认模式：WebSocket 长连接（无需公网 URL）。
 * @module dsh-im-gateway/channels/feishu
 */

import type { ChannelAdapter, ImMessage } from '../core/types.js'

export interface FeishuChannelConfig {
  enabled?: boolean
  /** 飞书开放平台应用的 App ID；缺省回退 DSH_FEISHU_APP_ID。 */
  appId?: string
  /** App Secret；缺省回退 DSH_FEISHU_APP_SECRET。 */
  appSecret?: string
}

type FeishuClient = {
  im: {
    message: {
      create: (opts: {
        params: { receive_id_type: string }
        data: { receive_id: string; msg_type: string; content: string }
      }) => Promise<unknown>
    }
  }
}

interface RawMessageEvent {
  sender?: {
    sender_id?: { open_id?: string; user_id?: string; union_id?: string }
  }
  message?: {
    message_id?: string
    chat_id?: string
    message_type?: string
    content?: string
  }
}

export function createFeishuChannel(config: FeishuChannelConfig, log: (line: string) => void): ChannelAdapter | undefined {
  const appId = config.appId ?? process.env.DSH_FEISHU_APP_ID
  const appSecret = config.appSecret ?? process.env.DSH_FEISHU_APP_SECRET
  if (!appId || !appSecret) return undefined

  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let client: FeishuClient | undefined
  let ws: { start(params: { eventDispatcher: unknown }): Promise<void>; close(params?: { force?: boolean }): void } | undefined
  let stopped = false
  let statusText = '未连接'

  return {
    id: 'feishu',
    label: '飞书 / Lark',
    maxMessageLength: 4000,
    async start() {
      stopped = false
      let sdk: typeof import('@larksuiteoapi/node-sdk')
      try {
        sdk = await import('@larksuiteoapi/node-sdk')
      } catch {
        statusText = '缺少依赖'
        log('[feishu] 需要安装 @larksuiteoapi/node-sdk：在 profile 目录执行 `npm i @larksuiteoapi/node-sdk`')
        return
      }
      client = new sdk.Client({ appId, appSecret }) as unknown as FeishuClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventDispatcher = new sdk.EventDispatcher({}).register({
        'im.message.receive_v1': (data: RawMessageEvent) => {
          const message = data.message
          if (!message || message.message_type !== 'text') return
          let text = ''
          try {
            text = (JSON.parse(message.content ?? '{}') as { text?: string }).text ?? ''
          } catch {
            text = message.content ?? ''
          }
          if (text === '') return
          void handler?.({
            chatId: message.chat_id ?? '',
            userId: data.sender?.sender_id?.open_id,
            text,
          })
        },
      })
      const wsClient = new sdk.WSClient({ appId, appSecret })
      ws = wsClient
      await wsClient.start({ eventDispatcher })
      statusText = 'WebSocket 长连接'
      log('[feishu] WebSocket 长连接已启动（机器人消息事件）')
    },
    async stop() {
      stopped = true
      ws?.close({ force: true })
      ws = undefined
    },
    async send(chatId, text) {
      if (!client) throw new Error('feishu: client 未就绪')
      await client.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      })
    },
    setMessageHandler(h) {
      handler = h
    },
    status() {
      return statusText
    },
  }
}
