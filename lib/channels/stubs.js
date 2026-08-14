/**
 * 骨架渠道适配器：Tlon（Urbit）、腾讯元宝、语音电话（Twilio/Plivo）。
 * 这三个渠道需要专用基础设施/凭据，v0.1 提供可配置骨架：
 * 启用时会明确提示当前能力边界，不静默失败。
 * @module dsh-im-gateway/channels/stubs
 */
export function createTlonChannel(config, log) {
    if (config.enabled !== true)
        return undefined;
    let stopped = false;
    return {
        id: 'tlon',
        label: 'Tlon（Urbit）',
        maxMessageLength: 2000,
        async start() {
            log(`[tlon] ⚠️ 实验性骨架：需要 Urbit ship（${config.ship ?? '未配置'}）与 %chat 应用桥接；v0.1 未实现完整协议`);
        },
        async stop() {
            stopped = true;
        },
        async send() {
            throw new Error('tlon: v0.1 骨架未实现发送');
        },
        setMessageHandler() {
            // 骨架：无接收
        },
        status() {
            return stopped ? '已停止' : '骨架（未实现）';
        },
    };
}
export function createYuanbaoChannel(config, log) {
    if (!config.enabled)
        return undefined;
    let stopped = false;
    return {
        id: 'yuanbao',
        label: '腾讯元宝',
        maxMessageLength: 2000,
        async start() {
            log('[yuanbao] ⚠️ 实验性骨架：腾讯元宝 bot API 未公开稳定文档，v0.1 未实现');
        },
        async stop() {
            stopped = true;
        },
        async send() {
            throw new Error('yuanbao: v0.1 骨架未实现发送');
        },
        setMessageHandler() {
            // 骨架：无接收
        },
        status() {
            return stopped ? '已停止' : '骨架（未实现）';
        },
    };
}
export function createVoiceChannel(config, log) {
    if (config.enabled !== true)
        return undefined;
    let stopped = false;
    return {
        id: 'voice',
        label: '语音电话',
        maxMessageLength: 1600,
        async start() {
            log(`[voice] ⚠️ 实验性骨架：需要 ${config.provider ?? 'twilio/plivo'} 账户与电话路由；v0.1 未实现通话流程`);
        },
        async stop() {
            stopped = true;
        },
        async send() {
            throw new Error('voice: v0.1 骨架未实现发送');
        },
        setMessageHandler() {
            // 骨架：无接收
        },
        status() {
            return stopped ? '已停止' : '骨架（未实现）';
        },
    };
}
//# sourceMappingURL=stubs.js.map