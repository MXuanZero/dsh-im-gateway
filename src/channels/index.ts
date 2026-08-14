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
import { createWebChatChannel } from './webchat.js'
import { createTlonChannel, createYuanbaoChannel, createVoiceChannel } from './stubs.js'

export type ChannelLog = (line: string) => void

/** 创建全部已配置渠道。stateDir 供扫码/状态类渠道落盘。 */
export function createChannels(config: ImGatewayConfig, log: ChannelLog, stateDir: string): ChannelAdapter[] {
  const c = config.channels
  const factories: Array<ChannelAdapter | undefined> = [
    createTelegramChannel(c.telegram ?? {}, log),
    createDiscordChannel(c.discord ?? {}, log),
    createSlackChannel(c.slack ?? {}, log),
    createFeishuChannel(c.feishu ?? {}, log),
    createWechatChannel(c.wechat ?? {}, log, stateDir),
    createQQBotChannel(c.qqbot ?? {}, log),
    createWhatsAppChannel(c.whatsapp ?? {}, log, stateDir),
    createSignalChannel(c.signal ?? {}, log),
    createMSTeamsChannel(c.msteams ?? {}, log),
    createLineChannel(c.line ?? {}, log),
    createMatrixChannel(c.matrix ?? {}, log),
    createMattermostChannel(c.mattermost ?? {}, log),
    createGoogleChatChannel(c.googlechat ?? {}, log),
    createIrcChannel(c.irc ?? {}, log),
    createTwitchChannel(c.twitch ?? {}, log),
    createNostrChannel(c.nostr ?? {}, log),
    createNextcloudChannel(c.nextcloud ?? {}, log),
    createSynologyChannel(c.synology ?? {}, log),
    createZaloChannel(c.zalo ?? {}, log),
    createIMessageChannel(c.imessage ?? {}, log),
    createWebChatChannel(c.webchat ?? {}, log),
    createTlonChannel(c.tlon ?? {}, log),
    createYuanbaoChannel(c.yuanbao ?? {}, log),
    createVoiceChannel(c.voice ?? {}, log),
  ]
  return factories.filter((f): f is ChannelAdapter => f !== undefined)
}

export { createTelegramChannel, createDiscordChannel, createSlackChannel, createFeishuChannel, createWechatChannel }
