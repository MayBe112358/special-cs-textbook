/**
 * @module        左侧最外层的活动栏——课程目录、学习路径、个人心得，三块之间切换
 * @problem       网站有三块性质不同的地方：课程目录（看课）、学习路径（排路线）、个人心得（写笔记）。
 *                把它们做成顶栏里的三个文字链接，看不出“它们是平级的三个工作区”，也看不出现在在哪一块。
 * @design        照 VS Code 的活动栏：一条 48px 宽的竖栏，三个图标，当前那块左边有一条蓝线、图标变亮。
 *                点一块，回到你上次在那一块停留的页面（从标签清单里找），而不是每次都回首页；
 *                已经在这一块时再点一次，收起 / 展开侧边栏——和 VS Code 一模一样。
 *                只在宽屏出现；手机上三块的入口放在侧边栏抽屉的顶上。
 * @courses       Stanford CS147 / UC Berkeley CS160（信息架构、全局导航、状态可见）
 * @exercises     https://hci.stanford.edu/courses/cs147/
 * @prereq        知道图标按钮一定要有文字说明（title 和 aria-label），否则读屏软件和第一次来的人都不知道它是什么。
 * @unclear       图标是手画的简单线条，没有经过认真设计；三个图标是不是一眼能认出来，要等别人来用过才知道。
 *
 * @letter
 * 为什么点一块要回到“上次停留的页面”，而不是这一块的首页？
 * 想象你在写 CS61A 的心得，中途去课程目录查了一眼 CS61B 的先修。查完点“个人心得”，
 * 你想回到的显然是刚才那份没写完的心得，而不是心得区的首页。标签清单已经记着你去过哪些地方，
 * 活动栏只是去那里翻出这一块最近的那一个——同一份数据，又一次被复用。
 */
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { toggleSidebar } from '@/components/sidebar-sash';
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
      onClick={(event) => { if (active) { event.preventDefault(); toggleSidebar(); } }}
      className={`relative grid h-12 w-12 place-items-center transition-colors ${active ? 'text-fd-foreground' : 'text-fd-muted-foreground hover:text-fd-foreground'}`}
    >
      {active ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-cs-button" /> : null}
      {area.icon}
    </Link>
  );
}

export function ActivityBar(): ReactNode {
  const pathname = usePathname();
  const { tabs, lastVisit } = useTabs();
  const current = areaOf(pathname);
  return (
    <nav aria-label="工作区" className="fixed bottom-0 left-0 top-11 z-40 hidden w-12 flex-col border-r border-fd-border bg-fd-card md:flex">
      {AREAS.map((area) => {
        // 回到这一块上次停留的页面；那个标签要是已经关掉了，就回这一块的首页。
        const last = lastVisit[area.id];
        const href = last && tabs.some((t) => t.url === last) ? last : area.home;
        return <AreaButton key={area.id} area={area} active={current === area.id} href={href} />;
      })}
    </nav>
  );
}
