/**
 * @module        侧边栏右边缘那条可以拖的分隔线，外加 Ctrl+B 收起 / 展开侧边栏
 * @problem       侧边栏宽度写死时，课程名长的人嫌窄、屏幕小的人嫌宽，谁都不满意。
 * @design        照 VS Code 的“sash”做：一条 5px 宽、平时看不见的热区贴在侧边栏右边缘，
 *                鼠标停上去一会儿才亮出一条蓝线（马上亮会在鼠标路过时闪个不停），光标变成左右箭头。
 *                按住拖动改宽度；拖到很窄（小于 120px）就收起；收起后分隔线贴在最左边，往右拖又能拉出来。
 *                双击恢复默认宽度。拖动中只改 CSS 变量，松手才保存（原因见 layout-prefs.ts）。
 *                只在宽屏出现；手机上侧边栏是抽屉，不需要调宽。
 * @courses       Stanford CS147 / UC Berkeley CS160（直接操作、可发现性、防误触）；
 *                CS50x Week 8（指针事件）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：事件、CSS 与浏览器存储
 * @prereq        知道“按下—移动—松开”是三个事件；setPointerCapture 能让拖出元素外也继续收到移动事件。
 * @unclear       键盘用户目前只能用 Ctrl+B 整个收起，不能用方向键一点点调宽度。
 *
 * @letter
 * 侧边栏右边缘那条能拖的线，看着是个小功能，其实有好几个容易做错的地方。
 *
 * 第一，能按的地方要比你看到的线宽。人的手没那么准，一条 1 像素的线基本点不中。
 * 所以真正的热区有 5 像素宽，平时是透明的；鼠标停上去一小会儿，才亮出一条 2 像素的蓝线。
 * 为啥要等一会儿才亮？因为鼠标只是从旁边路过的时候，线要是立刻亮，屏幕上就会一闪一闪的，很烦人。
 *
 * 第二，鼠标一出了那条窄窄的热区，拖动不能就此断掉。
 * setPointerCapture 就是在跟浏览器说：“这次按下去以后，不管鼠标跑到哪儿，移动的消息都先交给我。”
 *
 * 第三，拖的时候正文里的字会被顺手选中，一大片蓝，很难看。所以拖动期间给整页加一个“禁止选择”的标记，松手再去掉。
 *
 * 最后，收起侧边栏不一定非得找个按钮：你把它拖得足够窄（窄过 120 像素），它就明白你的意思，直接收起来了。收起后那条线贴在最左边，往右一拖又能拉出来。
 * 界面能读懂一个手势的意图，就少一个需要你去找的按钮。
 * 双击这条线恢复默认宽度，Ctrl+B 一键收起或展开，这两个都是跟 VS Code 学的。
 *
 * 拖动的时候只改 CSS 变量，松手才存下来。为什么这么做，在 layout-prefs.ts 那章里。
 */
'use client';
import { useEffect, useRef, type PointerEvent } from 'react';
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, SIDEBAR_SNAP, applyLayout, clamp, readLayout, updateLayout } from './layout-prefs';

/** 收起 / 展开侧边栏。顶栏按钮和 Ctrl+B 都走这里。 */
export function toggleSidebar() {
  updateLayout({ sidebarHidden: !readLayout().sidebarHidden });
}

export function SidebarSash() {
  // 记下开始拖之前的宽度：拖到收起时要保留它，下次展开才回到原来的宽度，而不是拖动途中经过的最小值。
  const dragging = useRef<{ pointerId: number; startWidth: number } | null>(null);
  const latest = useRef(readLayoutSafe());

  // Ctrl+B：和 VS Code 一样收起 / 展开侧边栏。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'b' || event.shiftKey || event.altKey) return;
      event.preventDefault();
      toggleSidebar();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function begin(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    latest.current = readLayout();
    dragging.current = { pointerId: event.pointerId, startWidth: latest.current.sidebarWidth };
    document.documentElement.dataset.resizing = 'col';
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    // 侧边栏左边还有一条活动栏，宽度要从活动栏右边缘算起。
    const activity = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cs-activity-width')) || 0;
    const x = event.clientX - activity;
    latest.current = x < SIDEBAR_SNAP
      ? { ...latest.current, sidebarHidden: true, sidebarWidth: dragging.current.startWidth }
      : { ...latest.current, sidebarHidden: false, sidebarWidth: clamp(x, SIDEBAR_MIN, SIDEBAR_MAX) };
    applyLayout(latest.current);
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    delete document.documentElement.dataset.resizing;
    updateLayout(latest.current);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动调整侧边栏宽度，双击恢复默认"
      title="拖动调整宽度 · 双击恢复默认 · Ctrl+B 收起"
      className="cs-sash cs-sash-col fixed bottom-0 top-11 z-40 hidden md:block"
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => updateLayout({ sidebarWidth: SIDEBAR_DEFAULT, sidebarHidden: false })}
    />
  );
}

/** 服务器上没有 localStorage；初值随便给一个，真正开始拖时会重新读。 */
function readLayoutSafe() {
  return typeof window === 'undefined'
    ? { sidebarWidth: SIDEBAR_DEFAULT, sidebarHidden: false, terminalHeight: 0 }
    : readLayout();
}
