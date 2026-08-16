/**
 * 聚合网关主服务：统一 IM 渠道的注册、会话路由、命令、审批桥与出站投递。
 *
 * 数据流：
 * - 入站：渠道 adapter → authorize → 命令? → merge → router 定位会话 → followup
 * - 出站：session/event（assistant/message）→ 按 sessionId 路由回渠道 → 分片 send
 * - 审批：approval/request waterfall → 推送到会话所在 chat → 回复「批准/拒绝」→ 返回 verdict
 * @module dsh-im-gateway/core/gateway
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage, type ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
// 引入 dsh-user-approval 的模块增强（approval/request 事件进入 Events key）
import type {} from '@deepseek-ai/dsh-user-approval'
// 引入 dsh-attachment 模块增强（ctx.attachments 服务）
import type {} from '@deepseek-ai/dsh-attachment'
// 引入 dsh-tools 模块增强（ctx.tools 服务）
import type {} from '@deepseek-ai/dsh-tools'
// 引入 dsh-session-query 模块增强（ctx.sessionQuery：会话列表/标题）
import type {} from '@deepseek-ai/dsh-session-query'
import { readFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { ApprovalBroker } from './approval.js'
import { SessionMerger, type MergeResult } from './merge.js'
import { SessionRouter, type ChatEntry } from './router.js'
import { splitText } from './split.js'
import { toPlainText } from './format.js'
import type { ChannelAdapter, ImGatewayConfig, ImMessage } from './types.js'

const PLUGIN_NAME = 'dsh-im-gateway'

const HELP_TEXT = [
  '🤖 dsh-im-gateway 可用命令：',
  '/help — 本帮助',
  '/status — 当前工作区 / 会话 / 待批准',
  '/new — 开启全新会话（per-chat 模式）',
  '/clear — 同 /new',
  '/workspaces — 列出所有工作区',
  '/workspace <路径> — 切换工作区（后续 /new 生效）',
  '/sessions [all|路径] — 列出会话（默认当前工作区；all 全部）',
  '/continue <会话id> — 继续已有会话（跨渠道/跨工作区）',
  '/bind <session-id> — 绑定本机 live 会话（bound 模式）',
  '/unbind — 解绑（bound 模式）',
  '/channels — 各渠道连接状态',
  '批准 / 拒绝 — 应答待批准的请求',
  '普通文本直接发给 agent；结尾 .. 表示还有后续，!! 表示立即提交',
].join('\n')

const TURN_END_LABEL: Record<string, string> = {
  completed: '✅ 完成',
  error: '❌ 出错',
  aborted: '⏹ 已中止',
  blocked: '🚫 被阻塞',
  'max-tokens': '↯ 达到 token 上限',
  interrupted: '⏸ 被打断',
}

export interface GatewayOptions {
  config: ImGatewayConfig
  /** 登录状态落盘目录（扫码链接等）。 */
  stateDir: string
  log: (line: string) => void
  /** 未授权用户触达时回调（如登记待授权请求）。返回给用户的提示文案（默认引导去设置批准）。 */
  onUnauthorized?: (channelId: string, msg: ImMessage) => string
  /** 每聊天工作区偏好的持久化（/workspace 命令）。 */
  workspaceStore?: {
    load(): Array<[string, string]>
    save(entries: Array<[string, string]>): void
  }
  /** 会话标题缓存持久化（/sessions 列表用；dsh 标题缺失时的兜底）。 */
  titleStore?: {
    load(): Record<string, string>
    save(titles: Record<string, string>): void
  }
}

export class ImGateway {
  private readonly ctx: Context
  private readonly config: ImGatewayConfig
  private readonly stateDir: string
  private readonly logLine: (line: string) => void
  /** 工作区偏好持久化（/workspace 命令）。 */
  private readonly workspaceStore: GatewayOptions['workspaceStore']
  /** 会话标题缓存（sessionId → 标题；dsh 标题缺失时兜底）。 */
  private readonly titleStore: GatewayOptions['titleStore']
  private readonly titles = new Map<string, string>()
  private readonly channels = new Map<string, ChannelAdapter>()
  private readonly router: SessionRouter
  private readonly broker = new ApprovalBroker()
  private readonly merger: SessionMerger
  private readonly mergeBuffers = new Map<string, string>()
  private readonly disposeEvents: Array<() => void> = []
  private readonly disposeTools: Array<() => void> = []
  /** 未授权回调（manager 登记待授权请求用）；options.onUnauthorized 兜底。 */
  private unauthorizedHandler: ((channelId: string, msg: ImMessage) => string) | undefined
  /** UI 批准的渠道白名单（manager 同步），重启后由 manager 重新灌入。 */
  private readonly extraAllowlist = new Map<string, Set<string>>()

  constructor(ctx: Context, options: GatewayOptions) {
    this.ctx = ctx
    this.config = options.config
    this.stateDir = options.stateDir
    this.logLine = options.log
    this.unauthorizedHandler = options.onUnauthorized
    this.workspaceStore = options.workspaceStore
    this.titleStore = options.titleStore
    for (const [sid, title] of Object.entries(options.titleStore?.load() ?? {})) this.titles.set(sid, title)
    this.router = new SessionRouter(ctx, {
      cwd: this.config.cwd,
      provider: this.config.provider,
      model: this.config.model,
    })
    // 恢复每聊天工作区偏好
    this.router.restoreWorkspaces(options.workspaceStore?.load() ?? [])
    this.merger = new SessionMerger({
      mergeTimeoutMs: this.config.mergeTimeoutSecs * 1000,
      onSnapshot: (key, buffer) => this.mergeBuffers.set(key, buffer),
      onFlush: (key, text) => {
        const [channelId, chatId] = splitKey(key)
        if (!channelId || !chatId) return
        void this.injectText(channelId, chatId, text)
      },
    })
    // 崩溃恢复：未 flush 的合并缓冲（重启后超时即提交）
    for (const [key, buffer] of this.mergeBuffers) this.merger.restore(key, buffer)

    // 出站：agent 输出 → 渠道
    this.disposeEvents.push(
      ctx.on('session/event', (session, event) => {
        this.handleSessionEvent(session, event)
      }, { global: true }),
    )

    // 审批桥：approval/request waterfall
    this.disposeEvents.push(
      ctx.on('approval/request', async (req, next) => {
        return this.handleApprovalRequest(req, next)
      }, { global: true }),
    )

    // 工具：agent 可以把工作区文件发给当前 IM 聊天（图片/视频/文档）
    this.registerSendMediaTool()
  }

  // ── 渠道注册 ──────────────────────────────────────────────

  register(channel: ChannelAdapter): void {
    if (this.channels.has(channel.id)) return
    this.channels.set(channel.id, channel)
    channel.setMessageHandler((msg) => this.handleInbound(channel.id, msg))
  }

  unregister(channelId: string): void {
    this.channels.delete(channelId)
  }

  channel(channelId: string): ChannelAdapter | undefined {
    return this.channels.get(channelId)
  }

  listChannels(): ChannelAdapter[] {
    return [...this.channels.values()]
  }

  /** 设置未授权回调（manager 构造后接线用）。 */
  setUnauthorizedHandler(handler: (channelId: string, msg: ImMessage) => string): void {
    this.unauthorizedHandler = handler
  }

  /** 添加 UI 批准的渠道白名单用户（manager 同步调用；重启后重新灌入）。 */
  addAuthorizedUser(channelId: string, userId: string): void {
    let set = this.extraAllowlist.get(channelId)
    if (!set) {
      set = new Set()
      this.extraAllowlist.set(channelId, set)
    }
    set.add(userId)
  }

  // ── 入站流水线 ────────────────────────────────────────────

  private async handleInbound(channelId: string, msg: ImMessage): Promise<void> {
    const channel = this.channels.get(channelId)
    if (!channel) return
    try {
      // 1. 命令（不经合并窗口）
      if (msg.text.startsWith('/')) {
        const reply = await this.handleCommand(channel, msg)
        if (reply !== undefined) await channel.send(msg.chatId, reply)
        return
      }
      // 2. 批准 / 拒绝（应答审批）
      const verdictText = msg.text.trim()
      if (verdictText === '批准' || verdictText === '同意' || verdictText === 'yes' || verdictText === 'y' || verdictText === 'allow') {
        const handled = await this.answerApproval(channel, msg, true)
        if (handled) return
      }
      if (verdictText === '拒绝' || verdictText === 'no' || verdictText === 'n' || verdictText === 'reject' || verdictText === 'deny') {
        const handled = await this.answerApproval(channel, msg, false)
        if (handled) return
      }
      // 3. 白名单：渠道本地授权（如微信扫码用户）优先，其次网关全局白名单
      const localAuth = channel.authorizes?.(msg.userId ?? '')
      if (localAuth === false || (localAuth === undefined && !this.authorized(channelId, msg.userId))) {
        this.logLine(`[${channelId}] 未授权用户 ${msg.userId ?? '(匿名)'} 消息被拦截（已登记待授权）`)
        const reply = this.unauthorizedHandler?.(channelId, msg) ?? '⛔ 未授权：请在 dsh 设置 → IM 网关 中批准你的访问请求。'
        await channel.send(msg.chatId, reply).catch(() => undefined)
        return
      }
      // 4. 媒体消息：直接注入（不过合并窗口）
      if (msg.media && msg.media.length > 0) {
        const blocks = await this.buildMediaBlocks(msg)
        if (blocks.length > 0) {
          const ack = await this.injectBlocks(channelId, msg.chatId, blocks)
          if (ack) await channel.send(msg.chatId, ack)
        }
        return
      }
      // 5. 合并窗口
      const key = `${channelId}:${msg.chatId}`
      const result = this.merger.ingest(key, msg.text)
      if (result.kind === 'flushed' && result.text) {
        const ack = await this.injectText(channelId, msg.chatId, result.text)
        if (ack) await channel.send(msg.chatId, ack)
      }
    } catch (err) {
      this.logLine(`[${channelId}] 消息处理失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** 把媒体消息组装成 content blocks（图片走 attachments → image block；文件/视频注明路径）。 */
  private async buildMediaBlocks(msg: ImMessage): Promise<ContentBlock[]> {
    const blocks: ContentBlock[] = []
    if (msg.text !== '') blocks.push({ type: 'text', text: msg.text })
    for (const m of msg.media ?? []) {
      try {
        if (m.kind === 'voice-text' && m.text) {
          blocks.push({ type: 'text', text: `[语音] ${m.text}` })
        } else if (m.kind === 'image') {
          let data = m.data
          if (!data && m.path) {
            try {
              data = new Uint8Array(await readFile(m.path))
            } catch { /* 读取失败走文本说明 */ }
          }
          if (data && this.ctx.attachments) {
            try {
              const ref = await this.ctx.attachments.saveImage({
                data,
                mediaType: (m.mediaType ?? 'image/jpeg') as never,
                name: m.name,
              })
              blocks.push({ type: 'image', attachment: ref })
              continue
            } catch (err) {
              this.logLine(`[gateway] 图片保存失败（降级为路径说明）: ${err instanceof Error ? err.message : String(err)}`)
            }
          }
          blocks.push({ type: 'text', text: `[用户发来图片${m.name ? `：${m.name}` : ''}${m.path ? `，已保存到 ${m.path}` : ''}]` })
        } else if (m.kind === 'file' || m.kind === 'video') {
          blocks.push({
            type: 'text',
            text: `[用户发来${m.kind === 'video' ? '视频' : '文件'}${m.name ? `：${m.name}` : ''}，已保存到 ${m.path ?? '（未知路径）'}]`,
          })
        }
      } catch (err) {
        this.logLine(`[gateway] 媒体 block 构建失败: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    return blocks
  }

  /** 把文本注入目标 chat 的 agent 会话，返回给用户的可选回执。 */
  private async injectText(channelId: string, chatId: string, text: string): Promise<string> {
    return this.injectBlocks(channelId, chatId, [{ type: 'text', text }])
  }

  /** 把 content blocks 注入目标 chat 的 agent 会话，返回给用户的可选回执。 */
  private async injectBlocks(channelId: string, chatId: string, blocks: ContentBlock[]): Promise<string> {
    const message = createUserMessage({
      content: blocks,
      source: { kind: 'plugin', plugin: PLUGIN_NAME, form: 'relay' },
    })
    if (this.config.sessionMode === 'bound') {
      const entry = this.router.get(channelId, chatId)
      if (!entry) {
        return '还没有绑定会话。请先用 /bind <session-id> 绑定一个 DSH 会话，或用 /status 查看。'
      }
      const agent = this.ctx.agents.get(SessionId(entry.sessionId))
      if (!agent) {
        return `会话 ${entry.sessionId} 当前没有运行中的 agent，无法注入。`
      }
      agent.followup(message)
      this.logLine(`[${channelId}] 消息注入会话 ${entry.sessionId}`)
      return this.ackFor(blocks)
    }

    const entry = await this.router.getOrCreate(channelId, chatId)
    entry.handle?.agent.followup(message)
    this.logLine(`[${channelId}] 消息注入会话 ${entry.sessionId}`)
    this.recordTitleIfNeeded(entry.sessionId, blocks)
    return this.ackFor(blocks)
  }

  /** 会话首次收到用户消息时记录标题（dsh 标题缺失时的兜底显示）。 */
  private recordTitleIfNeeded(sessionId: string, blocks: ContentBlock[]): void {
    if (this.titles.has(sessionId)) return
    const text = blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim()
    const title = summarizeTitle(text)
    if (title) {
      this.titles.set(sessionId, title)
      this.titleStore?.save(Object.fromEntries(this.titles))
    }
  }

  /** 从会话日志懒读取标题（/sessions 列表时对无标题会话补全，结果缓存）。 */
  private async lazyTitle(sessionId: string): Promise<string | undefined> {
    const cached = this.titles.get(sessionId)
    if (cached !== undefined) return cached
    const query = this.ctx.sessionQuery
    if (!query) return undefined
    try {
      const snapshot = await query.readSession(SessionId(sessionId))
      const firstUser = snapshot.events.find((e) => e.type === 'user/message')
      if (!firstUser) return undefined
      // user/message 事件的 data 即 UserMessage（{ id, role, content, source }）
      const data = firstUser.data as { content?: Array<{ type?: string; text?: string }> }
      const text = (data.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')
        .trim()
      const title = summarizeTitle(text)
      if (title) {
        this.titles.set(sessionId, title)
        this.titleStore?.save(Object.fromEntries(this.titles))
      }
      return title
    } catch { return undefined }
  }

  private ackFor(blocks: ContentBlock[]): string {
    const text = blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
    return text.length >= this.config.longInputAckChars ? '收到，处理中，稍后给你完整回复。' : ''
  }

  /** 注册 im_send_file 工具：agent 把工作区文件发给当前 IM 聊天。 */
  private registerSendMediaTool(): void {
    const tools = this.ctx.tools
    if (!tools) return
    try {
      const disposer = tools.register({
        name: 'im_send_file',
        description:
          '把工作区文件发送给当前 IM 会话的用户（微信/Telegram/飞书等渠道）。支持图片、视频和任意文档；' +
          'channel 可指定渠道 id（默认发送到所有关联渠道），caption 为可选附言。',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '要发送的文件路径（相对或绝对）' },
            caption: { type: 'string', description: '附言文本（可选，先于文件发送）' },
            channel: { type: 'string', description: '目标渠道 id（可选，默认所有关联渠道）' },
          },
          required: ['path'],
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              detail: { type: 'string' },
            },
            required: ['ok', 'detail'],
          },
          render: (args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        execute: async (args, exec) => {
          const { path, caption, channel: channelFilter } = args as { path: string; caption?: string; channel?: string }
          const sessionId = exec.agent?.session?.id
          return this.sendFileToChats(path, caption, channelFilter, sessionId ? String(sessionId) : undefined)
        },
      })
      this.disposeTools.push(disposer)
    } catch (err) {
      this.logLine(`[gateway] im_send_file 工具注册失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** 把文件发送到会话关联的所有渠道（im_send_file 工具的执行体，可测试）。 */
  async sendFileToChats(
    filePath: string,
    caption?: string,
    channelFilter?: string,
    sessionId?: string,
  ): Promise<{ ok: boolean; detail: string }> {
    const chats = sessionId ? this.router.chatsForSession(sessionId) : []
    if (chats.length === 0) {
      return { ok: false, detail: '当前会话没有关联的 IM 聊天（仅 IM 发起的会话可用此工具）' }
    }
    const details: string[] = []
    let anyOk = false
    for (const chat of chats) {
      if (channelFilter && chat.channelId !== channelFilter) continue
      const ch = this.channels.get(chat.channelId)
      if (!ch?.sendMedia) {
        details.push(`${chat.channelId}: 该渠道不支持发送文件`)
        continue
      }
      try {
        await ch.sendMedia(chat.chatId, filePath, caption)
        details.push(`${chat.channelId}: 已发送 ${filePath}`)
        anyOk = true
      } catch (err) {
        details.push(`${chat.channelId}: 发送失败（${err instanceof Error ? err.message : String(err)}）`)
      }
    }
    if (details.length === 0) details.push('没有匹配的渠道')
    return { ok: anyOk, detail: details.join('；') }
  }

  // ── 白名单 ────────────────────────────────────────────────

  private authorized(channelId: string, userId?: string): boolean {
    if (this.config.allowAllUsers) return true
    if (!userId) return false
    const perChannel = this.config.allowedUserIds[channelId]
    if (perChannel && perChannel.includes(userId)) return true
    // 扁平兜底：keys 为 * 或空时按全局名单
    const global = this.config.allowedUserIds['*']
    if (global && global.includes(userId)) return true
    // UI 批准的渠道白名单
    const extra = this.extraAllowlist.get(channelId)
    if (extra && extra.has(userId)) return true
    return false
  }

  // ── 命令 ──────────────────────────────────────────────────

  private async handleCommand(channel: ChannelAdapter, msg: ImMessage): Promise<string | undefined> {
    const [rawCmd, ...args] = msg.text.trim().split(/\s+/)
    const cmd = rawCmd?.toLowerCase()
    const channelId = channel.id
    const chatId = msg.chatId
    switch (cmd) {
      case '/help':
        return HELP_TEXT
      case '/status': {
        const entry = this.router.get(channelId, chatId)
        const lines = [
          `会话模式：${this.config.sessionMode}`,
          `当前工作区：${this.router.workspaceOf(channelId, chatId) ?? this.config.cwd}`,
          entry ? `绑定会话：${entry.sessionId}` : '当前会话：（无）',
          `待批准：${this.broker.size > 0 ? `${this.broker.size} 个` : '无'}`,
        ]
        return lines.join('\n')
      }
      case '/new':
      case '/clear': {
        if (this.config.sessionMode === 'bound') {
          this.router.unbind(channelId, chatId)
          return '已解绑。用 /bind <session-id> 绑定新会话。'
        }
        const entry = await this.router.rotate(channelId, chatId)
        return entry ? `已开启全新会话：${entry.sessionId}（工作区 ${entry.workspace ?? this.config.cwd}）` : '尚未有会话。'
      }
      case '/workspaces': {
        return await this.listWorkspaces()
      }
      case '/workspace': {
        const pathArg = args[0]
        if (!pathArg) {
          const current = this.router.workspaceOf(channelId, chatId) ?? this.config.cwd
          return `当前工作区：${current}\n用法：/workspace <路径> 切换（后续 /new 生效）`
        }
        // 相对路径基于全局 cwd 解析
        const target = pathArg.startsWith('/') ? pathArg : resolve(this.config.cwd, pathArg)
        try {
          if (!statSync(target).isDirectory()) return `不是目录：${target}`
        } catch {
          return `目录不存在：${target}`
        }
        this.router.setWorkspace(channelId, chatId, target)
        this.persistWorkspaces()
        return `✅ 工作区已切换：${target}\n发送 /new 在此工作区开启新会话，或 /sessions 查看该工作区的历史会话。`
      }
      case '/sessions': {
        // 默认当前聊天工作区（与 Web 侧边栏当前工作区视角一致）；all 显示全部
        const filter = args[0]
        let workspace: string | undefined
        if (filter === 'all') {
          workspace = undefined
        } else if (filter) {
          workspace = filter.startsWith('/') ? filter : resolve(this.config.cwd, filter)
        } else {
          workspace = this.router.workspaceOf(channelId, chatId) ?? this.config.cwd
        }
        return await this.listSessions(workspace)
      }
      case '/continue': {
        const sessionId = args[0]
        if (!sessionId) return '用法：/continue <会话id>（用 /sessions 查看）'
        const r = await this.router.continueSession(channelId, chatId, sessionId)
        if (!r.ok) return `❌ ${r.error}`
        return `✅ 已继续会话 ${sessionId}${r.workspace ? `（工作区 ${r.workspace}）` : ''}\n直接发消息即可继续对话。`
      }
      case '/bind': {
        const sessionId = args[0]
        if (!sessionId) return '用法：/bind <session-id>'
        const r = this.router.bind(channelId, chatId, sessionId, msg.userId)
        return r.ok ? `已绑定会话 ${sessionId}。` : `绑定失败：${r.error}`
      }
      case '/unbind':
        this.router.unbind(channelId, chatId)
        return '已解绑。'
      case '/channels': {
        const lines = ['渠道状态：']
        for (const ch of this.channels.values()) {
          const status = ch.status?.() ?? (ch ? '运行中' : '')
          lines.push(`• ${ch.label} (${ch.id}) — ${status || '运行中'}`)
        }
        return lines.join('\n')
      }
      default:
        return `未知命令 ${cmd}。发送 /help 查看可用命令。`
    }
  }

  // ── 会话 / 工作区查询 ─────────────────────────────────────

  /** 持久化每聊天工作区偏好。 */
  private persistWorkspaces(): void {
    this.workspaceStore?.save(this.router.workspaceEntries())
  }

  /** 列出所有工作区（按会话数排序）。 */
  private async listWorkspaces(): Promise<string> {
    const query = this.ctx.sessionQuery
    if (!query) return '会话查询服务不可用。'
    let records
    try {
      records = await query.listSessions()
    } catch (err) {
      return `列出工作区失败：${err instanceof Error ? err.message : String(err)}`
    }
    const byWorkspace = new Map<string, { count: number; last: number }>()
    for (const r of records) {
      const cwd = r.header.cwd ?? '(未知工作区)'
      const cur = byWorkspace.get(cwd) ?? { count: 0, last: 0 }
      cur.count += 1
      if (r.header.createdAt > cur.last) cur.last = r.header.createdAt
      byWorkspace.set(cwd, cur)
    }
    const rows = [...byWorkspace.entries()].sort((a, b) => b[1].last - a[1].last)
    const body = rows.slice(0, 20)
      .map(([cwd, info]) => `• ${cwd}（${info.count} 会话，最近 ${relTime(info.last)}）`)
      .join('\n\n')
    return [
      `📁 工作区（${rows.length} 个）：`,
      body,
      '用 /workspace <路径> 切换；/sessions <路径> 查看会话。',
    ].filter(Boolean).join('\n')
  }

  /** 列出会话（可按工作区过滤）。 */
  private async listSessions(workspace?: string): Promise<string> {
    const query = this.ctx.sessionQuery
    if (!query) return '会话查询服务不可用。'
    let records
    try {
      records = await query.listSessions()
    } catch (err) {
      return `列出会话失败：${err instanceof Error ? err.message : String(err)}`
    }
    const filtered = workspace ? records.filter((r) => (r.header.cwd ?? '') === workspace) : records
    if (filtered.length === 0) {
      return workspace
        ? `该工作区没有会话：${workspace}\n发送 /new 开启一个。`
        : '还没有任何会话。发送 /new 开启一个。'
    }
    const top = filtered.slice(0, 20)
    let titles: Array<{ ok: boolean; value?: { title?: string } }> = []
    try {
      const observations = await query.readTitleSnapshots(top.map((r) => r.header.id))
      titles = observations as unknown as Array<{ ok: boolean; value?: { title?: string } }>
    } catch (err) { /* 标题读取失败不阻塞 */ }
    // 无 dsh 标题的会话：用缓存标题，仍无则懒读取会话日志补全（限制并发，显示范围内全部补）
    const needBackfill = top.map((r, i) => ({ r, i })).filter(({ r, i }) => {
      const dshTitle = titles[i]?.ok ? (titles[i].value?.title ?? '') : ''
      return !dshTitle && !this.titles.has(String(r.header.id))
    })
    await runBatched(needBackfill.slice(0, 20), 3, async ({ r }) => {
      await this.lazyTitle(String(r.header.id))
    })
    const body = top.map((r, i) => {
      const dshTitle = titles[i]?.ok ? (titles[i].value?.title ?? '') : ''
      const title = dshTitle || this.titles.get(String(r.header.id)) || ''
      const live = r.live ? '🟢' : '💤'
      const cwd = r.header.cwd ? `\n   📁 ${r.header.cwd.length > 36 ? `…${r.header.cwd.slice(-35)}` : r.header.cwd}` : ''
      return `[${i + 1}] ${r.header.id} ${title ? `「${title.slice(0, 30)}」` : ''}${r.header.createdAt ? ` · ${relTime(r.header.createdAt)}` : ''} ${live}${cwd}`
    }).join('\n\n')
    return [
      `📋 ${workspace ? `会话（当前工作区 ${workspace}）` : '全部会话'}：${filtered.length} 个${filtered.length > 20 ? `，显示前 20` : ''}${workspace ? `（/sessions all 查看全部）` : ''}`,
      body,
      '用 /continue <会话id> 继续某个会话。',
    ].filter(Boolean).join('\n')
  }

  // ── 审批桥 ────────────────────────────────────────────────

  private async handleApprovalRequest(
    req: { agent: { session: { id: string } }; toolName: string; reason?: string; signal?: AbortSignal },
    next: () => Promise<ApprovalOutcome>,
  ): Promise<ApprovalOutcome> {
    const sessionId = String(req.agent.session.id)
    const chats = this.router.chatsForSession(sessionId)
    if (chats.length === 0) return next()
    const timeoutMs = this.config.approvalTimeoutSecs * 1000
    const text = [
      `⚠️ 批准请求（${timeoutMs / 1000}s 内回复「批准」或「拒绝」）`,
      `工具：${req.toolName}`,
      req.reason ? `原因：${req.reason}` : '',
      '回复「批准」或「拒绝」，超时转回本机批准体系。',
    ].filter(Boolean).join('\n')

    const verdicts = await Promise.all(
      chats.map(async (chat) => {
        const channel = this.channels.get(chat.channelId)
        if (!channel) return undefined
        await channel.send(chat.chatId, text).catch(() => undefined)
        return this.broker.wait(sessionId, timeoutMs, req.signal)
      }),
    )
    // 任一 chat 批准 → 放行；任一拒绝 → 拒绝；否则委托下游
    if (verdicts.includes('allow')) return 'allowed-once'
    if (verdicts.includes('reject')) return 'rejected'
    return next()
  }

  private async answerApproval(channel: ChannelAdapter, msg: ImMessage, allow: boolean): Promise<boolean> {
    const entry = this.router.get(channel.id, msg.chatId)
    if (!entry) return false
    const answered = this.broker.answer(entry.sessionId, allow)
    if (answered) await channel.send(msg.chatId, allow ? '已批准 ✅' : '已拒绝 ❌').catch(() => undefined)
    return answered
  }

  // ── 出站：会话事件 → 渠道 ─────────────────────────────────

  private handleSessionEvent(session: Session, event: SessionEvent): void {
    const chats = this.router.chatsForSession(String(session.id))
    if (chats.length === 0) return
    switch (event.type) {
      case 'turn/start':
        for (const chat of chats) {
          const channel = this.channels.get(chat.channelId)
          void channel?.sendAction?.(chat.chatId, 'typing').catch(() => undefined)
        }
        break
      case 'assistant/message': {
        const text = assistantText(event)
        if (text === undefined) return
        for (const chat of chats) this.deliver(chat, text)
        break
      }
      case 'turn/end': {
        if (!this.config.summaryOnTurnEnd) return
        const label = TURN_END_LABEL[event.data.reason.kind] ?? event.data.reason.kind
        for (const chat of chats) {
          const channel = this.channels.get(chat.channelId)
          if (!channel) continue
          void channel.send(chat.chatId, `[${label}] 会话 ${String(session.id)} 第 ${event.data.turn} 轮结束`).catch(() => undefined)
        }
        break
      }
      default:
        break
    }
  }

  private async deliver(chat: ChatEntry, text: string): Promise<void> {
    const channel = this.channels.get(chat.channelId)
    if (!channel) return
    const plain = toPlainText(text)
    if (plain === '') return
    for (const chunk of splitText(plain, channel.maxMessageLength)) {
      await channel.send(chat.chatId, chunk).catch(() => undefined)
    }
  }

  // ── 生命周期 ──────────────────────────────────────────────

  dispose(): void {
    for (const off of this.disposeEvents) off()
    this.disposeEvents.length = 0
    for (const off of this.disposeTools) off()
    this.disposeTools.length = 0
    this.merger.dispose()
    this.broker.dispose()
  }

  async stopAgents(): Promise<void> {
    await this.router.disposeAll()
  }
}

/** 提取 assistant 消息的文本块拼接。 */
function assistantText(event: Extract<SessionEvent, { type: 'assistant/message' }>): string | undefined {
  const blocks = event.data.message.content.filter((block) => block.type === 'text')
  return blocks.length === 0 ? undefined : blocks.map((block) => block.text).join('')
}

function splitKey(key: string): [string, string] {
  const idx = key.indexOf(':')
  if (idx < 0) return ['', '']
  return [key.slice(0, idx), key.slice(idx + 1)]
}

/** 消息合并结果类型再导出（供渠道层无感知使用）。 */
export type { MergeResult }

/** 相对时间显示（x 分钟/小时/天前）。 */
function relTime(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

/**
 * 从文本生成简短标题：与 dsh session-title 官方 fallback 算法一致
 * （清洗控制字符 + 取前 5 词 + 40 字节 UTF-8 截断），另去掉命令/终端前缀。
 */
function summarizeTitle(text: string): string {
  const clean = text
    // 去掉 IM 命令前缀
    .replace(/^\/(help|status|new|clear|sessions|workspace\S*|continue\S*|workspaces|bind\S*|unbind|channels)(\s|$).*$/m, '')
    // 去掉终端提示符前缀（如 chasemoon@host ~ %）
    .replace(/^[\w.-]+@[\w.-]+[^\n]{0,30}?[%$#]\s*/m, '')
    // 去掉围栏代码块
    .replace(/```[\s\S]*?```/g, ' ')
    // 清洗控制字符与 ANSI 转义（对齐 dsh cleanTitleText）
    .replace(/[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e]/g, '')
    // 空白归一化
    .replace(/\s+/g, ' ')
    .trim()
  if (clean === '') return ''
  // 前 5 词（对齐 dsh fallbackMaxWords: 5）
  const words = clean.split(' ').filter(Boolean).slice(0, 5).join(' ')
  // 40 字节 UTF-8 截断（对齐 dsh fallbackMaxBytes: 40），不拆散码点
  if (Buffer.byteLength(words, 'utf8') <= 40) return words
  let used = 0
  let out = ''
  for (const ch of words) {
    const bytes = Buffer.byteLength(ch, 'utf8')
    if (used + bytes > 40) break
    out += ch
    used += bytes
  }
  return out
}

/** 分批并发执行（限制并发数，避免一次性打爆资源）。 */
async function runBatched<T>(items: T[], batchSize: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    await Promise.all(batch.map((item) => fn(item).catch(() => undefined)))
  }
}
