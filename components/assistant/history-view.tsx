/**
 * @module        AI 对话的历史记录——按日期分组、搜索、点开接着聊、改名、删除
 * @problem       问过的问题、AI 帮你起草过的东西，过几天常常还想回头看、或者接着问下去。
 *                没有历史记录，每段对话关掉就没了；有了历史，还得能在几十段里快速找到那一段。
 * @design        一张列表，按“今天 / 昨天 / 最近 7 天 / 更早”分组（core/assistant/conversations.ts），新的在前；
 *                顶上一个搜索框，按标题和你说过的话找。每一条两行：标题 + 时间；下面一行小字写
 *                用的模型 · 几条消息 · 在哪门课问的（终端里问的写“终端”）。当前打开的那条高亮。
 *                每条右边一个“⋯”，点开是改名、删除；删除在原地再确认一次。
 *                最底下写明“对话只存在这台浏览器里”，和一个“全部清除”（同样要确认）。
 *                在终端 agent 里的对话也在这里，点开就在面板里接着聊。
 * @courses       Stanford CS147（历史与可恢复性、防误操作）；UC Berkeley CS61A（数据的分组与过滤）
 * @exercises     https://hci.stanford.edu/courses/cs147/
 * @prereq        知道“分组”：把一串东西按某个规则分成几堆，这里的规则是日期。
 * @unclear       搜索只看标题和你说的话，不搜 AI 的回答——AI 的回答通常很长，全搜的话随便一个词都会命中一大片。
 * @letter
 * 历史列表每一条下面那行小字——模型、几条消息、在哪门课问的——看起来是装饰，其实是帮你认出“是哪一段”的线索。
 * 人找东西靠的不是精确记得标题，而是“那次好像是在看 CS61B 的时候、用 DeepSeek 问的、聊了挺久”。
 * 把这些线索摆出来，你就不用一条条点开看了。
 */
'use client';
import { useMemo, useState } from 'react';
import { groupConversations, messageCount, searchConversations, type Conversation } from '@/core/assistant/conversations';
import { findPreset } from '@/core/assistant/providers';
import { clearChats, deleteChat, useConversations } from './chat-store';

function time(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function meta(c: Conversation): string {
  const where = c.surface === 'terminal' ? '终端' : c.context?.title || '网站';
  return `${c.model || findPreset(c.provider)?.name || c.provider} · ${messageCount(c)} 条 · ${where}`;
}

function Row({ conversation, active, onOpen, onDeleted, onRename }: {
  conversation: Conversation; active: boolean; onOpen: () => void; onDeleted: () => void; onRename: (title: string) => void;
}) {
  const [mode, setMode] = useState<'' | 'menu' | 'rename' | 'delete'>('');
  const [title, setTitle] = useState(conversation.title);
  if (mode === 'rename') {
    return (
      <li className="px-2 py-1">
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); onRename(title); setMode(''); }}>
          <label className="sr-only" htmlFor={`rename-chat-${conversation.id}`}>新名字</label>
          <input id={`rename-chat-${conversation.id}`} autoFocus className="cs-input min-w-0 flex-1 text-xs" value={title} maxLength={60}
            onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setMode(''); }} />
          <button type="submit" className="cs-btn cs-btn-primary">确定</button>
        </form>
      </li>
    );
  }
  return (
    <li className={`group relative rounded ${active ? 'bg-cs-active' : 'hover:bg-cs-hover'}`}>
      <button type="button" onClick={onOpen} aria-current={active ? 'true' : undefined} className="block w-full px-2 py-1.5 pr-8 text-left">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] text-fd-foreground">{conversation.title}</span>
          <span className="shrink-0 text-[11px] text-fd-muted-foreground">{time(conversation.updatedAt)}</span>
        </span>
        <span className="block truncate text-[11px] text-fd-muted-foreground">{meta(conversation)}</span>
      </button>
      <button type="button" aria-label={`「${conversation.title}」的更多操作`} aria-expanded={mode === 'menu'} onClick={() => setMode(mode === 'menu' ? '' : 'menu')}
        className="absolute right-1 top-1.5 grid size-6 place-items-center rounded text-fd-muted-foreground opacity-0 hover:bg-fd-accent group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 max-md:opacity-100">⋯</button>
      {mode === 'menu' ? (
        <div className="flex gap-1.5 px-2 pb-1.5">
          <button type="button" className="cs-btn" onClick={() => setMode('rename')}>改名</button>
          <button type="button" className="cs-btn" onClick={() => setMode('delete')}>删除</button>
        </div>
      ) : null}
      {mode === 'delete' ? (
        <div className="flex flex-wrap items-center gap-1.5 px-2 pb-1.5 text-xs">
          <span>删除这段对话？</span>
          <button type="button" className="cs-btn cs-btn-danger" autoFocus onClick={() => void deleteChat(conversation.id).then(onDeleted)}>确定删除</button>
          <button type="button" className="cs-btn" onClick={() => setMode('')}>取消</button>
        </div>
      ) : null}
    </li>
  );
}

export function HistoryView({ currentId, onOpen, onNew, onBack, onDeleted, onRename }: {
  currentId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onBack: () => void;
  onDeleted: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const { list, error } = useConversations();
  const [query, setQuery] = useState('');
  const [clearing, setClearing] = useState(false);
  const groups = useMemo(() => groupConversations(searchConversations(list ?? [], query), new Date()), [list, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
        <button type="button" onClick={onBack} className="rounded px-1.5 py-0.5 text-xs text-fd-muted-foreground hover:bg-cs-hover hover:text-fd-foreground">← 回到对话</button>
        <span className="ml-auto" />
        <button type="button" onClick={onNew} className="cs-btn">＋ 新对话</button>
      </div>
      <div className="shrink-0 p-2">
        <label className="sr-only" htmlFor="ai-history-search">搜索对话</label>
        <input id="ai-history-search" className="cs-input w-full text-xs" placeholder="搜索对话" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {error ? <p role="alert" className="px-2 text-xs text-cs-error">{error}</p> : null}
        {list === null ? <p className="px-2 text-xs text-fd-muted-foreground">正在读取……</p>
          : groups.length === 0 ? <p className="px-2 py-6 text-center text-xs text-fd-muted-foreground">{query ? '没有找到。' : '还没有对话。'}</p>
          : groups.map((g) => (
            <section key={g.label} aria-label={g.label} className="mb-2">
              <h3 className="px-2 pb-0.5 pt-1 text-[11px] font-medium text-fd-muted-foreground">{g.label}</h3>
              <ul className="space-y-0.5">
                {g.conversations.map((c) => (
                  <Row key={c.id} conversation={c} active={c.id === currentId} onOpen={() => onOpen(c.id)}
                    onDeleted={() => onDeleted(c.id)} onRename={(t) => onRename(c.id, t)} />
                ))}
              </ul>
            </section>
          ))}
      </div>
      <div className="shrink-0 border-t border-fd-border px-3 py-2 text-[11px] text-fd-muted-foreground">
        {clearing ? (
          <span className="flex flex-wrap items-center gap-1.5">
            删除全部 {list?.length ?? 0} 段对话？
            <button type="button" className="cs-btn cs-btn-danger" autoFocus onClick={() => void clearChats().then(() => { setClearing(false); onDeleted('*'); })}>全部删除</button>
            <button type="button" className="cs-btn" onClick={() => setClearing(false)}>取消</button>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            对话只存在这台浏览器里。
            {list && list.length ? <button type="button" className="ml-auto text-cs-error hover:underline" onClick={() => setClearing(true)}>全部清除</button> : null}
          </span>
        )}
      </div>
    </div>
  );
}
