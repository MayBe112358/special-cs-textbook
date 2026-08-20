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
 * @exercises     https://cs61a.org/                                  —— Scheme 解释器项目：本模块的完整版
 *                https://web.stanford.edu/class/cs143/               —— 编译器 PA1/PA2：词法与语法分析
 *                https://missing.csail.mit.edu/2020/course-shell/    —— 先在真 shell 里体会一遍
 *                https://missing.csail.mit.edu/2020/shell-tools/     —— 参数、引号、转义到底是谁在处理
 * @prereq        知道字符串可以按空格切开；知道函数可以放进对象里，再按名字取出来调用。
 * @unclear       拆词现在只按空白切开，还不认识引号（cd "my dir"）、不认识管道（find | grep）、
 *                也不认识重定向。管道要到 ROADMAP 阶段 10.4 才做，届时“命令之间传结构化数据而不是文本”
 *                这条要求会反过来影响这里的设计——那时可能需要真正的语法分析，而不是切一刀。
 *                命令现在可以返回站内导航动作，但引擎只负责原样交出去，仍然不执行浏览器副作用。
 *
 * @letter
 * 这是这本教材里最重要的一章，请你慢慢读这一段。
 *
 * 你在终端敲下 help 然后回车，这中间发生了什么？摊开来只有三步：
 *
 *   第一步，拆词。你敲的是一整行字符 "help"，程序拿到的也只是一串字符。
 *     它得先决定：哪一段是命令的名字，哪些是参数。我们的规则很简单——按空白切开，
 *     第一个词是命令名，剩下的是参数。真 shell 在这一步复杂得多（引号、转义、变量展开、通配符），
 *     但骨架就是这件事。编译原理课把它叫词法分析：把没有结构的字符，切成有意义的“词”。
 *
 *   第二步，查表。拿着名字 "help" 去注册表里找。找到了就有事可做，找不到就得回话。
 *     这一步在编译原理里叫符号表查找，在解释器里叫查找环境（CS61A 的解释器项目会让你亲手写一遍）。
 *     它朴素得不像个知识点，但所有的语言实现都有这一步。
 *
 *   第三步，求值。让找到的那条命令运行，把它交回的结果原样返回。
 *
 * 这三步（读入、求值、输出，再回到读入）合起来有个名字叫 REPL 循环，
 * 你用过的每一个交互式解释器——Python 的 >>>、浏览器的控制台、Scheme、还有你正在用的这个终端——
 * 都是这条循环。你现在读的这几十行代码，就是那条循环里“求值”的那一格。
 *
 * 接下来说这个文件为什么必须单独存在，这比上面三步更重要。
 *
 * 最省事的写法，是把这三步直接写在网页里“按下回车”的那段代码中间。功能上完全一样，行数还更少。
 * 但那样会有两个后果。第一个是它没法被测试：要检查 "asdfgh" 是不是真的回了 command not found，
 * 你就得启动浏览器、打开页面、点开终端、敲字、用眼睛看——每改一次代码就得重来一遍，于是你很快就不查了。
 * 现在它是一个纯函数，测试可以在几毫秒里跑几十种输入，包括那些你手动懒得试的：
 * 空行、只有空格、大写的 HELP、名字后面跟一串参数。
 *
 * 第二个后果更隐蔽：一旦这段逻辑住进了网页里，它就会开始顺手做网页才能做的事——
 * 直接改地址栏、直接读浏览器存储、直接摸 DOM。这些调用会像藤蔓一样长进来，
 * 等你想搬走它时已经搬不动了。而这段逻辑恰恰是这本教材要讲的核心章节（它对应 CS61A 的解释器、
 * 对应编译原理的前端），一旦和框架缠死，它就没法作为“可以单独读、单独跑”的教材内容存在了。
 *
 * 所以这里守着一条明确的边界：这个文件里没有 import react，没有 import next，
 * 没有 window、没有 document、没有 localStorage。你可以在任何一台装了 Node 的电脑上直接调用它。
 * 边界不是为了好看，是为了这一章能被讲清楚。
 *
 * 最后说一句报错。找不到命令时，我们回的是 command not found: asdfgh，一个字都不多。
 * 不给“你是不是想输入 help”，哪怕这很容易做到。原因写在项目的规矩里，我复述一遍：
 * 读者在这里练出来的手感，将来要迁移到真的终端；真终端不会替你猜，
 * 一个会替你猜的练习场，会让人养成一个到了真环境就失效的习惯。这里的严格是教学法，不是偷懒。
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
import { text } from "./output.ts";

/**
 * 命令注册表：引擎认识的所有命令。
 *
 * 新增一条命令，只需要写好它、然后把它加进这个数组，引擎和 help 都会自动认识它。
 */
export const COMMANDS: readonly CommandDefinition[] = [helpCommand, lsCommand, cdCommand, catCommand, openCommand];

/**
 * 第一步：拆词。把一整行字切成命令名和参数。
 *
 * 规则只有一条——按空白切开，第一个词是名字，剩下的是参数。
 * 空行（或只敲了空格）会得到 null，表示“你什么也没说”，那不是错误。
 */
export function parseCommandLine(line: string): CommandInvocation | null {
  const words = line.trim().split(/\s+/).filter((word) => word !== "");
  const [name, ...args] = words;
  if (name === undefined) return null;
  return { name, args };
}

/**
 * 引擎的入口：收下一行字，交回一组结果。
 *
 * session 是外部世界必须提供的信息（现在只有“你在哪”，它来自浏览器地址栏）。
 * 引擎把命令注册表补进去，凑成命令运行时能看到的完整上下文。
 */
export function runCommand(line: string, session: SessionContext): CommandResult {
  const invocation = parseCommandLine(line);

  // 敲了空行：真终端只是换一行继续等你，不显示任何东西，也不算出错。
  if (invocation === null) return { status: "ok", blocks: [], actions: [] };

  // 第二步：查表。注意这里是精确匹配，大小写敏感——真 Unix 里 HELP 和 help 不是同一个命令。
  const command = COMMANDS.find((candidate) => candidate.name === invocation.name);
  if (command === undefined) {
    return {
      status: "error",
      // 照抄 Unix 的说法。不猜、不纠正、不建议。
      blocks: [text(`command not found: ${invocation.name}`, "error")],
      actions: [],
    };
  }

  // 第三步：求值。命令只负责算出结果，不许自己动手改任何东西。
  const context: CommandContext = { ...session, commands: COMMANDS };
  return command.run(invocation, context);
}
