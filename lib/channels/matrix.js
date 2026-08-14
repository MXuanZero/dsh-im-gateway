/**
 * Matrix 渠道适配器：Matrix 客户端同步（/_matrix/client/v3/sync 长轮询），
 * 零第三方依赖。支持私聊与房间（m.room.message / m.text）。
 * @module dsh-im-gateway/channels/matrix
 */
export function createMatrixChannel(config, log) {
    const homeserver = (config.homeserver ?? process.env.DSH_MATRIX_HOMESERVER ?? '').replace(/\/$/, '');
    const accessToken = config.accessToken ?? process.env.DSH_MATRIX_ACCESS_TOKEN;
    if (!homeserver || !accessToken)
        return undefined;
    let handler;
    let stopped = false;
    let since;
    let statusText = '未连接';
    async function syncOnce() {
        const params = new URLSearchParams({ timeout: '30000' });
        if (since)
            params.set('since', since);
        const res = await fetch(`${homeserver}/_matrix/client/v3/sync?${params}`, {
            headers: { authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(40000),
        });
        if (!res.ok)
            throw new Error(`matrix sync: HTTP ${res.status}`);
        const data = (await res.json());
        if (data.next_batch)
            since = data.next_batch;
        const joinRooms = data.rooms?.join ?? {};
        for (const [roomId, room] of Object.entries(joinRooms)) {
            for (const ev of room.timeline?.events ?? []) {
                if (ev.type !== 'm.room.message')
                    continue;
                const body = ev.content?.body;
                if (!body)
                    continue;
                if (ev.sender === config.userId)
                    continue;
                void handler?.({
                    chatId: ev.room_id ?? roomId,
                    userId: ev.sender,
                    text: body,
                });
            }
        }
    }
    async function loop() {
        while (!stopped) {
            try {
                await syncOnce();
                statusText = '同步中';
            }
            catch (err) {
                if (stopped)
                    return;
                statusText = `错误: ${err instanceof Error ? err.message : String(err)}`;
                log(`[matrix] 同步失败，5s 后重试: ${statusText}`);
                await sleep(5000);
            }
        }
    }
    return {
        id: 'matrix',
        label: 'Matrix',
        maxMessageLength: 4000,
        async start() {
            stopped = false;
            log(`[matrix] 开始同步 ${homeserver}`);
            void loop();
        },
        async stop() {
            stopped = true;
        },
        async send(chatId, text) {
            const res = await fetch(`${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(chatId)}/send/m.room.message/${Date.now()}`, {
                method: 'PUT',
                headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
                body: JSON.stringify({ msgtype: 'm.text', body: text }),
            });
            if (!res.ok)
                throw new Error(`matrix send: HTTP ${res.status}`);
        },
        setMessageHandler(h) {
            handler = h;
        },
        status() {
            return statusText;
        },
    };
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=matrix.js.map