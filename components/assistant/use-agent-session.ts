/**
 * @module        一段 AI 对话在网页里的样子——对话记录、流式出字、工具进度、改动单等你点头，以及存档与接续
 * @problem       左侧 AI 面板和终端里的 agent 命令是两个入口，但它们做的事完全一样：
 *                把你的话交给主循环（core/assistant/agent.ts），把一路上发生的事画出来，
 *                遇到改动单时停下来等你同意或拒绝；聊过的要存下来，下次能从历史里点开接着聊。写两遍，迟早两边的规矩不一样。
 * @design        一个 React hook：useAgentSession(surface)。它持有：
 *                - 当前这段对话（Conversation）：标题、在哪发起、模型和权限、两份记录；
 *                - turns：交给模型的记录（和厂商无关的格式）；items：画在屏幕上的记录；
 *                - choice：这段对话用的模型和权限。新对话默认用你最近一次的选择；从历史载入时恢复成当时的。
 *                你在聊天框底部换模型或权限，只改这一段对话，同时记成“下次新对话的默认”。
 *                存档：第一句话发出时建档（标题取这一句），之后每有变化，停顿一小会儿就存一次（AI 流式出字时不会每个字存一遍），
 *                一轮结束、你对改动单做了决定时立刻存。存在浏览器的 IndexedDB 里（chat-store.ts），不含 Key。
 *                从历史载入时先“收拾残局”（conversations.ts 的 settle）。
 *                工具运行需要的环境（ToolEnv）在这里组装：统一编辑接口用浏览器里的 IndexedDB 实现，
 *                知识索引用构建时生成的那份，“当前在哪一页”从地址栏读。
 *                权限：只读时模型拿不到改动工具；每次确认时改动单挂起等你点（decide）；自动同意时直接写入但照样列出来。
 *                你点“停止”时，挂起的改动单一律按拒绝处理，正在进行的网络请求也中止。
 *                你发给模型的每句话前面会悄悄附上一行“我现在在看哪一页”，屏幕上不显示——这样你说“这门课”它才知道是哪门。
 * @courses       UC Berkeley CS61A（状态与闭包）；Stanford CS147（系统状态可见、可恢复性）；
 *                UC Berkeley CS162（异步与等待：Promise 挂起直到用户做出决定）；UC Berkeley CS186（持久化）
 * @exercises     https://cs147.stanford.edu/ ; https://cs61a.org/
 * @prereq        知道 Promise 可以“先答应、以后再兑现”：new Promise(resolve => …) 里的 resolve 可以先存起来，等按钮被点时再调。
 * @unclear       面板和终端同时打开同一段对话、两边都在聊时，后存的会盖掉先存的。
 *
 * @letter
 * 这个文件里有一个小技巧值得记住：怎么让一段异步代码“停下来等人点按钮”。
 *
 * 主循环在执行 create_note 时会调 requestChange，并 await 它的结果。requestChange 里做的事是：
 * 造一个 Promise，但不马上兑现，而是把它的 resolve 函数存进一个表里，然后在屏幕上画出“同意 / 拒绝”。
 * 于是主循环就停在那个 await 上了。等你点了按钮，decide 从表里取出那个 resolve，调用它——
 * Promise 兑现，主循环接着往下走，就像什么都没发生过一样。
 *
 * 你在操作系统课（CS162）里会学到“线程阻塞在一个条件变量上，等别人唤醒”，道理是一样的：
 * 这里的“线程”是一段 async 函数，“条件变量”是那个存起来的 resolve。
 *
 * 另一个值得看的是“停顿一小会儿再存”（防抖，debounce）。AI 一秒钟吐几十个字，每个字都写一次数据库，
 * 既慢又没必要；等它停下来半秒再存，存的次数少了几十倍，丢的最多是最后半秒——而一轮结束时还会再存一次。
 */
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import knowledgeIndexJson from '@/core/knowledge/generated/knowledge-index.json';
import type { KnowledgeIndex } from '@/core/knowledge/knowledge-index';
import { createVirtualFileSystem } from '@/core/filesystem/virtual-file-system';
import { defaultChoice, rememberChoice, resolveConnection, type ApprovalMode, type ModelChoice } from '@/core/assistant/assistant';
import { buildSystemPrompt, runAgent, type Surface, type Turn } from '@/core/assistant/agent';
import { applyChange, describeChange, type ChangeRequest } from '@/core/assistant/changes';
import { createModelClient } from '@/core/assistant/clients';
import { settle, titleFrom, type ChatRecord, type Conversation } from '@/core/assistant/conversations';
import { toolsFor, type ToolEnv } from '@/core/assistant/tools';
import { newId } from '@/core/workspace/canvas';
import { getWorkspace } from '@/components/workspace/browser-workspace';
import { listChats, readChat, writeChat } from './chat-store';
import { readSettings, updateSettings } from './settings-store';

const knowledge = knowledgeIndexJson as KnowledgeIndex;
const fileSystem = createVirtualFileSystem(knowledge);

export type TranscriptItem = ChatRecord;
export type { ChangeStatus } from '@/core/assistant/conversations';

/** 一段对话用的模型和权限。 */
export type SessionChoice = ModelChoice & { approval: ApprovalMode };

/** 从地址栏推出读者此刻在看什么：网址（去掉部署前缀）、标题、在知识树里的位置。 */
function pageContext() {
  const { pathname, search } = window.location;
  const start = pathname.search(/\/(docs|notes|paths)(\/|$)/);
  const local = start >= 0 ? pathname.slice(start) : '/';
  const match = /^\/(?:docs|notes)(\/.*)?$/.exec(local.replace(/\/+$/, ''));
  const candidate = match ? (match[1] ?? '/') : null;
  const knowledgePath = candidate && fileSystem.nodeAt(candidate) ? candidate : null;
  const title = document.title.replace(/\s*[|·-]\s*一本特殊的 CS 教材$/, '');
  return { url: local + search, title, knowledgePath };
}

function defaults(): SessionChoice {
  const settings = readSettings();
  return { ...defaultChoice(settings), approval: settings.approval };
}

let counter = 0;
const nextId = () => `t${Date.now().toString(36)}${(++counter).toString(36)}`;

export function useAgentSession(surface: Surface) {
  const [items, setItems] = useState<ChatRecord[]>([]);
  const [running, setRunning] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  // 服务器上生成页面时读不到浏览器里的设置，先用固定值，页面在浏览器里跑起来后再换成你的默认——
  // 两边第一次画出来的必须一样，否则 React 会报“服务器和浏览器画得不一致”（hydration mismatch）。
  const [choice, setChoiceState] = useState<SessionChoice>({ provider: 'anthropic', model: '', approval: 'ask' });
  useEffect(() => { if (!convRef.current) setChoiceState(defaults()); }, []);
  const turns = useRef<Turn[]>([]);
  const itemsRef = useRef<ChatRecord[]>([]);
  const convRef = useRef<Conversation | null>(null);
  const choiceRef = useRef(choice);
  const controller = useRef<AbortController | null>(null);
  const waiting = useRef(new Map<string, (approved: boolean) => void>());
  const current = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  itemsRef.current = items;
  choiceRef.current = choice;

  /** 把当前这段对话存进浏览器。还没建档（一句话都没说）就不存。 */
  const save = useCallback(async () => {
    if (saveTimer.current !== null) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
    const conv = convRef.current;
    if (!conv) return;
    const next: Conversation = { ...conv, ...choiceRef.current, updatedAt: new Date().toISOString(), turns: turns.current, records: itemsRef.current };
    convRef.current = next;
    try { await writeChat(next); } catch { /* 存不进去（隐私模式等）不影响这次聊天 */ }
  }, []);

  // 屏幕上的记录一变，停顿半秒再存（流式出字时不会每个字都存一遍）。
  useEffect(() => {
    if (!convRef.current) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(), 500);
  }, [items, save]);

  const patch = useCallback((id: string, change: (item: ChatRecord) => ChatRecord) => {
    setItems((old) => old.map((item) => (item.id === id ? change(item) : item)));
  }, []);
  const push = useCallback((item: ChatRecord) => setItems((old) => [...old, item]), []);

  /** 读者对一张改动单做了决定。 */
  const decide = useCallback((id: string, approved: boolean) => {
    const resolve = waiting.current.get(id);
    if (!resolve) return;
    waiting.current.delete(id);
    resolve(approved);
  }, []);

  const stop = useCallback(() => {
    controller.current?.abort();
    for (const [id, resolve] of waiting.current) { resolve(false); waiting.current.delete(id); }
  }, []);

  /** 换一段对话之前：先停下手头的，把这一段存好。 */
  const leave = useCallback(async () => {
    stop();
    await save();
  }, [stop, save]);

  /** 开一段新对话：清空，模型和权限回到默认（最近一次的选择）。 */
  const newChat = useCallback(async () => {
    await leave();
    turns.current = [];
    convRef.current = null;
    setConversation(null);
    setItems([]);
    setChoiceState(defaults());
  }, [leave]);

  /** 从历史载入一段对话，接着聊。 */
  const load = useCallback(async (id: string): Promise<boolean> => {
    if (convRef.current?.id === id) return true;
    await leave();
    const conv = await readChat(id);
    if (!conv) return false;
    const records = settle(conv.records);
    turns.current = conv.turns;
    convRef.current = { ...conv, records };
    setConversation(convRef.current);
    setItems(records);
    setChoiceState({ provider: conv.provider, model: conv.model, approval: conv.approval });
    return true;
  }, [leave]);

  /** 接着最近的一段对话（终端的 agent -c）。没有就返回 false。 */
  const loadLatest = useCallback(async (): Promise<boolean> => {
    const [latest] = await listChats().catch(() => [] as Conversation[]);
    return latest ? load(latest.id) : false;
  }, [load]);

  /** 换模型：只改这一段对话，并记成下次新对话的默认。 */
  const setModel = useCallback((next: ModelChoice) => {
    setChoiceState((old) => ({ ...old, ...next }));
    choiceRef.current = { ...choiceRef.current, ...next };
    try { updateSettings((s) => rememberChoice(s, next)); } catch { /* 记不住默认值不影响这次 */ }
    void save();
  }, [save]);

  /** 换权限：同上。 */
  const setApproval = useCallback((approval: ApprovalMode) => {
    setChoiceState((old) => ({ ...old, approval }));
    choiceRef.current = { ...choiceRef.current, approval };
    try { updateSettings((s) => ({ ...s, approval })); } catch { /* 同上 */ }
    void save();
  }, [save]);

  /** 设置变了（比如刚填好一家的 Key）：还没开始说话的新对话跟着换成新的默认。 */
  const syncDefaults = useCallback(() => {
    if (!convRef.current && !controller.current) setChoiceState(defaults());
  }, []);

  const rename = useCallback((title: string) => {
    const conv = convRef.current;
    const clean = title.trim().slice(0, 60);
    if (!conv || !clean) return;
    convRef.current = { ...conv, title: clean, titleEdited: true };
    setConversation(convRef.current);
    void save();
  }, [save]);

  /** 历史里删掉的正好是当前这段（或全部清除，id 为 '*'）：开新对话，免得自动存档又把它存回去。 */
  const forget = useCallback((id: string) => {
    if (!convRef.current || (id !== '*' && convRef.current.id !== id)) return;
    stop();
    turns.current = [];
    convRef.current = null;
    setConversation(null);
    setItems([]);
  }, [stop]);

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || controller.current) return;
    const ctx = pageContext();
    if (!convRef.current) {
      const now = new Date().toISOString();
      convRef.current = {
        id: newId(), title: titleFrom(question), titleEdited: false, surface, ...choiceRef.current,
        context: { title: ctx.title, knowledgePath: ctx.knowledgePath }, createdAt: now, updatedAt: now, turns: [], records: [],
      };
      setConversation(convRef.current);
    }
    push({ kind: 'user', id: nextId(), text: question });
    const active = choiceRef.current;
    const resolved = resolveConnection(readSettings(), active);
    if (!resolved.ok) {
      push({ kind: 'notice', id: nextId(), text: resolved.reason, tone: 'error', action: 'settings' });
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    try {
      const workspace = await getWorkspace();
      const env: ToolEnv = {
        workspace,
        knowledge,
        context: pageContext,
        now: () => new Date().toISOString(),
        newId: () => newId(),
        requestChange: async (request: ChangeRequest) => {
          const mode = choiceRef.current.approval;
          // 这一轮开始后你把权限切成了只读：后面的改动一律不写。
          if (mode === 'readonly') return { ok: false, reason: '读者把权限切成了只读，这次改动没有写入。' };
          const id = nextId();
          const auto = mode === 'auto';
          current.current = null; // 改动单之后 AI 再说话，另起一段
          push({ kind: 'change', id, summary: request.summary, preview: describeChange(request.change), status: 'pending', auto });
          const approved = auto ? !abort.signal.aborted : await new Promise<boolean>((resolve) => waiting.current.set(id, resolve));
          const result = await applyChange(workspace, request.change, approved, new Date().toISOString());
          patch(id, (item) => item.kind === 'change'
            ? { ...item, status: result.ok ? 'applied' : approved ? 'failed' : 'rejected', ...(result.ok ? {} : { reason: result.reason }) }
            : item);
          return result;
        },
      };
      const toolRows = new Map<string, string>();
      const withContext = `（我现在在看：${ctx.title || '网站'}，网址 ${ctx.url}${ctx.knowledgePath ? `，知识路径 ${ctx.knowledgePath}` : ''}）\n${question}`;
      const run = await runAgent({
        client: createModelClient(resolved.connection),
        system: buildSystemPrompt(surface, active.approval),
        tools: toolsFor(active.approval),
        turns: [...turns.current, { role: 'user', text: withContext }],
        env,
        signal: abort.signal,
        onEvent: (event) => {
          if (event.type === 'text') {
            if (!current.current) {
              const id = nextId();
              current.current = id;
              push({ kind: 'assistant', id, text: event.delta, streaming: true });
            } else {
              const id = current.current;
              patch(id, (item) => (item.kind === 'assistant' ? { ...item, text: item.text + event.delta } : item));
            }
          } else if (event.type === 'reply-done') {
            if (current.current) patch(current.current, (item) => (item.kind === 'assistant' ? { ...item, streaming: false } : item));
            current.current = null;
          } else if (event.type === 'tool-start') {
            // 屏幕上这一行用自己的编号：有的厂商每一轮都把工具调用编成 call_1，直接拿来用会和前面几轮撞号。
            const id = nextId();
            toolRows.set(event.id, id);
            push({ kind: 'tool', id, name: event.name, label: event.name, status: 'running' });
          } else if (event.type === 'tool-end') {
            const id = toolRows.get(event.id);
            if (id) patch(id, (item) => (item.kind === 'tool'
              ? { ...item, label: event.label, status: event.isError ? 'error' : 'done', ...(event.isError ? { detail: event.content.slice(0, 300) } : {}) }
              : item));
          } else {
            push({ kind: 'notice', id: nextId(), text: event.text, tone: 'muted' });
          }
        },
      });
      turns.current = run.turns;
      if (run.stopped === 'aborted') push({ kind: 'notice', id: nextId(), text: '已停止。', tone: 'muted' });
    } catch (error) {
      push({ kind: 'notice', id: nextId(), text: error instanceof Error ? error.message : String(error), tone: 'error' });
    } finally {
      if (current.current) patch(current.current, (item) => (item.kind === 'assistant' ? { ...item, streaming: false } : item));
      current.current = null;
      controller.current = null;
      setRunning(false);
      // 等这一轮最后几次屏幕更新落地，再存一次完整的。
      window.setTimeout(() => void save(), 0);
    }
  }, [patch, push, surface, save]);

  const pending = items.find((item): item is Extract<ChatRecord, { kind: 'change' }> => item.kind === 'change' && item.status === 'pending' && !item.auto) ?? null;

  return { items, running, send, stop, decide, pending, conversation, choice, setModel, setApproval, newChat, load, loadLatest, rename, forget, syncDefaults, reset: newChat };
}
