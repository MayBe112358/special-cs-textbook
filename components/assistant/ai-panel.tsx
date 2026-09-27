/**
 * @module        左侧的 AI 助手面板——和 AI 对话、选模型和权限、翻历史、看它在做什么、确认它想做的改动
 * @problem       读者要一个随手就能问的地方：看着课程页问“这门课适合我现在学吗”，看着心得说“帮我整理成导图”。
 *                它得和正在看的页面并排（不能挡住正文），得看得见 AI 正在读什么、想改什么，还得能随时叫停；
 *                聊过的要能找回来，接着聊。
 * @design        和课程树共用左侧侧边栏那块位置（components/workbench/side-view.ts 决定此刻显示哪个）。三种视图：
 *                - 对话：顶上一行是这段对话的名字（点一下改名）和“新对话 / 历史 / Key 与接口 / 收起”；
 *                  中间是对话记录（Transcript）；底下是输入框（Enter 发送，Shift+Enter 换行），
 *                  输入框底部左边是模型和权限两个选择器（pickers.tsx），右边是发送——AI 回答时变成“停止”。
 *                - 历史（history-view.tsx）：点一条就回到对话视图接着聊。
 *                - Key 与接口（settings-view.tsx）：只管各家的 Key、地址、模型列表。
 *                对话还没开始时给几句示例，点一下就发出去；还没配置好时直接引到设置页。
 *                面板放在工作区外壳里，换页不会被卸载，对话一直在；对话同时存进浏览器，关掉再开也能从历史里找回来。
 *                只有这一份面板：宽屏时贴在侧边栏的位置，手机上铺满全屏（位置全由 globals.css 的 .cs-ai-panel 按屏幕宽度决定），
 *                所以两种屏幕上是同一段对话。
 * @courses       Stanford CS147 / UC Berkeley CS160（对话式界面、系统状态可见、用户控制与自由）
 * @exercises     https://cs147.stanford.edu/ —— Stanford CS147 的原型与可用性测试作业
 * @prereq        知道 textarea 里 Enter 默认是换行，这里改成了发送，所以 Shift+Enter 才换行（和大多数聊天软件一样）。
 * @unclear       面板和终端同时打开同一段对话时，后存的会盖掉先存的。
 *
 * @letter
 * 这个面板上有个按钮，比“发送”还重要：停止。
 *
 * AI 干活是一连串的：读，想，写，再读。你眼看着它往一个错误的方向走，比如它要改的是另一门课的笔记，
 * 这时候你应该能立刻叫它停下，而不是眼巴巴等它把一整轮做完。
 * 所以 AI 在回答的时候，发送按钮会变成停止按钮。一按下去，网络请求中断，挂着等你确认的改动一律按“拒绝”处理。
 * 人机交互课里把这个叫“用户控制与自由”：用户随时都得有一个显眼的出口。
 *
 * 面板有三个视图：对话、历史、Key 与接口。对话视图最常用，最底下是输入框，Enter 发送，Shift+Enter 换行，跟大多数聊天软件一样。
 * 输入框下面左边是模型和权限两个小按钮，打字的时候一抬眼就看得到“现在用的是哪个模型、AI 能不能改我的东西”。
 * 还没开始聊的时候，会给几句示例，点一下就直接发出去；Key 还没填好的话，直接把你引到设置页。
 *
 * 这个面板挂在工作区的外壳上，你换页它不会被拆掉，对话一直在。
 * 全站只有这一份面板：宽屏时贴在侧边栏的位置，手机上铺满全屏，位置全交给 CSS 按屏幕宽度来定。
 * 所以不管你用哪种屏幕，看到的都是同一段对话。
 */
'use client';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { providerReady, resolveConnection } from '@/core/assistant/assistant';
import { OPEN_AI_SETTINGS, restoreSideView, setMobileAi, setSideView } from '@/components/workbench/side-view';
import { readChat, writeChat } from './chat-store';
import { HistoryView } from './history-view';
import { ModelPicker, PermissionPicker } from './pickers';
import { SettingsView } from './settings-view';
import { Transcript, useStickToBottom } from './transcript';
import { useAssistantSettings } from './settings-store';
import { useAgentSession } from './use-agent-session';

const EXAMPLES = [
  '我现在看的这一页讲了什么？适合什么时候学？',
  '把我在这门课写的心得整理成一张导图',
  '看看我标了哪些课在学，帮我排一下接下来学什么',
  '帮我为这门课新建一份学习提纲',
];

type View = 'chat' | 'history' | 'settings';

function IconButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={active} onClick={onClick}
      className={`grid size-7 shrink-0 place-items-center rounded-[4px] hover:bg-cs-hover hover:text-fd-foreground ${active ? 'bg-cs-hover text-fd-foreground' : 'text-fd-muted-foreground'}`}>
      {children}
    </button>
  );
}

/** 顶上的对话名：点一下原地改名。还没开始说话时是“新对话”，不能改。 */
function Title({ title, editable, onRename }: { title: string; editable: boolean; onRename: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  if (editing) {
    return (
      <form className="min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); onRename(draft); setEditing(false); }}>
        <label className="sr-only" htmlFor="ai-title">对话名字</label>
        <input id="ai-title" autoFocus className="cs-input h-6 w-full py-0 text-xs" value={draft} maxLength={60}
          onChange={(e) => setDraft(e.target.value)} onBlur={() => { onRename(draft); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }} />
      </form>
    );
  }
  return (
    <button type="button" disabled={!editable} onClick={() => { setDraft(title); setEditing(true); }} title={editable ? '点一下改名' : undefined}
      className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-[13px] font-medium text-fd-foreground enabled:hover:bg-cs-hover">
      {title}
    </button>
  );
}

export function AiPanel() {
  const settings = useAssistantSettings();
  const session = useAgentSession('panel');
  const [view, setView] = useState<View>('chat');
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scroller = useStickToBottom(session.items);
  const ready = providerReady(settings, session.choice.provider);
  const reason = ready ? '' : (resolveConnection(settings, session.choice) as { reason?: string }).reason ?? '';
  const { syncDefaults } = session;

  useEffect(() => { restoreSideView(); }, []);
  // 设置变了（比如刚填好一家的 Key）：还没开始说话的新对话跟着换成新的默认。
  useEffect(() => { syncDefaults(); }, [settings, syncDefaults]);
  // 终端里的 agent 缺设置时，会请这里翻到设置页。
  useEffect(() => {
    const open = () => setView('settings');
    window.addEventListener(OPEN_AI_SETTINGS, open);
    return () => window.removeEventListener(OPEN_AI_SETTINGS, open);
  }, []);
  // Ctrl+Alt+I：开关 AI 面板（VS Code 打开聊天用的是同一组键）。
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey && e.altKey && e.key.toLowerCase() === 'i')) return;
      e.preventDefault();
      const open = document.documentElement.dataset.sideView === 'ai';
      setSideView(open ? 'tree' : 'ai');
      if (!open) requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (session.running) { session.stop(); return; }
    const text = input.trim();
    if (!text) return;
    setInput('');
    void session.send(text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
    if (event.key === 'Escape' && session.running) { event.preventDefault(); session.stop(); }
  }

  /** 历史里改名：当前这段直接改；别的那段读出来改完存回去。 */
  async function renameAny(id: string, title: string) {
    if (session.conversation?.id === id) { session.rename(title); return; }
    const conv = await readChat(id);
    const clean = title.trim().slice(0, 60);
    if (conv && clean) await writeChat({ ...conv, title: clean, titleEdited: true });
  }

  const toggle = (next: View) => setView(view === next ? 'chat' : next);

  return (
    <aside aria-label="AI 助手" className="cs-ai-panel flex-col border-r border-fd-border bg-fd-card">
      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-fd-border pl-2 pr-1">
        {view === 'chat'
          ? <Title key={session.conversation?.id ?? 'new'} title={session.conversation?.title ?? '新对话'} editable={session.conversation !== null} onRename={session.rename} />
          : <span className="min-w-0 flex-1 truncate px-1 text-[13px] font-medium">{view === 'history' ? '历史记录' : 'Key 与接口'}</span>}
        <IconButton label="新对话" onClick={() => { void session.newChat(); setView('chat'); requestAnimationFrame(() => inputRef.current?.focus()); }}>
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M8 3v10M3 8h10" strokeLinecap="round" /></svg>
        </IconButton>
        <IconButton label="历史记录" active={view === 'history'} onClick={() => toggle('history')}>
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" strokeLinecap="round" /><path d="M2.5 2.5v2.5H5M8 5v3.2l2 1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </IconButton>
        <IconButton label="Key 与接口" active={view === 'settings'} onClick={() => toggle('settings')}>
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><circle cx="8" cy="8" r="2" /><path d="M8 1.8v1.8M8 12.4v1.8M1.8 8h1.8M12.4 8h1.8M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M3.6 12.4l1.3-1.3M11.1 4.9l1.3-1.3" strokeLinecap="round" /></svg>
        </IconButton>
        <IconButton label="收起 AI 面板" onClick={() => { setSideView('tree'); setMobileAi(false); }}>
          <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" /></svg>
        </IconButton>
      </div>

      {view === 'settings' ? (
        <div className="min-h-0 flex-1 overflow-y-auto"><SettingsView onDone={() => setView('chat')} /></div>
      ) : view === 'history' ? (
        <HistoryView
          currentId={session.conversation?.id ?? null}
          onOpen={(id) => { void session.load(id).then(() => setView('chat')); }}
          onNew={() => { void session.newChat(); setView('chat'); }}
          onBack={() => setView('chat')}
          onDeleted={session.forget}
          onRename={(id, title) => void renameAny(id, title)}
        />
      ) : (
        <>
          <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
            {session.items.length === 0 ? (
              <div className="space-y-3 text-sm text-fd-muted-foreground">
                <p className="leading-relaxed">问我关于课程和源码的问题，或者让我帮你写心得、画导图、排学习路线。我能读你在这个网站里写的东西。模型和权限在输入框下面选。</p>
                {ready ? (
                  <div className="space-y-1.5">
                    {EXAMPLES.map((example) => (
                      <button key={example} type="button" onClick={() => void session.send(example)}
                        className="block w-full rounded-md border border-fd-border px-2.5 py-1.5 text-left text-xs text-fd-foreground hover:border-cs-button hover:bg-cs-hover">
                        {example}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2 rounded-md border border-dashed border-fd-border p-3 text-xs">
                    <p>{reason}</p>
                    <button type="button" className="cs-btn cs-btn-primary" onClick={() => setView('settings')}>去填 Key</button>
                  </div>
                )}
              </div>
            ) : (
              <Transcript items={session.items} onDecide={session.decide} variant="panel" onOpenSettings={() => setView('settings')} />
            )}
          </div>

          <form onSubmit={submit} className="shrink-0 p-2">
            <div className="rounded-md border border-fd-border bg-fd-background focus-within:border-cs-button">
              <label htmlFor="ai-input" className="sr-only">问 AI</label>
              <textarea
                id="ai-input" ref={inputRef} rows={3} value={input}
                onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
                placeholder={session.pending ? '先处理上面的改动单…' : '问点什么，Enter 发送，Shift+Enter 换行'}
                className="block max-h-48 min-h-16 w-full resize-none bg-transparent px-2.5 pt-2 text-sm outline-none placeholder:text-fd-muted-foreground/70"
              />
              <div className="relative flex items-center gap-1.5 px-1.5 pb-1.5">
                <ModelPicker choice={session.choice} onChange={session.setModel} onManage={() => setView('settings')} />
                <PermissionPicker value={session.choice.approval} onChange={session.setApproval} />
                <button type="submit" className={`cs-btn ml-auto shrink-0 ${session.running ? '' : 'cs-btn-primary'}`} disabled={!session.running && !input.trim()}>
                  {session.running ? '停止' : '发送'}
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </aside>
  );
}
