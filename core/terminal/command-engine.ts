/**
 * @module        命令引擎——收下你敲的那一行字，交回一组结果
 * @problem       终端要把“一行文本”变成“一件被执行的事”。这中间其实有三步：
 *                把那行字拆成命令名和参数、按名字找到对应的命令、让它运行并交回结果。
 *                如果这三步散在界面代码里（比如写在按下回车的那个事件处理函数里），
 *                它们就只能在浏览器里跑、只能靠人手点着试，而这恰恰是整个项目里最需要被反复验证的一段逻辑。
 * @design        这个模块是纯逻辑：不认识 React、不认识 Next、不碰任何浏览器 API，
 *                进去的是字符串和一个上下文对象，出来的是结果对象。谁都能调用它，测试也能。
 *                命令用一张注册表管理（COMMANDS），引擎只认识“命令的形状”，不认识具体某条命令，
 *                所以新增命令时引擎不用改。
 *                找不到命令时照抄 Unix 的说法 command not found，并且绝不做“你是不是想输入 xxx”的猜测——
 *                这条是项目的硬规矩：读者在这里养成的习惯要能直接迁移到真终端，而自动纠正会让人放松。
 * @courses       UC Berkeley CS61A（第 3 章解释器：读入—求值—输出这条循环）；Stanford CS143 与 UCB CS164
 *                （词法分析：把字符流切成有意义的词；符号表：按名字找到定义）；
 *                MIT Missing Semester（shell 是怎么理解你敲的那一行的）；软件工程类课程（分层与可测试性）
 * @exercises     https://cs61a.org/ —— CS61A 当前学期主页：解释器单元的项目在学期后半发布（2026 秋季起改用 Gleam 写，不再是 Scheme）
 *                https://www.composingprograms.com/pages/34-interpreters-for-languages-with-combination.html —— CS61A 官方教材 3.4 节：一个计算器语言的解释器，读入—求值的完整例子
 *                https://web.stanford.edu/class/cs143/               —— 编译器 PA1/PA2：词法与语法分析
 *                https://missing.csail.mit.edu/2020/course-shell/    —— 先在真 shell 里体会一遍
 *                https://missing.csail.mit.edu/2020/shell-tools/     —— 参数、引号、转义到底是谁在处理
 * @prereq        知道字符串可以按空格切开；知道函数可以放进对象里，再按名字取出来调用。
 *                先读 syntax（怎么拆）和 command（命令长什么样）两章，再读这一章会顺很多。
 * @unclear       这不是完整的 shell：没有重定向、变量展开、后台任务，也不会启动任何真的程序。
 *                管道里传的是结构化数据；会改东西的命令不能进管道；不支持的语法一律明确报错。
 *                命令名区分大小写（HELP 找不到），和 Linux 上的终端一样（macOS 的文件系统默认不分大小写，在那儿敲 LS 反而能跑）。
 *
 * @letter
 * 如果这本教材只让你读一章代码，我会让你读这一章。不长，慢慢看。
 *
 * 你在终端里敲下 ls | grep math，按回车，中间到底发生了什么？摊开来其实就三步。
 *
 * 第一步，拆。程序拿到的只是一串字符，它得先搞清楚：这里有几条命令，每条叫什么，带了哪些参数。
 * 这一步交给了 syntax.ts，它会读懂引号、转义和竖线，交回来一个列表：[ls]、[grep, math]。
 * 编译原理课管这个叫词法分析，就是把一串没有结构的字符，切成一个个有意义的“词”。
 *
 * 第二步，查。拿着名字 ls 去注册表 COMMANDS 里找。找到了就有活干，找不到就回一句 command not found。
 * 编译原理里这叫查符号表，CS61A 的解释器项目里叫在环境里找名字，你会亲手写一遍。
 * 它朴素得不像个知识点，可每一个编程语言的实现里都有这一步。
 *
 * 第三步，跑。让找到的命令运行，把结果交回去。有管道的话，前一条的结果当成下一条的输入，一条接一条往下传，最后一条的结果就是整行的结果。
 *
 * 读一行、执行、把结果打出来、再读下一行，这个循环有个名字叫 REPL。
 * Python 的 >>>、浏览器的控制台、Scheme 的解释器，还有你手上这个终端，都是这个循环。
 * 这个文件里的 runCommand，就是循环里“执行”的那一格。
 *
 * 好，下面说点比这三步更要紧的：为什么这段代码非得单独放在一个文件里。
 *
 * 最省事的写法，是把这三步直接写进网页里“按下回车”的那段代码。功能一模一样，代码还更短。
 * 可这么干有两个后果。
 *
 * 头一个，没法测试。你想确认敲 asdfgh 真的回了 command not found，就得开浏览器、打开页面、点开终端、敲字、拿眼睛看。每改一次代码都得重来一遍，用不了几次你就懒得查了。
 * 现在它是个纯函数，塞进去一行字、拿回来一个结果。测试几毫秒就能跑几十种输入，包括你手动懒得试的：空行、一堆空格、大写的 HELP、管道里夹了个不存在的命令。
 *
 * 第二个后果更隐蔽。这段逻辑一旦住进网页里，它就会开始“顺手”干网页才能干的事：直接改地址栏、直接读浏览器存储、直接摸页面元素。
 * 这些调用会像藤蔓一样一点点长进来，等你哪天想把它搬出来的时候，已经搬不动了。
 * 偏偏这段逻辑是这本教材最想讲清楚的一章。跟框架缠死了，它就没法“单独拿出来读、单独拿出来跑”了。
 *
 * 所以这里守着一条死线：这个文件里没有 react，没有 next，没有 window、document、localStorage。
 * 随便哪台装了 Node 的电脑，都能直接调它。
 *
 * 管道这里有个细节，你可以看看 runCommand 里那两个循环。
 * 它先把整条管道从头到尾检查一遍：每个命令都存在吗？能不能放进管道？全过了，才开始真的跑第一条。
 * 为什么不边跑边查？想象一下 mark cs61a done | grpe x，后面那个 grep 拼错了。
 * 如果边跑边查，mark 已经把你的数据改了，才发现 grpe 不存在。你看到一句报错，以为什么都没发生，其实数据已经动过了。
 * 先查后跑，报错就真的等于“啥也没干”。
 * 也是因为这个，会改数据的命令（mark、cd、open 这些）根本不许进管道。
 *
 * 最后说说报错。找不到命令时，回的就是 command not found: asdfgh，一个字不多。
 * 不给“你是不是想输入 help”，虽然这很好做。
 * 你在这儿练出来的手感，将来要带到真终端里去。真终端不会替你猜，一个会替你猜的练习场，只会让你养成一个到了真环境就失灵的习惯。
 * 这里的严格，是故意的。
 */
import type {
  CommandContext,
  CommandDefinition,
  CommandInvocation,
  CommandResult,
  SessionContext,
} from "./command.ts";
import { helpCommand } from "./commands/help.ts";
import { lsCommand } from "./commands/ls.ts";
import { cdCommand } from "./commands/cd.ts";
import { catCommand } from "./commands/cat.ts";
import { openCommand } from "./commands/open.ts";
import { refsCommand } from "./commands/refs.ts";
import { markCommand } from "./commands/mark.ts";
import { statusCommand } from "./commands/status.ts";
import {searchCommand} from './commands/search.ts';
import { parsePipeline } from './syntax.ts';
import {pwdCommand,treeCommand,historyCommand,clearCommand} from './commands/navigation.ts';
import {findCommand} from './commands/find.ts';
import {grepCommand} from './commands/grep.ts';
import { agentCommand } from './commands/agent.ts';
import { text } from "./output.ts";

/**
 * 命令注册表：引擎认识的所有命令。
 *
 * 新增一条命令，只需要写好它、然后把它加进这个数组，引擎和 help 都会自动认识它。
 */
export const COMMANDS: readonly CommandDefinition[] = [
  helpCommand,
  lsCommand,
  cdCommand,
  catCommand,
  openCommand,
  refsCommand,
  markCommand,
  statusCommand, searchCommand,
  pwdCommand, treeCommand, historyCommand, clearCommand, findCommand, grepCommand,
  agentCommand,
];

/**
 * 把一行字拆成一条命令。只给测试和“只该有一条命令”的地方用；终端本身走 runCommand。
 *
 * 真正的拆词规则（引号、转义、管道）都在 syntax.ts 里。空行或者全是空格得到 null，表示“你什么也没说”，这不算错。
 */
export function parseCommandLine(line: string): CommandInvocation | null {
  const commands = parsePipeline(line);
  if (commands.length > 1) throw new Error('expected one command');
  return commands[0] ?? null;
}

/**
 * 引擎的入口：收下一行字，交回一组结果。
 *
 * session 是外面必须提供的信息：你在哪（来自地址栏）、你的学习记录（来自浏览器存储）等等。
 * 引擎把命令注册表补进去，凑成命令运行时能看到的完整上下文。
 */
export function runCommand(line: string, session: SessionContext): CommandResult {
  // 第一步：拆。语法有错就直接报，一条命令都不跑。
  let pipeline: CommandInvocation[];
  try {
    pipeline = parsePipeline(line);
  } catch (error) {
    return { status: 'error', blocks: [text(error instanceof Error ? error.message : 'syntax error', 'error')], actions: [] };
  }
  if (!pipeline.length) return { status: 'ok', blocks: [], actions: [] };

  // 第二步：查。整条管道先从头查到尾，全部没问题才开始跑；后面拼错了，前面的也不该已经改了你的数据。
  for (const invocation of pipeline) {
    const command = COMMANDS.find((candidate) => candidate.name === invocation.name);
    if (!command) return { status: 'error', blocks: [text(`command not found: ${invocation.name}`, 'error')], actions: [] };
    // 会改东西的命令（cd、open、mark……）没有 pipeline 标记，不许进管道。
    if (pipeline.length > 1 && !command.pipeline) return { status: 'error', blocks: [text(`${command.name}: not supported in a pipeline`, 'error')], actions: [] };
  }

  // 第三步：跑。前一条的输出块原样交给后一条当 stdin，中途有一条出错就停。
  let result: CommandResult = { status: 'ok', blocks: [], actions: [] };
  for (let i = 0; i < pipeline.length; i++) {
    const invocation = pipeline[i]!;
    const command = COMMANDS.find((candidate) => candidate.name === invocation.name)!;
    result = command.run(invocation, { ...session, commands: COMMANDS, ...(i ? { stdin: result.blocks } : {}) });
    if (result.status === 'error') return result;
  }
  return result;
}
