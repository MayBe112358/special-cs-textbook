/**
 * @module        全站交互与静态搜索入口
 * @problem       服务端布局不能直接把组件函数当作搜索配置传给客户端。
 * @design        在客户端边界内配置 Fumadocs，首次搜索时才加载替换弹窗。
 *                Fumadocs 界面上自带的那些英文（Search、On this page、Previous Page……）在这里换成中文。
 * @courses       Harvard CS50x Week 8（网页交互）；UC Berkeley CS61A（抽象边界：什么能跨过边界传递）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：页面组件与脚本
 * @prereq        懒加载表示需要某个功能时才下载它的代码。
 * @unclear       首次搜索仍需下载静态脚本，离线第一次访问不保证可用。
 *                404 页面的按钮文字还是“回到课程目录”，但它其实回的是首页 /，文字该改一下。
 * @letter
 * 这个文件就两件事：配好 Fumadocs 的全站环境，以及把它界面上那些英文换成中文。
 *
 * 先说第一件。搜索弹窗是我们自己写的（components/search/search-dialog.tsx），要把它交给 Fumadocs 替换掉默认的那个。
 * 可“交一个组件函数过去”这事，只能在浏览器这一侧做：服务端生成页面的时候，能跨过边界传给浏览器的只有 JSON 那样的普通数据，函数传不过去。
 * 所以这个文件开头写着 'use client'，把配置留在浏览器一侧。
 * 弹窗本身还用了 lazy：你第一次按 Ctrl+K 时才去下载它的代码，不搜索的人一个字节都不用多下。
 *
 * 再说那张中英对照表，它的键长得有点怪，比如 'On this page(table of contents)'，括号里写的是这句话用在哪儿。
 * 为什么不直接拿英文原文当钥匙？因为同一个英文词在不同地方可能得翻成不同的中文，比如 Search 在按钮上和在弹窗标题里。
 * 所以 Fumadocs 用“原文 + 用途”一起当钥匙，一个位置一个译法。
 * 翻译的时候也顺手改了几句的意思：404 页面那句，除了“这一页可能被移走了”，还提示你可以在终端里 ls 看看这一层有什么。
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
