/**
 * @module        命令的契约——一条命令长什么样、它能看到什么、它必须交回什么
 * @problem       引擎要能执行任何一条命令，又不能认识每一条命令的细节；命令要能被引擎调用，
 *                又不能反过来把引擎抱住。两边都需要一份共同的约定，而这份约定不该住在任何一方家里：
 *                放在引擎里，命令就得 import 引擎；放在命令里，引擎就得 import 某一条具体命令。
 *                两种都会让文件互相纠缠（术语叫循环依赖），改起来牵一发动全身。
 * @design        把约定单独放在这个文件：引擎 import 它，每条命令也 import 它，两边互不认识。
 *                约定里最要紧的一条是 run 必须返回结果，而不是自己动手——
 *                想跳转页面、想存东西，都只能在返回值里“说出来”，由外层决定做不做、怎么做。
 *                上下文里既有文件系统，也有原始的知识索引：前者按位置回答问题（cd、ls 用它），
 *                后者按关系回答问题（refs 用它）。它们是同一份数据的两种看法，不是两份数据。
 * @courses       UC Berkeley CS61A（高阶函数与数据抽象：把“要做的事”当值传来传去）；
 *                Stanford CS143 与 UCB CS164（解释器的求值接口）；软件工程类课程（依赖方向与接口设计）；
 *                MIT Missing Semester（Unix 命令的统一形状：名字、参数、退出状态）
 * @exercises     https://cs61a.org/                     —— Scheme 解释器项目：eval 的签名为什么长那样
 *                https://web.stanford.edu/class/cs143/  —— 编译器各阶段的接口划分
 * @prereq        知道函数可以作为对象的一个字段；知道“接口”就是双方说好的形状。
 * @unclear       动作现在有五种：站内跳转、清屏、改学习状态、改理解度、进入 AI 对话，都是某条命令真用上了才加的。
 *                将来要是有命令想下载文件之类，也照这个办法：先看它到底要表达什么，再加一种动作，
 *                不要提前把浏览器的能力全列进来。
 *
 * @letter
 * 这个文件定的是“一条命令得长什么样”。名字、一句话说明、用法，还有真正干活的 run，差不多就这几样。
 * 引擎只认这个形状，不认识具体是 ls 还是 grep。所以新加一条命令，引擎一行都不用改，按这个形状写好、登记一下就能用。
 * 这个项目从 help 一条命令长到现在十几条，引擎的主循环几乎没怎么动过，靠的就是这个。
 *
 * 我最想聊的是 run 的返回值，因为这是整个项目里最容易写歪、写歪了又最难掰回来的地方。
 *
 * 拿 open cs61a 来说，它要让页面跳到 CS61A。最顺手的写法是在 run 里直接调浏览器的跳转，三行搞定。
 * 可这么一写，这个命令就跟浏览器绑死了：测试的时候没有浏览器，一调就炸；想在别处复用也不行。
 * 更麻烦的是，跳转成了藏在某个角落里的副作用，哪天页面莫名其妙跳走了，你得把所有命令翻一遍才知道是谁干的。
 *
 * 所以这里的规矩是：命令不许自己动手，只能在返回值里说“我想干这件事”，交给外面统一去干。
 * 测试只要检查“它是不是说了想跳到 /docs/programming-intro/cs61a”，不用真跳。
 * 所有真正动手的地方都集中在外面那一层，出了问题一眼就能找到。
 * CS61A 后半程讲函数式编程的时候会正面讲这个思路，这里算是提前给你看个实物。
 *
 * 你现在能看到的动作一共五种：跳转页面、清屏、改学习状态、改理解度、进入 AI 对话。
 * 一开始只有跳转一种。其他几种都是后来某条命令真用上了才加的，没有提前一口气把浏览器能干的事全列进来。
 * 接口的形状，最好让真正用它的人来决定。提前猜的，多半猜不准。
 *
 * 还有个小地方：这些约定为什么单独放一个文件，不放在引擎里？
 * 因为放在引擎里，每条命令都得 import 引擎；引擎又得 import 每条命令来登记。两边互相 import，就绕成了一个圈，改一个牵动一片。
 * 单独拎出来以后，引擎和命令都只 import 这份约定，谁也不认识谁。
 */
import type { OutputBlock } from "./output.ts";
import type { VirtualFileSystem } from "../filesystem/virtual-file-system.ts";
import type { KnowledgeIndex } from "../knowledge/knowledge-index.ts";
import type { CourseProgress, ModuleUnderstanding, ProgressState, UnderstandingState } from "../progress/progress.ts";

/**
 * 外部世界在执行命令前必须告诉引擎的东西。
 *
 * 最重要的一件是：你在这棵知识树的哪个位置。注意这个位置是外面传进来的——
 * 它来自浏览器地址栏，而不是终端自己记着的一份副本。文件系统同样由外面递进来，只读不存会话；
 * previousPath 是 cd - 所需的历史事实。整个项目仍只有地址栏这一个“当前位置”真相。
 */
export type SessionContext = {
  /** 当前所在位置，例如 "/" 或 "/systems/operating-systems"。 */
  currentPath: string;
  /** 上一次由 cd 离开的目录；null 表示这次会话还没有切换过目录。 */
  previousPath: string | null;
  /** 从知识索引建立的只读文件系统。命令只能查询它，不能往里面写状态。 */
  fileSystem: VirtualFileSystem;
  /**
   * 构建时生成的那份知识索引本身。
   *
   * 文件系统是它的一种视图：按位置一层层往下走时用那个视图最顺手。
   * 但有些问题问的不是位置，而是关系——“哪些模块提到了这门课”要把所有模块过一遍，
   * 那种问题在原始的平表上问最直接。两者是同一份数据的两种看法，不是两份数据。
   */
  knowledge: KnowledgeIndex;
  /**
   * 读者自己标下的学习状态，一份只读快照。
   *
   * 注意它和上面两样东西的来源完全不同：文件系统和知识索引是构建时生成的、人人相同的内容；
   * 这一份来自读者自己的浏览器，换台设备就是另一副样子。引擎不去读浏览器存储——
   * 那样它就再也不能脱离浏览器跑测试了——所以由外层读好再递进来。
   *
   * 也正因为是快照，命令改不动它：要改状态只能返回一个 set-progress 动作，由外层执行。
   */
  progress: readonly CourseProgress[];
  /**
   * 第二条进度线：读者对每段代码的理解度，同样是一份只读快照。
   *
   * 和上面那份分开传，而不是塞进同一个数组，理由在 progress 模块的注释里写着：
   * 课程是这本教材的目录，代码是正文，"走到哪"和"读懂了多少"是两个问题，混在一起就算不出有意义的数字。
   */
  understanding: readonly ModuleUnderstanding[];
  /** 只读的会话历史，刷新即丢。 */
  history?: readonly string[];
};

/** 一条命令在运行时能看到的全部东西：外部给的 + 引擎补上的。 */
export type CommandContext = SessionContext & {
  /** 引擎里注册的所有命令。help 靠它自我介绍，所以它不需要手工维护一份命令清单。 */
  commands: readonly CommandDefinition[];
  /** 管道的前一段原样交来的结构化块，不解析渲染后的文字。 */
  stdin?: readonly OutputBlock[];
};

/** 用户敲下的那一行被拆开之后的样子。 */
export type CommandInvocation = {
  /** 命令名，例如 "help"。 */
  name: string;
  /** 命令名后面的参数，由 syntax.ts 按 shell 的引号规则切好。 */
  args: string[];
};

/** 一条命令执行完的结果。 */
export type CommandResult = {
  /** 成功还是失败。失败不代表程序坏了——打错命令是正常的日常。 */
  status: "ok" | "error";
  /** 要显示的内容，一组有类型的块；空数组表示什么也不显示（比如敲了个空行）。 */
  blocks: OutputBlock[];
  /** 命令希望外层执行的动作。命令本身不碰浏览器，所以这里只描述意图。 */
  actions: CommandAction[];
};

/**
 * 命令不能自己动手，只能交回一张“申请单”，由外层去执行。
 *
 * 目前有两种：一种是跳转页面，一种是改动读者本机的学习状态。
 * 两种都遵守同一条边界——命令只说“我想让这件事发生”，浏览器相关的动作全在外层完成。
 * 这样测试可以检查意图，而不需要先启动一个浏览器。
 */
export type CommandAction =
  | { type: "clear-screen" }
  | {
      type: "navigate";
      /** 交给网页路由器的站内地址。 */
      href: string;
      /** 为什么导航：外层只在 cd 时更新 OLDPWD，open 不改变它。 */
      reason: "change-directory" | "open";
    }
  | {
      type: "set-progress";
      /** 要改动的课程编号。 */
      course: string;
      /** 改成哪个状态；null 表示把这门课的标记清掉。 */
      state: ProgressState | null;
    }
  | {
      type: "set-understanding";
      /** 要改动的源码模块位置。用位置而不是名字，因为模块名会撞车。 */
      module: string;
      /** 改成哪个理解程度；null 表示把这段代码的标记清掉。 */
      state: UnderstandingState | null;
    }
  | {
      type: "agent";
      /** 只问这一句（agent <问题>）；null 表示进入对话模式，直到 exit。 */
      prompt: string | null;
      /** agent -c：接着最近的一段对话，而不是开新的。 */
      resume: boolean;
    };

/** 一条命令。 */
export type CommandDefinition = {
  /** 命令名，小写、简短、动词优先，和 Unix 的习惯一致。 */
  name: string;
  /** 只读命令才可以参加管道。 */
  pipeline?: boolean;
  /** 一句话说明，help 会列出来。 */
  summary: string;
  /** 用法示例，例如 "help"。 */
  usage: string;
  /** 真正干活的地方：收下这次调用和上下文，返回结果——不许自己动手做任何事。 */
  run(invocation: CommandInvocation, context: CommandContext): CommandResult;
};
