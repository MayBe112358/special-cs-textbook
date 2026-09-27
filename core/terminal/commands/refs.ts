/**
 * @module        refs 命令——问一门课对应哪些代码，或者问一段代码对应哪些课
 * @problem       课程页和讲解页上已经有了互相跳转的链接，但那只能一页一页地看。
 *                真正的问题往往是跨着问的：“我刚学完 CS61A，这个项目里有哪些代码是我现在读得懂的？”
 *                侧边栏回答不了这种问题——它按位置组织，而这个问题按关系组织。
 *                这正是终端该挣到自己位置的地方：它能做鼠标做不到的事。
 * @design        一条命令管两个方向，方向由参数本身决定：给它一门课，就回答“学完之后能读什么”；
 *                给它一个模块，就回答“读懂它要先学什么”。做成两条命令当然也行，但那要求使用者
 *                在开口之前先想清楚自己站在哪一边，而这两个问题其实是同一条线的两头。
 *                参数的找法有两种，按写法区分：带斜杠（或 . ~ ..）的当路径，交给文件系统按位置找；
 *                不带斜杠的当名字，在整棵树里按编号找——就像 man ls 不需要你写出 ls 在磁盘的哪个位置。
 *                名字撞车时（真实源码里有五个文件都叫 layout）不猜，把候选连同各自的位置列出来让人再说一遍。
 *                对应关系不在这里算，它来自构建时写进索引的 courseIds（见 [[cross-reference]]），
 *                所以这条命令和网页上那两块牌子给出的答案永远一致——它们读的是同一份数据。
 * @courses       MIT 6.042J（关系与图：一门课和一段代码之间是多对多）；UC Berkeley CS61B（图的邻接与反向查找）；
 *                CMU 15-445 与 UCB CS186（按关系查询，而不是按位置遍历）；
 *                MIT Missing Semester（man、which、apropos：命令行里“按名字问一件事”的传统）
 * @exercises     https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-spring-2015/ —— 6.042J 里讲关系与图的几讲和配套习题
 *                https://15445.courses.cs.cmu.edu/fall2023/project1/ —— 查询同一份数据的两种走法
 *                https://missing.csail.mit.edu/2020/course-shell/ —— man 与 which 怎么按名字找东西
 * @prereq        知道“A 提到了 B”和“谁提到了 A”是两个方向的问题；用过 man 或 which 这类按名字查的命令。
 * @unclear       一次只能问一样东西，不能按分类批量问（“系统那一支所有课对应的代码”）。
 *                管道已经有了，但它只能在结果里筛（refs cs61a | grep terminal），还不能把 find 挑出的一组东西
 *                当参数逐个喂给 refs；真 shell 里干这个的是 xargs，这里还没有。
 *                另外 CS61A 在六十多个文件的 @courses 里出现，refs cs61a 一次列出六十多条，太多了，
 *                说明有些文件标得偏宽，重写注释时要逐个核对。
 *
 * @letter
 * 这条命令是这本教材“课程是目录、代码是正文”在终端里的样子。先试试：
 *
 *     refs cs61a
 *     refs /internals/core/terminal/command-engine
 *
 * 第一条问“学完 CS61A 以后，这个项目里有哪些代码我能读了”；第二条反过来问“读懂命令引擎，得先学哪些课”。
 *
 * 你可能会问，网页上不是已经有链接了吗？课程页底下列着对应的代码，讲解页上列着对应的课，点过去就行了呀。
 * 问题在于，链接只能从你正在看的那一页出发。你得先想起来去打开 CS61A 那页，才能看到它对应啥。
 * 可实际上这种问题常常是突然冒出来的：刚做完一个 lab，合电脑之前顺嘴想问一句。这时候你在哪一页根本不重要，你要的是查一下，而不是逛过去。
 *
 * 这就是这个项目给终端定的门槛：得能干鼠标干不了的事，不然它就是个摆设。
 * cd、ls 这种“走路”的活，说实话鼠标更快。真正该交给终端的，是这种跨着整棵树问关系的问题。
 * 再配上管道就更顺手了，比如 refs cs61a | grep terminal，只看终端相关的那几章。
 *
 * 参数怎么找，这里有个你以后到处都会碰到的区别。
 * refs cs61a 给的是名字，refs /internals/core/terminal/command-engine 给的是位置。
 * 名字不带位置信息，得满树去找；位置本身就是答案，直接走过去就行。
 * 真终端也是这么分的：cat 要位置（cat cs61a 只在当前目录找），man 要名字（man ls 才不管 ls 装在哪）。
 * 等你学文件系统和数据库，会再见到这对概念，那时候它们叫“按路径寻址”和“按键寻址”。
 *
 * 对应关系不是这条命令自己算的。构建网站的时候，脚本已经从每个文件的 @courses 里认出了提到哪些课，写进了索引，
 * refs 和网页上那两块“对应课程/对应代码”的牌子读的是同一份数据，所以两边说的永远一样。
 *
 * 最后，撞名了它不替你选。源码里有五个文件都叫 layout，你敲 refs layout，它把五个都列出来，点一下就等于把完整位置写上重问一遍。
 * 宁可多问你一句，也不假装知道你想要哪个。
 */
import type { CommandDefinition, CommandResult } from "../command.ts";
import type { CourseEntry, ModuleEntry } from "../../knowledge/knowledge-index.ts";
import { coursesForModule, modulesForCourse } from "../../knowledge/cross-reference.ts";
import type { ListItem, OutputBlock } from "../output.ts";
import { list, text } from "../output.ts";
import { lookupError, usageError } from "./shared.ts";

const USAGE = "refs <course|module>";

/** 参数写成这样就是位置，否则就是名字。规则只有一条：带路径符号的当路径。 */
function looksLikePath(input: string): boolean {
  return input.includes("/") || input === "." || input === ".." || input === "~";
}

/**
 * 把一组结果画成可点的列表。
 *
 * 标签用完整位置而不是短名字：这些结果来自整棵树的各个角落，短名字放在一起会分不清谁是谁
 * （光是 layout 就有两个）。点击时执行的也是完整位置，所以你先 refs、再 cd 到别处，
 * 回头点旧输出仍然打开当时那一项。
 */
function toItems(entries: readonly { path: string; title: string }[]): ListItem[] {
  return entries.map((entry) => ({
    label: entry.path,
    description: entry.title,
    command: `open ${entry.path}`,
  }));
}

/** 一门课的答案：学完它之后可以回头读哪些代码。 */
function describeCourse(course: CourseEntry, modules: readonly ModuleEntry[]): OutputBlock[] {
  const found = modulesForCourse(modules, course.id);
  if (found.length === 0) {
    return [
      text(course.title),
      text("还没有源码模块在注释里点到这门课。", "muted"),
    ];
  }
  return [text(`学完 ${course.title} 之后，可以读这些代码：`), list(toItems(found))];
}

/** 一个模块的答案：读懂它需要先学哪些本站收录的课。 */
function describeModule(module: ModuleEntry, courses: readonly CourseEntry[]): OutputBlock[] {
  const found = coursesForModule(courses, module.courseIds);
  if (found.length === 0) {
    return [
      text(module.comment.module),
      text("它注释里提到的课，本站一门都还没有收录。", "muted"),
    ];
  }
  return [
    text(module.comment.module),
    text("读懂它需要先学（本站收录的课）："),
    list(toItems(found)),
  ];
}

export const refsCommand: CommandDefinition = {
  name: "refs",
  pipeline: true,
  summary: "查一门课对应哪些代码，或一段代码对应哪些课",
  usage: USAGE,
  run(invocation, context): CommandResult {
    if (invocation.args.length === 0) {
      return { status: "error", blocks: [text("refs: missing operand", "error"), text(`usage: ${USAGE}`, "muted")], actions: [] };
    }
    if (invocation.args.length > 1) return usageError("refs", USAGE);

    const input = invocation.args[0] ?? "";
    const { courses, modules } = context.knowledge;

    // 写成路径就按位置找，走的是和 cd、cat 完全一样的那套规则。
    if (looksLikePath(input)) {
      const result = context.fileSystem.lookup(context.currentPath, input);
      if (!result.found) return lookupError("refs", input, result);
      if (result.node.kind !== "file") {
        return { status: "error", blocks: [text(`refs: ${input}: Is a directory`, "error")], actions: [] };
      }
      const blocks = result.node.source.kind === "course"
        ? describeCourse(result.node.source.course, modules)
        : describeModule(result.node.source.module, courses);
      return { status: "ok", blocks, actions: [] };
    }

    // 写成名字就在整棵树里找。课程编号全站唯一，模块用的是源文件名，可能撞车。
    const matchedCourses = courses.filter((course) => course.id === input);
    const matchedModules = modules.filter((module) => module.id === input);
    const total = matchedCourses.length + matchedModules.length;

    if (total === 0) {
      return {
        status: "error",
        blocks: [text(`refs: no such course or module: ${input}`, "error")],
        actions: [],
      };
    }

    if (total > 1) {
      // 不猜。把候选连同位置列出来，点一下就等于用完整位置再问一次。
      const candidates = [...matchedCourses, ...matchedModules];
      return {
        status: "error",
        blocks: [
          text(`refs: ${input}: 有多个同名的东西，请写出完整位置`, "error"),
          list(candidates.map((entry) => ({
            label: entry.path,
            description: entry.title,
            command: `refs ${entry.path}`,
          }))),
        ],
        actions: [],
      };
    }

    const course = matchedCourses[0];
    const blocks = course !== undefined
      ? describeCourse(course, modules)
      : describeModule(matchedModules[0] as ModuleEntry, courses);
    return { status: "ok", blocks, actions: [] };
  },
};
