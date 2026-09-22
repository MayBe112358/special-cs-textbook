/**
 * @module        浏览器里的静态搜索弹窗
 * @problem       文档框架的默认搜索需要服务端接口，而本站必须能直接部署到静态托管。
 * @design        替换默认弹窗，在本机查询公开索引；原生 dialog 负责焦点限制、Escape 关闭与背景隔离。
 * @courses       CS50x Web 交互；CS61B 查询；软件工程共享逻辑
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 可访问的网页交互
 * @prereq        弹窗打开时键盘焦点应留在里面，关闭后应回到触发按钮。
 * @unclear       子串搜索不理解同义词；结果过多时只展示前 30 条。
 * @letter
 * 我没有让搜索框请求一个并不存在的 API。它打开时才加载查询界面和公开索引，输入文字后就在本机算答案。
 * 浏览器原生弹窗帮我们守住焦点：你按 Tab 不会跑到背后的侧边栏，按 Escape 就能返回阅读。
 * 选择结果后先关闭弹窗，再走站内链接；搜索和终端始终共用同一份课程与源码资料。
 */
'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import index from '@/core/knowledge/generated/knowledge-index.json';
import {searchKnowledge} from '@/core/knowledge/search';
import type {KnowledgeIndex} from '@/core/knowledge/knowledge-index';
export default function StaticSearchDialog({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const [query,setQuery]=useState('');
 const hits=useMemo(()=>searchKnowledge(index as KnowledgeIndex,query),[query]);
 useEffect(()=>{const node=dialog.current;if(!node)return;if(open&&!node.open)node.showModal();if(!open&&node.open)node.close();},[open]);
 return <dialog onKeyDownCapture={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.current?.close();onOpenChange(false);}}} ref={dialog} aria-labelledby="static-search-title" onCancel={event=>{event.preventDefault();onOpenChange(false);}} className="fixed inset-0 m-auto max-h-[80dvh] w-[min(42rem,92vw)] overflow-auto rounded border border-fd-border bg-fd-background p-5 text-fd-foreground backdrop:bg-black/40">
   <div className="flex items-center justify-between"><h2 id="static-search-title" className="text-xl font-semibold">搜索课程与代码讲解</h2><button onClick={()=>onOpenChange(false)} aria-label="关闭搜索">关闭</button></div>
   <label className="my-4 block">关键词<input autoFocus type="search" className="mt-2 w-full rounded border p-2" value={query} onChange={e=>setQuery(e.target.value)} placeholder="例如 CS61A、解释器、状态"/></label>
   <p role="status">{query.trim()?hits.length?`找到 ${hits.length} 条结果（最多显示 30 条）`:'没有找到结果。':'输入中文概念或英文课程编号。'}</p>
   <ul className="space-y-4 py-4">{hits.map(hit=><li key={hit.path}><Link className="font-semibold underline" href={hit.url} onClick={()=>onOpenChange(false)}>{hit.title}</Link><p className="text-sm text-fd-muted-foreground">{hit.kind==='course'?'课程':'代码讲解'} · {hit.path}</p><p className="mt-1 text-sm">{hit.excerpt}</p></li>)}</ul>
 </dialog>;
}
