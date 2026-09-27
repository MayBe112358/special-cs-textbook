/**
 * @module        工作区的标签页——像 VS Code 那样，在打开过的页面之间快速切换
 * @problem       课程页、心得文档、导图、学习路径越开越多，浏览器的“后退”只能一步步往回走，
 *                想回到三页之前那份没写完的心得，得连按好几次，还可能按过头。
 * @design        标签只是“打开过哪些地址”的一份清单，当前显示哪一页仍然只看地址栏（地址是唯一真相）：
 *                点标签 = 跳到那个地址；地址变了 = 找到或新开对应的标签。标签自己不存任何页面内容。
 *                照 VS Code 的习惯：
 *                - 单击侧边栏打开的是“预览标签”（斜体），下一次单击别的页面会替换它，免得标签越堆越多；
 *                - 双击标签，或在那一页开始编辑，它就固定下来；
 *                - 编辑器通过 useDirtyTab 报告“有未保存的修改”，标签上的 × 变成圆点，关闭时在原地问一句；
 *                - 标签清单存在浏览器里，刷新后还在（它是读者自己的界面偏好，不是内容）。
 *                - 标签栏末尾的 + 开一个“新标签页”，里面是首页；从它点进哪一页，那一页就开在这个标签里（和浏览器一样）；
 *                - 没点 + 就来到首页（比如关掉了最后一个标签）不生成标签：那是“什么都没打开”时的样子。
 *                - 标签能拖动换位置（move）；右键菜单里能一次关掉一批（closeMany：关闭其他 / 右侧 / 已保存的）。
 *                  一次关一批时，有未保存修改的标签不关、原样留着——一个一个问太啰嗦，悄悄丢掉又太危险。
 *                宽屏显示成一排标签；手机上放不下，变成顶栏里一个“n 个标签”的下拉列表。
 * @courses       Stanford CS147 / UC Berkeley CS160（导航模型、减少记忆负担）；UC Berkeley CS61A（状态与派生）；
 *                CS50x Week 8（事件与 DOM）
 * @exercises     https://cs147.stanford.edu/ —— 交互原型与可用性评估
 * @prereq        知道 React Context 能让很远的组件共用一份状态；知道 beforeunload 能在关网页前拦一下。
 * @unclear       浏览器把 Ctrl+Tab、Ctrl+W 留给自己，网页拦不住，所以这里没有切换 / 关闭标签的快捷键。
 *
 * @letter
 * 做标签页时最容易犯的错，是让标签自己“记住当前是哪一页”。那样就有了两份真相：地址栏说在 A，标签说在 B——
 * 你点浏览器后退，两者就对不上了。这里的做法是：标签只是一份目录，谁是当前页永远由地址栏说了算。
 * 你用鼠标点标签、在终端里 open、按浏览器后退，最后都只是改了地址；标签栏看到地址变了，自己去对齐。
 *
 * 预览标签看起来是个小细节，但它解决的是一个真实的烦恼：你在侧边栏里一门一门点过去看简介，
 * 如果每点一次就多一个标签，看完十门课就有十个标签，真正想留着的那一个被淹没了。
 * 预览标签的意思是“我只是看看”；一旦你双击它或者开始写东西，它才算“我要留着”。
 */
'use client';
import { Suspense, createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type Tab = { url: string; title: string; preview: boolean };

type TabsContextValue = {
  tabs: Tab[];
  active: string;
  dirty: ReadonlySet<string>;
  close: (url: string, force?: boolean) => void;
  /** 一次关掉一批（右键菜单用）。有未保存修改的跳过；返回因此留下来的个数。 */
  closeMany: (urls: readonly string[]) => number;
  /** 把一个标签挪到另一个标签前面；before 为 null 时挪到最后。 */
  move: (url: string, before: string | null) => void;
  pin: (url: string) => void;
  /** 标签栏上的 +：开一个“新标签页”，里面是首页。 */
  openNewTab: () => void;
  /** onDiscard：读者选择“放弃修改并关闭”时要做的事（通常是删掉暂存的草稿）。编辑器卸载后它仍然有效。 */
  setDirty: (url: string, dirty: boolean, onDiscard?: () => void) => void;
  /** 每一块最近一次去过的地址。活动栏用它“回到这一块上次停留的页面”。 */
  lastVisit: Partial<Record<'docs' | 'paths' | 'notes', string>>;
  /** 要关一个有未保存修改的标签时，先挂在这里，等读者在原地确认。 */
  confirming: string | null;
  cancelConfirm: () => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);
const KEY = 'special-cs-textbook:tabs:v1';
const MAX_TABS = 30;
/** 首页的地址。点 + 开的“新标签页”里显示的就是它；标签全关掉之后也回到这里。 */
export const HOME = '/';
const NEW_TAB_TITLE = '新标签页';

/** 把地址整理成标签的钥匙：去掉结尾的斜杠，保留查询参数（心得区用它指明打开的是哪份文档）。 */
export function tabKey(pathname: string, search: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return search ? `${path}?${search}` : path;
}

/** 标题还没从页面上读到时，先用地址最后一段顶着。 */
function guessTitle(url: string): string {
  const path = url.split('?')[0]!;
  if (path === HOME) return NEW_TAB_TITLE;
  if (path === '/docs') return '课程目录';
  if (path.startsWith('/paths')) return '学习路径';
  if (path === '/notes') return '个人心得';
  return path.split('/').filter(Boolean).at(-1) ?? url;
}

function loadTabs(): Tab[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter((t): t is Tab => t && typeof t.url === 'string' && t.url.startsWith('/') && typeof t.title === 'string').slice(0, MAX_TABS).map((t) => ({ ...t, preview: t.preview === true }))
      : [];
  } catch {
    return [];
  }
}

/** 地址一变，就让标签清单对上它。放在 Suspense 里，因为它读查询参数（静态导出的要求）。 */
function Tracker({ onVisit }: { onVisit: (url: string) => void }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => { onVisit(tabKey(pathname, search)); }, [pathname, search, onVisit]);
  return null;
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState('');
  const [dirty, setDirtySet] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [lastVisit, setLastVisit] = useState<TabsContextValue['lastVisit']>({});
  const loaded = useRef(false);
  // 上一次所在的地址。从“新标签页”点进别的页面时，要知道“刚才是在新标签页里”。
  const activeRef = useRef('');
  const discarders = useRef(new Map<string, () => void>());

  const onVisit = useCallback((url: string) => {
    const from = activeRef.current;
    activeRef.current = url;
    setActive(url);
    // 首页本身不生成标签：只有点了 + 才有一个“新标签页”。没点过 + 就来到首页（比如关掉了最后一个标签），
    // 它就只是“什么都没打开”时看到的那一页，像 VS Code 编辑区空着时的样子。
    if (url === HOME) {
      if (!loaded.current) { loaded.current = true; setTabs(loadTabs()); }
      return;
    }
    setLastVisit((old) => (old[areaOf(url)] === url ? old : { ...old, [areaOf(url)]: url }));
    setTabs((old) => {
      const base = loaded.current ? old : loadTabs();
      loaded.current = true;
      if (base.some((t) => t.url === url)) return base;
      // 刚才在“新标签页”里：新页面就开在这个标签里，和浏览器一样。这是你特意开的标签，所以直接固定，不当预览。
      const blank = from === HOME ? base.findIndex((t) => t.url === HOME) : -1;
      if (blank >= 0) return base.map((t, i) => (i === blank ? { url, title: guessTitle(url), preview: false } : t));
      const fresh: Tab = { url, title: guessTitle(url), preview: true };
      // 已有一个预览标签（而且它没有未保存的修改）就替换它，否则在最后加一个。
      const previewIndex = base.findIndex((t) => t.preview);
      const next = previewIndex >= 0 ? base.map((t, i) => (i === previewIndex ? fresh : t)) : [...base, fresh];
      return next.slice(-MAX_TABS);
    });
  }, []);

  // 页面的 <title> 变了，就把它当作标签的名字（去掉站名后缀）。
  // 要按“浏览器此刻真正所在的地址”去找标签，而不是按 active：换页时新标题可能比 active 先到，
  // 按 active 找就会把新页面的名字写到旧标签上。地址里可能带着部署前缀，所以用“结尾对得上”来匹配。
  useEffect(() => {
    const update = () => {
      const title = document.title.replace(/\s*[|·-]\s*一本特殊的 CS 教材$/, '').trim();
      if (!title || title === '一本特殊的 CS 教材') return;
      const here = tabKey(window.location.pathname, window.location.search.slice(1));
      setTabs((old) => old.map((t) => ((here === t.url || here.endsWith(t.url)) && t.title !== title ? { ...t, title } : t)));
    };
    update();
    const head = document.querySelector('head');
    if (!head) return;
    const observer = new MutationObserver(update);
    observer.observe(head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [active]);

  // 标签清单记在浏览器里；存不下就算了，不影响使用。
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(KEY, JSON.stringify(tabs)); } catch { /* 忽略 */ }
  }, [tabs]);

  // 有没保存的修改时，关网页前让浏览器问一句。
  useEffect(() => {
    if (dirty.size === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const pin = useCallback((url: string) => {
    setTabs((old) => old.map((t) => (t.url === url && t.preview ? { ...t, preview: false } : t)));
  }, []);

  const openNewTab = useCallback(() => {
    // 标签按地址区分，同一个地址只有一个标签，所以“新标签页”同时只有一个；已经有了就切过去。
    setTabs((old) => (old.some((t) => t.url === HOME) ? old : [...old, { url: HOME, title: NEW_TAB_TITLE, preview: false }].slice(-MAX_TABS)));
    router.push(HOME);
  }, [router]);

  const setDirty = useCallback((url: string, isDirty: boolean, onDiscard?: () => void) => {
    if (isDirty && onDiscard) discarders.current.set(url, onDiscard);
    if (!isDirty) discarders.current.delete(url);
    setDirtySet((old) => {
      if (old.has(url) === isDirty) return old;
      const next = new Set(old);
      if (isDirty) next.add(url); else next.delete(url);
      return next;
    });
    if (isDirty) pin(url);
  }, [pin]);

  const close = useCallback((url: string, force = false) => {
    if (!force && dirty.has(url)) { setConfirming(url); return; }
    setConfirming(null);
    // 读者确认放弃：把暂存的草稿也扔掉，否则下次打开还会冒出来。
    discarders.current.get(url)?.();
    setDirty(url, false);
    const index = tabs.findIndex((t) => t.url === url);
    const rest = tabs.filter((t) => t.url !== url);
    if (url === active) {
      // 关掉当前这一页：去它右边那个，没有就去左边那个；一个都不剩就回到首页。
      const neighbour = rest[Math.min(index, rest.length - 1)];
      setTabs(rest);
      router.push(neighbour ? neighbour.url : HOME);
    } else {
      setTabs(rest);
    }
  }, [tabs, active, dirty, router, setDirty]);

  const closeMany = useCallback((urls: readonly string[]) => {
    const doomed = new Set(urls.filter((url) => !dirty.has(url)));
    if (doomed.size === 0) return urls.length;
    const rest = tabs.filter((t) => !doomed.has(t.url));
    setTabs(rest);
    if (doomed.has(active)) {
      // 当前这一页也被关了：去原来位置右边最近的那个留下来的标签，没有就去左边，一个不剩回首页。
      const index = tabs.findIndex((t) => t.url === active);
      const neighbour = tabs.slice(index + 1).find((t) => !doomed.has(t.url)) ?? tabs.slice(0, index).reverse().find((t) => !doomed.has(t.url));
      router.push(neighbour ? neighbour.url : HOME);
    }
    return urls.length - doomed.size;
  }, [tabs, active, dirty, router]);

  const move = useCallback((url: string, before: string | null) => {
    if (url === before) return;
    setTabs((old) => {
      const moving = old.find((t) => t.url === url);
      if (!moving) return old;
      const rest = old.filter((t) => t.url !== url);
      const at = before === null ? -1 : rest.findIndex((t) => t.url === before);
      if (at < 0) return [...rest, moving];
      return [...rest.slice(0, at), moving, ...rest.slice(at)];
    });
    // 拖动过的标签算“要留着的”，和双击一样固定下来。
    pin(url);
  }, [pin]);

  const value = useMemo<TabsContextValue>(() => ({ tabs, active, dirty, close, closeMany, move, pin, openNewTab, setDirty, lastVisit, confirming, cancelConfirm: () => setConfirming(null) }), [tabs, active, dirty, close, closeMany, move, pin, openNewTab, setDirty, lastVisit, confirming]);

  return (
    <TabsContext value={value}>
      <Suspense fallback={null}><Tracker onVisit={onVisit} /></Suspense>
      {children}
    </TabsContext>
  );
}

export function useTabs(): TabsContextValue {
  const context = use(TabsContext);
  if (!context) throw new Error('useTabs 只能在 TabsProvider 里面用。');
  return context;
}

/**
 * 编辑器用：告诉标签栏“这一页有没有未保存的修改”。
 * 切到别的标签时编辑器会被卸载，但标记不撤销——草稿还暂存着（见 components/workspace/drafts.ts），
 * 切回来可以接着写；只有保存了、或者读者确认放弃，圆点才消失。
 */
export function useDirtyTab(url: string | null, isDirty: boolean, onDiscard?: () => void): void {
  const context = use(TabsContext);
  const setDirty = context?.setDirty;
  const discard = useRef(onDiscard);
  discard.current = onDiscard;
  useEffect(() => {
    if (!setDirty || !url) return;
    setDirty(url, isDirty, () => discard.current?.());
  }, [setDirty, url, isDirty]);
}

/** 按地址判断属于哪一块，用来给标签配图标、给活动栏找“这一块上次停在哪”。 */
export function areaOf(url: string): 'docs' | 'paths' | 'notes' {
  if (url.startsWith('/paths')) return 'paths';
  if (url.startsWith('/notes')) return 'notes';
  return 'docs';
}
