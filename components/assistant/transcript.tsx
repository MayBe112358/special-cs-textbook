/**
 * @module        AI 对话记录的样子——你说的话、AI 的回答、它在调哪个工具、等你点头的改动单
 * @problem       AI 在背后做的事（读了哪份笔记、想改哪几行）如果不画出来，你就只能盲目相信它。
 *                尤其是改动单：必须让你一眼看清“哪几行删了、哪几行加了”，再决定同不同意。
 * @design        一份记录，两种画法：
 *                - panel（左侧面板）：回答按 Markdown 渲染（和心得同一套：代码高亮、公式），你说的话靠右的气泡；
 *                - terminal（终端）：等宽字、不渲染 Markdown，像一段命令行输出。
 *                工具调用画成一行小字（进行中转圈，出错变红，可展开看原因）。
 *                改动单画成一张卡片：标题 + AI 的一句话说明 + 逐行对比（删红加绿，没变的行折叠起来，
 *                只留改动附近两行），导图和学习状态给要点列表；等你决定时下面是“同意 / 拒绝”，决定后换成结果。
 *                读者选了“自动同意”时，卡片直接显示结果，并注明“自动同意”。
 * @courses       Stanford CS147 / UC Berkeley CS160（系统状态可见、防误操作、差异的可视化）；CS50x Week 8（HTML/CSS）
 * @exercises     https://cs147.stanford.edu/
 * @prereq        知道 diff：把两个版本一行行比，标出删掉的和新加的。
 * @unclear       很长的对比（几百行）只默认显示改动附近；要看全文得点“展开”。对比是按行的，一行里只改了一个字也会整行标红标绿。
 *
 * @letter
 * 改动单上为什么要把没变的行折叠起来？因为人看 diff 的注意力是有限的。
 * AI 改了你三千字笔记里的两处，如果把三千字全摊开，那两处就淹没了，你很可能扫一眼就点了同意。
 * 只留改动附近的几行，等于替你把注意力放在该看的地方——代码评审工具（GitHub 的 PR 页面）也是这么做的。
 * 好的界面不是把信息全给你，而是把你做决定需要的那部分，放在你一眼就能看到的位置。
 */
'use client';
import { useEffect, useRef, useState } from 'react';
import type { DiffLine } from '@/core/workspace/diff';
import { MarkdownView } from '@/components/notes/markdown-view';
import type { TranscriptItem } from './use-agent-session';

type Variant = 'panel' | 'terminal';

/** 只留改动附近 context 行，其余折成“… n 行没变 …”。 */
function foldDiff(lines: readonly DiffLine[], context = 2): (DiffLine | { type: 'fold'; count: number })[] {
  const keep = lines.map((line, i) => line.type !== 'same' || lines.slice(Math.max(0, i - context), i + context + 1).some((l) => l.type !== 'same'));
  const out: (DiffLine | { type: 'fold'; count: number })[] = [];
  let folded = 0;
  lines.forEach((line, i) => {
    if (keep[i]) { if (folded) { out.push({ type: 'fold', count: folded }); folded = 0; } out.push(line); } else folded++;
  });
  if (folded) out.push({ type: 'fold', count: folded });
  return out;
}

function DiffView({ lines }: { lines: readonly DiffLine[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? lines : foldDiff(lines);
  const tooLong = !all && shown.length > 80;
  return (
    <div className="max-h-80 overflow-auto rounded border border-fd-border bg-fd-background font-mono text-[12px] leading-5">
      {(tooLong ? shown.slice(0, 80) : shown).map((line, i) => line.type === 'fold' ? (
        <button key={i} type="button" onClick={() => setAll(true)} className="block w-full px-2 text-left text-fd-muted-foreground hover:bg-cs-hover">… {line.count} 行没变（点开全部）</button>
      ) : (
        <div key={i} className={`whitespace-pre-wrap break-words px-2 ${line.type === 'add' ? 'bg-cs-ok/15 text-fd-foreground' : line.type === 'remove' ? 'bg-cs-error/15 text-fd-muted-foreground line-through decoration-cs-error/50' : 'text-fd-muted-foreground'}`}>
          <span aria-hidden="true" className="select-none pr-1.5">{line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}</span>
          <span className="sr-only">{line.type === 'add' ? '新增：' : line.type === 'remove' ? '删除：' : ''}</span>
          {line.text || ' '}
        </div>
      ))}
      {tooLong ? <button type="button" onClick={() => setAll(true)} className="block w-full px-2 py-1 text-left text-fd-muted-foreground hover:bg-cs-hover">还有 {shown.length - 80} 行，点开全部</button> : null}
    </div>
  );
}

const STATUS_TEXT = { applied: '已写入', rejected: '已拒绝，没有写入', failed: '没有写入', pending: '等你决定' } as const;

function ChangeCard({ item, onDecide, variant }: { item: Extract<TranscriptItem, { kind: 'change' }>; onDecide: (id: string, approved: boolean) => void; variant: Variant }) {
  const waiting = item.status === 'pending' && !item.auto;
  return (
    <div role={waiting ? 'group' : undefined} aria-label={waiting ? '等你确认的改动' : undefined}
      className={`space-y-2 rounded-md border p-2.5 ${waiting ? 'border-cs-button bg-cs-active/40' : 'border-fd-border bg-fd-card'} ${variant === 'terminal' ? 'max-w-3xl' : ''}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
        <span className="font-medium text-fd-foreground">{item.preview.title}</span>
      </div>
      {item.summary ? <p className="text-xs text-fd-muted-foreground">AI：{item.summary}</p> : null}
      {item.preview.diff ? <DiffView lines={item.preview.diff} /> : null}
      {item.preview.bullets ? <ul className="list-disc space-y-0.5 pl-5 text-xs text-fd-muted-foreground">{item.preview.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul> : null}
      {waiting ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="cs-btn cs-btn-primary" autoFocus onClick={() => onDecide(item.id, true)}>同意并写入</button>
          <button type="button" className="cs-btn" onClick={() => onDecide(item.id, false)}>拒绝</button>
          {variant === 'terminal' ? <span className="text-xs text-fd-muted-foreground">或输入 y / n</span> : null}
        </div>
      ) : (
        <p className={`text-xs ${item.status === 'applied' ? 'text-cs-ok' : item.status === 'pending' ? 'text-fd-muted-foreground' : 'text-cs-error'}`}>
          {item.auto && item.status !== 'rejected' ? '自动同意 · ' : ''}{STATUS_TEXT[item.status]}{item.reason && item.status !== 'rejected' ? `：${item.reason}` : ''}
        </p>
      )}
    </div>
  );
}

function ToolRow({ item }: { item: Extract<TranscriptItem, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs text-fd-muted-foreground">
      <button type="button" disabled={!item.detail} onClick={() => setOpen((v) => !v)} className="inline-flex max-w-full items-center gap-1.5 text-left disabled:cursor-default">
        {item.status === 'running'
          ? <span aria-hidden="true" className="size-3 shrink-0 animate-spin rounded-full border border-fd-muted-foreground border-t-transparent" />
          : <span aria-hidden="true" className={item.status === 'error' ? 'text-cs-error' : 'text-cs-ok'}>{item.status === 'error' ? '✕' : '✓'}</span>}
        <span className={`truncate ${item.status === 'error' ? 'text-cs-error' : ''}`}>{item.status === 'running' ? `正在调用 ${item.name}…` : item.label}</span>
      </button>
      {open && item.detail ? <p className="mt-0.5 whitespace-pre-wrap break-words pl-4">{item.detail}</p> : null}
    </div>
  );
}

export function Transcript({ items, onDecide, variant, onOpenSettings }: {
  items: readonly TranscriptItem[];
  onDecide: (id: string, approved: boolean) => void;
  variant: Variant;
  onOpenSettings?: () => void;
}) {
  return (
    <>
      {items.map((item) => {
        switch (item.kind) {
          case 'user':
            return variant === 'panel'
              ? <div key={item.id} className="ml-6 whitespace-pre-wrap break-words rounded-lg bg-cs-active/60 px-3 py-2 text-sm text-fd-foreground">{item.text}</div>
              : <div key={item.id} className="break-words"><span className="text-cs-prompt">agent</span><span className="text-fd-muted-foreground">&gt; </span>{item.text}</div>;
          case 'assistant':
            return variant === 'panel'
              ? <div key={item.id} className="cs-ai-answer text-sm">{item.text ? <MarkdownView text={item.text} /> : null}{item.streaming ? <span aria-hidden="true" className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-fd-muted-foreground align-middle" /> : null}</div>
              : <div key={item.id} className="whitespace-pre-wrap break-words text-fd-foreground">{item.text}{item.streaming ? <span aria-hidden="true" className="animate-pulse">▍</span> : null}</div>;
          case 'tool':
            return <ToolRow key={item.id} item={item} />;
          case 'change':
            return <ChangeCard key={item.id} item={item} onDecide={onDecide} variant={variant} />;
          case 'notice':
            return (
              <p key={item.id} role={item.tone === 'error' ? 'alert' : undefined} className={`text-xs ${item.tone === 'error' ? 'text-cs-error' : 'text-fd-muted-foreground'}`}>
                {item.text}
                {item.action === 'settings' && onOpenSettings ? <> <button type="button" className="text-fd-primary underline" onClick={onOpenSettings}>去设置</button></> : null}
              </p>
            );
        }
      })}
    </>
  );
}

/** 有新内容时滚到底——但读者自己往上翻的时候不抢。 */
export function useStickToBottom(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => { stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [dependency]);
  return ref;
}
