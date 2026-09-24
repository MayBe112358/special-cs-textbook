/**
 * @module        全站交互与静态搜索入口
 * @problem       服务端布局不能直接把组件函数当作搜索配置传给客户端。
 * @design        在客户端边界内配置 Fumadocs，首次搜索时才加载替换弹窗。
 *                Fumadocs 界面上自带的那些英文（Search、On this page、Previous Page……）在这里换成中文。
 * @courses       CS50x Web；CS61A 抽象边界
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 页面组件
 * @prereq        懒加载表示需要某个功能时才下载它的代码。
 * @unclear       首次搜索仍需下载静态脚本，离线第一次访问不保证可用。
 * @letter
 * 我把搜索配置留在客户端一侧，因为里面有组件函数，不能当作普通 JSON 越过服务端边界。
 * 页面正文仍然由外层静态生成，这个包裹只负责主题与交互，并不把整篇教材改成运行时请求。
 * 下面那张中文对照表的键长得有点怪，比如 "On this page(table of contents)"——括号里是这句话用在哪儿。
 * 同一个英文词在不同位置可能要译成不同的中文，所以 Fumadocs 用“原文 + 用途”当钥匙，而不是只用原文。
 */
'use client';
import {lazy,type ReactNode} from 'react';
import {RootProvider} from 'fumadocs-ui/provider/next';
const SearchDialog=lazy(()=>import('./search/search-dialog'));

const translations:Record<string,string>={
  'Search(search trigger)':'搜索',
  'Search(search dialog)':'搜索',
  'Open Search(search trigger)(aria-label)':'打开搜索',
  'Close Search(search dialog)(aria-label)':'关闭搜索',
  'No results found(search dialog)':'没有找到结果',
  'On this page(table of contents)':'本页目录',
  'No Headings(table of contents)':'这一页没有小标题',
  'Table of Contents(inline table of contents)':'目录',
  'Previous Page(pagination)':'上一页',
  'Next Page(pagination)':'下一页',
  'Open Sidebar(sidebar)(aria-label)':'打开课程目录',
  'Close Sidebar(sidebar)(aria-label)':'关闭课程目录',
  'Close Sidebar(aria-label)':'关闭课程目录',
  'Collapse Sidebar(sidebar)(aria-label)':'收起侧边栏',
  'Show Sidebar(sidebar)':'显示侧边栏',
  'Hide Sidebar(sidebar)':'隐藏侧边栏',
  'Toggle Menu(mobile menu)(aria-label)':'菜单',
  'Toggle Theme(theme switcher)(aria-label)':'切换深浅色',
  'Light(theme switcher)(aria-label)':'浅色',
  'Dark(theme switcher)(aria-label)':'深色',
  'System(theme switcher)(aria-label)':'跟随系统',
  'Copy Text(code block)(aria-label)':'复制代码',
  'Copied Text(code block)(aria-label)':'已复制',
  'Copy Anchor Link(heading anchor)(aria-label)':'复制这一节的链接',
  'Page Not Found(404 page)':'找不到这一页',
  'Back to Home(404 page)':'回到课程目录',
  'The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)':'这一页可能被移走或改了名字。可以用搜索，或者在终端里 ls 看看这一层有什么。',
  'Last updated on(page footer)':'最后更新于',
};

export function SiteProvider({children}:{children:ReactNode}){return <RootProvider search={{SearchDialog,preload:false}} i18n={{locale:'zh-CN',translations}}>{children}</RootProvider>;}
