/**
 * @module        聊天框底部的两个选择器——这段对话用哪个模型、AI 有什么权限
 * @problem       换模型、换权限是聊天时最常做的两件事。如果每次都要进设置页，你会懒得换；
 *                放在输入框底下，打字的时候顺手就能看见“现在是哪个模型、AI 能不能改我的东西”。
 * @design        照 VS Code Copilot 的做法，两个小按钮贴在输入框底部，点开向上弹出菜单：
 *                - 模型：顶上一个搜索框；先列“最近用过”，再按厂商分组列出模型——只列已经填好 Key 的厂商，
 *                  模型来自各家实时拉到的列表（在设置页“获取模型列表”），拉不到就用预设；
 *                  搜索框里敲一个列表里没有的名字，可以直接“使用它”；最下面是未配置的厂商和“管理 Key 与模型…”。
 *                - 权限：三档，按风险配颜色——只读（灰）、每次确认（蓝）、自动同意（橙）。每一档下面一句话说清会发生什么。
 *                两个选择都只改这一段对话，同时记成下次新对话的默认（use-agent-session.ts）。
 *                菜单点外面、按 Esc 就收起；↑↓ 在选项之间移动。
 * @courses       Stanford CS147 / UC Berkeley CS160（可见性、用颜色和图标之外的文字传达风险、渐进披露）
 * @exercises     https://hci.stanford.edu/courses/cs147/
 * @prereq        知道“弹出菜单”在键盘上也要能用：能用 Tab 进去、方向键移动、Esc 退出。
 * @unclear       模型很多时（有的厂商有上百个）列表会很长，现在只靠搜索框缩小范围，没有做分页。
 *
 * @letter
 * 权限按钮为什么要配颜色，又为什么不能只靠颜色？
 * 颜色是给扫一眼的人看的：橙色的“自动同意”在输入框底下一直亮着，你不会忘了自己把刹车松开了。
 * 但有人分不清颜色，有人用读屏软件——所以每一档都同时有图标、有文字、有一句解释。
 * 人机交互课里反复讲的一条：重要的状态至少要用两种方式表达，颜色只能是其中之一。
 */
'use client';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { profileOf, providerReady, type ApprovalMode, type ModelChoice } from '@/core/assistant/assistant';
import { PROVIDER_PRESETS, findPreset } from '@/core/assistant/providers';
import { useAssistantSettings } from './settings-store';

/** 向上弹出的菜单外壳：点外面、Esc 收起，↑↓ 在按钮之间移动。 */
function Popover({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (!ref.current?.parentElement?.contains(e.target as Node)) onClose(); };
    window.addEventListener('pointerdown', onPointer, true);
    return () => window.removeEventListener('pointerdown', onPointer, true);
  }, [open, onClose]);
  if (!open) return null;
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"],[role="menuitem"]') ?? [])];
    if (buttons.length === 0) return;
    e.preventDefault();
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[at < 0 ? 0 : (at + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
  }
  return (
    <div ref={ref} role="menu" aria-label={label} onKeyDown={onKeyDown}
      className="absolute bottom-full left-0 right-0 z-10 mb-1 max-h-[min(60vh,28rem)] animate-cs-pop-in overflow-y-auto rounded-md border border-fd-border bg-fd-popover py-1 text-[13px] shadow-cs-pop">
      {children}
    </div>
  );
}

const chip = 'inline-flex min-w-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-4 hover:bg-cs-hover';

export function ModelPicker({ choice, onChange, onManage }: { choice: ModelChoice; onChange: (next: ModelChoice) => void; onManage: () => void }) {
  const settings = useAssistantSettings();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ready = providerReady(settings, choice.provider);
  const preset = findPreset(choice.provider);
  const model = choice.model || (preset ? profileOf(settings, preset.id).model || preset.defaultModel : '');

  const groups = useMemo(() => PROVIDER_PRESETS.filter((p) => providerReady(settings, p.id)).map((p) => {
    const models = [...new Set([profileOf(settings, p.id).model, ...(settings.modelLists[p.id] ?? p.models), p.defaultModel].filter(Boolean))];
    return { preset: p, models };
  }), [settings]);
  const unready = PROVIDER_PRESETS.filter((p) => !providerReady(settings, p.id));
  const q = query.trim().toLowerCase();
  const match = (m: string) => !q || m.toLowerCase().includes(q);
  const recent = settings.recent.filter((r) => providerReady(settings, r.provider) && match(r.model));
  const exact = groups.some((g) => g.models.some((m) => m.toLowerCase() === q));

  function pick(next: ModelChoice) { onChange(next); setOpen(false); setQuery(''); }
  const item = (key: string, next: ModelChoice, label: ReactNode, sub?: string) => {
    const selected = next.provider === choice.provider && next.model === model;
    return (
      <button key={key} type="button" role="menuitemradio" aria-checked={selected} onClick={() => pick(next)}
        className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-cs-hover focus:bg-cs-hover focus:outline-none">
        <span aria-hidden="true" className="w-3 shrink-0 text-cs-button">{selected ? '✓' : ''}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{label}</span>
        {sub ? <span className="shrink-0 text-[11px] text-fd-muted-foreground">{sub}</span> : null}
      </button>
    );
  };

  return (
    <div className="min-w-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} title={ready ? `${preset?.name} · ${model}` : '这家还没配置好，点这里换一个或去设置'}
        className={`${chip} max-w-full ${ready ? 'border-fd-border text-fd-muted-foreground hover:text-fd-foreground' : 'border-cs-error/50 text-cs-error'}`}>
        <svg viewBox="0 0 16 16" className="size-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="2" /><path d="M6 1.5V3M10 1.5V3M6 13v1.5M10 13v1.5M1.5 6H3M1.5 10H3M13 6h1.5M13 10h1.5" strokeLinecap="round" /></svg>
        <span className="truncate font-mono">{ready ? model || '选择模型' : '未配置'}</span>
        <span aria-hidden="true">▾</span>
      </button>
      <Popover open={open} onClose={() => { setOpen(false); setQuery(''); }} label="选择模型">
        <div className="px-2 pb-1 pt-0.5">
          <label className="sr-only" htmlFor="ai-model-search">搜索模型</label>
          <input id="ai-model-search" autoFocus className="cs-input w-full text-xs" placeholder="搜索或输入模型名" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && q && !exact && ready) { e.preventDefault(); pick({ provider: choice.provider, model: query.trim() }); } }} />
        </div>
        {q && !exact && ready ? item('custom', { provider: choice.provider, model: query.trim() }, <>使用「{query.trim()}」</>, preset?.name.replace(/（.*）/, '')) : null}
        {recent.length ? (
          <>
            <p className="px-3 pb-0.5 pt-1.5 text-[11px] text-fd-muted-foreground">最近用过</p>
            {recent.map((r) => item(`recent-${r.provider}-${r.model}`, r, r.model, findPreset(r.provider)?.name.replace(/（.*）/, '')))}
          </>
        ) : null}
        {groups.map(({ preset: p, models }) => {
          const shown = models.filter(match);
          if (!shown.length) return null;
          return (
            <div key={p.id}>
              <p className="px-3 pb-0.5 pt-1.5 text-[11px] text-fd-muted-foreground">{p.name}</p>
              {shown.map((m) => item(`${p.id}-${m}`, { provider: p.id, model: m }, m))}
            </div>
          );
        })}
        {groups.length === 0 ? <p className="px-3 py-2 text-xs text-fd-muted-foreground">还没有填好 Key 的厂商。</p> : null}
        <div className="mt-1 border-t border-fd-border pt-1">
          {unready.length ? <p className="px-3 py-1 text-[11px] leading-relaxed text-fd-muted-foreground">未配置：{unready.map((p) => p.name.replace(/（.*）/, '')).join('、')}</p> : null}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onManage(); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fd-primary hover:bg-cs-hover focus:bg-cs-hover focus:outline-none">⚙ 管理 Key 与模型…</button>
        </div>
      </Popover>
    </div>
  );
}

export const APPROVAL_OPTIONS: readonly { value: ApprovalMode; label: string; description: string; tone: string }[] = [
  { value: 'readonly', label: '只读', description: '只能读和回答，不给它任何改动工具', tone: 'text-fd-muted-foreground border-fd-border' },
  { value: 'ask', label: '每次确认', description: '改动先给你看改前 / 改后，同意才写入', tone: 'text-cs-button border-cs-button/50' },
  { value: 'auto', label: '自动同意', description: '直接写入，对话里列出改了什么', tone: 'text-cs-warn border-cs-warn/60' },
];

export function ApprovalIcon({ mode, className = 'size-3' }: { mode: ApprovalMode; className?: string }) {
  if (mode === 'readonly') return <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></svg>;
  if (mode === 'ask') return <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M8 1.5 13.5 3.5v4c0 3.3-2.4 5.9-5.5 7-3.1-1.1-5.5-3.7-5.5-7v-4z" strokeLinejoin="round" /><path d="M5.5 8 7.3 9.8 10.5 6.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z" strokeLinejoin="round" /></svg>;
}

export function PermissionPicker({ value, onChange }: { value: ApprovalMode; onChange: (next: ApprovalMode) => void }) {
  const [open, setOpen] = useState(false);
  const current = APPROVAL_OPTIONS.find((o) => o.value === value)!;
  return (
    <div className="min-w-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} title={`权限：${current.label}——${current.description}`}
        className={`${chip} ${current.tone}`}>
        <ApprovalIcon mode={value} />
        <span className="truncate">{current.label}</span>
        <span aria-hidden="true">▾</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} label="AI 的权限">
        <p className="px-3 pb-1 pt-1 text-[11px] text-fd-muted-foreground">这段对话里 AI 能做什么</p>
        {APPROVAL_OPTIONS.map((o, i) => (
          <button key={o.value} type="button" role="menuitemradio" aria-checked={o.value === value} autoFocus={i === 0}
            onClick={() => { onChange(o.value); setOpen(false); }}
            className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-cs-hover focus:bg-cs-hover focus:outline-none">
            <span className={`mt-0.5 ${o.tone.split(' ')[0]}`}><ApprovalIcon mode={o.value} className="size-3.5" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[13px] text-fd-foreground">{o.label}{o.value === value ? <span aria-hidden="true" className="text-cs-button">✓</span> : null}</span>
              <span className="block text-[11px] leading-snug text-fd-muted-foreground">{o.description}</span>
            </span>
          </button>
        ))}
        <p className="border-t border-fd-border px-3 pb-1 pt-1.5 text-[11px] leading-snug text-fd-muted-foreground">无论哪一档，AI 都不能删除任何东西。</p>
      </Popover>
    </div>
  );
}
