# 🐋 dsh-im-gateway

<h3 align="center">把 DeepSeek Harness 接入你常用的每一个聊天软件</h3>
<p align="center">Aggregated IM gateway for <b>DeepSeek Harness (dsh)</b> — drive your coding agents from <b>WeChat, Feishu, Telegram, Discord, QQ</b> and 20+ chat platforms, with unified sessions, remote approvals and one-command setup.</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-4d6bfe">
  <img alt="Platform" src="https://img.shields.io/badge/platform-DeepSeek%20Harness-4d6bfe">
  <img alt="Channels" src="https://img.shields.io/badge/channels-24%2B-238636">
  <img alt="DSH bundle" src="https://img.shields.io/badge/dsh-bundle%20plugin-4d6bfe">
  <img alt="PRs Welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen">
  <img alt="Tests" src="https://img.shields.io/badge/tests-47%20passed-238636">
</p>

<p align="center"><b>English</b> · <a href="#中文">中文</a></p>

---

## ⚡ 一键安装：把提示词发给你的 dsh 即可

> 任选一种方式，把下面整段提示词发给你的 dsh（Web GUI 聊天框 / `dsh --profile headless "…"` / 已接入的 IM 聊天），agent 会**自动完成下载、构建、安装**——不用手动敲命令。

<details open>
<summary><b>方式 A · GitHub 克隆安装（最稳妥，推荐）</b></summary>

```text
请帮我安装 dsh-im-gateway 插件（DeepSeek Harness 的聚合 IM 网关）：
1. 执行 git clone --depth 1 https://github.com/zhuiyueya/dsh-im-gateway.git /tmp/dsh-im-gateway
2. 执行 cd /tmp/dsh-im-gateway && npm install && npm run build
3. 执行 dsh plugin --profile web add /tmp/dsh-im-gateway
4. 汇报结果；如果提示需要重启，提醒我重启 dsh web。
```
</details>

<details>
<summary><b>方式 B · 远程仓库直装（无需 clone，已实测可用）</b></summary>

```text
请安装 dsh-im-gateway 插件：dsh plugin --profile web add https://github.com/zhuiyueya/dsh-im-gateway.git
装完提醒我重启 dsh web（首次安装依赖约 1-2 分钟）。
```
</details>

<details>
<summary><b>方式 C · 本机已有项目目录</b></summary>

```text
请把本机项目 dsh-im-gateway 安装为 dsh 插件：
1. 进入项目目录执行 npm install && npm run build
2. 执行 dsh plugin --profile web add <项目绝对路径>
3. 提醒我重启 dsh web。
```
</details>

装好后：**打开 dsh Web GUI → 设置 ⚙️ → 🐋 IM 网关 → 点选渠道连接**（微信/WhatsApp 扫码即连，其余填凭据即可）。

---

## ✨ Highlights

- 🌐 **23+ 渠道全覆盖** — 对齐 OpenClaw 的渠道面：微信、飞书、Telegram、Discord、Slack、QQ、WhatsApp、Signal、Teams、LINE、Matrix、Mattermost、IRC、Twitch、Nostr、Zalo、iMessage……
- 🔁 **每聊天一个 agent 会话** — 群里聊天 = 驱动 agent，回复实时回推；`/new` 换新会话，`/bind` 绑定现有会话
- ✅ **远程审批桥** — agent 请求工具批准时推送到 IM，聊天里回一句「批准 / 拒绝」即可，超时自动转回本机批准体系
- 📱 **手机多段输入合并** — `..` 表示还有后续，`!!` 立即提交，裸文本 5 秒合并窗口，崩溃后自动恢复
- ✂️ **长回复智能分片** — 按各渠道上限切分，优先在换行/句号断行，带 `（i/n）` 序号且收敛
- 🛡️ **白名单安全默认** — 默认拒绝一切未知用户；审批应答强制校验会话归属
- 🔑 **扫码登录 + 免扫码恢复** — 微信 / WhatsApp 扫码登录链接自动落盘；登录态（bot_token + 轮询游标）持久化，**重启自动恢复连接，无需重复扫码**
- 🖼️ **媒体收发** — 微信渠道完整支持图片/语音（服务端转文字）/文件/视频（CDN AES-128-ECB 加密），agent 可用 `im_send_file` 工具把工作区文件发给聊天
- 📦 **一条命令安装 + 可视化连接** — 标准 `dsh.bundle` 插件；Web GUI 设置面板点选渠道、扫码/填凭据即连，无需重启
- 🎯 **小白友好** — 微信/WhatsApp 点一下直接弹二维码；其余渠道表单引导，状态实时显示

## 🏗 Architecture

```
   IM 渠道 (Telegram / 微信 / 飞书 / Discord / …)              DSH agent
        │  adapter 归一化入站                                    ▲
        ▼                                                       │
┌─────────────────────────┐      ┌────────────────────────┐    │
│  ChannelAdapter          │◄────►│  ImGateway (核心网关)    │────┘
│  · 每渠道一个适配器       │      │  · 会话路由 (per-chat)   │
│  · 收: 轮询/WebSocket/   │      │  · 白名单 & IM 命令      │
│     webhook → ImMessage  │      │  · 审批桥 (approval/    │
│  · 发: send(chatId,text) │      │    request waterfall)   │
└─────────────────────────┘      │  · 分片 / 合并 / 格式化   │
        ▲                        └────────────────────────┘
        │  session/event · assistant/message · turn/end
        └────────────────────────────────────────────────────
```

```
用户消息 → 渠道 adapter → 网关(白名单→合并→会话路由) → agent.followup()
agent 回复 ← 网关(按渠道分片) ← session/event(assistant/message) ← agent
工具批准 → approval/request → 推送到聊天 → 「批准」→ allowed-once
```

## 📡 Supported Channels

| 渠道 | 状态 | 接收方式 | 需要 |
|---|---|---|---|
| **Telegram** | ✅ 完整 | Bot API 长轮询 | @BotFather token |
| **Discord** | ✅ 完整 | Gateway WebSocket | Bot token |
| **Slack** | ✅ 完整 | Socket Mode | xoxb- + xapp- token |
| **飞书 / Lark** | ✅ 完整 | 官方 SDK 长连接 | App ID + Secret |
| **微信** | ✅ 完整* | iLink 扫码登录（官方协议） | 专用小号 ⚠️ |
| **QQ 机器人** | ✅ 完整 | 官方 WebSocket | AppID + Secret |
| **LINE** | ✅ 完整 | REST + webhook | Channel token |
| **Matrix** | ✅ 完整 | 客户端同步 | Homeserver + token |
| **Mattermost** | ✅ 完整 | WebSocket + REST | Server URL + token |
| **IRC** | ✅ 完整 | 原生 socket | 服务器地址 |
| **Twitch** | ✅ 完整 | WebSocket IRC | OAuth token |
| **Signal** | ✅ 完整 | signal-cli 子进程 | 本机 signal-cli |
| **Nextcloud Talk** | ✅ 完整 | REST 轮询 | 实例账号 |
| **Synology Chat** | ✅ 完整 | webhook | Incoming webhook |
| **Zalo** | ✅ 完整 | REST + webhook | OA token |
| **iMessage** | ✅ 完整* | imsg / osascript | macOS |
| **WhatsApp** | 🔄 动态依赖 | Baileys 扫码 | `npm i @whiskeysockets/baileys` |
| **Nostr** | 🔄 动态依赖 | NIP-04 私信 | `npm i @noble/curves` |
| **Teams** | 🧪 实验性 | Bot Framework | Azure 注册 |
| **Google Chat** | 🧪 实验性 | webhook | 公网地址 |
| **Tlon / 元宝 / 语音** | 🧪 骨架 | — | 基础设施 |

✅ 完整 = 收发可用 ｜ 🔄 动态依赖 = 未装 SDK 时提示安装 ｜ 🧪 实验性 = 需公网/专用基础设施 ｜ \*微信 = 官方 iLink 协议（媒体收发 + 语音转文字 + typing）

## 🚀 Quick Start

### 1. 安装（一次）

```bash
cd dsh-im-gateway
npm install && npm run build

dsh plugin --profile web add /path/to/dsh-im-gateway
dsh web    # 重启 dsh（安装插件后需要重启一次）
```

### 2. 连接渠道（之后所有操作都在网页里，无需再碰配置）

打开 dsh Web GUI（默认 http://localhost:3080）→ **设置 ⚙️ → 「🐋 IM 网关」**：

- **微信 / WhatsApp**：点「连接（扫码）」→ 页面直接弹出**二维码**，手机扫码确认即连 ✅
- **飞书 / Telegram / QQ 机器人 / Discord / Slack …**：点「填写凭据」→ 按提示粘贴 token → 「保存并连接」✅

连接后无需重启，状态实时显示（等待扫码 / 已连接 / 异常）。**重启 dsh 后所有已配置渠道自动重连**（微信登录态已持久化，无需重复扫码）。

> 🔧 **断开 vs 删除配置**：已连接渠道卡片上有两个按钮——「断开」只是临时停用（重启自动恢复）；「删除配置」会移除凭据（重启不再连接，需重新配置）。

> 💡 手动配置方式（可选）：在 `~/.dsh/profiles/web/cordis.patch.yml` 写配置，凭据也可用环境变量，见下文「Configuration」。

### 3. 开始使用

在连接好的聊天软件里给机器人发消息：

```
/help        ← 可用命令
你好，帮我看看当前工作区    ← 直接聊天 = 驱动 agent
```

> 🔔 **首次使用需要授权**（安全默认）：第一次发消息会收到"未授权"提示，同时 dsh 设置 → IM 网关 面板顶部出现 **「有用户请求访问」** 横幅——点「允许」后即可正常使用，无需手动找用户 ID。

agent 回复实时回推；需要批准时在聊天里回「批准 / 拒绝」；agent 还可以用 `im_send_file` 把文件（截图/报告）直接发到聊天。

## 💬 IM Commands

| 命令 | 说明 |
|---|---|
| `/help` | 帮助 |
| `/status` | 当前会话 / 待批准数 |
| `/new` · `/clear` | 开启全新会话（per-chat 模式） |
| `/bind <session-id>` | 绑定已有 DSH 会话（bound 模式） |
| `/unbind` | 解绑 |
| `/channels` | 各渠道连接状态 |
| `批准` / `拒绝` | 应答待批准请求（也支持 yes / no / 同意） |
| 普通文本 | 发给 agent；结尾 `..` 表示还有后续，`!!` 立即提交 |

## ⚙️ Configuration

所有配置写在 profile 的 `cordis.patch.yml` 的 `im-gateway` 行；凭据也可用环境变量（见下表）。

### 通用配置

```yaml
- id: im-gateway
  config:
    sessionMode: per-chat          # per-chat（默认）| bound
    cwd: /path/to/workspace        # agent 工作目录
    provider: deepseek-official    # LLM provider（默认跟随 dsh）
    model: deepseek-v4-flash       # 模型（默认跟随 dsh）
    allowAllUsers: true            # 默认放行所有用户（开箱即用）；管控时改 false
    allowedUserIds:                # 白名单：按渠道（allowAllUsers=false 时生效）
      telegram: ['123456789']
      '*': ['u-common']            # 跨渠道通用
    mergeTimeoutSecs: 5            # 手机多段输入合并窗口
    approvalTimeoutSecs: 120       # 审批超时，超时转回本机批准
    summaryOnTurnEnd: true         # 每轮结束推送 [✅ 完成] 摘要
    stateDir: ''                   # 状态目录（默认 $DSH_HOME/dsh-im-gateway）
```

### 渠道凭据速查

| 渠道 | 配置字段 | 环境变量 |
|---|---|---|
| telegram | `token` | `DSH_TELEGRAM_TOKEN` |
| discord | `token` | `DSH_DISCORD_TOKEN` |
| slack | `token` + `appToken` | `DSH_SLACK_TOKEN` / `DSH_SLACK_APP_TOKEN` |
| feishu | `appId` + `appSecret` | `DSH_FEISHU_APP_ID` / `DSH_FEISHU_APP_SECRET` |
| qqbot | `appId` + `appSecret` | `DSH_QQ_APP_ID` / `DSH_QQ_APP_SECRET` |
| signal | `cli` + `phone` | `DSH_SIGNAL_CLI` / `DSH_SIGNAL_PHONE` |
| line | `channelToken` + `channelSecret` | `DSH_LINE_TOKEN` / `DSH_LINE_SECRET` |
| matrix | `homeserver` + `accessToken` | `DSH_MATRIX_HOMESERVER` / `DSH_MATRIX_ACCESS_TOKEN` |
| mattermost | `serverUrl` + `token` | `DSH_MATTERMOST_URL` / `DSH_MATTERMOST_TOKEN` |
| irc | `server` + `nick` + `channels` | `DSH_IRC_SERVER` |
| twitch | `botName` + `token` | `DSH_TWITCH_BOT_NAME` / `DSH_TWITCH_TOKEN` |
| nostr | `privateKey` + `relays` | `DSH_NOSTR_PRIVATE_KEY` / `DSH_NOSTR_RELAYS` |
| nextcloud | `serverUrl` + `user` + `password` | `DSH_NEXTCLOUD_URL` 等 |
| synology | `webhookUrl` | `DSH_SYNOLOGY_WEBHOOK_URL` |
| zalo | `accessToken` | `DSH_ZALO_TOKEN` |
| imessage | `enabled` + `imsgPath` | `DSH_IMSG_PATH` |
| wechat | `enabled: true` | — （iLink 扫码） |
| whatsapp | `enabled: true` | — （Baileys 扫码） |

## 🔐 Security

- **微信为腾讯官方 iLink Bot 协议**（与 OpenClaw 官方插件 `@tencent-weixin/openclaw-weixin` 同协议，2026 年官方开放）：仅私聊、一个账号一个 poller，建议使用**专用小号**；使用即表示同意《微信ClawBot功能使用条款》
- **白名单默认拒绝一切未知用户**；审批应答强制校验会话归属（pending approval id 一一对应）
- **不要让多个 DSH 进程共享同一个 `DSH_HOME`**：并发恢复同一会话会写出重复 `seq` 并损坏历史。网关会拒绝第二个实例；测试实例请使用独立目录，例如 `DSH_HOME=/tmp/dsh-test-8788 dsh web`。
- 实验性/骨架渠道（Teams、Google Chat、Tlon、元宝、语音）启用前请阅读源码
- 第三方插件即第三方代码——安装前请审阅源码，建议先在隔离环境试用

## 🧪 Development

```bash
npm install
npm run build          # tsc 构建到 lib/
npm test               # node --test（31 个用例：分片/合并/审批/网关）
```

**新增一个渠道只需 4 步**：

1. 在 `src/channels/` 新建 `yourchannel.ts`，实现 `ChannelAdapter`（6 个方法）
2. 在 `src/channels/index.ts` 注册
3. 在 `src/index.ts` 的 Config 里补配置字段
4. 在 README 渠道表加一行 ✨

```typescript
export function createYourChannel(config, log): ChannelAdapter | undefined {
  if (!config.token) return undefined          // 未配置凭据 → 不启动
  return {
    id: 'yourchannel', label: 'YourChannel', maxMessageLength: 2000,
    start() { /* 连接 / 轮询 / 扫码 */ },
    stop() { /* 释放 */ },
    async send(chatId, text) { /* 发消息 */ },
    setMessageHandler(h) { /* 入站回调 */ },
    status() { return 'running' },
  }
}
```

## 🤝 Contributing

- 修 bug、补渠道、完善文档都欢迎！
- 请先 `npm test` 保证 31 个用例全绿
- 给仓库加 `dsh-plugin` 和 `deepseek-harness` topic 可以进 awesome 插件列表

## 📄 License

[MIT](./LICENSE) © zhuiyueya

---

<p align="center">Made with 🐋 for the DeepSeek Harness ecosystem</p>
