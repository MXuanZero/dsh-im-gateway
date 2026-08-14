import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ImGateway } from '../lib/core/gateway.js'

/** 极简 mock ctx：只实现 gateway 用到的表面。 */
function makeCtx() {
  const listeners = new Map()
  const agents = new Map()
  const sessions = new Map()
  const ctx = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {} }),
    on: (event, cb) => {
      const list = listeners.get(event) ?? []
      list.push(cb)
      listeners.set(event, list)
      return () => {
        const l = listeners.get(event) ?? []
        listeners.set(event, l.filter((f) => f !== cb))
      }
    },
    agents: {
      create: async (opts) => {
        const agent = {
          id: String(opts.sessionId),
          session: { id: opts.sessionId },
          followup: () => {},
          inbox: {},
        }
        agent.followup = (msg) => {
          const record = { sessionId: String(opts.sessionId), msg }
          agents.set(String(opts.sessionId), { agent, record })
        }
        return { agent, dispose: async () => agents.delete(String(opts.sessionId)) }
      },
      get: (id) => agents.get(String(id))?.agent,
    },
    _listeners: listeners,
    _agents: agents,
  }
  return ctx
}

/** mock 渠道：记录发送的消息。 */
function makeChannel(id = 'test') {
  const sent = []
  const channel = {
    id,
    label: 'Test',
    maxMessageLength: 100,
    handler: undefined,
    start: async () => {},
    stop: async () => {},
    send: async (chatId, text) => { sent.push({ chatId, text }) },
    setMessageHandler: (h) => { channel.handler = h },
    status: () => 'running',
  }
  return { channel, sent }
}

const baseConfig = {
  channels: {},
  sessionMode: 'per-chat',
  cwd: process.cwd(),
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  allowAllUsers: true,
  allowedUserIds: {},
  mergeTimeoutSecs: 1,
  longInputAckChars: 180,
  approvalTimeoutSecs: 5,
  summaryOnTurnEnd: false,
  stateDir: '/tmp',
}

test('消息注入 per-chat 会话', async () => {
  const ctx = makeCtx()
  const gw = new ImGateway(ctx, { config: baseConfig, stateDir: '/tmp', log: () => {} })
  const { channel } = makeChannel()
  gw.register(channel)

  await channel.handler({ chatId: 'c1', userId: 'u1', text: '你好!!' })
  const keys = [...ctx._agents.keys()]
  assert.equal(keys.length, 1, '应创建 agent')
  const agent = ctx._agents.get(keys[0])
  assert.ok(agent.record.msg.content[0].text, '你好')
  assert.equal(agent.record.msg.source.kind, 'plugin')

  gw.dispose()
})

test('命令 /status 不创建会话', async () => {
  const ctx = makeCtx()
  const gw = new ImGateway(ctx, { config: baseConfig, stateDir: '/tmp', log: () => {} })
  const { channel, sent } = makeChannel()
  gw.register(channel)

  await channel.handler({ chatId: 'c1', userId: 'u1', text: '/status' })
  assert.equal(ctx._agents.size, 0)
  assert.ok(sent[0].text.includes('会话模式'))

  gw.dispose()
})

test('白名单拦截非授权用户', async () => {
  const ctx = makeCtx()
  const cfg = { ...baseConfig, allowAllUsers: false, allowedUserIds: { test: ['u1'] } }
  const gw = new ImGateway(ctx, { config: cfg, stateDir: '/tmp', log: () => {} })
  const { channel, sent } = makeChannel()
  gw.register(channel)

  await channel.handler({ chatId: 'c1', userId: 'evil', text: '你好!!' })
  assert.equal(ctx._agents.size, 0)
  assert.ok(sent[0].text.includes('未授权'))

  await channel.handler({ chatId: 'c1', userId: 'u1', text: '你好!!' })
  assert.equal(ctx._agents.size, 1)

  gw.dispose()
})

test('assistant/message 事件回发渠道', async () => {
  const ctx = makeCtx()
  const gw = new ImGateway(ctx, { config: baseConfig, stateDir: '/tmp', log: () => {} })
  const { channel, sent } = makeChannel()
  gw.register(channel)

  await channel.handler({ chatId: 'c1', userId: 'u1', text: 'hello!!' })
  const sessionId = [...ctx._agents.keys()][0]
  const session = { id: sessionId, events: [] }
  const event = {
    type: 'assistant/message',
    data: { message: { content: [{ type: 'text', text: '回复内容' }] } },
  }
  const cb = ctx._listeners.get('session/event')[0]
  cb(session, event)
  assert.ok(sent.some((s) => s.text === '回复内容'))

  gw.dispose()
})

test('approval/request 推送到渠道并远程批准', async () => {
  const ctx = makeCtx()
  const gw = new ImGateway(ctx, { config: baseConfig, stateDir: '/tmp', log: () => {} })
  const { channel, sent } = makeChannel()
  gw.register(channel)

  await channel.handler({ chatId: 'c1', userId: 'u1', text: '请执行任务!!' })
  const sessionId = [...ctx._agents.keys()][0]

  const cb = ctx._listeners.get('approval/request')[0]
  let nextCalled = false
  const p = cb(
    { agent: { session: { id: sessionId } }, toolName: 'tool-bash', reason: '执行命令' },
    async () => { nextCalled = true; return 'unavailable' },
  )
  // 等待推送
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(sent.some((s) => s.text.includes('批准请求')))
  // 用户在 IM 回复「批准」
  await channel.handler({ chatId: 'c1', userId: 'u1', text: '批准' })
  const outcome = await p
  assert.equal(outcome, 'allowed-once')
  assert.equal(nextCalled, false)

  gw.dispose()
})

test('approval/request 无关联会话时委托 next', async () => {
  const ctx = makeCtx()
  const gw = new ImGateway(ctx, { config: baseConfig, stateDir: '/tmp', log: () => {} })
  const { channel } = makeChannel()
  gw.register(channel)

  const cb = ctx._listeners.get('approval/request')[0]
  let nextCalled = false
  const outcome = await cb(
    { agent: { session: { id: 'no-such-session' } }, toolName: 'x' },
    async () => { nextCalled = true; return 'unavailable' },
  )
  assert.equal(outcome, 'unavailable')
  assert.equal(nextCalled, true)

  gw.dispose()
})
