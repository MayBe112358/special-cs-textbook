/**
 * @module        AI 对话记录——一段对话存成什么样、怎么起标题、怎么分组、重新打开时怎么收拾残局
 * @problem       对话要能留下来：关掉浏览器再打开，还能在历史里找到上周问过的那段，点开接着聊。
 *                接着聊需要两样东西：交给模型的记录（和厂商无关的 Turn），和画在屏幕上的记录（你的话、回答、工具、改动单）。
 *                每段对话还记着自己的模型和权限（只读 / 每次确认 / 自动同意），重新打开时一起恢复。
 * @design        Conversation = 编号 + 标题 + 在哪发起（面板 / 终端）+ 模型和权限 + 发起时所在的页面 + 两份记录。
 *                标题默认取你的第一句话（截到 30 个字），你改过名就不再自动改。
 *                重新打开一段对话时先 settle：还在“流式输出中”的回答标成已结束；还在转圈的工具标成中断；
 *                挂着没决定的改动单一律按“没有写入”处理——页面关掉时那一轮已经不在了，不能假装它还能继续。
 *                从浏览器里读出来的对话要校验（validateConversation）：坏了就跳过这一段，不让整个历史列表打不开。
 *                历史列表按“今天 / 昨天 / 最近 7 天 / 更早”分组，搜索看标题和你说过的话。
 *                这里不碰浏览器，存在哪由 components/assistant/chat-store.ts 决定。
 * @courses       UC Berkeley CS61A（数据抽象）；CMU 15-445 / UC Berkeley CS186（持久化与模式设计）；
 *                Stanford CS147（历史记录与可恢复性）
 * @exercises     https://cs186berkeley.net/ —— CS186 里崩溃恢复（ARIES）的部分
 *                https://cs61a.org/ —— CS61A 的数据抽象
 * @prereq        知道“持久化”：把内存里的东西存到关掉程序也不会丢的地方。
 * @unclear       对话里存着模型的原始回复（raw），很长的对话会占不少空间；目前没有自动清理旧对话，需要你在历史里手动删。
 *
 * @letter
 * 这个文件管的是对话记录：存成啥样，标题怎么起，历史列表怎么分组，还有重新打开时怎么收拾残局。
 *
 * 我最想让你看的是 settle 这个函数。
 * 存下来的对话是某一刻的快照，而那一刻可能恰好是“AI 话说到一半”，或者“改动单还等着你点”。
 * 你关掉页面以后，那一轮其实已经死了：网络请求断了，等你点按钮的那个 Promise 也没了。
 * 要是原样恢复，屏幕上就会有一个永远在转的圈、一张永远点不动的改动单。看着还活着，其实早就死透了。
 *
 * 所以重新打开之前，先收拾一下：说到一半的回答标成“已结束”，还在转圈的工具标成“中断”，没点的改动单一律按“没写入”算。
 * 每样半途而废的东西，都给它标上真实的结局。
 * 数据库崩溃恢复也是这个道理（CS186 讲 ARIES 那一课）：重启以后，没提交的事务一律当作没发生过。
 *
 * 一段对话要存两份记录，这点也挺有意思。一份是交给模型的（跟厂商无关的那种 Turn），一份是画在屏幕上的（你的话、回答、工具调用、改动单）。
 * 为啥不只存一份？因为这两边要的东西不一样。模型要的是原原本本的对话，屏幕要的是“这张改动单你当时点了同意还是拒绝”。
 * 硬凑成一份，要么模型那边多出一堆它看不懂的界面状态，要么屏幕这边少了你关心的信息。
 *
 * 还有个小细节：从浏览器里读出来的对话要一段段校验，某一段坏了就跳过它。
 * 不能因为一段坏记录，让整个历史列表都打不开。
 */

import type { Turn, Surface } from './agent.ts';
import type { ApprovalMode } from './assistant.ts';
import type { ChangePreview } from './changes.ts';

export type ChangeStatus = 'pending' | 'applied' | 'rejected' | 'failed';

/** 画在屏幕上的一条记录。 */
export type ChatRecord =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; streaming: boolean }
  | { kind: 'tool'; id: string; name: string; label: string; status: 'running' | 'done' | 'error'; detail?: string }
  | { kind: 'change'; id: string; summary: string; preview: ChangePreview; status: ChangeStatus; auto: boolean; reason?: string }
  | { kind: 'notice'; id: string; text: string; tone: 'muted' | 'error'; action?: 'settings' };

export type Conversation = {
  id: string;
  title: string;
  /** 读者亲手改过名，就不再用第一句话自动起名。 */
  titleEdited: boolean;
  surface: Surface;
  provider: string;
  model: string;
  approval: ApprovalMode;
  /** 发起这段对话时在看哪一页。历史列表里显示“在哪门课问的”。 */
  context: { title: string; knowledgePath: string | null } | null;
  createdAt: string;
  updatedAt: string;
  turns: Turn[];
  records: ChatRecord[];
};

const ID = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_TITLE = 30;
const MAX_TURNS = 4000;
const MAX_RECORDS = 8000;

/** 从第一句话起标题：第一行、去掉首尾空白、最长 30 个字。 */
export function titleFrom(text: string): string {
  const line = text.trim().split('\n')[0]!.trim();
  if (!line) return '新对话';
  return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE)}…` : line;
}

/** 历史列表里的“几条消息”：只数你说的和 AI 回答的，不数工具和提示。 */
export function messageCount(conversation: Conversation): number {
  return conversation.records.filter((r) => r.kind === 'user' || r.kind === 'assistant').length;
}

/** 重新打开时收拾残局：半途而废的东西标成它真实的结局。 */
export function settle(records: readonly ChatRecord[]): ChatRecord[] {
  return records.map((r): ChatRecord => {
    if (r.kind === 'assistant' && r.streaming) return { ...r, streaming: false };
    if (r.kind === 'tool' && r.status === 'running') return { ...r, status: 'error', detail: '页面关闭时这个工具还没执行完。' };
    if (r.kind === 'change' && r.status === 'pending') return { ...r, status: 'rejected', reason: '页面关闭时还没有决定，按没有写入处理。' };
    return r;
  });
}

function isTime(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
}

/** 检查从浏览器里读出来（或备份里带来）的一段对话。只查“能不能安全地画出来、接着用”，不深究每个字段。 */
export function validateConversation(value: unknown): Conversation {
  if (!value || typeof value !== 'object') throw new Error('对话格式错误。');
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !ID.test(v.id)) throw new Error('对话编号无效。');
  if (typeof v.title !== 'string' || v.title.length > 200) throw new Error('对话标题无效。');
  if (v.surface !== 'panel' && v.surface !== 'terminal') throw new Error('对话来源无效。');
  if (typeof v.provider !== 'string' || typeof v.model !== 'string') throw new Error('对话的模型无效。');
  if (v.approval !== 'readonly' && v.approval !== 'ask' && v.approval !== 'auto') throw new Error('对话的权限无效。');
  if (!isTime(v.createdAt) || !isTime(v.updatedAt)) throw new Error('对话的时间无效。');
  if (!Array.isArray(v.turns) || v.turns.length > MAX_TURNS || !v.turns.every((t) => t && typeof t === 'object' && ['user', 'assistant', 'tool'].includes((t as { role?: string }).role ?? ''))) {
    throw new Error('对话记录无效。');
  }
  if (!Array.isArray(v.records) || v.records.length > MAX_RECORDS || !v.records.every((r) => r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string'
    && ['user', 'assistant', 'tool', 'change', 'notice'].includes((r as { kind?: string }).kind ?? ''))) {
    throw new Error('对话显示记录无效。');
  }
  const context = v.context && typeof v.context === 'object'
    ? { title: String((v.context as Record<string, unknown>).title ?? '').slice(0, 200), knowledgePath: typeof (v.context as Record<string, unknown>).knowledgePath === 'string' ? (v.context as Record<string, string>).knowledgePath : null }
    : null;
  return {
    id: v.id, title: v.title, titleEdited: v.titleEdited === true, surface: v.surface, provider: v.provider, model: v.model, approval: v.approval,
    context, createdAt: v.createdAt, updatedAt: v.updatedAt, turns: v.turns as Turn[], records: v.records as ChatRecord[],
  };
}

export type ConversationGroup = { label: string; conversations: Conversation[] };

/** 按最后一次说话的时间分组，组内新的在前。now 从外面传进来，测试时能固定。 */
export function groupConversations(list: readonly Conversation[], now: Date): ConversationGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const buckets: [string, (t: number) => boolean][] = [
    ['今天', (t) => t >= startOfToday],
    ['昨天', (t) => t >= startOfToday - day && t < startOfToday],
    ['最近 7 天', (t) => t >= startOfToday - 7 * day && t < startOfToday - day],
    ['更早', (t) => t < startOfToday - 7 * day],
  ];
  const sorted = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return buckets
    .map(([label, test]) => ({ label, conversations: sorted.filter((c) => test(Date.parse(c.updatedAt))) }))
    .filter((g) => g.conversations.length > 0);
}

/** 搜索：标题或你说过的任何一句话里含有全部关键词（不分大小写）。 */
export function searchConversations(list: readonly Conversation[], query: string): Conversation[] {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...list];
  return list.filter((c) => {
    const haystack = [c.title, ...c.records.filter((r) => r.kind === 'user').map((r) => (r as { text: string }).text)].join('\n').toLocaleLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}
