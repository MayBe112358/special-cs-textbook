/**
 * @module        浏览器里的静态搜索弹窗——长得和用起来都像 VS Code 的“快速打开”（Ctrl+K）
 * @problem       文档框架的默认搜索需要服务端接口，而本站必须能直接部署到静态托管。
 *                找到之后还得打开得快：想去一门课，最顺手的是敲几个字、按回车，手不离开键盘。
 * @design        替换默认弹窗，在本机查询公开索引；原生 dialog 负责焦点限制、Escape 关闭与背景隔离。
 *                弹窗贴在页面上方而不是正中间，输入框在最上面，结果紧跟在下面——眼睛不用来回跳。
 *                ↑↓ 移动选中项，回车打开，鼠标移上去也会改变选中项，两种操作方式说的是同一件事。
 *                搜到的字会被高亮，一眼看出“为什么是它”。输入框还空着时，给几个可以直接点的例子。
 * @courses       CS50x Web 交互；CS61B 查询；软件工程共享逻辑；Stanford CS147（键盘优先的交互、反馈）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 可访问的网页交互
 * @prereq        弹窗打开时键盘焦点应留在里面，关闭后应回到触发按钮。
 * @unclear       子串搜索不理解同义词；结果过多时只展示前 30 条。分类目录本身搜不到，只搜课程和代码讲解。
 * @letter
 * 我没有让搜索框请求一个并不存在的 API。它打开时才加载查询界面和公开索引，输入文字后就在本机算答案。
 * 浏览器原生弹窗帮我们守住焦点：你按 Tab 不会跑到背后的侧边栏，按 Escape 就能返回阅读。
 * 选择结果后先关闭弹窗，再走站内链接；搜索和终端始终共用同一份课程与源码资料。
 *
 * 为什么选中项要同时响应键盘和鼠标？想象你用 ↓ 走到第三项，这时手碰了一下鼠标，
 * 高亮跳到了鼠标下的第五项——如果回车打开的还是第三项，你会觉得这个框“不听话”。
 * 所以这里只有一个“选中项”，键盘和鼠标都在改它，回车永远打开你眼睛看到的那一项。
 * 这和终端里“当前目录只从地址栏来”是同一个原则：同一件事只存一份。
 */
'use client';
import {useEffect,useMemo,useRef,useState,type KeyboardEvent,type ReactNode} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import index from '@/core/knowledge/generated/knowledge-index.json';
import {searchKnowledge} from '@/core/knowledge/search';
import type {KnowledgeIndex} from '@/core/knowledge/knowledge-index';

/** 输入框还空着时给的例子：一个课程编号、一个中文概念、一个源码模块。 */
const EXAMPLES = ['cs61a', '编译', '操作系统', '命令引擎'];

/** 把文字里第一个命中的词包成高亮。只高亮第一个，免得一行字花成一片。 */
function highlight(text: string, query: string): ReactNode {
  const terms = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  // 原文只转小写、不做 NFKC：NFKC 会把“…”拆成三个点，算出来的位置就和原文对不上了。
  const lower = text.toLocaleLowerCase();
  for (const term of terms) {
    const at = lower.indexOf(term);
    if (at >= 0) return <>{text.slice(0, at)}<mark className="bg-transparent font-semibold text-fd-primary">{text.slice(at, at + term.length)}</mark>{text.slice(at + term.length)}</>;
  }
  return text;
}

export default function StaticSearchDialog({open,onOpenChange}:{open:boolean;onOpenChange:(open:boolean)=>void}){
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const hits = useMemo(() => searchKnowledge(index as KnowledgeIndex, query), [query]);

  useEffect(() => {
    const node = dialog.current; if (!node) return;
    if (open && !node.open) {
      node.showModal();
      // 再次打开时保留上次的关键词并全选：想接着搜就直接改，想换一个就直接打字覆盖。
      input.current?.select();
    }
    if (!open && node.open) node.close();
  }, [open]);

  // 选中项跟着键盘移动时，保证它滚进视野。
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({block: 'nearest'});
  }, [selected]);

  function close() { onOpenChange(false); }
  function go(url: string) { close(); router.push(url); }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (hits.length === 0) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((i) => (i + 1) % hits.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((i) => (i - 1 + hits.length) % hits.length); }
    else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      // 输入法还在选字时的回车是“上屏”，不是“打开”。
      event.preventDefault(); const hit = hits[selected]; if (hit) go(hit.url);
    }
  }

  return <dialog
    ref={dialog}
    aria-label="搜索课程与代码讲解"
    onKeyDownCapture={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dialog.current?.close(); close(); } }}
    onCancel={event => { event.preventDefault(); close(); }}
    // 点弹窗外面的阴影就关闭：点击落在 dialog 元素本身（而不是里面的内容）时，就是点在了背景上。
    onClick={event => { if (event.target === event.currentTarget) close(); }}
    className="fixed inset-x-0 top-0 mx-auto mt-[10vh] max-h-[min(34rem,80dvh)] w-[min(40rem,calc(100vw-1rem))] overflow-hidden rounded-md border border-fd-border bg-fd-popover p-0 text-fd-popover-foreground shadow-cs-pop open:flex open:animate-cs-pop-in open:flex-col backdrop:bg-cs-scrim open:backdrop:animate-cs-fade-in max-md:mt-2"
  >
    <div className="flex items-center gap-2 border-b border-fd-border px-3">
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0 text-fd-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14" strokeLinecap="round"/></svg>
      <input
        ref={input}
        autoFocus
        type="search"
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls="search-results"
        aria-activedescendant={hits.length ? `search-hit-${selected}` : undefined}
        aria-label="搜索关键词"
        className="min-w-0 flex-1 bg-transparent py-3 text-[0.9375rem] outline-none placeholder:text-fd-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        value={query}
        onChange={e => { setQuery(e.target.value); setSelected(0); }}
        onKeyDown={onKeyDown}
        placeholder="搜索课程和代码讲解，例如 CS61A、解释器"
      />
      <button type="button" onClick={close} className="rounded-[3px] border border-fd-border px-1.5 font-mono text-[11px] leading-5 text-fd-muted-foreground hover:bg-cs-hover" aria-label="关闭搜索">Esc</button>
    </div>

    <p role="status" className="sr-only">{query.trim() ? (hits.length ? `找到 ${hits.length} 条结果` : '没有找到结果') : ''}</p>

    {query.trim() === '' ? (
      <div className="space-y-2 px-3 py-3 text-sm text-fd-muted-foreground">
        <p>输入中文概念或英文课程编号，课程简介和源码注释都会被搜到。</p>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map(example => (
            <button key={example} type="button" className="cs-chip hover:border-fd-primary hover:text-fd-primary" onClick={() => { setQuery(example); setSelected(0); input.current?.focus(); }}>{example}</button>
          ))}
        </div>
      </div>
    ) : hits.length === 0 ? (
      <p className="px-3 py-4 text-sm text-fd-muted-foreground">没有匹配「{query.trim()}」的课程或代码讲解。换个说法，或者试试英文课程编号。</p>
    ) : (
      <ul id="search-results" ref={list} role="listbox" aria-label="搜索结果" className="min-h-0 flex-1 overflow-y-auto py-1">
        {hits.map((hit, i) => (
          <li key={hit.path} id={`search-hit-${i}`} role="option" aria-selected={i === selected} data-index={i}>
            <Link
              href={hit.url}
              onClick={close}
              onMouseMove={() => { if (i !== selected) setSelected(i); }}
              tabIndex={-1}
              className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-3 py-2 ${i === selected ? 'bg-cs-active' : ''}`}
            >
              <span className="truncate font-medium text-fd-foreground">{highlight(hit.title, query)}</span>
              <span className="text-xs text-fd-muted-foreground">{hit.kind === 'course' ? '课程' : '代码讲解'}</span>
              <span className="col-span-2 truncate font-mono text-xs text-fd-muted-foreground">{hit.path}</span>
              <span className="col-span-2 line-clamp-1 text-xs text-fd-muted-foreground">{highlight(hit.excerpt, query)}</span>
            </Link>
          </li>
        ))}
      </ul>
    )}

    <div className="hidden items-center gap-4 border-t border-fd-border px-3 py-1.5 text-[11px] text-fd-muted-foreground md:flex">
      <span><kbd className="font-mono">↑↓</kbd> 选择</span>
      <span><kbd className="font-mono">Enter</kbd> 打开</span>
      <span><kbd className="font-mono">Esc</kbd> 关闭</span>
      {hits.length ? <span className="ml-auto">{hits.length} 条结果{hits.length >= 30 ? '（最多显示 30 条）' : ''}</span> : null}
    </div>
  </dialog>;
}
