/**
 * @module        整个网站最外层的页面骨架
 * @problem       所有页面都需要共享语言、基础高度和 Fumadocs 的交互环境。
 * @design        在根布局只挂载 SiteProvider（里面是 Fumadocs 的 RootProvider、主题和搜索）和基础类名，不放具体文档内容；
 *                公式的样式表也在这里引入——它属于全站排版能力，不属于某一页。
 * @courses       Harvard CS50x Week 8（HTML、CSS、JavaScript）；UC Berkeley CS61A（抽象：通用的外壳与具体的内容分开）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：一个网页的 head 和 body 各放什么
 * @prereq        HTML 页面有 html、body 两层，以及父组件可以包住所有子页面。
 * @unclear       站点元数据只有标题和一句简介，还没有社交分享用的预览图（Open Graph 图片）。
 *
 * @letter
 * 整个网站最外面的那一层。不管你打开哪一页，都会先经过这里。
 *
 * 它只放全站都要用的东西：网站的名字和一句话简介，中文的语言标记，公式的样式表，还有 SiteProvider（主题、搜索框这些全站共用的环境）。
 * 具体哪门课、你的学习状态，它一概不知道，也不该知道。通用的外壳和具体的内容分开，页面再多，全站共同的规则也只在一个地方管。
 *
 * <head> 里那段最先执行的小脚本值得看一眼。它在页面露面之前，就把你上次拖好的侧边栏宽度、终端高度写到 <html> 上，
 * 所以你不会看到页面先按默认尺寸画出来、再“跳”一下（原理在 components/layout-prefs.ts）。
 * 因为这段脚本改了 <html> 的属性，React 接手时会发现“跟服务器生成的不一样”，所以 html 上要加 suppressHydrationWarning，告诉它这是故意的。
 */
import type { Metadata } from "next";
import { SiteProvider } from "@/components/site-provider";
import { BOOT_SCRIPT } from "@/components/layout-prefs";
import type { ReactNode } from "react";
import "katex/dist/katex.min.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "一本特殊的 CS 教材",
  description: "以课程为目录、以项目代码和注释为正文的计算机科学教材。",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  // head 里那段脚本最先执行：把你上次拖好的侧边栏宽度、终端高度写到 <html> 上，页面露面时就是对的尺寸，
  // 不会先闪一下默认值（见 components/layout-prefs.ts）。它改了 <html> 的属性，所以 html 上要 suppressHydrationWarning。
  return <html lang="zh-CN" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} /></head><body className="flex min-h-screen flex-col"><SiteProvider>{children}</SiteProvider></body></html>;
}
