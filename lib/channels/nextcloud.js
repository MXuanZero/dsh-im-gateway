/**
 * Nextcloud Talk 渠道适配器（实验性）：登录拿 token → WebSocket 推送 → REST 拉消息。
 * 需要 Nextcloud 实例（支持 Talk 应用）。
 * @module dsh-im-gateway/channels/nextcloud
 */
export function createNextcloudChannel(config, log) {
    const serverUrl = (config.serverUrl ?? process.env.DSH_NEXTCLOUD_URL ?? '').replace(/\/$/, '');
    const user = config.user ?? process.env.DSH_NEXTCLOUD_USER;
    const password = config.password ?? process.env.DSH_NEXTCLOUD_PASSWORD;
    if (!serverUrl || !user || !password)
        return undefined;
    const userArg = user; // 窄化进闭包
    const passwordArg = password;
    let handler;
    let stopped = false;
    let token = '';
    let statusText = '未连接';
    async function login() {
        const res = await fetch(`${serverUrl}/ocs/v2.php/login/v2`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ user: userArg, password: passwordArg }),
        });
        if (!res.ok)
            throw new Error(`nextcloud login: HTTP ${res.status}`);
        const data = (await res.json());
        const t = data.ocs?.data?.token;
        if (!t)
            throw new Error('nextcloud login: no token');
        token = t;
    }
    async function ocs(path) {
        const res = await fetch(`${serverUrl}${path}`, {
            headers: { 'OCS-APIRequest': 'true', Authorization: `Bearer ${token}` },
        });
        if (!res.ok)
            throw new Error(`nextcloud ${path}: HTTP ${res.status}`);
        return res.json();
    }
    async function pollRoom(token_, lastKnownMessageId) {
        const data = await ocs(`/ocs/v2.php/apps/spreed/api/v1/chat/${encodeURIComponent(token_)}?lookIntoFuture=0&limit=20&setReadMarker=0`);
        let latest = lastKnownMessageId;
        for (const msg of data.ocs?.data ?? []) {
            if (msg.id > lastKnownMessageId && msg.message && !msg.message.startsWith('{')) {
                void handler?.({
                    chatId: token_,
                    userId: msg.actorId,
                    username: msg.actorDisplayName,
                    text: msg.message,
                });
                latest = Math.max(latest, msg.id);
            }
        }
        return latest;
    }
    async function loop() {
        const lastIds = new Map();
        while (!stopped) {
            for (const room of config.rooms ?? []) {
                try {
                    const last = await pollRoom(room, lastIds.get(room) ?? 0);
                    lastIds.set(room, last);
                    statusText = '轮询中';
                }
                catch (err) {
                    statusText = `错误: ${err instanceof Error ? err.message : String(err)}`;
                    log(`[nextcloud] 轮询失败: ${statusText}`);
                }
            }
            await new Promise((r) => setTimeout(r, 3000));
        }
    }
    return {
        id: 'nextcloud',
        label: 'Nextcloud Talk',
        maxMessageLength: 4000,
        async start() {
            stopped = false;
            await login();
            log(`[nextcloud] 已登录 ${serverUrl}，轮询 ${(config.rooms ?? []).length} 个会话`);
            void loop();
        },
        async stop() {
            stopped = true;
        },
        async send(chatId, text) {
            const res = await fetch(`${serverUrl}/ocs/v2.php/apps/spreed/api/v1/chat/${encodeURIComponent(chatId)}`, {
                method: 'POST',
                headers: {
                    'OCS-APIRequest': 'true',
                    Authorization: `Bearer ${token}`,
                    'content-type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({ message: text }),
            });
            if (!res.ok)
                throw new Error(`nextcloud send: HTTP ${res.status}`);
        },
        setMessageHandler(h) {
            handler = h;
        },
        status() {
            return statusText;
        },
    };
}
//# sourceMappingURL=nextcloud.js.map