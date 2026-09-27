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
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：表单、事件和 CSS 定位
 *                https://cs61a.org/ —— CS61A 里 REPL 和“核心只算、外壳动手”的写法
 * @prereq        知道表单回车会提交；React state 能让界面记住本次打开期间的数据；
 *                知道 CSS 里 fixed 的元素“脱离文档流”，也就是别人排版时当它不存在。
 * @unclear       手机上展开后弹出的软键盘会再挤掉一块屏幕，目前靠“展开时最多占半屏”来缓解，
 *                没有针对不同手机逐一验证。手机上不能拖动调高度，只能展开或收起。
 *
 * @letter
 * 前面那些终端章节里的代码都只会“算”：塞进去一行字，吐出几个输出块和几条动作。到了这个文件，东西才真的动起来：
 * navigate 交给 Next 的路由器去跳页面，列表项变成能点的按钮，报错的字变成红色。
 * “真动手”的地方全在这一个文件里，而且主要就在 executeLine 这一个函数里。哪天你想查“到底是谁把页面跳走了”，看这儿就够了，不用去翻每一条命令。
 *
 * 这里有三种看着差不多的状态，被故意分开放。
 * 命令历史和屏幕上的输出，是这一次打开页面的会话状态，刷新就没了。
 * OLDPWD（cd - 要用的“上一次在哪”）也只是一条历史记录。
 * 当前目录呢？这个文件里根本没有一个 state 存它，每次都从地址栏现算。
 * 你把终端收起来，只是把面板压扁了，组件还活着，所以历史还在；整页一刷新，它们才一起清空。
 *
 * 有个小细节你用的时候可能都没察觉：按 ↑ 翻历史的时候，你正在敲、还没敲完的那句草稿会被悄悄记下来。
 * 翻了一圈再一路按 ↓ 回到最底下，草稿原样回来。真终端就是这样的，这里要是做反了，就会教出一种到了真终端里不对劲的手感。
 *
 * 这个组件还有第二个身份：它是个“底座”，把整个内容区包在自己怀里。为啥要这样？
 *
 * 终端是 fixed 的，钉在屏幕底部，你怎么滚正文它都不动。这是对的，一个滚一下就不见了的终端没法用。
 * 可 fixed 有个代价：这种元素“脱离文档流”，别的东西排版时当它不存在。
 * 于是正文会大大方方地铺到它底下去，最后几行永远被挡着；侧边栏最底下那几项也被压在终端后面，偏偏 cd 之后要确认的高亮可能就在那儿。
 * 一个会挡住你要看的东西的界面，就是没做完。
 *
 * 办法不是把终端改成不 fixed，而是让别人知道“底下这块被我占了”。
 * 这个组件只在最外层标一句 data-terminal="open"、"closed" 或者 "auto"；
 * app/globals.css 按这个标记算出一个变量 --fd-terminal-height，写明终端有多高；
 * 内容区底下留出同样高的空白，工作区外壳（components/workbench/area-layout.tsx）再把侧边栏、页内目录能用的高度减掉这个数。
 * 这样正文滚到底、侧边栏 sticky 的尽头，都刚好停在终端上沿。
 * 中间没有谁去量 DOM，也没有谁通知谁，全靠一个 CSS 变量往下传。
 * 这个变量还用 @property 登记成了“长度”，所以它变的时候浏览器能补出中间帧，终端、正文、侧边栏在同一个动画里一起伸缩。
 *
 * 那个 "auto" 是第三种状态，意思是“你还没碰过终端”。这时候宽屏展开、手机收起，由 CSS 按屏幕宽度来定；你一旦亲手展开或者收起，就听你的。
 * 为啥交给 CSS、不用 JavaScript 判断？因为页面是在构建时生成好的，那时候根本不知道你的屏幕多宽。
 * 等 JavaScript 跑起来再收，手机上就会先闪一下展开的终端，再“啪”地收回去。
 *
 * 最后是 agent 模式。敲 agent 以后，输入行就不交给命令引擎了，改交给 AI，用的是和左边 AI 面板同一套会话代码（components/assistant/use-agent-session.ts）。
 * 提示符变成 agent>，敲 exit 回来，Ctrl+C 停掉正在进行的回答；AI 交来的改动单，可以点按钮，也可以直接敲 y 或 n。
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
import type { OutputBlock } from "@/core/terminal/output";
import { OutputView } from "@/components/terminal/output-view";
import { useAgentSession, type TranscriptItem } from "@/components/assistant/use-agent-session";
import { Transcript } from "@/components/assistant/transcript";
import { APPROVAL_OPTIONS } from "@/components/assistant/pickers";
import { requestAiSettings } from "@/components/workbench/side-view";
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
  /** 这一条是一段 AI 对话：'live' 表示就是当前这段（跟着会话实时变）；数组是之前那段对话定格下来的样子。 */
  agent?: "live" | TranscriptItem[];
};

/** agent 模式：off 普通终端；chat 进入了对话（直到 exit）；once 只问一句，答完自动回来。 */
type AgentMode = "off" | "chat" | "once";

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
  const agent = useAgentSession("terminal");
  const [agentMode, setAgentMode] = useState<AgentMode>("off");
  const [agentHistory, setAgentHistory] = useState<string[]>([]);
  // 会话里最新的对话记录。开始下一段对话前，用它把上一段“定格”下来。
  const agentItems = useRef<TranscriptItem[]>([]);
  agentItems.current = agent.items;
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

    // 命令只递申请单，真正动手在这里：跳转交给路由器，改状态交给浏览器存储，AI 对话交给会话。
    for (const action of result.actions) {
      if (action.type === "agent") {
        // 上一段对话定格下来，这一段从头开始。
        const snapshot = agentItems.current;
        setEntries((old) => [
          ...old.map((entry) => (entry.agent === "live" ? { ...entry, agent: snapshot } : entry)).filter((entry) => entry.id !== entryId),
          {
            id: entryId,
            prompt: currentPath,
            command: line,
            blocks: action.prompt === null
              ? [{ type: "text", text: `${action.resume ? "接着上一段对话。" : "进入 AI 对话。"}直接输入问题；exit 退出，Ctrl+C 停止回答，clear 开始新对话。需要确认改动时输入 y / n。`, tone: "muted" }]
              : [],
            agent: "live",
          },
        ]);
        void (async () => {
          // agent -c：接着最近的一段（面板里的也算）；没有就开新的，并说一声。
          if (action.resume && !(await agent.loadLatest())) {
            await agent.newChat();
            setEntries((old) => [...old, { id: nextEntryId.current++, prompt: currentPath, command: "", blocks: [{ type: "text", text: "还没有可以接着的对话，开了一段新的。", tone: "muted" }] }]);
          } else if (!action.resume) {
            await agent.newChat();
          }
          if (action.prompt === null) { setAgentMode("chat"); return; }
          setAgentMode("once");
          await agent.send(action.prompt);
          setAgentMode((mode) => (mode === "once" ? "off" : mode));
        })();
      } else if (action.type === "clear-screen") {
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
  }, [currentPath, previousPath, progress, understanding, commandHistory, router, agent]);

  /** agent 模式下敲的一行。 */
  const agentLine = useCallback((line: string) => {
    const text = line.trim();
    if (!text) return;
    if (agent.pending && /^(y|yes|是|同意)$/i.test(text)) { agent.decide(agent.pending.id, true); return; }
    if (agent.pending && /^(n|no|否|拒绝)$/i.test(text)) { agent.decide(agent.pending.id, false); return; }
    if (/^(exit|quit|:q)$/i.test(text)) {
      agent.stop();
      setAgentMode("off");
      setEntries((old) => [...old, { id: nextEntryId.current++, prompt: currentPath, command: "", blocks: [{ type: "text", text: "已退出 AI 对话。", tone: "muted" }] }]);
      return;
    }
    if (/^(clear|\/new)$/i.test(text)) { void agent.newChat(); return; }
    if (agent.running) return;
    setAgentHistory((old) => [...old, text]);
    void agent.send(text);
  }, [agent, currentPath]);

  useEffect(() => {
    if (!expanded) return;
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [entries, expanded, agent.items]);

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
    if (agentMode !== "off") agentLine(input); else executeLine(input);
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
    if (agentMode !== "off") {
      const selecting = event.currentTarget.selectionStart !== event.currentTarget.selectionEnd;
      if (event.key === "c" && event.ctrlKey && !selecting) {
        event.preventDefault();
        if (agent.running) agent.stop(); else agentLine("exit");
        return;
      }
      if (event.key === "Escape" && agent.running) { event.preventDefault(); agent.stop(); return; }
      if (event.key === "Tab") { event.preventDefault(); return; }
      if ((event.key === "ArrowUp" || event.key === "ArrowDown") && agentHistory.length) {
        event.preventDefault();
        const next = event.key === "ArrowUp"
          ? (historyCursor === null ? agentHistory.length - 1 : Math.max(0, historyCursor - 1))
          : (historyCursor === null ? null : historyCursor + 1 < agentHistory.length ? historyCursor + 1 : null);
        setHistoryCursor(next);
        setInput(next === null ? "" : agentHistory[next] ?? "");
      }
      return;
    }
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
      {/* 文档区照常排版，只是尾部留出终端那么高的一段空白，滚到底也不会被压在终端下面。
          这段空白留在哪里由 globals.css 的 .cs-dock-body 决定：宽屏上要留在正文那一列里，不能留在整个布局外面。 */}
      <div className="cs-dock-body flex-1">
        {children}
      </div>

      {/* 宽屏时终端从侧边栏右边开始，只占正文下方那一块，侧边栏一直通到底——和 VS Code 的面板一样。 */}
      <section
        className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-[minmax(0,1fr)] grid-rows-[2.25rem_minmax(0,1fr)] overflow-hidden border-t border-fd-border bg-fd-card pb-[env(safe-area-inset-bottom)] md:left-[calc(var(--cs-activity-width)+var(--cs-sidebar-width))] md:border-l"
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
                {entry.agent ? (
                  <div className="space-y-1.5 pt-0.5">
                    <Transcript
                      items={entry.agent === "live" ? agent.items : entry.agent}
                      onDecide={agent.decide}
                      variant="terminal"
                      onOpenSettings={requestAiSettings}
                    />
                    {entry.agent === "live" && agent.running ? <p className="text-xs text-fd-muted-foreground">AI 正在回答…（Ctrl+C 停止）</p> : null}
                    {entry.agent === "live" && agentMode !== "off" ? (
                      <p className="text-xs text-fd-muted-foreground">
                        模型 {agent.choice.model || "未选"} · 权限 {APPROVAL_OPTIONS.find((o) => o.value === agent.choice.approval)?.label}（在左侧 AI 面板的输入框下面可以换）
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <form className="flex items-center gap-2 border-t border-fd-border px-4 py-2" onSubmit={submit}>
            <label htmlFor="course-terminal-input" className="max-w-[45%] shrink-0 truncate">
              {agentMode !== "off" ? (
                <><span className="text-cs-author">agent</span><span className="text-fd-muted-foreground">&gt;</span></>
              ) : (
                <><span className="text-cs-prompt">{currentPath}</span><span className="text-fd-muted-foreground"> $</span></>
              )}
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
              aria-label={agentMode !== "off" ? "问 AI（exit 退出）" : "输入终端命令"}
              placeholder={agentMode === "off" ? undefined : agent.pending ? "输入 y 同意，n 拒绝" : agent.running ? "AI 正在回答…Ctrl+C 停止" : "问 AI，exit 退出"}
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
