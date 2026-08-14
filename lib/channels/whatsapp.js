/**
 * WhatsApp 渠道适配器：基于 @whiskeysockets/baileys（可选依赖，动态 import）。
 * 需要扫码配对（配对码写入状态目录 whatsaapp-pairing.txt 并在日志输出）。
 * @module dsh-im-gateway/channels/whatsapp
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export function createWhatsAppChannel(config, log, stateDir) {
    if (!config.enabled)
        return undefined;
    const dir = config.stateDir ?? stateDir;
    const pairingPath = join(dir, 'whatsapp-pairing.txt');
    let handler;
    let sock;
    let statusText = '未启动';
    let stopped = false;
    let adapter;
    adapter = {
        id: 'whatsapp',
        label: 'WhatsApp',
        maxMessageLength: 4000,
        async start() {
            stopped = false;
            let baileys;
            try {
                baileys = await import('@whiskeysockets/baileys');
            }
            catch {
                statusText = '缺少依赖';
                log('[whatsapp] 需要安装 @whiskeysockets/baileys：`npm i @whiskeysockets/baileys`');
                return;
            }
            const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = baileys;
            // baileys 版本间类型漂移，宽松化
            const { state: authState } = await useMultiFileAuthState(join(dir, 'whatsapp-auth'));
            const socket = makeWASocket({
                auth: authState,
                printQRInTerminal: false,
                browser: ['dsh-im-gateway', 'Chrome', '1.0'],
            });
            sock = socket;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            socket.ev.on('connection.update', (update) => {
                const qr = update.qr;
                const connection = update.connection;
                if (qr) {
                    statusText = '等待扫码';
                    log(`[whatsapp] 请用 WhatsApp 扫码配对（配对码见 ${pairingPath}）`);
                    try {
                        mkdirSync(dir, { recursive: true });
                        writeFileSync(pairingPath, `${qr}\n`);
                    }
                    catch { /* 忽略 */ }
                }
                if (connection === 'open') {
                    statusText = '已连接';
                    log('[whatsapp] 配对成功，已连接');
                }
                if (connection === 'close') {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const lastDisconnect = update.lastDisconnect;
                    const code = lastDisconnect?.error?.output?.statusCode;
                    statusText = code === DisconnectReason.loggedOut ? '已登出' : '已断开';
                    if (code !== DisconnectReason.loggedOut && !stopped) {
                        log(`[whatsapp] 连接关闭（code ${code}），5s 后重连`);
                        setTimeout(() => void adapter?.start(), 5000);
                    }
                }
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            socket.ev.on('messages.upsert', (data) => {
                const messages = data.messages;
                for (const raw of messages ?? []) {
                    const key = raw.key;
                    if (key?.fromMe)
                        continue;
                    const msg = raw.message;
                    const remoteJid = key?.remoteJid;
                    const text = msg?.conversation ?? msg?.extendedTextMessage?.text;
                    if (!remoteJid || !text)
                        continue;
                    void handler?.({
                        chatId: remoteJid,
                        userId: remoteJid.split('@')[0],
                        text,
                    });
                }
            });
        },
        async stop() {
            stopped = true;
            sock?.end();
            sock = undefined;
        },
        async send(chatId, text) {
            if (!sock)
                throw new Error('whatsapp: 未连接');
            await sock.sendMessage(chatId, { text });
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
//# sourceMappingURL=whatsapp.js.map