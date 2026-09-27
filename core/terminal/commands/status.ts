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
 * @unclear       带参数时一次只能问一样东西。想按分类或状态筛，用 find（find systems -status learning）
 *                或者在 status 后面接 grep（status | grep 61），不打算给 status 自己加一堆选项。
 *                整体统计现在是拼成文字显示的，没有真正的进度条。
 *
 * @letter
 * 你可能注意到了，这个终端里的命令几乎全是动词：ls 是 list，cd 是 change directory，cat 是 concatenate。status 是个例外，它是个名词。
 * 这是有原因的。Unix 里有一类命令，不是让它去做事，而是问它“现在是什么情况”，git status 就是最出名的一个。
 * 查进度正好是这一类。叫 show、check 也不是不行，但 status 这个词你在真终端里早晚会天天敲，那就现在先熟悉起来。
 *
 * 不带参数敲 status，它会把两条进度线一起报给你：课程那边想学、在学、学完各几门；代码那边读懂了几段，占整本教材的百分之几。
 * 这种全局的问题，侧边栏是永远答不上来的，因为侧边栏是按位置摆的，而这个问题横跨整棵树。
 *
 * 聊聊那个百分比。它的分母是“这本教材一共有多少段代码”，不是“你标过多少段”。
 * 要是用后者，你只标一段、标成读懂了，那就是 100%，好看是好看，一点意义都没有。
 * 而且只有“读懂了”才算数，“读过”不算。这不是故意为难你。
 * 读过但没读懂，恰恰是这本教材最想帮你跨过去的那道坎；要是计数的时候都把两者混在一起，这条进度线就量不出它真正想量的东西了。
 *
 * 最后一点：status 只读不写，它连改数据的能力都没有。
 * 它拿到的是外面从你浏览器里读好、递进来的一份快照，它也不交回任何动作。
 * 这是故意的。查询命令一旦能写，“我就看一眼”这句话就没那么让人放心了。
 * 读和写分成 status 和 mark 两条命令，你敲 status 的时候可以百分之百确定：敲多少遍，你的数据都一个字不会变。
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
  pipeline: true,
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
        // 课程可能已经从树上删掉了，但读者的记录还在。照实说，不悄悄丢掉读者的数据。
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
