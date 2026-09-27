/**
 * @module        标签栏的样子——宽屏一排标签，手机上一个下拉切换
 * @problem       tabs.tsx 管“有哪些标签”，这里管“怎么显示、怎么点”。
 * @design        宽屏：放在内容区正上方（Fumadocs 布局里原本给移动端标题栏留的那一格），35px 高，
 *                当前标签底色和正文一样、顶上一条蓝线；预览标签斜体；鼠标悬停或当前标签才露出 ×；
 *                有未保存修改时 × 换成圆点（悬停时变回 ×）。中键点击关闭，双击固定预览标签。
 *                标签多了横向滚动，当前那个自动滚进视野。
 *                关一个有未保存修改的标签时，标签下方弹出一个小框：“放弃修改并关闭 / 取消”。
 *                最后一个标签后面是 +，开一个新标签页（里面是首页）。
 *                按住标签左右拖可以换位置，松手处有一条竖线指示会落在哪；拖过的标签自动固定。
 *                右键（或键盘上的菜单键 / Shift+F10）弹出菜单：固定、关闭、关闭其他、关闭右侧、关闭已保存的。
 *                一次关一批时，有未保存修改的标签留着不关，标签栏下方会说一声留下了几个。
 *                手机：顶栏里一个“n 个标签 ▾”按钮，点开是一张列表，列表最上面是“新标签页”。
 * @courses       Stanford CS147 / UC Berkeley CS160（可发现性、防误操作）；CS50x Week 8（事件处理）
 * @exercises     https://cs147.stanford.edu/ —— Stanford CS147 的原型与可用性测试作业
 * @prereq        知道鼠标中键点击的事件是 auxclick，button 等于 1；知道浏览器自带拖放（drag and drop）：
 *                dragstart 时放一份数据，dragover 里 preventDefault 表示“这里可以放”，drop 时取出来。
 * @unclear       拖放用的是浏览器自带的 HTML5 拖放，触摸屏不支持——手机上标签本来就收成了下拉列表，不需要拖。
 *                标签不能拖出窗口变成新窗口（VS Code 可以），网页做不到。
 *
 * @letter
 * tabs.tsx 管“有哪些标签”，这个文件管它们长什么样、怎么点。
 *
 * 标签栏上几乎每个小细节，都是 VS Code 用了很多年磨出来的，这里照搬，是因为你多半早就习惯了：
 * × 平时藏着，鼠标放上去或者是当前标签才露出来，好让标题多露几个字；
 * 没保存的时候，× 的位置换成一个小圆点，因为“能不能直接关”恰好就是它要提醒你的事；
 * 鼠标中键点一下就关，这是给常用鼠标的人留的快捷方式。
 * 好的界面细节，很多不是发明出来的，而是尊重了人已经有的习惯。
 *
 * 关一个有没保存修改的标签时，不会弹出系统那种挡住整个屏幕的对话框，而是在标签下面冒出一个小框：“放弃修改并关闭”还是“取消”。
 * 问题出在哪儿，就在哪儿问，你的视线不用跳走。
 *
 * 拖标签换位置用的是浏览器自带的拖放。按住标签往左右拖，松手的地方会有一条竖线提示你它会落在哪儿；被拖过的标签会自动固定下来，毕竟你都专门给它挪地方了，肯定是想留着。
 * 右键菜单用键盘也能叫出来（菜单键或者 Shift+F10），这是给不用鼠标的人准备的。
 *
 * 手机上一排标签根本放不下，就收成顶栏里一个“n 个标签”的下拉按钮，点开是一张列表。浏览器自带的拖放在触屏上也不好使，正好手机上也用不着拖。
 */
'use client';
import { Header } from 'fumadocs-ui/layouts/docs/slots/header';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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

/** 拖动标签时放在 dataTransfer 里的类型名；只认它，拖进来的文件、文字不会被当成标签。 */
const TAB_DRAG = 'application/x-special-cs-tab';

type DropMark = { url: string; side: 'before' | 'after' } | null;
type MenuState = { url: string; x: number; y: number } | null;

function TabItem({ tab, active, dirty, drop, onDragMark, onDropHere, onMenu }: {
  tab: Tab; active: boolean; dirty: boolean; drop: DropMark;
  onDragMark: (mark: DropMark) => void;
  onDropHere: (event: DragEvent<HTMLDivElement>) => void;
  onMenu: (url: string, x: number, y: number) => void;
}) {
  const { close, pin } = useTabs();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (active) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [active]);
  return (
    <div
      ref={ref}
      role="tab"
      aria-selected={active}
      data-active={active}
      draggable
      className={`group relative flex h-full min-w-0 max-w-56 shrink-0 items-center border-r border-fd-border text-[13px] ${active ? 'bg-fd-background text-fd-foreground' : 'bg-fd-card text-fd-muted-foreground hover:bg-cs-hover'}`}
      onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); close(tab.url); } }}
      onDoubleClick={() => pin(tab.url)}
      onContextMenu={(event) => {
        event.preventDefault();
        // 键盘打开的菜单（菜单键、Shift+F10）没有鼠标位置，就贴着标签的左下角出现。
        const box = event.currentTarget.getBoundingClientRect();
        const fromKeyboard = event.clientX === 0 && event.clientY === 0;
        onMenu(tab.url, fromKeyboard ? box.left : event.clientX, fromKeyboard ? box.bottom : event.clientY);
      }}
      onDragStart={(event) => { event.dataTransfer.setData(TAB_DRAG, tab.url); event.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(TAB_DRAG)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        // 鼠标在标签左半边就插到它前面，右半边就插到它后面。
        const box = event.currentTarget.getBoundingClientRect();
        const side = event.clientX < box.left + box.width / 2 ? 'before' : 'after';
        if (drop?.url !== tab.url || drop.side !== side) onDragMark({ url: tab.url, side });
      }}
      onDrop={onDropHere}
      onDragEnd={() => onDragMark(null)}
    >
      {active ? <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-cs-button" /> : null}
      {drop?.url === tab.url ? <span aria-hidden="true" className={`absolute inset-y-1 z-10 w-0.5 rounded-full bg-cs-button ${drop.side === 'before' ? '-left-px' : '-right-px'}`} /> : null}
      {/* 链接自己默认也能拖（拖出去是一个网址），这里关掉，让拖动交给外面这一整块标签。 */}
      <Link href={tab.url} draggable={false} className="flex h-full min-w-0 items-center gap-1.5 pl-3 pr-1" title={tab.preview ? `${tab.title}（预览，双击固定）` : tab.title}>
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

/** 标签的右键菜单。点菜单外面、按 Esc、滚动或窗口变化都会收起；↑↓ 在菜单项之间移动。 */
function TabMenu({ menu, onClose, onKept }: { menu: NonNullable<MenuState>; onClose: () => void; onKept: (kept: number) => void }) {
  const { tabs, dirty, close, closeMany, pin } = useTabs();
  const ref = useRef<HTMLDivElement>(null);
  const index = tabs.findIndex((t) => t.url === menu.url);
  const tab = tabs[index];

  useEffect(() => {
    const onPointer = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }, []);

  if (!tab) return null;
  const others = tabs.filter((t) => t.url !== tab.url).map((t) => t.url);
  const right = tabs.slice(index + 1).map((t) => t.url);
  const saved = tabs.filter((t) => !dirty.has(t.url)).map((t) => t.url);
  const run = (action: () => number | void) => {
    const kept = action();
    onClose();
    if (typeof kept === 'number' && kept > 0) onKept(kept);
  };

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  }

  const item = 'flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-cs-hover focus:bg-cs-hover focus:outline-none disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`标签「${tab.title}」`}
      onKeyDown={onKeyDown}
      // 菜单宽约 13rem；太靠右就往左挪，别伸出窗口。
      style={{ left: Math.min(menu.x, window.innerWidth - 224), top: menu.y + 2 }}
      className="fixed z-50 min-w-52 animate-cs-pop-in rounded-md border border-fd-border bg-fd-popover py-1 shadow-cs-pop"
    >
      {tab.preview ? <button type="button" role="menuitem" className={item} onClick={() => run(() => pin(tab.url))}>固定</button> : null}
      <button type="button" role="menuitem" className={item} onClick={() => run(() => close(tab.url))}>关闭</button>
      <button type="button" role="menuitem" className={item} disabled={others.length === 0} onClick={() => run(() => closeMany(others))}>关闭其他</button>
      <button type="button" role="menuitem" className={item} disabled={right.length === 0} onClick={() => run(() => closeMany(right))}>关闭右侧</button>
      <div role="separator" className="my-1 border-t border-fd-border" />
      <button type="button" role="menuitem" className={item} disabled={saved.length === 0} onClick={() => run(() => closeMany(saved))}>关闭已保存的</button>
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
  const { tabs, active, dirty, openNewTab, move } = useTabs();
  const [drop, setDrop] = useState<DropMark>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [notice, setNotice] = useState('');
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /** 松手：按竖线指示的位置把拖着的标签放过去。 */
  function onDropHere(event: DragEvent<HTMLDivElement>) {
    const url = event.dataTransfer.getData(TAB_DRAG);
    event.preventDefault();
    setDrop(null);
    if (!url || !drop) return;
    const at = tabs.findIndex((t) => t.url === drop.url);
    const before = drop.side === 'before' ? drop.url : tabs[at + 1]?.url ?? null;
    // 放在“自己右边那个标签的前面”就是原地，不用动。
    if (before !== url) move(url, before);
  }

  return (
    <div className="sticky top-(--fd-docs-row-1) z-30 h-(--fd-header-height) [grid-area:header] max-md:hidden">
      {/* 标签多了只让标签那一段横向滚动，+ 始终紧跟在最后一个标签后面、不被滚走——和浏览器一样。 */}
      <div className="flex h-full border-b border-fd-border bg-fd-card">
        <div
          role="tablist"
          aria-label="打开的页面"
          className="cs-tabstrip flex h-full min-w-0 overflow-x-auto overflow-y-hidden"
          onScroll={closeMenu}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null); }}
        >
          {tabs.map((tab) => (
            <TabItem key={tab.url} tab={tab} active={tab.url === active} dirty={dirty.has(tab.url)} drop={drop}
              onDragMark={setDrop} onDropHere={onDropHere} onMenu={(url, x, y) => setMenu({ url, x, y })} />
          ))}
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
      {menu ? <TabMenu menu={menu} onClose={closeMenu} onKept={(kept) => setNotice(`${kept} 个标签有未保存的修改，留着没关。`)} /> : null}
      {notice ? (
        <p role="status" className="absolute right-2 top-full z-40 mt-1 animate-cs-pop-in rounded-md border border-fd-border bg-fd-popover px-3 py-1.5 text-xs shadow-cs-pop">{notice}</p>
      ) : null}
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
