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
 * @exercises     https://missing.csail.mit.edu/2020/command-line/ —— 命令行环境：交互程序、作业控制，以及怎么进出它们
 * @prereq        知道 REPL：一个“读一行、执行、打印结果、再读下一行”的交互程序，python、node 敲回车进去的就是。
 * @unclear       agent 模式里没有 Tab 补全，↑↓ 翻的是这次对话里问过的话。
 * @letter
 * 你在命令行里敲 python 回车，会进到一个新的提示符 >>>，在那儿敲的东西都交给 Python 去解释，敲 exit() 才回来。
 * agent 就是照这个样子做的：敲 agent 进去，提示符变成 agent>，你之后敲的每一行字不再交给这个终端的命令引擎，而是发给 AI，敲 exit 回来。
 * 这种“一个交互程序里再套一个交互程序”的结构，你用 python、node、mysql 的时候天天都在遇到，只是可能没留意过。
 *
 * 这个文件本身短得可怜，因为它啥都不能干。
 * 命令引擎有条硬规矩：不许碰网络，不许碰浏览器。AI 对话偏偏两样都得碰。
 * 所以 agent 只交回一句“我想进入 AI 对话”，附上你的问题和要不要接着上一段聊，然后就撒手不管了。
 * 真正去跟 AI 说话的，是终端外壳 components/terminal/terminal.tsx，它用的和左边 AI 面板是同一套会话代码。
 * 所以你在终端里聊的，和在面板里聊的，存在同一份历史里；AI 想改你的东西，在这儿一样得先问过你（敲 y 或 n）。
 *
 * agent 不能接进管道。AI 的回答是一段话，不是一行行带结构的条目，交给 grep 也筛不出什么名堂。
 * 要是你敲了 ls | agent，会被直接拒掉。
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
