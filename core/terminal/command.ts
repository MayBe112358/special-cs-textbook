/**
 * @module        命令的契约——一条命令长什么样、它能看到什么、它必须交回什么
 * @problem       引擎要能执行任何一条命令，又不能认识每一条命令的细节；命令要能被引擎调用，
 *                又不能反过来把引擎抱住。两边都需要一份共同的约定，而这份约定不该住在任何一方家里：
 *                放在引擎里，命令就得 import 引擎；放在命令里，引擎就得 import 某一条具体命令。
 *                两种都会让文件互相纠缠（术语叫循环依赖），改起来牵一发动全身。
 * @design        把约定单独放在这个文件：引擎 import 它，每条命令也 import 它，两边互不认识。
 *                约定里最要紧的一条是 run 必须返回结果，而不是自己动手——
 *                想跳转页面、想存东西，都只能在返回值里“说出来”，由外层决定做不做、怎么做。
 * @courses       UC Berkeley CS61A（高阶函数与数据抽象：把“要做的事”当值传来传去）；
 *                Stanford CS143 与 UCB CS164（解释器的求值接口）；软件工程类课程（依赖方向与接口设计）；
 *                MIT Missing Semester（Unix 命令的统一形状：名字、参数、退出状态）
 * @exercises     https://cs61a.org/                     —— Scheme 解释器项目：eval 的签名为什么长那样
 *                https://web.stanford.edu/class/cs143/  —— 编译器各阶段的接口划分
 * @prereq        知道函数可以作为对象的一个字段；知道“接口”就是双方说好的形状。
 * @unclear       现在的动作只有站内导航。等命令需要修改访问者状态或下载文件时，是否沿用同一份 actions，
 *                要由真实命令需要的数据决定；不要提前把所有浏览器能力枚举进来。
 *
 * @letter
 * 这个文件定义的是“一条命令得长什么样”。四个字段：名字、一句话说明、用法、以及真正干活的 run。
 * 引擎只认识这个形状，不认识具体是 help 还是将来的 ls——所以新增一条命令时，引擎一行都不用改。
 * 这种“定好形状，谁符合谁就能插进来”的做法，你在很多地方都会遇到；它值钱的地方不在于优雅，
 * 而在于它把“新增功能要改的地方”从很多处压缩成一处。
 *
 * 我想重点说 run 的返回值，因为这是这个项目里最容易被写歪、也最难改回来的一处设计。
 *
 * 设想将来的 open cs61a：它要让页面跳到 CS61A。最直觉的写法是在 run 里直接调用浏览器的跳转函数，
 * 三行就能跑通。但那一刻，这个模块就永远绑死在浏览器上了：它没法在测试里跑
 * （测试环境里没有浏览器，一调就炸），也没法被别的地方复用。更麻烦的是，跳转变成了藏在深处的副作用，
 * 出问题时你得翻遍所有命令才知道是谁动的手。
 *
 * 所以本项目的规矩是：命令不许自己动手，它只能把“我想做这件事”写在返回值里交出去，
 * 由外层统一执行。这样测试可以直接检查“它是不是说了想跳转到 /docs/programming-intro/cs61a”，
 * 不需要真的跳；而所有真正的动作都汇集在一个地方发生，出问题一眼能找到。
 * 这个思路有个通行的名字叫“把副作用推到边界”，函数式编程课（CS61A 后半程）会正面讲它。
 *
 * 到 ROADMAP 3.3 的 open 真正需要跳转时，CommandResult 才长出 actions 字段；现在里面也只定义一种 navigate。
 * 这不是忘了提前做完整，而是刻意等真实使用者决定接口形状。未来若需要保存心得或下载文件，
 * 也应先看那条命令到底要表达什么，再增加一种动作，而不是把整套浏览器 API 搬进约定。
 */
import type { OutputBlock } from "./output.ts";
import type { VirtualFileSystem } from "../filesystem/virtual-file-system.ts";

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
};

/** 一条命令在运行时能看到的全部东西：外部给的 + 引擎补上的。 */
export type CommandContext = SessionContext & {
  /** 引擎里注册的所有命令。help 靠它自我介绍，所以它不需要手工维护一份命令清单。 */
  commands: readonly CommandDefinition[];
};

/** 用户敲下的那一行被拆开之后的样子。 */
export type CommandInvocation = {
  /** 命令名，例如 "help"。 */
  name: string;
  /** 命令名后面的参数，按空白切开。 */
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

/** 命令不能自己跳转页面，只能交回这样一张“导航申请”。 */
export type CommandAction = {
  type: "navigate";
  /** 交给网页路由器的站内地址。 */
  href: string;
  /** 为什么导航：外层只在 cd 时更新 OLDPWD，open 不改变它。 */
  reason: "change-directory" | "open";
};

/** 一条命令。 */
export type CommandDefinition = {
  /** 命令名，小写、简短、动词优先，和 Unix 的习惯一致。 */
  name: string;
  /** 一句话说明，help 会列出来。 */
  summary: string;
  /** 用法示例，例如 "help"。 */
  usage: string;
  /** 真正干活的地方：收下这次调用和上下文，返回结果——不许自己动手做任何事。 */
  run(invocation: CommandInvocation, context: CommandContext): CommandResult;
};
