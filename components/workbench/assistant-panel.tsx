/**
 * @module        右侧的 AI 助手面板——现在只占好位置、说明将来能做什么，还不接任何模型
 * @problem       将来的 AI 聊天窗口要放在右边（和 VS Code 一样），打开时正文和终端要给它让出位置。
 *                布局上的这件事如果等到接 AI 时再做，要同时改布局和写 AI，出了问题分不清是哪一边。
 * @design        顶栏右边一个开关（Ctrl+Alt+I 也行），打开时 <html> 上标记 data-assistant="open"，
 *                CSS 据此把正文区和终端往左收 340px，面板从右边滑出来。开关状态记在浏览器里。
 *                面板里现在只写清楚三件事：它将来能做什么、Key 存在哪、改东西要经过你同意——
 *                这三件事的代码约定在 core/assistant/assistant.ts 和 core/workspace/workspace.ts 里已经定好了。
 *                不在这里收集 API Key：还不能用的功能，就不该先要你的密钥。
 * @courses       Stanford CS147（渐进披露）；UC Berkeley CS161（最小权限、不要提前索要凭证）
 * @exercises     https://hci.stanford.edu/courses/cs147/
 * @prereq        知道界面上“先占位置、后填内容”是一种常见的分步做法。
 * @unclear       手机上没有这个面板：屏幕太小，将来的 AI 助手在手机上大概要做成全屏的一页。
 * @letter
 * 一个空面板值得做吗？值得，因为它逼着我们现在就回答“AI 打开时，其他东西怎么让位”。
 * 终端、正文、标签栏都要算进去；等到 AI 真的接进来，这件事已经被验证过，剩下的只是往面板里填对话。
 */
'use client';
import { useEffect, useSyncExternalStore } from 'react';

const KEY = 'special-cs-textbook:assistant-open:v1';
const EVENT = 'special-cs-textbook:assistant-toggled';

function isOpen(): boolean {
  return document.documentElement.dataset.assistant === 'open';
}

export function setAssistantOpen(open: boolean): void {
  if (open) document.documentElement.dataset.assistant = 'open';
  else delete document.documentElement.dataset.assistant;
  try { localStorage.setItem(KEY, open ? '1' : '0'); } catch { /* 记不住也不影响 */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useAssistantOpen(): boolean {
  return useSyncExternalStore(
    (cb) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); },
    isOpen,
    () => false,
  );
}

export function AssistantToggle() {
  const open = useAssistantOpen();
  // 恢复上次的开关状态；Ctrl+Alt+I 开关（VS Code 打开聊天面板用的是同一组键）。
  useEffect(() => {
    try { if (localStorage.getItem(KEY) === '1') setAssistantOpen(true); } catch { /* 忽略 */ }
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'i') { e.preventDefault(); setAssistantOpen(!isOpen()); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <button
      type="button"
      aria-pressed={open}
      aria-label={open ? '收起 AI 助手面板' : '打开 AI 助手面板'}
      title="AI 助手（尚未接入 · Ctrl+Alt+I）"
      onClick={() => setAssistantOpen(!open)}
      className={`grid size-7 shrink-0 place-items-center rounded-[4px] hover:bg-cs-hover hover:text-fd-foreground ${open ? 'bg-cs-hover text-fd-foreground' : 'text-fd-muted-foreground'}`}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" strokeLinejoin="round" />
        <path d="M5.5 7h.01M8 7h.01M10.5 7h.01" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    </button>
  );
}

export function AssistantPanel() {
  const open = useAssistantOpen();
  return (
    <aside
      aria-label="AI 助手"
      aria-hidden={!open}
      inert={!open}
      className="cs-assistant fixed bottom-0 right-0 top-11 z-40 hidden flex-col border-l border-fd-border bg-fd-card md:flex"
    >
      <div className="flex h-9 items-center justify-between border-b border-fd-border px-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-fd-foreground">AI 助手</span>
        <button type="button" onClick={() => setAssistantOpen(false)} aria-label="收起 AI 助手面板" className="grid size-7 place-items-center rounded-[4px] text-fd-muted-foreground hover:bg-cs-hover">
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" /></svg>
        </button>
      </div>
      <div className="space-y-3 overflow-y-auto p-4 text-sm leading-relaxed text-fd-muted-foreground">
        <p className="font-medium text-fd-foreground">这里将来是 AI 聊天窗口，现在还没有接入任何模型。</p>
        <ul className="list-disc space-y-1.5 pl-4">
          <li>你可以让它读你的心得、学习路径和学习状态，帮你整理笔记、提问、规划路线。</li>
          <li>模型厂商由你自己选，API Key 由你自己填。Key 只存在这台浏览器里，不经过这个网站的任何服务器（这个网站本来也没有服务器），也不会进备份文件。</li>
          <li>它想改你的任何东西时，只能先给出“改前 / 改后”的逐行对比，你点了同意才会写入。</li>
        </ul>
        <p className="text-xs">这些规矩已经写进了代码：core/assistant/assistant.ts、core/workspace/workspace.ts。</p>
      </div>
    </aside>
  );
}
