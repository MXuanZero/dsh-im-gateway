/**
 * WebChat 渠道适配器：内置本地 HTTP 聊天服务，零依赖。
 * - GET  /            → 极简聊天页（原生 JS，SSE 收消息）
 * - POST /api/send    → 发送消息（JSON { text, token }）
 * - GET  /api/events  → SSE 出站流（assistant 回复实时推送）
 * 适合局域网/本机远程指挥 agent，无需任何第三方账号。
 * @module dsh-im-gateway/channels/webchat
 */
import { createServer } from 'node:http';
const PAGE = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh-im-gateway WebChat</title>
<style>
 body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:16px;background:#0f1115;color:#e6e6e6}
 h1{font-size:18px}#log{white-space:pre-wrap;line-height:1.6;min-height:60vh;border:1px solid #333;border-radius:8px;padding:12px;margin:12px 0;overflow-y:auto}
 .me{color:#7ee787}.agent{color:#79c0ff}.sys{color:#8b949e}
 form{display:flex;gap:8px}input{flex:1;padding:10px;border-radius:8px;border:1px solid #333;background:#161b22;color:#e6e6e6}
 button{padding:10px 18px;border-radius:8px;border:0;background:#238636;color:#fff;cursor:pointer}
</style></head><body>
<h1>🐋 dsh-im-gateway WebChat</h1>
<div id="log"></div>
<form id="f"><input id="i" placeholder="输入消息，Enter 发送" autocomplete="off"><button>发送</button></form>
<script>
const log=document.getElementById('log'),i=document.getElementById('i'),f=document.getElementById('f');
const add=(cls,t)=>{const d=document.createElement('div');d.className=cls;d.textContent=t;log.appendChild(d);log.scrollTop=log.scrollHeight};
const es=new EventSource('/api/events');
es.onmessage=e=>{const d=JSON.parse(e.data);if(d.type==='agent')add('agent',d.text);else if(d.type==='sys')add('sys',d.text)};
f.onsubmit=async e=>{e.preventDefault();const t=i.value.trim();if(!t)return;i.value='';add('me',t);
 await fetch('/api/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:t,token:localStorage.getItem('tk')||''})})};
</script></body></html>`;
export function createWebChatChannel(config, log) {
    if (!config.enabled)
        return undefined;
    let handler;
    let server;
    const clients = new Set();
    let statusText = '未启动';
    return {
        id: 'webchat',
        label: 'WebChat（内置网页）',
        maxMessageLength: 4000,
        async start() {
            const port = config.port ?? 8787;
            server = createServer((req, res) => {
                const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
                if (url.pathname === '/' && req.method === 'GET') {
                    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                    res.end(PAGE);
                    return;
                }
                if (url.pathname === '/api/events' && req.method === 'GET') {
                    res.writeHead(200, {
                        'content-type': 'text/event-stream',
                        'cache-control': 'no-cache',
                        connection: 'keep-alive',
                    });
                    res.write(`data: ${JSON.stringify({ type: 'sys', text: '已连接 dsh-im-gateway' })}\n\n`);
                    clients.add(res);
                    req.on('close', () => clients.delete(res));
                    return;
                }
                if (url.pathname === '/api/send' && req.method === 'POST') {
                    let body = '';
                    req.on('data', (c) => { body += c; });
                    req.on('end', () => {
                        try {
                            const data = JSON.parse(body);
                            if (config.token && data.token !== config.token) {
                                res.writeHead(403).end('forbidden');
                                return;
                            }
                            if (!data.text) {
                                res.writeHead(400).end('missing text');
                                return;
                            }
                            log(`[webchat] 收到消息: ${data.text.slice(0, 60)}`);
                            void handler?.({ chatId: 'webchat', userId: 'webchat-user', text: data.text });
                            res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }));
                        }
                        catch {
                            res.writeHead(400).end('bad json');
                        }
                    });
                    return;
                }
                res.writeHead(404).end();
            });
            await new Promise((resolve, reject) => {
                server?.listen(port, () => resolve());
                server?.on('error', reject);
            });
            statusText = `http://localhost:${port}`;
            log(`[webchat] 已启动: http://localhost:${port}${config.token ? '（已设访问口令）' : ''}`);
        },
        async stop() {
            for (const client of clients)
                client.end();
            clients.clear();
            await new Promise((resolve) => server?.close(() => resolve()));
            server = undefined;
        },
        async send(_chatId, text) {
            log(`[webchat] 推送 ${clients.size} 个连接: ${text.slice(0, 60)}`);
            for (const client of clients) {
                try {
                    client.write(`data: ${JSON.stringify({ type: 'agent', text })}\n\n`);
                }
                catch (err) {
                    log(`[webchat] 推送失败: ${err instanceof Error ? err.message : String(err)}`);
                    clients.delete(client);
                    client.destroy();
                }
            }
        },
        setMessageHandler(h) {
            handler = h;
        },
        status() {
            return statusText;
        },
    };
}
//# sourceMappingURL=webchat.js.map