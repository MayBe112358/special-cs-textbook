/**
 * @module        左边侧边栏此刻显示什么——课程树，还是 AI 助手
 * @problem       AI 助手放在左边（像 VS Code 的聊天插件），和课程树共用侧边栏那一块位置：
 *                点活动栏的 AI 图标，侧边栏换成对话；点回“课程目录”等，又换回树。正文不动，你看着哪一页就还是哪一页。
 *                这件事既不是网址（换视图不换页面），也不属于某一个组件——活动栏、AI 面板、终端都要知道它。
 * @design        一个很小的全局状态：'tree' 或 'ai'，挂在 <html data-side-view> 上，CSS 按它显示或藏起 AI 面板；
 *                记在浏览器里，刷新后还是上次的样子。打开 AI 时如果侧边栏是收起的，就先展开；
 *                侧边栏太窄（放不下对话）就拉宽到 360px。手机上没有侧边栏，AI 是一个全屏的面板（data-ai-mobile）。
 *                终端里 agent 需要读者去填设置时，也通过这里打开 AI 面板的设置页（requestAiSettings）。
 *                Ctrl+Alt+I 开关 AI（和 VS Code 打开聊天的键一样）。
 * @courses       Stanford CS147（信息架构、模式切换的可见性）；UC Berkeley CS61A（状态放在哪一层）
 * @exercises     https://cs147.stanford.edu/
 * @prereq        知道 useSyncExternalStore 能订阅 React 之外的一份数据。
 * @unclear       课程树和 AI 共用一个宽度；你为了看对话拉宽了侧边栏，换回课程树时它也是宽的。
 *
 * @letter
 * 为什么 AI 放左边而不是像原先那样放右边？因为它和课程树、心得树一样，是“你正在用的工具”，
 * 而正文是“你正在看的东西”。VS Code 把资源管理器、搜索、插件都放在左边同一块位置上轮流显示，
 * 就是这个道理：工具轮换，正文不动。你问 AI 关于这一页的问题时，这一页一直在你眼前。
 */
'use client';
import { useSyncExternalStore } from 'react';
import { readLayout, updateLayout } from '@/components/layout-prefs';

export type SideView = 'tree' | 'ai';

const KEY = 'special-cs-textbook:side-view:v1';
const EVENT = 'special-cs-textbook:side-view';
const AI_MIN_WIDTH = 320;

function current(): SideView {
  return document.documentElement.dataset.sideView === 'ai' ? 'ai' : 'tree';
}

function notify() {
  window.dispatchEvent(new Event(EVENT));
}

export function setSideView(view: SideView): void {
  const root = document.documentElement;
  if (view === 'ai') {
    root.dataset.sideView = 'ai';
    const layout = readLayout();
    if (layout.sidebarHidden || layout.sidebarWidth < AI_MIN_WIDTH) updateLayout({ sidebarHidden: false, sidebarWidth: Math.max(layout.sidebarWidth, 360) });
  } else {
    delete root.dataset.sideView;
  }
  try { localStorage.setItem(KEY, view); } catch { /* 记不住也不影响 */ }
  notify();
}

/** 刷新后恢复上次的视图。在 AI 面板挂载时调一次。 */
export function restoreSideView(): void {
  try { if (localStorage.getItem(KEY) === 'ai') { document.documentElement.dataset.sideView = 'ai'; notify(); } } catch { /* 忽略 */ }
}

export function useSideView(): SideView {
  return useSyncExternalStore(
    (cb) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); },
    current,
    () => 'tree',
  );
}

/** 手机上的全屏 AI 面板。 */
export function setMobileAi(open: boolean): void {
  if (open) document.documentElement.dataset.aiMobile = 'open';
  else delete document.documentElement.dataset.aiMobile;
  notify();
}

/** 打开 AI 面板，并直接翻到设置页（终端里的 agent 缺设置时用）。 */
export const OPEN_AI_SETTINGS = 'special-cs-textbook:open-ai-settings';
export function requestAiSettings(): void {
  if (window.matchMedia('(min-width: 768px)').matches) setSideView('ai'); else setMobileAi(true);
  window.dispatchEvent(new Event(OPEN_AI_SETTINGS));
}
