/**
 * @module        终端输出的样子——把命令交回的结构化结果画成网页
 * @problem       命令引擎只交回“一段文字 / 一张列表 / 一棵树”这样的数据，不管它们长什么样。
 *                底部的终端和首页的演示终端都要把这些数据画出来，而且要画得一模一样：
 *                同一个内核，读者在两处看到的输出不该是两种样子。
 * @design        三种输出块各对应一个小组件；列表里能点的项画成按钮，点了等于把那条命令再敲一遍。
 *                ls 的输出排成多列、只写名字（和真终端一样），其他列表一行一项、后面跟说明。
 *                从 terminal.tsx 里单独拿出来，是为了让首页的演示终端也能用，而不是复制一份。
 * @courses       CS50x Week 8（HTML 与组件）；UC Berkeley CS61A（数据与表示分开：同一份数据可以有不同的画法）；
 *                MIT Missing Semester（ls 的输出长什么样）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        知道 React 组件接收数据、返回要显示的东西。
 * @unclear       表格、进度条、代码块这几种输出块在 AGENTS.md 里提过，还没有命令用到，所以这里也还没画。
 *
 * @letter
 * 命令引擎交回来的不是一行拼好的字，而是“这是一张列表，第一项叫 systems，它是个目录，点它等于 open /systems”。
 * 这个文件就是把这种数据变成你眼睛看到的东西的地方。
 * 这样分工的好处，你在首页就能看到：演示终端和底部终端是两个不同的框，
 * 但它们调用的是同一个引擎、用的是同一套画法，所以 ls 在两处的样子分毫不差。
 * 如果当初让命令直接返回拼好的文字，就只能靠复制粘贴来保持一致了——而复制出来的两份，迟早会不一样。
 */
"use client";

import type { OutputBlock, TreeItem } from "@/core/terminal/output";
import type { ReactNode } from "react";

export function CommandLink({ command, onCommand, className, children }: {
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

export function OutputView({ block, onCommand }: { block: OutputBlock; onCommand: (line: string) => void }) {
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

