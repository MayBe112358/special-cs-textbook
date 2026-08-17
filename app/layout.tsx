/**
 * @module        整个网站最外层的页面骨架
 * @problem       所有页面都需要共享语言、基础高度和 Fumadocs 的交互环境。
 * @design        在根布局只挂载 RootProvider 和官方要求的基础类名，不放具体文档内容。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript; React 组件组合
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        HTML 页面有 html、body 两层，以及父组件可以包住所有子页面。
 * @unclear       深浅色偏好和站点级元数据会在后续步骤结合正式内容处理。
 *
 * @letter
 * 无论你打开哪一篇文档，都会先经过这个最外层。RootProvider 提供主题与界面交互所需的共同环境，
 * 但它不知道具体课程，也不保存访问者的学习状态。把通用外壳和具体内容分开，后续页面变多时仍只有
 * 一个地方负责全站共同规则。
 */
import type { Metadata } from "next";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata = {
  title: "一本特殊的 CS 教材",
  description: "以课程为目录、以项目代码和注释为正文的计算机科学教材。",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-CN" suppressHydrationWarning><body className="flex min-h-screen flex-col"><RootProvider>{children}</RootProvider></body></html>;
}
