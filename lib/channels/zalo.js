/**
 * Zalo 渠道适配器（实验性）：Zalo OA 开放平台。
 * - 发送：REST /v3.0/im/oa/message
 * - 接收：webhook → 本地 HTTP server（Zalo 回调需公网可达）
 * @module dsh-im-gateway/channels/zalo
 */
import { createServer } from 'node:http';
export function createZaloChannel(config, log) {
    const accessToken = config.accessToken ?? process.env.DSH_ZALO_TOKEN;
    if (!accessToken)
        return undefined;
    let handler;
    let server;
    let statusText = '未启动';
    return {
        id: 'zalo',
        label: 'Zalo',
        maxMessageLength: 4000,
        async start() {
            server = createServer((req, res) => {
                const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
                if (url.pathname !== '/zalo-webhook' || req.method !== 'POST') {
                    res.writeHead(404).end();
                    return;
                }
                let body = '';
                req.on('data', (c) => { body += c; });
                req.on('end', () => {
                    res.writeHead(200).end();
                    try {
                        const data = JSON.parse(body);
                        if (data.event_name === 'user_send_text' && data.message?.text) {
                            void handler?.({
                                chatId: data.sender?.id ?? '',
                                userId: data.sender?.id,
                                text: data.message.text,
                            });
                        }
                    }
                    catch { /* 忽略 */ }
                });
            });
            const port = config.port ?? 8791;
            await new Promise((resolve, reject) => {
                server?.listen(port, () => resolve());
                server?.on('error', reject);
            });
            statusText = `webhook 监听 :${port}`;
            log('[zalo] webhook 已监听（需要公网可达 + Zalo 回调配置）');
        },
        async stop() {
            await new Promise((resolve) => server?.close(() => resolve()));
            server = undefined;
        },
        async send(chatId, text) {
            const res = await fetch('https://openapi.zalo.me/v3.0/im/oa/message', {
                method: 'POST',
                headers: { access_token: accessToken, 'content-type': 'application/json' },
                body: JSON.stringify({ recipient: { user_id: chatId }, message: { text } }),
            });
            if (!res.ok)
                throw new Error(`zalo send: HTTP ${res.status}`);
        },
        setMessageHandler(h) {
            handler = h;
        },
        status() {
            return statusText;
        },
    };
}
//# sourceMappingURL=zalo.js.map