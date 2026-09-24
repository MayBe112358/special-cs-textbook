/**
 * @module        文档页底部的终端底座——终端本体，外加它在页面上占住的那条位置
 * @problem       纯命令引擎已经能回答 help，却还没有让人打字、查看回显、翻历史或执行导航动作的网页边界。
 *                还有一个只有真用起来才会发现的问题：终端如果只是“浮”在页面底部，它会盖住正文的最后几行，
 *                也会盖住侧边栏最下面几项——而侧边栏恰恰是 cd 之后要去确认高亮的地方。
 *                一个会挡住验收对象的界面，等于没做完。
 * @design        用普通 React 表单和结构化输出组件实现，不使用 xterm.js。执行命令时把文件系统和知识索引
 *                一起递给引擎——它们都是构建时生成、之后只读的东西，终端只负责转交，不保存也不修改。
 *                命令历史、输出、OLDPWD 都是会话状态，
 *                留在这个常驻布局组件的内存里；当前目录则每次从 usePathname 推导，绝不复制进 state。
 *                router.push 是唯一真正执行副作用的位置，命令只交回动作描述。
 *                布局上，这个组件同时充当“底座”：它把文档区当 children 包进来，用一个 CSS 变量宣布
 *                “我占了底下这么高”，文档区据此缩短。终端本身仍然 fixed 贴在视口底部（不然长文一滚它就没了），
 *                但因为下方那段高度已经被预留出来，谁也不会被盖住。
 *                阶段 14 起它长得像 VS Code 底部的面板：一条标签栏（“终端”、当前位置、清空、收起），
 *                下面是输出和输入行。宽屏时它只占侧边栏右边那一块；上边缘能拖动调高度（记在浏览器里），
 *                拖到很矮就收起。展开收起有动画，手机上默认收起，Ctrl+` 在任何地方都能叫出它。
 * @courses       CS50x Week 8（表单、事件、DOM、CSS 盒模型与定位）；UC Berkeley CS61A（REPL 与函数式核心/命令式外壳）；
 *                Stanford CS143、UCB CS164（结构化结果的解释）；软件工程类课程（状态边界）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 *                https://cs61a.org/ ; https://web.stanford.edu/class/cs143/
 * @prereq        知道表单回车会提交；React state 能让界面记住本次打开期间的数据；
 *                知道 CSS 里 fixed 的元素“脱离文档流”，也就是别人排版时当它不存在。
 * @unclear       手机上展开后弹出的软键盘会再挤掉一块屏幕，目前靠“展开时最多占半屏”来缓解，
 *                没有针对不同手机逐一验证。手机上不能拖动调高度，只能展开或收起。
 *
 * @letter
 * 这里是纯逻辑第一次碰到真实网页的边界。上半部分的命令引擎只会算：输入一句话，得到若干输出块和动作。
 * 到这个组件，动作才真的发生——navigate 交给 Next 路由器，列表项才变成按钮，文字块才拥有颜色。
 * 把边界放在一个地方的好处是，你要追查“谁改了页面”时只看 executeLine，不必翻每条命令。
 *
 * 三种看似相近的状态在这里被刻意分开。历史和输出刷新就丢，是会话状态；OLDPWD 也只是历史事实；
 * 当前目录没有 useState，它来自地址栏。折叠终端只是把面板压扁，不卸掉这个组件，所以历史仍在；
 * 但整页刷新会清空它们，这正符合 ROADMAP 对会话状态的定义。
 *
 * ↑↓ 的实现还保留了你开始翻历史前正在输入的草稿：按 ↑ 找旧命令，再一路按 ↓ 回到末尾，草稿会回来。
 * 这类细节不是为了炫技，而是为了不教出一种和真终端相反的肌肉记忆。
 *
 * 最后说说这个组件为什么要把整个文档区当 children 抱在怀里，因为这是它的第二个身份。
 *
 * 终端是 fixed 的：它钉在视口底部，你滚正文它不动。这是对的——一个滚一滚就没影的终端不叫终端。
 * 但 fixed 有个代价：这种元素“脱离文档流”，排版时其他人当它不存在，于是正文会理直气壮地铺到它底下去，
 * 最后几行你永远看不见。侧边栏也一样，最下面几项被压在终端后面——而 cd 之后要看的那个高亮偏偏可能就在那儿。
 * 一个会挡住你验收对象的界面，就是没做完。
 *
 * 解决办法不是把终端改成不 fixed，而是让别人知道底下这块被占了：这个组件在最外层挂一个 CSS 变量
 * --fd-terminal-height，写明自己有多高；下面那层给文档区留出同样高的空白；同时文档布局把它自己的
 * “可用高度”减掉这个数（那件事在 app/docs/layout.tsx 里做，Fumadocs 正好留了 --fd-docs-height 这个旋钮）。
 * 于是侧边栏和页内目录的 sticky 高度、正文的滚动尽头，全都自动停在终端上沿。
 *
 * 值得留意的是这里没有测量 DOM、没有 ResizeObserver、也没有谁通知谁。高度是我们自己说了算的几个值，
 * 写在 app/globals.css 的 .cs-dock 那几条规则里；这个组件只在最外层标一句 data-terminal="open" 或 "closed"，
 * 其余部分靠 CSS 变量往下继承。那个变量被登记成了“长度”，所以它变化时浏览器能补出中间帧——
 * 终端、正文、侧边栏在同一个动画里一起伸缩。
 *
 * 手机上为什么默认收起？因为手机屏幕只有电脑的三分之一高，一个默认展开的终端会先吃掉半屏正文，
 * 而第一次打开网站的人最想看的是正文。所以这里有第三种状态 "auto"：你还没碰过终端时，
 * 宽屏展开、窄屏收起，由 CSS 按屏幕宽度决定；你一旦亲手展开或收起，就听你的。
 * 这个判断交给 CSS 媒体查询而不是 JavaScript，是因为页面在服务器上生成时还不知道屏幕多宽——
 * 如果等 JavaScript 跑起来再收，手机上会先闪一下展开的终端。
 * 这和“地址栏是唯一真相”是同一种思路：能靠一份数据往下推的，就不要让两个组件互相汇报——
 * 互相汇报的两份数据，迟早会有一份是错的，而且你不会知道是哪一份。
 */
"use client";

import { createVirtualFileSystem } from "@/core/filesystem/virtual-file-system";
import knowledgeIndexJson from "@/core/knowledge/generated/knowledge-index.json";
import type { KnowledgeIndex } from "@/core/knowledge/knowledge-index";
import { completeLine } from "@/core/terminal/completion";
import { COMMANDS, runCommand } from "@/core/terminal/command-engine";
import { pathnameToWorkingDirectory } from "@/core/terminal/location";
import type { CourseProgress, ModuleUnderstanding } from "@/core/progress/progress";
import { readProgressSnapshot, readUnderstandingSnapshot, subscribeProgress, writeProgress, writeUnderstanding } from "@/components/progress/progress-store";
import type { OutputBlock, TreeItem } from "@/core/terminal/output";
import { usePathname, useRouter } from "next/navigation";
import { TERMINAL_DEFAULT, TERMINAL_MIN, TERMINAL_SNAP, applyLayout, readLayout, updateLayout } from "@/components/layout-prefs";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

const knowledgeIndex = knowledgeIndexJson as KnowledgeIndex;
const fileSystem = createVirtualFileSystem(knowledgeIndex);

/** 和 app/globals.css 里 .cs-dock 的断点一致：这个宽度以上算“宽屏”，终端默认展开。 */
const WIDE_SCREEN = "(min-width: 768px)";

type HistoryEntry = {
  id: number;
  prompt: string;
  command: string;
  blocks: OutputBlock[];
};

/**
 * 终端的三种状态。"auto" 表示读者还没动过它：宽屏展开、窄屏收起，交给 CSS 决定（原因见顶上的信）。
 */
type DockMode = "auto" | "open" | "closed";

/** 订阅一条媒体查询。服务器上没有屏幕，先按宽屏算，和 CSS 在没有 JavaScript 时的表现一致。 */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

function CommandLink({ command, onCommand, className, children }: {
  command: string;
  onCommand: (line: string) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={command}
      className={`rounded-[2px] text-left underline-offset-2 hover:underline ${className ?? "text-fd-primary"}`}
      onClick={() => onCommand(command)}
    >
      {children}
    </button>
  );
}

function TreeView({ node, onCommand }: { node: TreeItem; onCommand: (line: string) => void }) {
  const link = <CommandLink command={node.command} onCommand={onCommand}>{node.label}</CommandLink>;
  if (!node.children) return link;
  return (
    <details open className="group">
      <summary className="cursor-pointer list-none marker:hidden">
        <span aria-hidden="true" className="mr-1 inline-block text-fd-muted-foreground transition-transform group-open:rotate-90">›</span>
        {link}
      </summary>
      <ul className="ml-[0.3rem] border-l border-fd-border pl-3">
        {node.children.map((child) => <li key={child.command}><TreeView node={child} onCommand={onCommand} /></li>)}
      </ul>
    </details>
  );
}

function OutputView({ block, onCommand }: { block: OutputBlock; onCommand: (line: string) => void }) {
  if (block.type === "tree") return <TreeView node={block.root} onCommand={onCommand} />;
  if (block.type === "text") {
    const toneClass = block.tone === "error"
      ? "text-cs-error"
      : block.tone === "muted"
        ? "text-fd-muted-foreground"
        : "text-fd-foreground";
    return <div className={`whitespace-pre-wrap break-words ${toneClass}`}>{block.text}</div>;
  }

  // ls 的输出（每一项都知道自己是目录还是文件）照真终端的样子排成多列、只写名字；
  // 中文标题放进悬停提示，想看全称就 cat 它。其他命令的列表仍是一行一项、后面跟说明。
  if (block.items.length > 0 && block.items.every((item) => item.kind !== undefined)) {
    return (
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-x-4">
        {block.items.map((item) => (
          <li key={item.label} className="min-w-0 truncate">
            {item.command ? (
              <CommandLink
                command={item.command}
                onCommand={onCommand}
                className={item.kind === "directory" ? "font-medium text-cs-dir" : "text-fd-primary"}
              >
                <span title={item.description}>{item.label}{item.kind === "directory" ? "/" : ""}</span>
              </CommandLink>
            ) : (
              <span title={item.description}>{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="space-y-0.5">
      {block.items.map((item) => (
        <li key={`${item.label}:${item.description ?? ""}`} className="flex min-w-0 flex-wrap gap-x-3">
          {item.command ? (
            // 目录用青色、文件用蓝色，和编辑器资源管理器里一样：一眼分得清哪些还能往里走。
            <CommandLink
              command={item.command}
              onCommand={onCommand}
              className={item.kind === "directory" ? "font-medium text-cs-dir" : "text-fd-primary"}
            >
              {item.label}{item.kind === "directory" ? "/" : ""}
            </CommandLink>
          ) : (
            <span>{item.label}</span>
          )}
          {item.description ? <span className="min-w-0 text-fd-muted-foreground">{item.description}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TerminalDock({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentPath = pathnameToWorkingDirectory(pathname, fileSystem);
  const wide = useMediaQuery(WIDE_SCREEN);
  const finePointer = useMediaQuery("(pointer: fine)");
  const [mode, setMode] = useState<DockMode>("auto");
  const expanded = mode === "auto" ? wide : mode === "open";
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [previousPath, setPreviousPath] = useState<string | null>(null);
  // 读者本机的两条进度线。引擎不许自己读浏览器存储，所以在这里读好再递进去。
  const [progress, setProgress] = useState<readonly CourseProgress[]>([]);
  const [understanding, setUnderstanding] = useState<readonly ModuleUnderstanding[]>([]);
  const draftBeforeHistory = useRef("");
  const nextEntryId = useRef(1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const completionCursor = useRef<number | null>(null);
  // 在输入值提交的同一帧恢复光标；延后一帧会干扰紧接着发生的选择和输入。
  useLayoutEffect(() => {
    if(completionCursor.current !== null){inputRef.current?.setSelectionRange(completionCursor.current,completionCursor.current);completionCursor.current=null;}
  },[input]);

  // 页面挂载后才有浏览器；之后订阅变化，页面上点按钮这里也会跟着更新。
  useEffect(() => {
    const load = () => {
      setProgress(readProgressSnapshot().records);
      setUnderstanding(readUnderstandingSnapshot().records);
    };
    load();
    return subscribeProgress(load);
  }, []);

  const executeLine = useCallback((line: string) => {
    if (line.trim() === "") return;

    const result = runCommand(line, { currentPath, previousPath, fileSystem, knowledge: knowledgeIndex, progress, understanding, history:[...commandHistory,line] });
    const entryId = nextEntryId.current++;
    setEntries((oldEntries) => [...oldEntries, {
      id: entryId,
      prompt: currentPath,
      command: line,
      blocks: result.blocks,
    }]);
    setCommandHistory((oldHistory) => [...oldHistory, line]);
    setHistoryCursor(null);
    draftBeforeHistory.current = "";

    // 命令只递申请单，真正动手在这里：跳转交给路由器，改状态交给浏览器存储。
    for (const action of result.actions) {
      if (action.type === "clear-screen") {
        setEntries([]);
      } else if (action.type === "navigate") {
        if (action.reason === "change-directory") setPreviousPath(currentPath);
        router.push(action.href);
      } else if (action.type === "set-progress" || action.type === "set-understanding") {
        try {
          if (action.type === "set-progress") writeProgress(action.course, action.state);
          else writeUnderstanding(action.module, action.state);
          setProgress(readProgressSnapshot().records);
          setUnderstanding(readUnderstandingSnapshot().records);
        } catch {
          setEntries((oldEntries) => [...oldEntries, {
            id: nextEntryId.current++,
            prompt: currentPath,
            command: "",
            blocks: [{ type: "text", text: "保存失败，本机数据未改动。浏览器可能禁止存储或空间不足。", tone: "error" }],
          }]);
        }
      }
    }
  }, [currentPath, previousPath, progress, understanding, commandHistory, router]);

  useEffect(() => {
    if (!expanded) return;
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [entries, expanded]);

  /**
   * 展开或收起。展开之后要不要把光标放进输入行？用键盘的人要，用手指的人不要——
   * 手机上一聚焦就会弹出软键盘，把刚展开的终端又挡住一半。所以只在“精确指针”（鼠标、触控板）时聚焦。
   */
  const setExpanded = useCallback((next: boolean, focus = finePointer) => {
    setMode(next ? "open" : "closed");
    if (next && focus) requestAnimationFrame(() => inputRef.current?.focus());
  }, [finePointer]);

  /**
   * 拖终端的上边缘改高度，和 VS Code 的面板一样：
   * 往上拖变高（最多占窗口四分之三），往下拖到很矮就收起；收起时从标签栏往上拖，又能拉出来。
   * 拖动中只改 CSS 变量，松手才保存；双击恢复默认高度。
   */
  const drag = useRef<{ height: number; open: boolean } | null>(null);
  function beginResize(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !wide) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { height: readLayout().terminalHeight, open: expanded };
    document.documentElement.dataset.resizing = "row";
  }
  function resize(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;
    const height = window.innerHeight - event.clientY;
    const open = height >= TERMINAL_SNAP;
    if (open) {
      current.height = Math.min(Math.max(height, TERMINAL_MIN), Math.round(window.innerHeight * 0.75));
      applyLayout({ ...readLayout(), terminalHeight: current.height });
    }
    if (open !== current.open) { current.open = open; setMode(open ? "open" : "closed"); }
  }
  function endResize(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    delete document.documentElement.dataset.resizing;
    updateLayout({ terminalHeight: current.height });
  }

  // Ctrl+`：和 VS Code 一样。终端开着但光标不在里面时，先把光标放进去；已经在里面，再按一次才收起。
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (!event.ctrlKey || event.key !== "`") return;
      event.preventDefault();
      if (!expanded) setExpanded(true, true);
      else if (document.activeElement !== inputRef.current) inputRef.current?.focus();
      else { setExpanded(false); inputRef.current?.blur(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded, setExpanded]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    executeLine(input);
    setInput("");
    inputRef.current?.focus();
  }

  /** 点输出区的空白处，光标回到输入行——但正在选中文字复制时不抢。 */
  function focusFromOutput(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget && (event.target as HTMLElement).closest("button, a, summary")) return;
    if (window.getSelection()?.toString()) return;
    inputRef.current?.focus({ preventScroll: true });
  }

  function moveThroughHistory(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "l" && event.ctrlKey) {
      // Ctrl+L 清屏，和真终端一样；已经敲了一半的命令留着。
      event.preventDefault();
      setEntries([]);
      return;
    }
    if(event.key==='Tab'){
      event.preventDefault();const result=completeLine(input,event.currentTarget.selectionStart??input.length,{currentPath,previousPath,fileSystem,knowledge:knowledgeIndex,progress,understanding},COMMANDS.map(c=>c.name));
      if(result.value!==input){completionCursor.current=result.cursor;setInput(result.value);}
      if(result.candidates.length>1)setEntries(old=>[...old,{id:nextEntryId.current++,prompt:currentPath,command:input,blocks:[{type:'list',items:result.candidates.map(label=>({label}))}]}]);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (commandHistory.length === 0) return;
    event.preventDefault();

    if (event.key === "ArrowUp") {
      if (historyCursor === null) draftBeforeHistory.current = input;
      const nextCursor = historyCursor === null
        ? commandHistory.length - 1
        : Math.max(0, historyCursor - 1);
      setHistoryCursor(nextCursor);
      setInput(commandHistory[nextCursor] ?? "");
      return;
    }

    if (historyCursor === null) return;
    if (historyCursor < commandHistory.length - 1) {
      const nextCursor = historyCursor + 1;
      setHistoryCursor(nextCursor);
      setInput(commandHistory[nextCursor] ?? "");
    } else {
      setHistoryCursor(null);
      setInput(draftBeforeHistory.current);
    }
  }

  return (
    // data-terminal 是这里唯一对外宣布的东西；--fd-terminal-height 由 globals.css 按它算出来，往下继承。
    <div className="cs-dock flex flex-1 flex-col" data-terminal={mode}>
      {/* 文档区照常排版，只是尾部留出终端那么高的一段空白，滚到底也不会被压在终端下面。 */}
      <div className="flex-1" style={{ paddingBottom: "var(--fd-terminal-height)" }}>
        {children}
      </div>

      {/* 宽屏时终端从侧边栏右边开始，只占正文下方那一块，侧边栏一直通到底——和 VS Code 的面板一样。 */}
      <section
        className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-[minmax(0,1fr)] grid-rows-[2.25rem_minmax(0,1fr)] overflow-hidden border-t border-fd-border bg-fd-card pb-[env(safe-area-inset-bottom)] md:left-(--cs-sidebar-width) md:border-l"
        style={{ height: "calc(var(--fd-terminal-height) + env(safe-area-inset-bottom))" }}
        aria-label="课程终端"
      >
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="拖动调整终端高度，双击恢复默认"
          title="拖动调整高度 · 双击恢复默认"
          className="cs-sash cs-sash-row max-md:hidden"
          onPointerDown={beginResize}
          onPointerMove={resize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onDoubleClick={() => { updateLayout({ terminalHeight: TERMINAL_DEFAULT }); setMode("open"); }}
        />
        <div className="flex min-w-0 items-center gap-1 pl-2 pr-1.5 text-fd-muted-foreground">
          <button
            type="button"
            className="flex h-full items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-[0.06em] text-fd-foreground"
            aria-expanded={expanded}
            aria-controls="course-terminal-panel"
            onClick={() => setExpanded(!expanded)}
          >
            <span className={`border-b py-[7px] transition-colors ${expanded ? "border-cs-button" : "border-transparent"}`}>终端</span>
          </button>
          <span className="ml-auto min-w-0 truncate px-2 font-mono text-xs" title="当前位置">{currentPath}</span>
          <kbd className="hidden rounded-[3px] border border-fd-border px-1 font-mono text-[10px] leading-4 md:inline-block">Ctrl `</kbd>
          <button
            type="button"
            className={`grid size-7 place-items-center rounded-[4px] hover:bg-cs-hover hover:text-fd-foreground ${expanded ? "" : "invisible"}`}
            aria-label="清空终端"
            title="清空（Ctrl+L）"
            tabIndex={expanded ? 0 : -1}
            onClick={() => { setEntries([]); if (finePointer) inputRef.current?.focus(); }}
          >
            <ClearIcon className="size-4" />
          </button>
          <button
            type="button"
            className="grid size-7 place-items-center rounded-[4px] hover:bg-cs-hover hover:text-fd-foreground"
            aria-label={expanded ? "收起终端" : "展开终端"}
            title={expanded ? "收起（Ctrl+`）" : "展开（Ctrl+`）"}
            aria-expanded={expanded}
            aria-controls="course-terminal-panel"
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronIcon className={`size-4 transition-transform duration-200 ${expanded ? "" : "rotate-180"}`} />
          </button>
        </div>

        {/* 收起时面板不卸载（历史还在），只是被压扁；inert 让键盘和读屏软件也跳过它。 */}
        <div id="course-terminal-panel" inert={!expanded} className="flex min-h-0 flex-col font-mono text-[13px] leading-relaxed">
          <div
            ref={outputRef}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pt-1 pb-2"
            aria-live="polite"
            onClick={focusFromOutput}
          >
            {entries.length === 0 ? (
              <p className="text-fd-muted-foreground">输入 help 查看全部命令。Tab 补全，↑↓ 翻历史。</p>
            ) : null}
            {entries.map((entry) => (
              <div key={entry.id} className="space-y-0.5">
                <div className="break-words">
                  <span className="text-cs-prompt">{entry.prompt}</span>
                  <span className="text-fd-muted-foreground"> $ </span>
                  <span className="text-fd-foreground">{entry.command}</span>
                </div>
                {entry.blocks.map((block, index) => (
                  <OutputView key={index} block={block} onCommand={executeLine} />
                ))}
              </div>
            ))}
          </div>

          <form className="flex items-center gap-2 border-t border-fd-border px-4 py-2" onSubmit={submit}>
            <label htmlFor="course-terminal-input" className="max-w-[45%] shrink-0 truncate">
              <span className="text-cs-prompt">{currentPath}</span>
              <span className="text-fd-muted-foreground"> $</span>
            </label>
            <input
              ref={inputRef}
              id="course-terminal-input"
              className="min-w-0 flex-1 bg-transparent text-fd-foreground caret-fd-foreground outline-none placeholder:text-fd-muted-foreground/60"
              value={input}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              aria-label="输入终端命令"
              onChange={(event) => {
                setInput(event.target.value);
                setHistoryCursor(null);
              }}
              onKeyDown={moveThroughHistory}
            />
          </form>
        </div>
      </section>
    </div>
  );
}
