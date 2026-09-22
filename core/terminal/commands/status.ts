/**
 * @module        status 命令——报告两条进度线：课程学到哪了，代码读懂了多少
 * @problem       标记只有能查回来才有意义。而"查"有两种问法：一种是问一样具体的东西
 *                （"CS61A 我标过没有"），另一种是问全局（"我到底在学几门了、整本教材读懂了几成"）。
 *                后一种侧边栏永远回答不了——它按位置组织内容，而这个问题横跨整棵树，和位置无关。
 * @design        一条命令管两种问法：带参数问一样东西，不带参数把两条线一起报告。
 *                统计、排序和百分比都调用 progress 模块里的函数，网页上显示的数字读的是同一套规则，
 *                所以两边永远一致。命令只读不写，不返回任何动作。
 * @courses       UC Berkeley CS61B（按关系查询而不是按位置遍历）；
 *                CMU 15-445 与 UCB CS186（同一份数据的两种查法：按键取一条，按条件扫一遍）；
 *                MIT Missing Semester（git status 那类"报告当前状态"的命令）
 * @exercises     https://15445.courses.cs.cmu.edu/ —— 官方项目里的查询执行
 *                https://missing.csail.mit.edu/2020/version-control/ —— status 这类命令的习惯
 * @prereq        知道"取一条记录"和"把所有记录过一遍"是两种不同的问法。
 * @unclear       现在只能按名字问，不能按分类或状态筛（"列出我在学的系统课"）。
 *                那属于 ROADMAP 阶段 10 的 find 与管道：由 find 负责挑出一组东西，
 *                再交给别的命令处理，而不是让这条命令自己长出一堆选项。
 *
 * @letter
 * 这条命令的名字不是动词，这在一个"动词优先"的命令集里有点显眼，值得解释一下。
 *
 * Unix 的命令大多是动词：ls（list）、cd（change directory）、cat（concatenate）。
 * 但也有一类例外，它们报告的是"现在是什么样"，而不是"去做什么"——git status 就是最常见的一个。
 * 进度正属于这一类：你不是让它做事，你是在问它一句话。叫 check 或 show 也行，
 * 但 status 是你在真终端里早就见过的词，而这本教材希望你在这里养成的习惯能原样搬去真终端。
 *
 * 再说那个百分比。它的分母是"这本教材一共有多少段代码"，不是"你标过多少段"。
 * 换成后者，标一段读懂就是 100%，那个数字会好看得毫无意义。
 * 而且只有"读懂了"才计入——"读过"不算。这不是苛刻：读过而没读懂正是这本教材最想帮你越过的那道坎，
 * 如果连计数都把两者混为一谈，这条进度线就量不出它真正想量的东西了。
 *
 * 最后：这条命令读的是两份从你浏览器里读好再递进来的快照。它不去读存储，也就改不了存储——
 * 这个限制是故意的。查询命令一旦能写，"我只是看一眼"就再也不是一句可靠的话了。
 * 读和写分成 status 与 mark 两条命令，你敲下 status 时可以完全确定：
 * 不管敲多少次，你的数据一个字都不会变。
 */
import type { CommandDefinition, CommandResult } from "../command.ts";
import type { OutputBlock } from "../output.ts";
import type { CourseEntry, ModuleEntry } from "../../knowledge/knowledge-index.ts";
import {
  PROGRESS_STATES,
  STATE_LABELS,
  UNDERSTANDING_LABELS,
  UNDERSTANDING_STATES,
  countByState,
  countByUnderstanding,
  sortProgress,
  sortUnderstanding,
  understandingSummary,
  type CourseProgress,
  type ModuleUnderstanding,
} from "../../progress/progress.ts";
import { list, text } from "../output.ts";
import { resolveTarget, usageError } from "./shared.ts";

const USAGE = "status [course|module]";

/** 课程那条线的统计，像 "想学 3 · 在学 1 · 学完 12"。 */
function courseSummary(records: readonly CourseProgress[]): string {
  const counts = countByState(records);
  return PROGRESS_STATES.map((state) => `${STATE_LABELS[state]} ${counts[state]}`).join(" · ");
}

/** 代码那条线的统计，末尾带上整体理解度。 */
function moduleSummary(records: readonly ModuleUnderstanding[], modulePaths: string[]): string {
  const counts = countByUnderstanding(records);
  const summary = understandingSummary(records, modulePaths);
  const parts = UNDERSTANDING_STATES.map((state) => `${UNDERSTANDING_LABELS[state]} ${counts[state]}`).join(" · ");
  return `${parts}　整体理解度 ${summary.understood}/${summary.total}（${summary.percent}%）`;
}

export const statusCommand: CommandDefinition = {
  name: "status",
  summary: "查课程学到哪了、代码读懂了多少",
  usage: USAGE,
  run(invocation, context): CommandResult {
    if (invocation.args.length > 1) return usageError("status", USAGE);

    const input = invocation.args[0];

    // 带参数：问一样具体的东西，是课程还是源码由它自己决定。
    if (input !== undefined) {
      const found = resolveTarget("status", input, context);
      if (!found.ok) return found.result;

      if (found.kind === "course") {
        const course = found.course;
        const record = context.progress.find((item) => item.course === course.id);
        return record === undefined
          ? {
              status: "ok",
              blocks: [text(`${course.title} 还没有标记。`, "muted"), text(`用 mark ${course.id} todo 把它标成想学。`, "muted")],
              actions: [],
            }
          : {
              status: "ok",
              blocks: [
                text(`${course.title}：${STATE_LABELS[record.state]}`),
                list([{ label: course.path, description: course.title, command: `open ${course.path}` }]),
              ],
              actions: [],
            };
      }

      const module = found.module;
      const record = context.understanding.find((item) => item.module === module.path);
      return record === undefined
        ? {
            status: "ok",
            blocks: [text(`${module.title} 还没有标记。`, "muted"), text(`用 mark ${module.path} read 标成读过。`, "muted")],
            actions: [],
          }
        : {
            status: "ok",
            blocks: [
              text(`${module.title}：${UNDERSTANDING_LABELS[record.state]}`),
              list([{ label: module.path, description: module.title, command: `open ${module.path}` }]),
            ],
            actions: [],
          };
    }

    // 不带参数：两条线一起报告。
    const modulePaths = context.knowledge.modules.map(module => module.path);
    if (context.progress.length === 0 && context.understanding.length === 0) {
      return {
        status: "ok",
        blocks: [
          text("你还没有标记任何东西。", "muted"),
          text("用 mark <课程> todo 标下第一门课，例如 mark cs61a todo。", "muted"),
          text("用 mark <源码> read 标下第一段代码，例如 mark /internals/core/terminal/command-engine read。", "muted"),
        ],
        actions: [],
      };
    }

    const blocks: OutputBlock[] = [];

    // 第一条线：课程。记录里存的是编号，要显示成人看得懂的标题和位置，得回索引里查一次。
    blocks.push(text(`课程　${courseSummary(context.progress)}`));
    const courseById = new Map<string, CourseEntry>(context.knowledge.courses.map((course) => [course.id, course]));
    for (const state of PROGRESS_STATES) {
      const inState = sortProgress(context.progress.filter((record) => record.state === state));
      if (inState.length === 0) continue;
      blocks.push(text(`　${STATE_LABELS[state]}（${inState.length}）`, "muted"));
      blocks.push(list(inState.map((record) => {
        const course = courseById.get(record.course);
        // 课程可能已经从树上删掉了，但读者的记录还在。照实说，不悄悄丢掉他的数据。
        return course === undefined
          ? { label: record.course, description: "这门课已不在课程树里" }
          : { label: course.path, description: course.title, command: `open ${course.path}` };
      })));
    }

    // 第二条线：代码。
    blocks.push(text(`代码　${moduleSummary(context.understanding, modulePaths)}`));
    const moduleByPath = new Map<string, ModuleEntry>(context.knowledge.modules.map((module) => [module.path, module]));
    for (const state of UNDERSTANDING_STATES) {
      const inState = sortUnderstanding(context.understanding.filter((record) => record.state === state));
      if (inState.length === 0) continue;
      blocks.push(text(`　${UNDERSTANDING_LABELS[state]}（${inState.length}）`, "muted"));
      blocks.push(list(inState.map((record) => {
        const module = moduleByPath.get(record.module);
        return module === undefined
          ? { label: record.module, description: "这段代码已不在项目里" }
          : { label: module.path, description: module.title, command: `open ${module.path}` };
      })));
    }

    return { status: "ok", blocks, actions: [] };
  },
};
