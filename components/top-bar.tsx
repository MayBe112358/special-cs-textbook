/**
 * @module        全站顶栏——站名、居中的搜索框、三个去处、深浅色切换
 * @problem       原来站名、搜索框、“学习路径 / 知识图谱”和深浅色开关全挤在侧边栏里：
 *                侧边栏本该只是一棵课程树，结果顶上压着一截工具，底下垫着一个开关，树反而被挤到中间。
 *                学习路径页和知识图谱页又没有侧边栏，到了那里连搜索框都找不到。
 * @design        照 VS Code 的样子拆开：最上面一条细细的顶栏放“全站都要用的东西”，侧边栏只放课程树。
 *                搜索框放在顶栏正中，长得像编辑器的命令中心，点它和按 Ctrl+K 是同一件事。
 *                当前在哪一块（课程目录 / 学习路径 / 知识图谱），对应的链接就亮着，从地址推出来，不另存状态。
 *                文档区在手机上仍用 Fumadocs 自带的那条移动端顶栏（有打开课程目录的按钮），
 *                所以这条顶栏在文档区只在宽屏出现；学习路径页和知识图谱页没有那条移动端顶栏，就一直显示它。
 * @courses       Stanford CS147 / UC Berkeley CS160（信息架构、全局导航与局部导航的分工）；
 *                CS50x Week 8（页面布局、sticky 定位）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 多页面网站的导航栏
 * @prereq        知道 CSS 的 sticky：元素随页面滚动，滚到顶端就停住。
 * @unclear       顶栏的 2.75rem 和 app/docs/layout.tsx 里交给 Fumadocs 的 --fd-banner-height 必须一样高，
 *                目前是两处各写一次，改的时候要一起改。
 *
 * @letter
 * 网站上的导航其实有两种，值得分清：一种回答“我在这本书的哪一页”，一种回答“我在这个网站的哪一块”。
 *
 * 侧边栏那棵树回答前一个问题：它很长，会随着你走到哪儿而展开、高亮。
 * 顶栏回答后一个问题：它很短，永远就那几项，永远在同一个位置。
 * 以前这两种东西挤在同一列里，你要找“学习路径”，得先在一大堆课程名里把它认出来。
 * 现在它们分开了——这和编辑器顶上是菜单和命令中心、左边是文件树，是同一种分工。
 *
 * 顶栏里的“当前位置”没有用 useState 记，而是每次从地址栏推出来：你在 /paths，“学习路径”就亮。
 * 这和终端的提示符、侧边栏的高亮用的是同一条规矩——地址是唯一真相。
 */
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { ThemeSwitch } from 'fumadocs-ui/layouts/shared/slots/theme-switch';
import { useSyncExternalStore } from 'react';
import { LAYOUT_CHANGED } from './layout-prefs';
import { toggleSidebar } from './sidebar-sash';

/** 侧边栏现在是不是收起的：直接看 <html data-sidebar>，它由 layout-prefs 负责写。 */
function useSidebarHidden(): boolean {
  return useSyncExternalStore(
    (onChange) => { window.addEventListener(LAYOUT_CHANGED, onChange); return () => window.removeEventListener(LAYOUT_CHANGED, onChange); },
    () => document.documentElement.dataset.sidebar === 'hidden',
    () => false,
  );
}

function SidebarIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M6 2.5v11" />
      {hidden ? null : <rect x="1.5" y="2.5" width="4.5" height="11" rx="1" fill="currentColor" opacity=".35" stroke="none" />}
    </svg>
  );
}

const SECTIONS = [
  { href: '/docs', label: '课程目录', match: (path: string) => path.startsWith('/docs') },
  { href: '/paths', label: '学习路径', match: (path: string) => path.startsWith('/paths') },
  { href: '/graph', label: '知识图谱', match: (path: string) => path.startsWith('/graph') },
];

export function TopBar({ hideOnMobile = false, sidebarToggle = false }: { hideOnMobile?: boolean; sidebarToggle?: boolean }) {
  const sidebarHidden = useSidebarHidden();
  // usePathname 给的地址已经去掉了 GitHub Pages 的前缀，可以直接比。
  const pathname = usePathname();
  const { setOpenSearch } = useSearchContext();

  return (
    <header
      className={`sticky top-0 z-40 h-11 items-center gap-3 border-b border-fd-border bg-fd-card/95 px-3 backdrop-blur-sm md:gap-4 md:px-4 ${hideOnMobile ? 'hidden md:flex' : 'flex'}`}
    >
      {sidebarToggle ? (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-pressed={!sidebarHidden}
          aria-label={sidebarHidden ? '展开侧边栏' : '收起侧边栏'}
          title={`${sidebarHidden ? '展开' : '收起'}侧边栏（Ctrl+B）`}
          className="-ml-1 grid size-7 shrink-0 place-items-center rounded-[4px] text-fd-muted-foreground hover:bg-cs-hover hover:text-fd-foreground"
        >
          <SidebarIcon hidden={sidebarHidden} />
        </button>
      ) : null}
      <Link href="/docs" className="flex shrink-0 items-center gap-2 rounded-[3px] font-semibold text-fd-foreground">
        <span aria-hidden="true" className="rounded-[3px] bg-cs-button px-1.5 font-mono text-xs leading-5 text-cs-button-foreground">~/</span>
        <span className="hidden text-sm sm:inline">一本特殊的 CS 教材</span>
      </Link>

      {/* 命令中心式的搜索框：宽屏时占住中间，窄屏时缩成一个放大镜。 */}
      <button
        type="button"
        onClick={() => setOpenSearch(true)}
        className="mx-auto flex h-7 min-w-0 items-center gap-2 rounded-md border border-fd-border bg-fd-background px-2.5 text-[13px] text-fd-muted-foreground transition-colors hover:border-fd-muted-foreground/50 hover:text-fd-foreground max-sm:ml-auto max-sm:mr-0 max-sm:w-8 max-sm:justify-center max-sm:px-0 sm:w-full sm:max-w-md"
        aria-label="搜索课程和代码讲解"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" strokeLinecap="round" /></svg>
        <span className="truncate max-sm:hidden">搜索课程和代码讲解</span>
        <kbd className="ml-auto hidden rounded-[3px] border border-fd-border bg-fd-card px-1 font-mono text-[11px] leading-4 md:inline">Ctrl K</kbd>
      </button>

      <nav aria-label="网站各部分" className="flex shrink-0 items-center gap-0.5">
        {SECTIONS.map((section) => {
          const active = section.match(pathname);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-[4px] px-2 py-1 text-[13px] transition-colors hover:bg-cs-hover hover:text-fd-foreground ${active ? 'bg-cs-hover font-medium text-fd-foreground' : 'text-fd-muted-foreground'} ${section.href === '/docs' ? 'max-sm:hidden' : ''}`}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>
      <ThemeSwitch className="shrink-0 rounded-[4px] p-0.5 *:rounded-[3px]" />
    </header>
  );
}
