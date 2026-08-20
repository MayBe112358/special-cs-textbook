/**
 * @module        文档页底部的终端底座——终端本体，外加它在页面上占住的那条位置
 * @problem       纯命令引擎已经能回答 help，却还没有让人打字、查看回显、翻历史或执行导航动作的网页边界。
 *                还有一个只有真用起来才会发现的问题：终端如果只是“浮”在页面底部，它会盖住正文的最后几行，
 *                也会盖住侧边栏最下面几项——而侧边栏恰恰是 cd 之后要去确认高亮的地方。
 *                一个会挡住验收对象的界面，等于没做完。
 * @design        用普通 React 表单和结构化输出组件实现，不使用 xterm.js。命令历史、输出、OLDPWD 都是会话状态，
 *                留在这个常驻布局组件的内存里；当前目录则每次从 usePathname 推导，绝不复制进 state。
 *                router.push 是唯一真正执行副作用的位置，命令只交回动作描述。
 *                布局上，这个组件同时充当“底座”：它把文档区当 children 包进来，用一个 CSS 变量宣布
 *                “我占了底下这么高”，文档区据此缩短。终端本身仍然 fixed 贴在视口底部（不然长文一滚它就没了），
 *                但因为下方那段高度已经被预留出来，谁也不会被盖住。
 * @courses       CS50x Week 8（表单、事件、DOM、CSS 盒模型与定位）；UC Berkeley CS61A（REPL 与函数式核心/命令式外壳）；
 *                Stanford CS143、UCB CS164（结构化结果的解释）；软件工程类课程（状态边界）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 *                https://cs61a.org/ ; https://web.stanford.edu/class/cs143/
 * @prereq        知道表单回车会提交；React state 能让界面记住本次打开期间的数据；
 *                知道 CSS 里 fixed 的元素“脱离文档流”，也就是别人排版时当它不存在。
 * @unclear       Tab 补全属于 AGENTS.md 的最终终端约束，但 ROADMAP 3.1—3.4 没要求，本次不提前实现。
 *                两个高度写成了常量，还没做成可拖拽调整；小屏幕上 20.5rem 会吃掉不少正文，
 *                真正的移动端方案留到正式界面步骤。
 *
 * @letter
 * 这里是纯逻辑第一次碰到真实网页的边界。上半部分的命令引擎只会算：输入一句话，得到若干输出块和动作。
 * 到这个组件，动作才真的发生——navigate 交给 Next 路由器，列表项才变成按钮，文字块才拥有颜色。
 * 把边界放在一个地方的好处是，你要追查“谁改了页面”时只看 executeLine，不必翻每条命令。
 *
 * 三种看似相近的状态在这里被刻意分开。历史和输出刷新就丢，是会话状态；OLDPWD 也只是历史事实；
 * 当前目录没有 useState，它来自地址栏。折叠终端只是不渲染面板，不卸掉这个组件，所以历史仍在；
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
 * 值得留意的是这里没有测量 DOM、没有 ResizeObserver、也没有谁通知谁。高度是一个我们自己说了算的常量，
 * 展开就是 20.5rem、折叠就是 2.5rem，写在一个地方，其余部分靠 CSS 变量往下继承。
 * 这和“地址栏是唯一真相”是同一种思路：能靠一份数据往下推的，就不要让两个组件互相汇报——
 * 互相汇报的两份数据，迟早会有一份是错的，而且你不会知道是哪一份。
 */
"use client";

import { createVirtualFileSystem } from "@/core/filesystem/virtual-file-system";
import knowledgeIndexJson from "@/core/knowledge/generated/knowledge-index.json";
import type { KnowledgeIndex } from "@/core/knowledge/knowledge-index";
import { runCommand } from "@/core/terminal/command-engine";
import { pathnameToWorkingDirectory } from "@/core/terminal/location";
import type { OutputBlock } from "@/core/terminal/output";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

const fileSystem = createVirtualFileSystem(knowledgeIndexJson as KnowledgeIndex);

/**
 * 终端底座占住的高度，也就是文档区要让出来的那一条。
 *
 * 折叠时只剩那根标题条（h-10，2.5rem）；展开时再加上面板（h-72，18rem），合起来 20.5rem。
 * 这两个数和下面 className 里的 h-10 / h-72 必须对得上——它们是同一件事的两种说法，
 * 一个说给 CSS 变量听，一个说给元素自己听。改高度时两处一起改。
 */
const DOCK_HEIGHT_COLLAPSED = "2.5rem";
const DOCK_HEIGHT_EXPANDED = "20.5rem";

type HistoryEntry = {
  id: number;
  prompt: string;
  command: string;
  blocks: OutputBlock[];
};

function OutputView({ block, onCommand }: { block: OutputBlock; onCommand: (line: string) => void }) {
  if (block.type === "text") {
    const toneClass = block.tone === "error"
      ? "text-red-600 dark:text-red-400"
      : block.tone === "muted"
        ? "text-fd-muted-foreground"
        : "text-fd-foreground";
    return <div className={`whitespace-pre-wrap ${toneClass}`}>{block.text}</div>;
  }

  return (
    <ul className="space-y-1">
      {block.items.map((item) => (
        <li key={`${item.label}:${item.description ?? ""}`} className="flex gap-2">
          {item.command ? (
            <button
              type="button"
              className="font-mono text-blue-600 underline underline-offset-2 dark:text-blue-400"
              onClick={() => onCommand(item.command ?? "")}
            >
              {item.label}
            </button>
          ) : (
            <span className="font-mono">{item.label}</span>
          )}
          {item.description ? <span className="text-fd-muted-foreground">— {item.description}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function TerminalDock({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentPath = pathnameToWorkingDirectory(pathname, fileSystem);
  const [expanded, setExpanded] = useState(true);
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [previousPath, setPreviousPath] = useState<string | null>(null);
  const draftBeforeHistory = useRef("");
  const nextEntryId = useRef(1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const executeLine = useCallback((line: string) => {
    if (line.trim() === "") return;

    const result = runCommand(line, { currentPath, previousPath, fileSystem });
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

    for (const action of result.actions) {
      if (action.type === "navigate") {
        if (action.reason === "change-directory") setPreviousPath(currentPath);
        router.push(action.href);
      }
    }
  }, [currentPath, previousPath, router]);

  useEffect(() => {
    if (!expanded) return;
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [entries, expanded]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    executeLine(input);
    setInput("");
    inputRef.current?.focus();
  }

  function moveThroughHistory(event: KeyboardEvent<HTMLInputElement>) {
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

  // 这个变量沿着 DOM 往下传：下面那段空白用它，app/docs/layout.tsx 里的文档区也用它。
  const dockStyle = {
    "--fd-terminal-height": expanded ? DOCK_HEIGHT_EXPANDED : DOCK_HEIGHT_COLLAPSED,
  } as CSSProperties;

  return (
    <div className="flex flex-1 flex-col" style={dockStyle}>
      {/* 文档区照常排版，只是尾部留出终端那么高的一段空白，滚到底也不会被压在终端下面。 */}
      <div className="flex-1" style={{ paddingBottom: "var(--fd-terminal-height)" }}>
        {children}
      </div>

      <section className="fixed inset-x-0 bottom-0 z-50 border-t border-fd-border bg-fd-background shadow-lg" aria-label="课程终端">
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between px-4 text-left font-mono text-sm"
          aria-expanded={expanded}
          aria-controls="course-terminal-panel"
          onClick={() => setExpanded((value) => !value)}
        >
          <span>terminal</span>
          <span aria-hidden="true">{expanded ? "▼" : "▲"}</span>
        </button>

        {expanded ? (
          <div id="course-terminal-panel" className="flex h-72 flex-col border-t border-fd-border font-mono text-sm">
            <div ref={outputRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
              {entries.map((entry) => (
                <div key={entry.id} className="space-y-1">
                  <div><span className="text-emerald-600 dark:text-emerald-400">{entry.prompt} $</span> {entry.command}</div>
                  {entry.blocks.map((block, index) => (
                    <OutputView key={index} block={block} onCommand={executeLine} />
                  ))}
                </div>
              ))}
            </div>

            <form className="flex items-center gap-2 border-t border-fd-border px-4 py-3" onSubmit={submit}>
              <label htmlFor="course-terminal-input" className="shrink-0 text-emerald-600 dark:text-emerald-400">
                {currentPath} $
              </label>
              <input
                ref={inputRef}
                id="course-terminal-input"
                className="min-w-0 flex-1 bg-transparent outline-none"
                value={input}
                autoComplete="off"
                spellCheck={false}
                aria-label="输入终端命令"
                onChange={(event) => {
                  setInput(event.target.value);
                  setHistoryCursor(null);
                }}
                onKeyDown={moveThroughHistory}
              />
            </form>
          </div>
        ) : null}
      </section>
    </div>
  );
}
