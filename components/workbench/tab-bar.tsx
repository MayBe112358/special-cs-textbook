/**
 * @module        标签栏的样子——宽屏一排标签，手机上一个下拉切换
 * @problem       tabs.tsx 管“有哪些标签”，这里管“怎么显示、怎么点”。
 * @design        宽屏：放在内容区正上方（Fumadocs 布局里原本给移动端标题栏留的那一格），35px 高，
 *                当前标签底色和正文一样、顶上一条蓝线；预览标签斜体；鼠标悬停或当前标签才露出 ×；
 *                有未保存修改时 × 换成圆点（悬停时变回 ×）。中键点击关闭，双击固定预览标签。
 *                标签多了横向滚动，当前那个自动滚进视野。
 *                关一个有未保存修改的标签时，标签下方弹出一个小框：“放弃修改并关闭 / 取消”。
 *                最后一个标签后面是 +，开一个新标签页（里面是首页）。
 *                手机：顶栏里一个“n 个标签 ▾”按钮，点开是一张列表，列表最上面是“新标签页”。
 * @courses       Stanford CS147 / UC Berkeley CS160（可发现性、防误操作）；CS50x Week 8（事件处理）
 * @exercises     https://hci.stanford.edu/courses/cs147/
 * @prereq        知道鼠标中键点击的事件是 auxclick，button 等于 1。
 * @unclear       标签还不能拖动排序，也没有右键菜单（关闭其他、关闭右侧）。
 *
 * @letter
 * 标签栏上每个小细节都是 VS Code 用了很多年磨出来的，这里照搬，是因为读者多半已经习惯了它们：
 * × 平时藏起来，是为了让标题多露出几个字；未保存的圆点占了 × 的位置，是因为“能不能直接关”恰好就是它要提醒的事；
 * 中键关闭是给鼠标用得多的人的快捷方式。你会发现好的界面细节往往不是发明出来的，而是尊重了人已经有的习惯。
 */
'use client';
import { Header } from 'fumadocs-ui/layouts/docs/slots/header';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { HOME, areaOf, useTabs, type Tab } from './tabs';

function TabIcon({ url }: { url: string }) {
  const area = areaOf(url);
  const common = { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, 'aria-hidden': true, className: 'size-3.5 shrink-0' } as const;
  if (url === HOME) return <svg {...common} className="size-3.5 shrink-0 text-fd-muted-foreground"><path d="M2.5 7.5 8 3l5.5 4.5V13h-3.5V9.5h-4V13H2.5z" strokeLinejoin="round" /></svg>;
  if (area === 'paths') return <svg {...common} className="size-3.5 shrink-0 text-cs-dir"><rect x="1.5" y="2" width="4" height="3" rx=".5" /><rect x="10.5" y="11" width="4" height="3" rx=".5" /><path d="M3.5 5v3.5h9V11" /></svg>;
  if (area === 'notes') return <svg {...common} className="size-3.5 shrink-0 text-cs-author"><path d="M3.5 1.5h6l3 3v10h-9z" /><path d="M6 7.5h4M6 10h4" /></svg>;
  return <svg {...common} className="size-3.5 shrink-0 text-fd-primary"><path d="M3 2.5h7l3 3v8H3z" /><path d="M5.5 8h5M5.5 10.5h3" /></svg>;
}

function PlusGlyph() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" /></svg>;
}

function CloseGlyph() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" /></svg>;
}

function TabItem({ tab, active, dirty }: { tab: Tab; active: boolean; dirty: boolean }) {
  const { close, pin } = useTabs();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (active) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [active]);
  return (
    <div
      ref={ref}
      role="tab"
      aria-selected={active}
      data-active={active}
      className={`group relative flex h-full min-w-0 max-w-56 shrink-0 items-center border-r border-fd-border text-[13px] ${active ? 'bg-fd-background text-fd-foreground' : 'bg-fd-card text-fd-muted-foreground hover:bg-cs-hover'}`}
      onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); close(tab.url); } }}
      onDoubleClick={() => pin(tab.url)}
    >
      {active ? <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-cs-button" /> : null}
      <Link href={tab.url} className="flex h-full min-w-0 items-center gap-1.5 pl-3 pr-1" title={tab.preview ? `${tab.title}（预览，双击固定）` : tab.title}>
        <TabIcon url={tab.url} />
        <span className={`truncate ${tab.preview ? 'italic' : ''}`}>{tab.title}</span>
      </Link>
      <button
        type="button"
        aria-label={`关闭 ${tab.title}`}
        title={dirty ? '有未保存的修改' : '关闭'}
        onClick={() => close(tab.url)}
        className={`mr-1.5 grid size-5 shrink-0 place-items-center rounded-[3px] hover:bg-fd-accent ${active || dirty ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
      >
        {dirty ? (
          <>
            <span aria-hidden="true" className="size-2 rounded-full bg-fd-foreground group-hover:hidden" />
            <span className="hidden group-hover:block"><CloseGlyph /></span>
          </>
        ) : <CloseGlyph />}
      </button>
    </div>
  );
}

/** 关闭一个有未保存修改的标签前，在标签栏下方问一句。 */
function ConfirmClose() {
  const { tabs, confirming, close, cancelConfirm } = useTabs();
  const tab = tabs.find((t) => t.url === confirming);
  if (!tab) return null;
  return (
    <div role="alertdialog" aria-label="未保存的修改" className="absolute left-2 top-full z-50 mt-1 flex animate-cs-pop-in flex-wrap items-center gap-2 rounded-md border border-fd-border bg-fd-popover px-3 py-2 text-sm shadow-cs-pop">
      <span>「{tab.title}」有未保存的修改。</span>
      <button type="button" className="cs-btn cs-btn-danger" autoFocus onClick={() => close(tab.url, true)}>放弃修改并关闭</button>
      <button type="button" className="cs-btn" onClick={cancelConfirm}>取消</button>
    </div>
  );
}

/** 宽屏的标签栏，放在 Fumadocs 布局的 header 那一格。 */
export function TabBar() {
  const { tabs, active, dirty, openNewTab } = useTabs();
  return (
    <div className="sticky top-(--fd-docs-row-1) z-30 h-(--fd-header-height) [grid-area:header] max-md:hidden">
      {/* 标签多了只让标签那一段横向滚动，+ 始终紧跟在最后一个标签后面、不被滚走——和浏览器一样。 */}
      <div className="flex h-full border-b border-fd-border bg-fd-card">
        <div role="tablist" aria-label="打开的页面" className="cs-tabstrip flex h-full min-w-0 overflow-x-auto overflow-y-hidden">
          {tabs.map((tab) => <TabItem key={tab.url} tab={tab} active={tab.url === active} dirty={dirty.has(tab.url)} />)}
        </div>
        <button
          type="button"
          onClick={openNewTab}
          aria-label="新标签页"
          title="新标签页"
          className="mx-1 grid size-7 shrink-0 place-items-center self-center rounded-[4px] text-fd-muted-foreground hover:bg-cs-hover hover:text-fd-foreground"
        >
          <PlusGlyph />
        </button>
      </div>
      <ConfirmClose />
    </div>
  );
}

/** 替换 Fumadocs 的 header 插槽：手机上仍是它原来的标题栏，宽屏上换成标签栏。 */
export function WorkbenchHeader() {
  return (
    <>
      <Header />
      <TabBar />
    </>
  );
}

/** 手机顶栏里的标签切换：一个按钮，点开是列表。 */
export function MobileTabSwitcher() {
  const { tabs, active, dirty, close, openNewTab } = useTabs();
  const [open, setOpen] = useState(false);
  const current = tabs.find((t) => t.url === active);
  useEffect(() => { setOpen(false); }, [active]);
  if (tabs.length === 0) return null;
  return (
    <div className="relative ms-auto md:hidden">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex max-w-40 items-center gap-1 rounded-md border border-fd-border px-2 py-1 text-xs text-fd-muted-foreground">
        <span className="truncate">{current?.title ?? '标签'}</span>
        <span className="shrink-0 tabular-nums">· {tabs.length}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <ul className="absolute right-0 top-full z-50 mt-1 max-h-[60dvh] w-64 animate-cs-pop-in overflow-y-auto rounded-md border border-fd-border bg-fd-popover py-1 shadow-cs-pop">
          <li className="border-b border-fd-border pb-1 mb-1">
            <button type="button" onClick={() => { setOpen(false); openNewTab(); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-fd-muted-foreground hover:text-fd-foreground">
              <PlusGlyph />新标签页
            </button>
          </li>
          {tabs.map((tab) => (
            <li key={tab.url} className={`flex items-center gap-1 ${tab.url === active ? 'bg-cs-active' : ''}`}>
              <Link href={tab.url} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm">
                <TabIcon url={tab.url} />
                <span className={`truncate ${tab.preview ? 'italic' : ''}`}>{tab.title}</span>
                {dirty.has(tab.url) ? <span aria-label="未保存" className="size-2 shrink-0 rounded-full bg-fd-foreground" /> : null}
              </Link>
              <button type="button" aria-label={`关闭 ${tab.title}`} onClick={() => close(tab.url)} className="mr-1 grid size-8 place-items-center text-fd-muted-foreground"><CloseGlyph /></button>
            </li>
          ))}
        </ul>
      ) : null}
      {/* 手机上关闭有未保存修改的标签，确认框也要出现。 */}
      <div className="fixed inset-x-2 top-16 z-50"><ConfirmClose /></div>
    </div>
  );
}
