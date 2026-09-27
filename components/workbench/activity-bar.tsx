/**
 * @module        左侧最外层的活动栏——课程目录、学习路径、个人心得三块之间切换，最下面是 AI 助手
 * @problem       网站有三块性质不同的地方：课程目录（看课）、学习路径（排路线）、个人心得（写笔记）。
 *                把它们做成顶栏里的三个文字链接，看不出“它们是平级的三个工作区”，也看不出现在在哪一块。
 * @design        照 VS Code 的活动栏：一条 48px 宽的竖栏，三个图标，当前那块左边有一条蓝线、图标变亮。
 *                点一块，回到你上次在那一块停留的页面（从标签清单里找），而不是每次都回首页；
 *                已经在这一块时再点一次，收起 / 展开侧边栏——和 VS Code 一模一样。
 *                只在宽屏出现；手机上三块的入口放在侧边栏抽屉的顶上。
 *                第四个图标是 AI 助手，和前三个不一样：它不换页面，只把侧边栏换成对话（side-view.ts）。
 *                AI 打开时它亮、前三个都不亮；点前三个任一个，侧边栏换回树。
 * @courses       Stanford CS147 / UC Berkeley CS160（信息架构、全局导航、状态可见）
 * @exercises     https://cs147.stanford.edu/ —— Stanford CS147 的原型与可用性测试作业
 * @prereq        知道图标按钮一定要有文字说明（title 和 aria-label），否则读屏软件和第一次来的人都不知道它是什么。
 * @unclear       图标是手画的简单线条，没有经过认真设计；三个图标是不是一眼能认出来，要等别人来用过才知道。
 *
 * @letter
 * 最左边那一条窄窄的竖栏，三个图标：课程目录、学习路径、个人心得。最底下还有一个 AI。
 *
 * 为什么不在顶栏放三个文字链接？因为那样看不出它们是“平起平坐的三个工作区”，也看不出你现在在哪一块。
 * 竖栏加图标，当前那块左边亮一条蓝线，一眼就知道。这也是照着 VS Code 学的。
 *
 * 有个小设计值得说：点一块，回到的是你上次在那一块停留的那一页，而不是那一块的首页。
 * 想象你正在写 CS61A 的心得，写到一半去课程目录查了一眼 CS61B 的先修。查完了点“个人心得”，
 * 你想回去的显然是刚才那份没写完的心得，而不是心得区的首页。
 * 标签清单本来就记着你去过哪些地方，活动栏只是去那儿翻出这一块最近的那一个。同一份数据，又被复用了一次。
 *
 * 已经在这一块了再点一下，侧边栏会收起来；再点，又展开。VS Code 里也是这样，想要宽一点的正文时很顺手。
 *
 * AI 那个图标跟前三个不一样：它不换页面，只把侧边栏换成对话框，正文还是你正在看的那一页（细节在 side-view.ts）。
 *
 * 每个图标都有文字说明（title 和 aria-label）。光有图标的按钮，读屏软件念不出来，第一次来的人也猜不到它是干嘛的。
 */
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { toggleSidebar } from '@/components/sidebar-sash';
import { setSideView, useSideView } from './side-view';
import { areaOf, useTabs } from './tabs';

const AREAS = [
  {
    id: 'docs' as const,
    label: '课程目录',
    home: '/docs',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="size-6">
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2h6.5A1.5 1.5 0 0 1 20 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
        <path d="M8 11h8M8 15h5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'paths' as const,
    label: '学习路径',
    home: '/paths',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="size-6">
        <rect x="3" y="4" width="6" height="4" rx="1" /><rect x="15" y="4" width="6" height="4" rx="1" /><rect x="9" y="16" width="6" height="4" rx="1" />
        <path d="M6 8v3a2 2 0 0 0 2 2h1.5M18 8v3a2 2 0 0 1-2 2h-1.5M12 13v3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'notes' as const,
    label: '个人心得',
    home: '/notes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="size-6">
        <path d="M6 3.5h9l3.5 3.5v13.5H6z" strokeLinejoin="round" />
        <path d="M15 3.5V7h3.5M9 12h6M9 15.5h6M9 8.5h3" strokeLinecap="round" />
      </svg>
    ),
  },
];

/** 活动栏的三块，手机抽屉里也要用同一份清单。 */
export const WORKBENCH_AREAS = AREAS;

function AreaButton({ area, active, href }: { area: (typeof AREAS)[number]; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      aria-label={area.label}
      aria-current={active ? 'page' : undefined}
      title={active ? `${area.label}（再点一次收起侧边栏 · Ctrl+B）` : area.label}
      onClick={(event) => {
        // AI 开着时点任何一块：先把侧边栏换回树。
        if (document.documentElement.dataset.sideView === 'ai') setSideView('tree');
        else if (active) { event.preventDefault(); toggleSidebar(); }
      }}
      className={`relative grid h-12 w-12 place-items-center transition-colors ${active ? 'text-fd-foreground' : 'text-fd-muted-foreground hover:text-fd-foreground'}`}
    >
      {active ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-cs-button" /> : null}
      {area.icon}
    </Link>
  );
}

/** AI 助手：不换页面，只把侧边栏换成对话；已经开着时再点一次收起侧边栏（和前三块一样）。 */
function AiButton({ active }: { active: boolean }) {
  return (
    <button
      type="button"
      aria-label="AI 助手"
      aria-pressed={active}
      title={active ? 'AI 助手（再点一次收起侧边栏 · Ctrl+Alt+I）' : 'AI 助手（Ctrl+Alt+I）'}
      onClick={() => { if (active) toggleSidebar(); else setSideView('ai'); }}
      className={`relative mt-auto mb-1 grid h-12 w-12 place-items-center transition-colors ${active ? 'text-fd-foreground' : 'text-fd-muted-foreground hover:text-fd-foreground'}`}
    >
      {active ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-cs-button" /> : null}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="size-6">
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4 3.5V16h-.5A1.5 1.5 0 0 1 4 14.5z" strokeLinejoin="round" />
        <path d="M12 7.2l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function ActivityBar(): ReactNode {
  const pathname = usePathname();
  const { tabs, lastVisit } = useTabs();
  const side = useSideView();
  const current = side === 'ai' ? null : areaOf(pathname);
  return (
    <nav aria-label="工作区" className="fixed bottom-0 left-0 top-11 z-40 hidden w-12 flex-col border-r border-fd-border bg-fd-card md:flex">
      {AREAS.map((area) => {
        // 回到这一块上次停留的页面；那个标签要是已经关掉了，就回这一块的首页。
        const last = lastVisit[area.id];
        const href = last && tabs.some((t) => t.url === last) ? last : area.home;
        return <AreaButton key={area.id} area={area} active={current === area.id} href={href} />;
      })}
      <AiButton active={side === 'ai'} />
    </nav>
  );
}
