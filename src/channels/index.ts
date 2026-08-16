/**
 * 渠道注册表：把配置对象映射为各渠道 adapter 实例。
 * 每个 factory 在凭据缺失/未启用时返回 undefined（不启动）。
 * @module dsh-im-gateway/channels
 */

import type { ChannelAdapter, ImGatewayConfig } from '../core/types.js'
import { createTelegramChannel } from './telegram.js'
import { createDiscordChannel } from './discord.js'
import { createSlackChannel } from './slack.js'
import { createFeishuChannel } from './feishu.js'
import { createWechatChannel } from './wechat.js'
import { createQQBotChannel } from './qqbot.js'
import { createWhatsAppChannel } from './whatsapp.js'
import { createSignalChannel } from './signal.js'
import { createMSTeamsChannel } from './msteams.js'
import { createLineChannel } from './line.js'
import { createMatrixChannel } from './matrix.js'
import { createMattermostChannel } from './mattermost.js'
import { createGoogleChatChannel } from './googlechat.js'
import { createIrcChannel } from './irc.js'
import { createTwitchChannel } from './twitch.js'
import { createNostrChannel } from './nostr.js'
import { createNextcloudChannel } from './nextcloud.js'
import { createSynologyChannel } from './synology.js'
import { createZaloChannel } from './zalo.js'
import { createIMessageChannel } from './imessage.js'
import { createTlonChannel, createYuanbaoChannel, createVoiceChannel } from './stubs.js'

export type ChannelLog = (line: string) => void

/** 渠道 id 列表（展示顺序即推荐顺序）。 */
export const CHANNEL_IDS = [
  'wechat',
  'feishu',
  'telegram',
  'qqbot',
  'discord',
  'slack',
  'whatsapp',
  'signal',
  'msteams',
  'line',
  'matrix',
  'mattermost',
  'googlechat',
  'irc',
  'twitch',
  'nostr',
  'nextcloud',
  'synology',
  'zalo',
  'imessage',
  'tlon',
  'yuanbao',
  'voice',
] as const

export type ChannelId = (typeof CHANNEL_IDS)[number]

/** 渠道展示元数据（UI 面板用）。 */
export interface ChannelField {
  key: string
  label: string
  /** 密文字段（输入框用 password）。 */
  secret?: boolean
}

export interface ChannelMeta {
  label: string
  emoji: string
  /** 连接所需的最小配置字段（UI 表单提示）。 */
  needs: string[]
  /** 凭据表单字段（kind=credentials 时渲染输入框）。 */
  fields: ChannelField[]
  /** 一句话连接说明。 */
  hint: string
  /** 连接方式：qr=扫码登录 credentials=填凭据 simple=开关即用 stub=未实现。 */
  kind: 'qr' | 'credentials' | 'simple' | 'stub'
}

export const CHANNEL_META: Record<ChannelId, ChannelMeta> = {
  wechat: { label: '微信', emoji: '💬', needs: [], fields: [], hint: '扫码登录，官方 iLink 协议，仅私聊（建议专用小号）', kind: 'qr' },
  feishu: { label: '飞书 / Lark', emoji: '📘', needs: ['App ID', 'App Secret'], fields: [{ key: 'appId', label: 'App ID' }, { key: 'appSecret', label: 'App Secret', secret: true }], hint: '开放平台创建应用，机器人事件走 WebSocket 长连接', kind: 'credentials' },
  telegram: { label: 'Telegram', emoji: '✈️', needs: ['Bot Token'], fields: [{ key: 'token', label: 'Bot Token', secret: true }], hint: '找 @BotFather 创建机器人拿 token', kind: 'credentials' },
  qqbot: { label: 'QQ 机器人', emoji: '🐧', needs: ['AppID', 'AppSecret'], fields: [{ key: 'appId', label: 'AppID' }, { key: 'appSecret', label: 'AppSecret', secret: true }], hint: 'QQ 开放平台创建机器人（官方 API）', kind: 'credentials' },
  discord: { label: 'Discord', emoji: '🎮', needs: ['Bot Token'], fields: [{ key: 'token', label: 'Bot Token', secret: true }], hint: 'Discord Developer Portal 创建应用拿 token', kind: 'credentials' },
  slack: { label: 'Slack', emoji: '💼', needs: ['Bot Token', 'App Token'], fields: [{ key: 'token', label: 'Bot Token (xoxb-)', secret: true }, { key: 'appToken', label: 'App Token (xapp-)', secret: true }], hint: 'Socket Mode 需要 xoxb- 和 xapp- 两个 token', kind: 'credentials' },
  whatsapp: { label: 'WhatsApp', emoji: '🟢', needs: [], fields: [], hint: '扫码配对（需安装 baileys 依赖）', kind: 'qr' },
  signal: { label: 'Signal', emoji: '🔒', needs: ['手机号', 'signal-cli'], fields: [{ key: 'phone', label: '本机号码（+86…）' }], hint: '需本机安装 signal-cli 并注册号码', kind: 'credentials' },
  msteams: { label: 'Microsoft Teams', emoji: '🏢', needs: ['App ID', 'App Password'], fields: [{ key: 'appId', label: 'App ID' }, { key: 'appPassword', label: 'App Password', secret: true }], hint: '实验性：需 Azure Bot Framework 注册', kind: 'credentials' },
  line: { label: 'LINE', emoji: '🟩', needs: ['Channel Token'], fields: [{ key: 'channelToken', label: 'Channel Access Token', secret: true }], hint: 'Messaging API；接收需公网 webhook', kind: 'credentials' },
  matrix: { label: 'Matrix', emoji: '🧩', needs: ['Homeserver', 'Access Token'], fields: [{ key: 'homeserver', label: 'Homeserver（如 https://matrix.org）' }, { key: 'accessToken', label: 'Access Token', secret: true }], hint: '客户端同步长轮询', kind: 'credentials' },
  mattermost: { label: 'Mattermost', emoji: '🅜', needs: ['Server URL', 'Token'], fields: [{ key: 'serverUrl', label: '服务器地址' }, { key: 'token', label: '个人访问令牌', secret: true }], hint: 'WebSocket + REST', kind: 'credentials' },
  googlechat: { label: 'Google Chat', emoji: '🔷', needs: [], fields: [], hint: '实验性：接收需公网 webhook', kind: 'stub' },
  irc: { label: 'IRC', emoji: '💻', needs: ['服务器地址'], fields: [{ key: 'server', label: '服务器地址' }, { key: 'nick', label: '昵称（可选）' }], hint: '经典 IRC 协议', kind: 'credentials' },
  twitch: { label: 'Twitch', emoji: '📺', needs: ['Bot 名', 'OAuth Token'], fields: [{ key: 'botName', label: 'Bot 用户名' }, { key: 'token', label: 'OAuth Token', secret: true }], hint: 'WebSocket IRC', kind: 'credentials' },
  nostr: { label: 'Nostr', emoji: '🧅', needs: ['私钥', '中继'], fields: [{ key: 'privateKey', label: '私钥 (hex)', secret: true }, { key: 'relays', label: '中继（逗号分隔）' }], hint: 'NIP-04 私信（需安装 @noble/curves）', kind: 'credentials' },
  nextcloud: { label: 'Nextcloud Talk', emoji: '☁️', needs: ['Server URL', '账号', '密码'], fields: [{ key: 'serverUrl', label: '服务器地址' }, { key: 'user', label: '用户名' }, { key: 'password', label: '密码', secret: true }], hint: '实验性：Nextcloud Talk', kind: 'credentials' },
  synology: { label: 'Synology Chat', emoji: '🖥️', needs: ['Webhook URL'], fields: [{ key: 'webhookUrl', label: 'Incoming Webhook URL', secret: true }], hint: '群晖 NAS 聊天', kind: 'credentials' },
  zalo: { label: 'Zalo', emoji: '🇻🇳', needs: ['Access Token'], fields: [{ key: 'accessToken', label: 'OA Access Token', secret: true }], hint: '实验性：Zalo OA', kind: 'credentials' },
  imessage: { label: 'iMessage', emoji: '🍏', needs: [], fields: [], hint: 'macOS only；发送 osascript / 接收 imsg 桥', kind: 'simple' },
  tlon: { label: 'Tlon (Urbit)', emoji: '🌌', needs: [], fields: [], hint: '骨架：未实现完整协议', kind: 'stub' },
  yuanbao: { label: '腾讯元宝', emoji: '🧧', needs: [], fields: [], hint: '骨架：未实现', kind: 'stub' },
  voice: { label: '语音电话', emoji: '📞', needs: [], fields: [], hint: '骨架：需 Twilio/Plivo', kind: 'stub' },
}

/** 创建单个渠道（凭据缺失/未启用返回 undefined）。 */
export function createChannel(id: string, config: Record<string, unknown>, log: ChannelLog, stateDir: string): ChannelAdapter | undefined {
  switch (id) {
    case 'telegram': return createTelegramChannel(config, log)
    case 'discord': return createDiscordChannel(config, log)
    case 'slack': return createSlackChannel(config, log)
    case 'feishu': return createFeishuChannel(config, log)
    case 'wechat': return createWechatChannel(config, log, stateDir)
    case 'qqbot': return createQQBotChannel(config, log)
    case 'whatsapp': return createWhatsAppChannel(config, log, stateDir)
    case 'signal': return createSignalChannel(config, log)
    case 'msteams': return createMSTeamsChannel(config, log)
    case 'line': return createLineChannel(config, log)
    case 'matrix': return createMatrixChannel(config, log)
    case 'mattermost': return createMattermostChannel(config, log)
    case 'googlechat': return createGoogleChatChannel(config, log)
    case 'irc': return createIrcChannel(config, log)
    case 'twitch': return createTwitchChannel(config, log)
    case 'nostr': return createNostrChannel(config, log)
    case 'nextcloud': return createNextcloudChannel(config, log)
    case 'synology': return createSynologyChannel(config, log)
    case 'zalo': return createZaloChannel(config, log)
    case 'imessage': return createIMessageChannel(config, log)
    case 'tlon': return createTlonChannel(config, log)
    case 'yuanbao': return createYuanbaoChannel(config, log)
    case 'voice': return createVoiceChannel(config, log)
    default: return undefined
  }
}

/** 创建全部已配置渠道。stateDir 供扫码/状态类渠道落盘。 */
export function createChannels(config: ImGatewayConfig, log: ChannelLog, stateDir: string): ChannelAdapter[] {
  const out: ChannelAdapter[] = []
  for (const id of CHANNEL_IDS) {
    const channel = createChannel(id, (config.channels as Record<string, Record<string, unknown>>)[id] ?? {}, log, stateDir)
    if (channel) out.push(channel)
  }
  return out
}

export { createTelegramChannel, createDiscordChannel, createSlackChannel, createFeishuChannel, createWechatChannel }
