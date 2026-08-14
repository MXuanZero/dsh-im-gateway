/**
 * Twitch 渠道适配器：WebSocket IRC（原生 WebSocket），零依赖。
 * 需要 OAuth token（https://twitchtokengenerator.com 或官方 OAuth）与 bot 用户名。
 * @module dsh-im-gateway/channels/twitch
 */
export function createTwitchChannel(config, log) {
    const botName = config.botName ?? process.env.DSH_TWITCH_BOT_NAME;
    const token = config.token ?? process.env.DSH_TWITCH_TOKEN;
    if (!botName || !token)
        return undefined;
    let handler;
    let ws;
    let stopped = false;
    let statusText = '未连接';
    const channels = config.channels ?? [];
    const oauth = token.startsWith('oauth:') ? token : `oauth:${token}`;
    let adapter;
    adapter = {
        id: 'twitch',
        label: 'Twitch',
        maxMessageLength: 500,
        async start() {
            stopped = false;
            ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
            ws.onopen = () => {
                ws?.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
                ws?.send(`PASS ${oauth}`);
                ws?.send(`NICK ${botName}`);
                for (const ch of channels)
                    ws?.send(`JOIN #${ch.toLowerCase()}`);
                statusText = `已连接 ${channels.map((c) => `#${c}`).join(', ') || '（未加入频道）'}`;
                log(`[twitch] 已连接，bot=${botName}，频道=${channels.join(',') || '无'}`);
            };
            ws.onmessage = (ev) => {
                const text = String(ev.data);
                for (const line of text.split('\r\n')) {
                    if (!line)
                        continue;
                    if (line.startsWith('PING')) {
                        ws?.send(`PONG ${line.slice(5)}`);
                        continue;
                    }
                    const m = line.match(/^@([^ ]+) :([^!]+)![^ ]+ PRIVMSG (#[^ ]+) :(.*)$/);
                    if (!m)
                        continue;
                    const tags = Object.fromEntries((m[1] ?? '').split(';').map((kv) => {
                        const idx = kv.indexOf('=');
                        return idx >= 0 ? [kv.slice(0, idx), kv.slice(idx + 1)] : [kv, ''];
                    }));
                    const from = m[2] ?? '';
                    const channel = m[3] ?? '';
                    const body = m[4] ?? '';
                    if (from === botName)
                        continue;
                    void handler?.({
                        chatId: channel,
                        userId: tags['user-id'] ?? from,
                        username: from,
                        text: body,
                    });
                }
            };
            ws.onclose = (ev) => {
                statusText = `已断开（code ${ev.code}）`;
                if (!stopped) {
                    log(`[twitch] 连接断开（${ev.code}），5s 后重连`);
                    setTimeout(() => void adapter?.start(), 5000);
                }
            };
            ws.onerror = () => {
                statusText = '连接错误';
            };
        },
        async stop() {
            stopped = true;
            ws?.close(1000, 'shutdown');
            ws = undefined;
        },
        async send(chatId, text) {
            // Twitch 限速：20 条/30s；消息内换行拆开分别发
            for (const line of text.split('\n')) {
                if (!line.trim())
                    continue;
                ws?.send(`PRIVMSG ${chatId} :${line.slice(0, 450)}`);
                await new Promise((r) => setTimeout(r, 1600)); // 节流 ~37 条/分钟
            }
        },
        setMessageHandler(h) {
            handler = h;
        },
        status() {
            return statusText;
        },
    };
    return adapter;
}
//# sourceMappingURL=twitch.js.map