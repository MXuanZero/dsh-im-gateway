/**
 * 微信渠道适配器：通过腾讯非官方 iLink 网关（ilinkai.weixin.qq.com）接入个人微信。
 * 协议移植自 hermes-agent / AMClaw 同源实现（与 OpenClaw 微信插件同一机制）：
 * 扫码登录 → 长轮询收消息 → context_token 回复。
 *
 * ⚠️ 非官方通道：仅私聊、一个账号一个 poller，建议使用专用小号，有被限制风险。
 * @module dsh-im-gateway/channels/wechat
 */

import type { ChannelAdapter, ImMessage } from '../core/types.js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface WechatChannelConfig {
  enabled?: boolean
  /** 登录/上下文状态落盘目录。 */
  stateDir?: string
  pollTimeoutSecs?: number
}

const BASE_URL = 'https://ilinkai.weixin.qq.com'

interface WechatState {
  allowedUserId?: string
  contextTokens: Record<string, string>
}

type Json = Record<string, unknown>

function pickStr(obj: Json, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null && v !== '') return String(v)
  }
  return undefined
}

function normalizeId(v: unknown): string | undefined {
  if (typeof v === 'string') return v || undefined
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v))
  if (v && typeof v === 'object') {
    const inner = pickStr(v as Json, 'id', 'value', 'str')
    if (inner !== undefined) return normalizeId(inner)
  }
  return undefined
}

export function createWechatChannel(config: WechatChannelConfig, log: (line: string) => void, stateDir: string): ChannelAdapter | undefined {
  if (!config.enabled) return undefined
  const dir = config.stateDir ?? stateDir
  const statePath = join(dir, 'wechat-state.json')
  const loginPath = join(dir, 'wechat-login.txt')

  let state: WechatState = loadState()
  let handler: ((msg: ImMessage) => void | Promise<void>) | undefined
  let stopped = false
  let botToken = ''
  let statusText = '未登录'

  const uin = Buffer.from(String(Math.floor(Math.random() * 0xffffffff)), 'utf8').toString('base64')

  function loadState(): WechatState {
    try {
      const raw = readFileSync(statePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<WechatState>
      return { allowedUserId: parsed.allowedUserId, contextTokens: parsed.contextTokens ?? {} }
    } catch {
      return { contextTokens: {} }
    }
  }

  function flush(): void {
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(statePath, JSON.stringify(state, null, 2))
    } catch (err) {
      log(`[wechat] 状态落盘失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function headers(): Record<string, string> {
    const h: Record<string, string> = {
      'content-type': 'application/json',
      'iLink-App-ClientVersion': '1',
      'X-WECHAT-UIN': uin,
    }
    if (botToken) {
      h['Authorization'] = `Bearer ${botToken}`
      h['AuthorizationType'] = 'ilink_bot_token'
    }
    return h
  }

  async function request(path: string, body: unknown, timeoutMs: number, tolerateRet1 = false): Promise<Json> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new Error(`wechat ${path} http ${res.status}`)
    const data = (await res.json()) as Json
    const ret = Number(data.ret ?? 0)
    const errcode = Number(data.errcode ?? 0)
    if (tolerateRet1 && ret === 1 && errcode === 0) return data
    if (ret !== 0 || errcode !== 0) {
      throw new Error(`wechat ${path} ret=${ret} errcode=${errcode} ${String(data.errmsg ?? '')}`)
    }
    return data
  }

  async function loginLoop(): Promise<boolean> {
    while (!stopped) {
      let qr: Json
      try {
        qr = await request('/ilink/bot/get_bot_qrcode?bot_type=3', {}, 15_000)
      } catch (err) {
        log(`[wechat] 获取二维码失败，5s 后重试: ${err instanceof Error ? err.message : String(err)}`)
        await sleep(5000)
        continue
      }
      const qrcodeId = pickStr(qr, 'qrcode', 'qrcode_id')
      const qrUrl = pickStr(qr, 'qrcode_img_content', 'qrcode_url', 'url')
      if (!qrcodeId || !qrUrl) {
        log('[wechat] 二维码字段缺失，5s 后重试')
        await sleep(5000)
        continue
      }
      statusText = '等待扫码'
      log(`[wechat] 请用微信扫码登录: ${qrUrl}`)
      try {
        mkdirSync(dir, { recursive: true })
        writeFileSync(loginPath, `${qrUrl}\n`)
      } catch { /* 忽略 */ }

      while (!stopped) {
        let st: Json
        try {
          st = await request(`/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcodeId)}`, {}, 40_000, true)
        } catch {
          await sleep(2000)
          continue
        }
        const status = String(st.status ?? '')
        if (Number(st.ret ?? 0) === 0 && status === 'confirmed') {
          const token = pickStr(st, 'bot_token')
          const userId = pickStr(st, 'ilink_user_id')
          if (!token || !userId) throw new Error('wechat confirmed 但缺少 token/user')
          botToken = token
          if (!state.allowedUserId) {
            state.allowedUserId = userId
            flush()
            log(`[wechat] 已绑定白名单用户 ${userId}（仅该用户可驱动）`)
          } else if (state.allowedUserId !== userId) {
            log(`[wechat] 扫码用户 ${userId} 不在白名单（白名单=${state.allowedUserId}）`)
            return false
          }
          statusText = '已登录'
          log('[wechat] 登录完成')
          return true
        }
        if (status === 'expired') {
          log('[wechat] 二维码已过期，重新获取')
          break
        }
        await sleep(2000)
      }
    }
    return false
  }

  async function pollLoop(): Promise<void> {
    if (!(await loginLoop())) return
    let cursor = ''
    while (!stopped) {
      let data: Json
      try {
        data = await request(
          '/ilink/bot/getupdates',
          { get_updates_buf: cursor, base_info: { channel_version: '1.0.0' } },
          (config.pollTimeoutSecs ?? 70) * 1000 + 5000,
        )
      } catch (err) {
        if (stopped) return
        log(`[wechat] 长轮询失败，5s 后重试: ${err instanceof Error ? err.message : String(err)}`)
        await sleep(5000)
        continue
      }
      cursor = pickStr(data, 'get_updates_buf', 'cursor', 'sync_buf') ?? cursor
      const rawList = data.msgs ?? data.messages ?? data.updates
      if (!Array.isArray(rawList)) continue
      for (const raw of rawList) {
        try {
          const msg = parseInbound(raw)
          if (!msg) continue
          if (msg.contextToken) state.contextTokens[msg.fromUserId] = msg.contextToken
          if (state.allowedUserId && msg.fromUserId !== state.allowedUserId) continue
          void handler?.({
            chatId: msg.fromUserId,
            userId: msg.fromUserId,
            text: msg.text,
            context: { contextToken: msg.contextToken },
          })
        } catch { /* 单条失败跳过 */ }
      }
      flush()
    }
  }

  function parseInbound(raw: unknown): { fromUserId: string; contextToken?: string; text: string; messageId: string } | null {
    if (!raw || typeof raw !== 'object') return null
    let m = raw as Json
    if (m.message && typeof m.message === 'object') m = { ...m, ...(m.message as Json) }
    if (m.message_type !== undefined && Number(m.message_type) !== 1) return null
    const fromUserId = pickStr(m, 'from_user_id', 'from_user')
    if (!fromUserId) return null
    const parts: string[] = []
    if (typeof m.text === 'string') parts.push(m.text)
    if (Array.isArray(m.item_list)) {
      for (const item of m.item_list) {
        const t = (item as Json)?.text_item as Json | undefined
        if (t && typeof t.text === 'string') parts.push(t.text)
      }
    }
    const text = parts.join('').trim()
    if (!text) return null
    const messageId = normalizeId(m.message_id) ?? normalizeId(m.msg_id) ?? `${fromUserId}:${String(m.create_time_ms ?? m.create_time ?? 0)}`
    const contextToken = pickStr(m, 'context_token')
    return { fromUserId, contextToken, text, messageId: String(messageId) }
  }

  async function sendRaw(toUserId: string, text: string, clientId: string): Promise<void> {
    const contextToken = state.contextTokens[toUserId]
    if (!contextToken) throw new Error('wechat 回复跳过：没有该用户的 context_token')
    await request(
      '/ilink/bot/sendmessage',
      {
        msg: {
          from_user_id: '',
          to_user_id: toUserId,
          client_id: clientId,
          message_type: 2,
          message_state: 2,
          context_token: contextToken,
          item_list: [{ type: 1, text_item: { text } }],
        },
        base_info: { channel_version: '1.0.0' },
      },
      15_000,
    )
  }

  return {
    id: 'wechat',
    label: '微信',
    maxMessageLength: 1200,
    async start() {
      stopped = false
      statusText = '登录中'
      void pollLoop()
    },
    async stop() {
      stopped = true
      flush()
    },
    async send(chatId, text) {
      await sendRaw(chatId, text, `dsh-im-gateway:${Date.now()}:${Math.floor(Math.random() * 1e6)}`)
    },
    setMessageHandler(h) {
      handler = h
    },
    status() {
      return statusText
    },
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
