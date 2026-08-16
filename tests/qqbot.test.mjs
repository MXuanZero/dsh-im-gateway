import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createQQBotChannel } from '../lib/channels/qqbot.js'

const waitForImmediate = () => new Promise((resolve) => setImmediate(resolve))

test('QQ Bot 按官方协议获取网关并在 Hello 后鉴权', async () => {
  const originalFetch = globalThis.fetch
  const originalWebSocket = globalThis.WebSocket
  const requests = []
  const sockets = []

  class MockWebSocket {
    onopen
    onmessage
    onclose
    onerror
    sent = []

    constructor(url) {
      this.url = url
      sockets.push(this)
    }

    send(data) {
      this.sent.push(JSON.parse(data))
    }

    close() {}
  }

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    requests.push({ url, init })
    if (url === 'https://bots.qq.com/app/getAppAccessToken') {
      return Response.json({ access_token: 'test-token' })
    }
    if (url === 'https://api.sgroup.qq.com/gateway') {
      return Response.json({ url: 'ws://qq.test' })
    }
    throw new Error(`unexpected URL: ${url}`)
  }
  globalThis.WebSocket = MockWebSocket

  const channel = createQQBotChannel({ appId: 'app', appSecret: 'secret' }, () => {})
  assert.ok(channel)
  try {
    await channel.start()
    assert.equal(sockets.length, 1)
    assert.deepEqual(sockets[0].sent, [])

    sockets[0].onopen?.()
    assert.deepEqual(sockets[0].sent, [])

    sockets[0].onmessage?.({ data: JSON.stringify({ op: 10, d: { heartbeat_interval: 60_000 } }) })
    assert.deepEqual(sockets[0].sent, [{
      op: 2,
      d: {
        token: 'QQBot test-token',
        intents: 1 << 25,
        shard: [0, 1],
      },
    }])

    assert.equal(requests[0].url, 'https://bots.qq.com/app/getAppAccessToken')
    assert.deepEqual(JSON.parse(requests[0].init.body), { appId: 'app', clientSecret: 'secret' })
    assert.equal(requests[1].url, 'https://api.sgroup.qq.com/gateway')
    assert.equal(new Headers(requests[1].init.headers).get('authorization'), 'QQBot test-token')
  } finally {
    await channel.stop()
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
  }
})

test('QQ Bot 按官方事件结构映射私聊和群聊', async () => {
  const originalFetch = globalThis.fetch
  const originalWebSocket = globalThis.WebSocket
  const received = []
  let socket

  class MockWebSocket {
    onopen
    onmessage
    onclose
    onerror

    constructor() {
      socket = this
    }

    send() {}
    close() {}
  }

  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/app/getAppAccessToken')) return Response.json({ access_token: 'test-token' })
    if (url.endsWith('/gateway')) return Response.json({ url: 'ws://qq.test' })
    throw new Error(`unexpected URL: ${url}`)
  }
  globalThis.WebSocket = MockWebSocket

  const channel = createQQBotChannel({ appId: 'app', appSecret: 'secret' }, () => {})
  assert.ok(channel)
  channel.setMessageHandler((message) => received.push(message))
  try {
    await channel.start()
    socket.onmessage?.({
      data: JSON.stringify({
        op: 0,
        t: 'C2C_MESSAGE_CREATE',
        d: { id: 'c2c-message', content: 'hello', author: { user_openid: 'user-openid' } },
      }),
    })
    socket.onmessage?.({
      data: JSON.stringify({
        op: 0,
        t: 'GROUP_AT_MESSAGE_CREATE',
        d: {
          id: 'group-message',
          content: 'world',
          group_openid: 'group-openid',
          author: { member_openid: 'member-openid', username: 'tester' },
        },
      }),
    })
    await waitForImmediate()

    assert.deepEqual(received, [
      {
        chatId: 'user-openid',
        userId: 'user-openid',
        username: undefined,
        text: 'hello',
        context: { messageId: 'c2c-message', messageType: 'c2c' },
      },
      {
        chatId: 'g:group-openid',
        userId: 'member-openid',
        username: 'tester',
        text: 'world',
        context: { messageId: 'group-message', messageType: 'group' },
      },
    ])
  } finally {
    await channel.stop()
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
  }
})

test('QQ Bot 重连限频不会产生未处理 rejection', async () => {
  const originalFetch = globalThis.fetch
  const originalWebSocket = globalThis.WebSocket
  const logs = []
  let gatewayRequests = 0

  class MockWebSocket {
    onopen
    onmessage
    onclose
    onerror

    constructor() {
      setImmediate(() => this.onclose?.({ code: 4004 }))
    }

    send() {}
    close() {}
  }

  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/app/getAppAccessToken')) {
      return Response.json({ access_token: 'test-token' })
    }
    if (url.endsWith('/gateway')) {
      gatewayRequests += 1
      if (gatewayRequests === 1) return Response.json({ url: 'ws://qq.test' })
      return Response.json({ message: '接口调用超过频率限制', code: 100017 }, { status: 400 })
    }
    throw new Error(`unexpected URL: ${url}`)
  }
  globalThis.WebSocket = MockWebSocket

  const channel = createQQBotChannel({ appId: 'app', appSecret: 'secret' }, (line) => logs.push(line))
  assert.ok(channel)
  try {
    await channel.start()
    await new Promise((resolve) => setTimeout(resolve, 3300))
    assert.ok(logs.some((line) => line.includes('重连失败') && line.includes('频率限制')))
  } finally {
    await channel.stop()
    globalThis.fetch = originalFetch
    globalThis.WebSocket = originalWebSocket
  }
})
