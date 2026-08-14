/**
 * 会话路由：管理 (渠道, chat) → agent 会话的映射与生命周期。
 * - per-chat 模式：网关用 ctx.agents.create 为每个 chat 创建独立 agent 会话，
 *   `/new` 轮换（dispose 旧的，建新的）。
 * - bound 模式：不创建 agent；用户 `/bind <session-id>` 绑定本进程 live 的 agent。
 * @module dsh-im-gateway/core/router
 */
import { SessionId } from '@deepseek-ai/dsh-session';
export class SessionRouter {
    ctx;
    options;
    entries = new Map();
    /** sessionId → 绑定它的 chat 集合（bound 模式可多 chat 绑同一会话）。 */
    bySession = new Map();
    constructor(ctx, options) {
        this.ctx = ctx;
        this.options = options;
    }
    /** 取 chat 条目；不存在时返回 undefined（调用方决定是否创建）。 */
    get(channelId, chatId) {
        return this.entries.get(`${channelId}:${chatId}`);
    }
    /** per-chat 模式：取或建（自动创建 agent 会话）。 */
    async getOrCreate(channelId, chatId) {
        const key = `${channelId}:${chatId}`;
        const existing = this.entries.get(key);
        if (existing)
            return existing;
        return this.create(channelId, chatId);
    }
    /** 创建新会话（per-chat）。 */
    async create(channelId, chatId) {
        const key = `${channelId}:${chatId}`;
        const sessionId = SessionId(`im:${channelId}:${chatId}:${Date.now()}`);
        const handle = await this.ctx.agents.create({
            sessionId,
            meta: { cwd: this.options.cwd },
            agentOptions: { provider: this.options.provider, model: this.options.model },
        });
        const entry = { channelId, chatId, key, sessionId: String(sessionId), handle };
        this.entries.set(key, entry);
        this.index(entry);
        return entry;
    }
    /** `/new`：轮换新会话。 */
    async rotate(channelId, chatId) {
        const key = `${channelId}:${chatId}`;
        const old = this.entries.get(key);
        if (old?.handle) {
            this.unindex(old);
            this.entries.delete(key);
            await old.handle.dispose().catch(() => undefined);
        }
        if (!old)
            return undefined;
        return this.create(channelId, chatId);
    }
    /** bound 模式：把 chat 绑定到本进程的 live agent 会话。 */
    bind(channelId, chatId, sessionId, userId) {
        const agent = this.ctx.agents.get(SessionId(sessionId));
        if (!agent)
            return { ok: false, error: `会话 ${sessionId} 当前没有运行中的 agent（须为本进程 live 会话）` };
        const key = `${channelId}:${chatId}`;
        const existing = this.entries.get(key);
        if (existing?.handle) {
            // per-chat 条目转 bound：释放自建 handle
            this.unindex(existing);
            void existing.handle.dispose().catch(() => undefined);
        }
        const entry = { channelId, chatId, key, sessionId, boundBy: userId };
        this.entries.set(key, entry);
        this.index(entry);
        return { ok: true };
    }
    /** 解绑（bound 模式回到无绑定状态）。 */
    unbind(channelId, chatId) {
        const key = `${channelId}:${chatId}`;
        const entry = this.entries.get(key);
        if (entry) {
            this.unindex(entry);
            this.entries.delete(key);
        }
    }
    /** 按 sessionId 找所有关联 chat（事件路由用）。 */
    chatsForSession(sessionId) {
        return [...(this.bySession.get(sessionId) ?? [])];
    }
    /** 全部条目（/status 用）。 */
    list() {
        return [...this.entries.values()];
    }
    /** 插件卸载时释放所有自建 agent。 */
    async disposeAll() {
        const handles = [...this.entries.values()].filter((e) => e.handle).map((e) => e.handle);
        this.entries.clear();
        this.bySession.clear();
        await Promise.allSettled(handles.map((h) => h.dispose()));
    }
    index(entry) {
        let set = this.bySession.get(entry.sessionId);
        if (!set) {
            set = new Set();
            this.bySession.set(entry.sessionId, set);
        }
        set.add(entry);
    }
    unindex(entry) {
        const set = this.bySession.get(entry.sessionId);
        if (set) {
            set.delete(entry);
            if (set.size === 0)
                this.bySession.delete(entry.sessionId);
        }
    }
}
//# sourceMappingURL=router.js.map