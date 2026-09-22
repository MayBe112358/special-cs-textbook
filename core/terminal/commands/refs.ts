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
 *                名字撞车时（真实源码里就有两个 layout）不猜，把候选连同各自的位置列出来让人再说一遍。
 *                对应关系不在这里算，它来自构建时写进索引的 courseIds（见 [[cross-reference]]），
 *                所以这条命令和网页上那两块牌子给出的答案永远一致——它们读的是同一份数据。
 * @courses       MIT 6.042J（关系与图：一门课和一段代码之间是多对多）；UC Berkeley CS61B（图的邻接与反向查找）；
 *                CMU 15-445 与 UCB CS186（按关系查询，而不是按位置遍历）；
 *                MIT Missing Semester（man、which、apropos：命令行里“按名字问一件事”的传统）
 * @exercises     https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-spring-2015/pages/assignments/ —— 关系与图
 *                https://15445.courses.cs.cmu.edu/fall2023/project1/ —— 查询同一份数据的两种走法
 *                https://missing.csail.mit.edu/2020/course-shell/ —— man 与 which 怎么按名字找东西
 * @prereq        知道“A 提到了 B”和“谁提到了 A”是两个方向的问题；用过 man 或 which 这类按名字查的命令。
 * @unclear       现在只接受一个参数，也不能按分类批量问（“列出系统那一支下所有课对应的代码”）。
 *                批量和组合查询要等 ROADMAP 阶段 10 的 find 和管道，那时该由 find 负责挑出一组东西，
 *                再把它们喂给别的命令，而不是让这条命令自己长出一堆选项。
 *
 * @letter
 * 这条命令是这本教材“目录 ↔ 正文”那个环在终端里的样子，我想说说它为什么值得存在。
 *
 * 网页上已经有链接了：课程页底下列着对应的代码，讲解页上列着对应的课。既然点得过去，为什么还要一条命令？
 *
 * 因为链接只能从你正在看的那一页出发。你得先想到去打开 CS61A 那一页，才能看到它对应什么。
 * 而实际的问题常常是从空中冒出来的：你刚做完一个 lab，合上电脑之前顺手想问一句“这门课在这个项目里
 * 对应哪些东西”。这时候你在哪一页并不重要，你要的是一次查询，不是一次浏览。
 * 侧边栏做不到这件事——它按位置组织，一门课只能待在它那个分类里；而“谁提到了这门课”散落在三十个源文件里。
 *
 * 这就是这个项目对终端的要求：它得能做鼠标做不到的事，否则它只是个装饰。
 * cd 和 ls 那种“走路”的动作，鼠标其实更快；真正属于终端的是这种跨着整棵树问关系的问题。
 *
 * 再说参数怎么找这件事，它有个你以后到处会遇到的道理。
 *
 * refs cs61a 和 refs /internals/core/terminal/command-engine 都能用，但走的是两条路：
 * 前者是名字，后者是位置。名字不带位置信息，所以要在整棵树里找；位置本身就是答案，直接走过去即可。
 * 真终端也是这么分的：cat 要位置（cat cs61a 只在当前目录找），man 要名字（man ls 不管 ls 装在哪）。
 * 这两种寻址方式的区别，在文件系统课和数据库课里都会正面出现，只是那时它叫“按路径寻址”和“按键寻址”。
 *
 * 最后一处细节：名字撞车时这条命令不替你选。真实源码里有两个 layout.tsx（一个是全站外壳，
 * 一个是文档区的三栏布局），你敲 refs layout，它把两个都列出来，让你再说一遍是哪个。
 * 这和项目里“不做你是不是想输入 xxx”的规矩是同一件事：宁可多问一句，也不假装知道你想要什么。
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
