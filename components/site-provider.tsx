/**
 * @module        全站交互与静态搜索入口
 * @problem       服务端布局不能直接把组件函数当作搜索配置传给客户端。
 * @design        在客户端边界内配置 Fumadocs，首次搜索时才加载替换弹窗。
 * @courses       CS50x Web；CS61A 抽象边界
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 页面组件
 * @prereq        懒加载表示需要某个功能时才下载它的代码。
 * @unclear       首次搜索仍需下载静态脚本，离线第一次访问不保证可用。
 * @letter
 * 我把搜索配置留在客户端一侧，因为里面有组件函数，不能当作普通 JSON 越过服务端边界。
 * 页面正文仍然由外层静态生成，这个包裹只负责主题与交互，并不把整篇教材改成运行时请求。
 */
'use client';
import {lazy,type ReactNode} from 'react';
import {RootProvider} from 'fumadocs-ui/provider/next';
const SearchDialog=lazy(()=>import('./search/search-dialog'));
export function SiteProvider({children}:{children:ReactNode}){return <RootProvider search={{SearchDialog,preload:false}}>{children}</RootProvider>;}
