/**
 * Signal 渠道适配器：通过 signal-cli（外部进程）收发，零 npm 依赖。
 * 需要用户自行安装 signal-cli 并注册号码。
 * @module dsh-im-gateway/channels/signal
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
export function createSignalChannel(config, log) {
    const cli = config.cli ?? process.env.DSH_SIGNAL_CLI ?? 'signal-cli';
    const phone = config.phone ?? process.env.DSH_SIGNAL_PHONE;
    if (!phone)
        return undefined;
    const phoneArg = phone; // 窄化进闭包
    let handler;
    let stopped = false;
    let statusText = '未启动';
    let running = false;
    async function receiveOnce() {
        const { stdout } = await execFileAsync(cli, ['-a', phoneArg, 'receive', '--json'], { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }).catch((err) => {
            throw err;
        });
        const lines = stdout.split('\n').filter((l) => l.trim().startsWith('{'));
        for (const line of lines) {
            try {
                const env = JSON.parse(line);
                const source = env.envelope?.source ?? env.envelope?.sourceUuid;
                const text = env.envelope?.dataMessage?.message;
                if (!source || !text)
                    continue;
                void handler?.({
                    chatId: source,
                    userId: source,
                    text,
                });
            }
            catch { /* 单条失败跳过 */ }
        }
    }
    async function loop() {
        while (!stopped) {
            try {
                await receiveOnce();
                statusText = '轮询中';
            }
            catch (err) {
                if (stopped)
                    return;
                statusText = `错误: ${err instanceof Error ? err.message : String(err)}`;
                log(`[signal] receive 失败（请确认 signal-cli 已安装且已注册 ${phone}）: ${statusText}`);
            }
            await new Promise((r) => setTimeout(r, (config.pollIntervalSec ?? 10) * 1000));
        }
    }
    return {
        id: 'signal',
        label: 'Signal',
        maxMessageLength: 2000,
        async start() {
            stopped = false;
            if (running)
                return;
            running = true;
            log(`[signal] 启动 signal-cli 轮询（账号 ${phone}）`);
            void loop();
        },
        async stop() {
            stopped = true;
            running = false;
        },
        async send(chatId, text) {
            await execFileAsync(cli, ['-a', phoneArg, 'send', '-m', text, chatId], { timeout: 30000 });
        },
        setMessageHandler(h) {
            handler = h;
        },
        status() {
            return statusText;
        },
    };
}
//# sourceMappingURL=signal.js.map