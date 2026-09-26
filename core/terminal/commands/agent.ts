/**
 * @module        agent——在终端里和 AI 对话（CLI 形式）
 * @problem       有人习惯鼠标，点左边的 AI 面板；有人手已经在键盘上，敲 agent 更顺手。
 *                就像 Claude Code、aider 这些命令行里的 AI 工具一样：敲命令进入对话，exit 退出。
 * @design        命令本身什么都不做——它不能碰网络，也不能碰浏览器（AGENTS.md 7.1），只返回一个“我想进入 AI 对话”的动作：
 *                - agent：进入对话模式，提示符变成 agent>，之后敲的每一行都发给 AI，exit 退出；
 *                - agent <问题>：只问这一句，回答完回到普通终端；
 *                - agent -c（--continue）：接着最近的一段对话聊（面板里的也算），可以和问题连用：agent -c 继续刚才的。
 *                终端里的对话和面板里的存在同一份历史里，标注“终端”。
 *                真正的对话由终端外层（components/terminal/terminal.tsx）用和左侧面板同一套会话代码去跑，
 *                改动照样要确认（在终端里输入 y / n，或点按钮）。
 *                不能放进管道：AI 的回答不是结构化数据，交给 grep 没有意义。
 * @courses       MIT Missing Semester（命令行交互程序：REPL 与退出约定）；UC Berkeley CS61A（REPL：读—求值—打印循环）
 * @exercises     https://missing.csail.mit.edu/2020/command-line/
 * @prereq        知道 REPL：一个“读一行、执行、打印结果、再读下一行”的交互程序，python、node 敲回车进去的就是。
 * @unclear       agent 模式里没有 Tab 补全，↑↓ 翻的是这次对话里问过的话。
 * @letter
 * 你在命令行里敲 python，会进入一个新的提示符 >>>，在那里敲的东西由 Python 解释，敲 exit() 回来。
 * agent 就是照这个样子做的：进去以后，你的每一行字不再交给这个终端的命令引擎，而是交给 AI。
 * 这种“一个程序里套着另一个交互程序”的结构，你在 Missing Semester 讲 shell 的那一课会反复看到。
 */
import type { CommandDefinition } from '../command.ts';

export const agentCommand: CommandDefinition = {
  name: 'agent',
  summary: '和 AI 助手对话：agent 进入对话（exit 退出），agent <问题> 只问一句，agent -c 接着上一段',
  usage: 'agent [-c] [question...]',
  run: ({ args }) => {
    const resume = args[0] === '-c' || args[0] === '--continue';
    const rest = resume ? args.slice(1) : args;
    return { status: 'ok', blocks: [], actions: [{ type: 'agent', prompt: rest.length ? rest.join(' ') : null, resume }] };
  },
};
