/**
 * Mattermost 渠道适配器：WebSocket（authentication_challenge）+ REST，零依赖。
 * 监听 posted 事件，回复走 /api/v4/posts。
 * @module dsh-im-gateway/channels/mattermost
 */
export function createMattermostChannel(config, log) {
    const serverUrl = (config.serverUrl ?? process.env.DSH_MATTERMOST_URL ?? '').replace(/\/$/, '');
    const token = config.token ?? process.env.DSH_MATTERMOST_TOKEN;
    if (!serverUrl || !token)
        return undefined;
    let handler;
    let ws;
    let heartbeat;
    let stopped = false;
    let statusText = '未连接';
    async function rest(path, init) {
        const res = await fetch(`${serverUrl}/api/v4${path}`, {
            ...init,
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json',
                ...(init?.headers ?? {}),
            },
        });
        if (!res.ok)
            throw new Error(`mattermost ${path}: HTTP ${res.status}`);
        return res.json();
    }
    async function connect() {
        const wsUrl = serverUrl.replace(/^http/, 'ws') + '/api/v4/websocket';
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
            ws?.send(JSON.stringify({ seq: 1, action: 'authentication_challenge', data: { token } }));
            statusText = '已连接';
            log('[mattermost] WebSocket 已连接');
        };
        ws.onmessage = (ev) => {
            const data = JSON.parse(String(ev.data));
            if (data.event === 'hello') {
                // 认证成功后发送 ping 保活
                heartbeat = setInterval(() => ws?.send(JSON.stringify({ action: 'ping' })), 30000);
                return;
            }
            if (data.event === 'posted' && data.data?.post) {
                let post;
                try {
                    post = JSON.parse(data.data.post);
                }
                catch {
                    return;
                }
                if (!post.message || post.type !== '' && post.type !== undefined)
                    return;
                void handler?.({
                    chatId: post.channel_id,
                    userId: post.user_id,
                    username: data.data.sender_name,
                    text: post.message,
                });
            }
            if (data.seq_reply === 1)
                log('[mattermost] 认证成功');
        };
        ws.onclose = (ev) => {
            clearInterval(heartbeat);
            heartbeat = undefined;
            statusText = `已断开（code ${ev.code}）`;
            if (!stopped) {
                log(`[mattermost] 连接断开（${ev.code}），3s 后重连`);
                setTimeout(() => void connect(), 3000);
            }
        };
        ws.onerror = () => {
            statusText = '连接错误';
        };
    }
    return {
        id: 'mattermost',
        label: 'Mattermost',
        maxMessageLength: 4000,
        async start() {
            stopped = false;
            await connect();
        },
        async stop() {
            stopped = true;
            clearInterval(heartbeat);
            ws?.close(1000, 'shutdown');
            ws = undefined;
        },
        async send(chatId, text) {
            await rest('/posts', {
                method: 'POST',
                body: JSON.stringify({ channel_id: chatId, message: text }),
            });
        },
        setMessageHandler(h) {
            handler = h;
        },
        status() {
            return statusText;
        },
    };
}
//# sourceMappingURL=mattermost.js.map