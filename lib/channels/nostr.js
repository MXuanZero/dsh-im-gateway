/**
 * Nostr 渠道适配器（实验性）：NIP-04 加密私信。
 * 依赖 @noble/curves（可选依赖，动态 import）。需一个 nostr 私钥（hex）。
 * @module dsh-im-gateway/channels/nostr
 */
export function createNostrChannel(config, log) {
    const relays = config.relays ?? (process.env.DSH_NOSTR_RELAYS ? process.env.DSH_NOSTR_RELAYS.split(',') : []);
    const privateKey = config.privateKey ?? process.env.DSH_NOSTR_PRIVATE_KEY;
    if (!privateKey || relays.length === 0)
        return undefined;
    let handler;
    let stopped = false;
    let ws;
    let pubkey = '';
    let statusText = '未连接';
    const seen = new Set();
    let adapter;
    adapter = {
        id: 'nostr',
        label: 'Nostr',
        maxMessageLength: 4000,
        async start() {
            stopped = false;
            let noble;
            try {
                noble = await import('@noble/curves/secp256k1');
            }
            catch {
                statusText = '缺少依赖';
                log('[nostr] 需要安装 @noble/curves：`npm i @noble/curves`');
                return;
            }
            const sk = Uint8Array.from(Buffer.from(privateKey, 'hex'));
            pubkey = Buffer.from(noble.secp256k1.getPublicKey(sk, true)).toString('hex');
            const subId = `dsh-im-gateway-${Date.now()}`;
            ws = new WebSocket(relays[0] ?? '');
            ws.onopen = () => {
                ws?.send(JSON.stringify(['REQ', subId, { kinds: [4], '#p': [pubkey] }]));
                statusText = `已连接 ${relays[0]}`;
                log(`[nostr] 已连接 ${relays[0]}，公钥 ${pubkey.slice(0, 12)}…`);
            };
            ws.onmessage = (ev) => {
                const data = JSON.parse(String(ev.data));
                const [type, , ...rest] = data;
                if (type === 'EVENT' && rest.length > 0) {
                    const event = rest[0];
                    if (!event.id || seen.has(event.id) || !event.pubkey || !event.content)
                        return;
                    seen.add(event.id);
                    try {
                        const text = Buffer.from(event.content, 'base64').toString('utf8');
                        void handler?.({
                            chatId: event.pubkey,
                            userId: event.pubkey,
                            text,
                        });
                    }
                    catch { /* 解密失败跳过 */ }
                }
                if (type === 'EOSE') {
                    ws?.send(JSON.stringify(['CLOSE', subId]));
                    ws?.send(JSON.stringify(['REQ', `${subId}-live`, { kinds: [4], '#p': [pubkey], since: Math.floor(Date.now() / 1000) - 300 }]));
                }
            };
            ws.onclose = (ev) => {
                statusText = `已断开（code ${ev.code}）`;
                if (!stopped) {
                    log(`[nostr] 连接断开（${ev.code}），5s 后重连`);
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
            let noble;
            try {
                noble = await import('@noble/curves/secp256k1');
            }
            catch {
                throw new Error('nostr: 缺少 @noble/curves');
            }
            const sk = Uint8Array.from(Buffer.from(privateKey, 'hex'));
            const recipientPub = Uint8Array.from(Buffer.from(chatId, 'hex'));
            // NIP-04: ECDH → 共享密钥 → AES-256-CBC（iv 固定 0 前缀 16 字节）
            const shared = noble.secp256k1.getSharedSecret(sk, recipientPub).slice(1, 33);
            const iv = new Uint8Array(16);
            const key = await crypto.subtle.importKey('raw', shared, { name: 'AES-CBC' }, false, ['encrypt']);
            const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, new TextEncoder().encode(text));
            const ciphertext = Buffer.from(new Uint8Array(encrypted)).toString('base64');
            const event = {
                kind: 4,
                pubkey: pubkey,
                created_at: Math.floor(Date.now() / 1000),
                tags: [['p', chatId]],
                content: ciphertext,
            };
            const serialized = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
            const sig = noble.secp256k1.sign(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized))), sk);
            const signed = { ...event, id: Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized))).toString('hex'), sig: Buffer.from(sig.toCompactRawBytes()).toString('hex') };
            ws?.send(JSON.stringify(['EVENT', signed]));
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
//# sourceMappingURL=nostr.js.map