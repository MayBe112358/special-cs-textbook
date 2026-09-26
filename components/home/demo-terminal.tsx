/**
 * @module        首页的演示终端——同一个命令内核，对第一次来的人更友善的一副面孔
 * @problem       底部那个终端是给已经会用的人准备的：它什么都不提示，打错了只回一句 command not found。
 *                第一次打开网站的人不知道能敲什么，也不知道敲了会怎样，多半看一眼就走了。
 * @design        内核完全不变：还是 core/terminal 的 runCommand，输出也用和底部终端同一套画法（output-view）。
 *                不同的只是外面这层“待客之道”：
 *                - 打开页面时自己演示几条命令，像有人在旁边敲给你看；你一碰它（点一下、敲一个键），演示立刻停下，让给你；
 *                - 下面一排可以点的示例命令；
 *                - 输错命令时，报错照抄 Unix，但界面会在下面补一句“输入 help 看全部命令”。
 *                  这不是“你是不是想输入 xxx”式的纠正（那是 AGENTS.md 明令禁止的），只是告诉你去哪里查。
 *                它没有自己的“当前目录”：它永远站在根目录 /。cd 和 open 会真的把页面带过去，
 *                和底部终端一样——地址栏仍然是唯一真相。
 *                系统设置了“减少动态效果”的读者，演示不做打字动画，直接显示结果。
 * @courses       UC Berkeley CS61A（同一个解释器，不同的前端）；Stanford CS147 / UC Berkeley CS160（新手引导、渐进式披露）；
 *                MIT Missing Semester（shell 的基本命令）
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/ —— 在真的 shell 里把这几条命令敲一遍
 * @prereq        知道 setTimeout 能让一件事过一会儿再做；知道 React 的 useEffect 在组件出现后运行、在消失前清理。
 * @unclear       演示用的三条命令是写死在这里的；如果将来课程目录改名（比如 programming-intro 换了），这里要跟着改，
 *                测试不会提醒你。
 *
 * @letter
 * PROJECT.md 里有一句话：“同一个内核，两种默认友善度。”这个文件就是那句话的另一半。
 *
 * 你也许会问：既然要友善，为什么不干脆让它会纠错、会猜你想干什么？因为这个终端教的是真的命令行。
 * 真的 shell 不会猜你的意思，你在这里被惯出来的习惯，到了真终端上就是坑。
 * 所以“友善”只放在内核外面：演示给你看、给你可以点的例子、告诉你 help 在哪——但命令本身的脾气，一点没改。
 *
 * 演示动画里有个容易被忽略的细节：读者一碰终端，演示就要马上停。
 * 不然你刚想自己敲点什么，那边还在自顾自地打字，你的输入和它的输入搅在一起——这是最让人烦躁的那种界面。
 * 所以每一步动画之前都先看一眼“是不是被打断了”，被打断就收手，一个字都不再打。
 */
'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createVirtualFileSystem } from '@/core/filesystem/virtual-file-system';
import knowledgeIndexJson from '@/core/knowledge/generated/knowledge-index.json';
import type { KnowledgeIndex } from '@/core/knowledge/knowledge-index';
import { COMMANDS, runCommand } from '@/core/terminal/command-engine';
import { completeLine } from '@/core/terminal/completion';
import type { OutputBlock } from '@/core/terminal/output';
import { readProgressSnapshot, readUnderstandingSnapshot, writeProgress, writeUnderstanding } from '@/components/progress/progress-store';
import { OutputView } from '@/components/terminal/output-view';

const knowledgeIndex = knowledgeIndexJson as KnowledgeIndex;
const fileSystem = createVirtualFileSystem(knowledgeIndex);
const HOME = '/';

/** 自动演示的三步：看看有什么 → 读一门课的简介 → 反查一段代码对应哪些课。 */
const SCRIPT = ['ls', 'cat programming-intro/cs61a', 'refs command-engine'];
/** 下面那排可以点的例子，每个都配一句大白话。 */
const EXAMPLES: { line: string; hint: string }[] = [
  { line: 'ls', hint: '看看这里有什么' },
  { line: 'cat programming-intro/cs61a', hint: '读一门课的简介' },
  { line: 'refs cs61a', hint: '学完这门课能读哪些代码' },
  { line: 'search 编译', hint: '搜索课程和讲解' },
  { line: 'tree programming-intro', hint: '看一个分支的全部课程' },
  { line: 'help', hint: '全部命令' },
];

type Entry = { id: number; command: string; blocks: OutputBlock[]; hint?: string };

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export function DemoTerminal() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const nextId = useRef(1);
  const interrupted = useRef(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const execute = useCallback((line: string) => {
    if (line.trim() === '') return;
    const session = {
      currentPath: HOME,
      previousPath: null,
      fileSystem,
      knowledge: knowledgeIndex,
      progress: readProgressSnapshot().records,
      understanding: readUnderstandingSnapshot().records,
      history: [...history, line],
    };
    const result = runCommand(line, session);
    // 报错原样照抄；只在“这个命令不存在”时，额外告诉新来的人 help 在哪。
    const notFound = result.blocks.some((b) => b.type === 'text' && b.text.startsWith('command not found'));
    const entry: Entry = { id: nextId.current++, command: line, blocks: result.blocks, hint: notFound ? '输入 help 可以看到这里认识的全部命令。' : undefined };
    setEntries((old) => [...old, entry]);
    setHistory((old) => [...old, line]);
    setCursor(null);
    for (const action of result.actions) {
      if (action.type === 'clear-screen') setEntries([]);
      else if (action.type === 'navigate') router.push(action.href);
      // 首页的演示终端不接 AI：它面向第一次来的人，还没配置过模型。告诉他去哪里用。
      else if (action.type === 'agent') setEntries((old) => [...old, { id: nextId.current++, command: '', blocks: [{ type: 'text', text: 'AI 对话在工作区里用：进入课程目录后，在底部终端敲 agent，或点左边活动栏最下面的 AI 图标。', tone: 'muted' }] }]);
      else {
        try {
          if (action.type === 'set-progress') writeProgress(action.course, action.state);
          else writeUnderstanding(action.module, action.state);
        } catch {
          setEntries((old) => [...old, { id: nextId.current++, command: '', blocks: [{ type: 'text', text: '保存失败，本机数据未改动。', tone: 'error' }] }]);
        }
      }
    }
  }, [history, router]);

  // 自动演示：一个字一个字地敲，敲完停一下再回车。被读者打断就立刻收手。
  useEffect(() => {
    interrupted.current = false;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>((resolve) => { timers.push(window.setTimeout(resolve, ms)); });
    let cancelled = false;
    (async () => {
      if (reducedMotion) {
        // 也等一拍再跑：开发模式下 React 会把组件装上、拆掉、再装一次，同步执行会演示两遍。
        await wait(0);
        if (!cancelled) for (const line of SCRIPT) execute(line);
        return;
      }
      setTyping(true);
      await wait(500);
      for (const line of SCRIPT) {
        for (let i = 1; i <= line.length; i++) {
          if (cancelled || interrupted.current) return;
          setInput(line.slice(0, i));
          await wait(28 + Math.random() * 40);
        }
        await wait(300);
        if (cancelled || interrupted.current) return;
        setInput('');
        execute(line);
        await wait(1100);
      }
      if (!cancelled) setTyping(false);
    })();
    return () => { cancelled = true; timers.forEach(clearTimeout); };
    // 只在第一次出现时演示一遍；execute 变了（历史多了一条）不该让演示重来。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  /** 读者碰了终端：停下演示，把演示敲了一半的字清掉，输入行交给读者。 */
  const takeOver = useCallback(() => {
    if (interrupted.current) return;
    interrupted.current = true;
    setTyping(false);
    setInput('');
  }, []);

  useEffect(() => {
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [entries]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    takeOver();
    execute(input);
    setInput('');
  }

  function runExample(line: string) {
    takeOver();
    execute(line);
    inputRef.current?.focus({ preventScroll: true });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Tab') {
      event.preventDefault();
      const result = completeLine(input, event.currentTarget.selectionStart ?? input.length, { currentPath: HOME, previousPath: null, fileSystem, knowledge: knowledgeIndex, progress: [], understanding: [] }, COMMANDS.map((c) => c.name));
      if (result.value !== input) setInput(result.value);
      if (result.candidates.length > 1) setEntries((old) => [...old, { id: nextId.current++, command: input, blocks: [{ type: 'list', items: result.candidates.map((label) => ({ label })) }] }]);
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (history.length === 0) return;
    event.preventDefault();
    const next = event.key === 'ArrowUp'
      ? (cursor === null ? history.length - 1 : Math.max(0, cursor - 1))
      : (cursor === null ? null : cursor + 1 < history.length ? cursor + 1 : null);
    setCursor(next);
    setInput(next === null ? '' : history[next] ?? '');
  }

  return (
    <div className="cs-home-terminal flex min-w-0 flex-col gap-3">
      <div
        className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-fd-border bg-fd-card shadow-cs-window"
        onPointerDown={takeOver}
      >
        <div className="flex h-9 items-center gap-2 border-b border-fd-border px-3 text-fd-muted-foreground">
          <span className="flex h-full items-center border-b border-cs-button text-[11px] font-medium uppercase tracking-[0.06em] text-fd-foreground">终端</span>
          <span className="rounded-[3px] border border-fd-border px-1.5 text-[10px] leading-4">演示</span>
          <span className="ml-auto font-mono text-xs">和底部的终端是同一个内核</span>
        </div>
        <div
          ref={outputRef}
          role="log"
          aria-label="演示终端的输出"
          aria-live="polite"
          className="h-[19rem] space-y-2.5 overflow-y-auto px-4 pb-2 pt-3 font-mono text-[13px] leading-relaxed max-md:h-[16rem]"
          onClick={(event) => { if (!(event.target as HTMLElement).closest('button, a, summary') && !window.getSelection()?.toString()) inputRef.current?.focus({ preventScroll: true }); }}
        >
          {entries.length === 0 && !typing ? <p className="text-fd-muted-foreground">在下面输入命令，或者点一个例子试试。</p> : null}
          {entries.map((entry) => (
            <div key={entry.id} className="animate-cs-fade-in space-y-0.5">
              {entry.command ? (
                <div className="break-words">
                  <span className="text-cs-prompt">{HOME}</span>
                  <span className="text-fd-muted-foreground"> $ </span>
                  <span className="text-fd-foreground">{entry.command}</span>
                </div>
              ) : null}
              {entry.blocks.map((block, index) => <OutputView key={index} block={block} onCommand={runExample} />)}
              {entry.hint ? <div className="text-fd-muted-foreground">{entry.hint}</div> : null}
            </div>
          ))}
        </div>
        <form className="relative flex items-center gap-2 border-t border-fd-border px-4 py-2.5 font-mono text-[13px]" onSubmit={submit}>
          <label htmlFor="home-terminal-input" className="shrink-0">
            <span className="text-cs-prompt">{HOME}</span>
            <span className="text-fd-muted-foreground"> $</span>
          </label>
          <input
            ref={inputRef}
            id="home-terminal-input"
            value={input}
            onChange={(event) => { takeOver(); setInput(event.target.value); setCursor(null); }}
            onFocus={takeOver}
            onKeyDown={onKeyDown}
            placeholder="输入命令，回车运行（Tab 补全）"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className={`min-w-0 flex-1 bg-transparent text-fd-foreground outline-none placeholder:text-fd-muted-foreground/70 ${typing ? 'pointer-events-none absolute opacity-0' : ''}`}
          />
          {/* 演示打字时，输入框先藏起来，换成“字 + 闪烁的光标”；读者一碰，输入框就回来。 */}
          {typing ? <span aria-hidden="true" className="min-w-0 flex-1 truncate text-fd-foreground">{input}<span className="cs-caret" /></span> : null}
        </form>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 text-fd-muted-foreground">试试：</span>
        {EXAMPLES.map((example) => (
          <button
            key={example.line}
            type="button"
            title={example.hint}
            onClick={() => runExample(example.line)}
            className="rounded-[4px] border border-fd-border bg-fd-background px-2 py-1 font-mono text-fd-foreground transition-colors hover:border-cs-button hover:text-fd-primary"
          >
            {example.line}
          </button>
        ))}
      </div>
    </div>
  );
}
