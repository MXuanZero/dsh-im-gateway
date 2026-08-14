/**
 * 会话路由：管理 (渠道, chat) → agent 会话的映射与生命周期。
 * - per-chat 模式：网关用 ctx.agents.create 为每个 chat 创建独立 agent 会话，
 *   `/new` 轮换（dispose 旧的，建新的）。
 * - bound 模式：不创建 agent；用户 `/bind <session-id>` 绑定本进程 live 的 agent。
 * @module dsh-im-gateway/core/router
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AgentHandle } from '@deepseek-ai/dsh-agent';
/** 一个 chat 的会话条目。 */
export interface ChatEntry {
    readonly channelId: string;
    readonly chatId: string;
    /** `${channelId}:${chatId}` 唯一键。 */
    readonly key: string;
    /** 当前 agent 会话 id。 */
    sessionId: string;
    /** per-chat 模式持有 handle；bound 模式为 undefined。 */
    handle?: AgentHandle;
    /** bound 模式的绑定者 userId（用于鉴权）。 */
    boundBy?: string;
}
export interface RouterOptions {
    /** 网关创建 agent 时的工作目录。 */
    cwd: string;
    provider: string;
    model: string;
}
export declare class SessionRouter {
    private readonly ctx;
    private readonly options;
    private readonly entries;
    /** sessionId → 绑定它的 chat 集合（bound 模式可多 chat 绑同一会话）。 */
    private readonly bySession;
    constructor(ctx: Context, options: RouterOptions);
    /** 取 chat 条目；不存在时返回 undefined（调用方决定是否创建）。 */
    get(channelId: string, chatId: string): ChatEntry | undefined;
    /** per-chat 模式：取或建（自动创建 agent 会话）。 */
    getOrCreate(channelId: string, chatId: string): Promise<ChatEntry>;
    /** 创建新会话（per-chat）。 */
    create(channelId: string, chatId: string): Promise<ChatEntry>;
    /** `/new`：轮换新会话。 */
    rotate(channelId: string, chatId: string): Promise<ChatEntry | undefined>;
    /** bound 模式：把 chat 绑定到本进程的 live agent 会话。 */
    bind(channelId: string, chatId: string, sessionId: string, userId?: string): {
        ok: boolean;
        error?: string;
    };
    /** 解绑（bound 模式回到无绑定状态）。 */
    unbind(channelId: string, chatId: string): void;
    /** 按 sessionId 找所有关联 chat（事件路由用）。 */
    chatsForSession(sessionId: string): ChatEntry[];
    /** 全部条目（/status 用）。 */
    list(): ChatEntry[];
    /** 插件卸载时释放所有自建 agent。 */
    disposeAll(): Promise<void>;
    private index;
    private unindex;
}
//# sourceMappingURL=router.d.ts.map