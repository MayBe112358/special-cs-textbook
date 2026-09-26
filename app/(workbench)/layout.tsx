/**
 * @module        工作区的外壳——顶栏、左侧活动栏、标签页、终端，三块共用
 * @problem       课程目录、学习路径、个人心得是三块不同的页面，但读者在它们之间来回切换时，
 *                终端的命令历史、打开过的标签不该因为换了一块就清空。
 * @design        用 Next.js 的“路由组”把三块放进同一个文件夹 (workbench)：括号里的名字不出现在网址里，
 *                但组里的页面共用这一个布局。布局在切换页面时不会被卸载，于是终端和标签的状态一直在。
 *                每一块自己的三栏布局（左边那棵树不同）在各自文件夹的 layout.tsx 里，用 AreaLayout。
 * @courses       CS50x Week 8（页面布局）；UC Berkeley CS61A（状态放在哪一层）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        知道 Next.js 的 layout 包住它下面所有页面，换页时 layout 本身不重新挂载。
 * @unclear       AI 面板（components/assistant/ai-panel.tsx）也住在这一层，所以换页时对话不丢；但刷新页面对话就没了。
 *
 * @letter
 * “状态放在哪一层”是写界面时最常要回答的问题。放得太低（比如放在某个页面里），一换页就丢；
 * 放得太高（比如放进根布局），连无关的页面都要背着它。
 * 终端历史和标签清单属于“整个工作区”，所以它们住在这一层：比单个页面高，比整个网站低。
 */
import type { ReactNode } from "react";
import { TerminalDock } from "@/components/terminal/terminal";
import { TopBar } from "@/components/top-bar";
import { SidebarSash } from "@/components/sidebar-sash";
import { ActivityBar } from "@/components/workbench/activity-bar";
import { TabsProvider } from "@/components/workbench/tabs";
import { AiPanel } from "@/components/assistant/ai-panel";

export default function WorkbenchLayout({ children }: { children: ReactNode }) {
  return (
    <TabsProvider>
      <TerminalDock>
        <TopBar hideOnMobile sidebarToggle />
        <ActivityBar />
        <SidebarSash />
        <AiPanel />
        {children}
      </TerminalDock>
    </TabsProvider>
  );
}
