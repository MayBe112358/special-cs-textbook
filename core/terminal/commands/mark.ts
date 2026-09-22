/**
 * @module        mark 命令——标一门课学到哪了，或标一段代码读懂了没有
 * @problem       这本教材有两条进度线：课程是目录，你在目录上走到哪；代码是正文，你把正文读懂了多少。
 *                两条线都需要读者能随手留下记号。网页上点按钮当然可以，但那要求你先走到那一页；
 *                常见的场景是"我刚扫完一批课程介绍，想一口气把感兴趣的几门都标上"，
 *                那时一条命令比翻五次页面快得多。
 * @design        只做一件事：改状态。查询交给 status，读写分开。
 *                一条命令管两条线，标哪条由参数指到哪里决定——指到课程就用课程那套状态词，
 *                指到源码就用理解度那套，两套词不重叠，所以不会混。这和 refs 一条命令管两个方向同理：
 *                方向由参数本身决定，而不是由一个额外的选项决定。
 *                命令自己不碰浏览器存储，只返回一个动作，由外层执行——和 open 只返回 navigate 是同一条边界。
 * @courses       UC Berkeley CS61A（函数式核心与命令式外壳：把副作用推到边界）；
 *                MIT Missing Semester（命令行里"一条命令做一件事"的传统）；
 *                Harvard CS50x Week 9（读者自己的数据存在哪）
 * @exercises     https://cs61a.org/ —— 官方 lab 中的抽象与副作用边界
 *                https://missing.csail.mit.edu/2020/course-shell/ —— 命令与参数的习惯
 * @prereq        知道"返回一个动作描述"和"当场执行动作"是两件不同的事。
 * @unclear       现在一次只能标一样东西。批量标记（"把系统那一支全标成想学"）要等 ROADMAP 阶段 10 的
 *                find 和管道，那时该由 find 挑出一组东西再喂给 mark，而不是让这条命令自己长出一堆选项。
 *
 * @letter
 * 这条命令短得几乎没有内容，但它踩在两条界线上，都值得说清楚。
 *
 * 第一条是数据的归属。你标下的东西存在你自己的浏览器里，不会上传，不会被作者看到，
 * 换台电脑也带不过去（除非你自己导出备份再导进去）。这是有意的：你学到哪里是你自己的事，
 * 而这个网站没有服务器，也没有账号——它连"你是谁"都不知道。
 *
 * 第二条是代码的边界。命令引擎是不许碰浏览器的：整个 core 目录里没有一行 window、
 * 没有一行 localStorage，因为那样它就再也不能脱离浏览器跑测试了，
 * 而命令引擎是这本教材里最该讲清楚的一章（它对应 CS61A 的解释器项目）。
 * 解决办法是：这条命令不动手，只递申请单。它算出"cs61a 这门课应该变成 learning"，
 * 把这句话装进一个动作返回出去，真正写进浏览器的是外面那层界面代码。
 * 你在测试里能验证"mark cs61a learning 会申请把 cs61a 改成 learning"，
 * 而整个过程不需要一个浏览器。这就是"把副作用推到边界"最具体的样子。
 *
 * 最后说说为什么两条线合用一条命令，而不是各开一条。
 * 因为动作是同一个：标记。变的只是你标的是什么——一门课，还是一段代码。
 * 你不必先想清楚"我现在要用哪条命令"，指到哪里，答案就在哪里。
 * 多一条近义词命令看起来更整齐，实际是把一个本来不存在的选择题塞给了读者。
 */
import type { CommandDefinition, CommandResult } from "../command.ts";
import {
  PROGRESS_STATES,
  STATE_LABELS,
  UNDERSTANDING_LABELS,
  UNDERSTANDING_STATES,
  validState,
  validUnderstandingState,
} from "../../progress/progress.ts";
import { list, text } from "../output.ts";
import { resolveTarget, usageError } from "./shared.ts";

const USAGE = "mark <course|module> <state|clear>";

/** 把某一条线上可用的词连同中文说法摆出来，读者拼错时不用再去翻 help。 */
function stateList(kind: "course" | "module") {
  const entries = kind === "course"
    ? PROGRESS_STATES.map((state) => ({ label: state, description: STATE_LABELS[state] }))
    : UNDERSTANDING_STATES.map((state) => ({ label: state, description: UNDERSTANDING_LABELS[state] }));
  return list([...entries, { label: "clear", description: "清掉这条标记" }]);
}

export const markCommand: CommandDefinition = {
  name: "mark",
  summary: "标一门课学到哪了，或标一段代码读懂了没有",
  usage: USAGE,
  run(invocation, context): CommandResult {
    if (invocation.args.length === 0) {
      return { status: "error", blocks: [text("mark: missing operand", "error"), text(`usage: ${USAGE}`, "muted")], actions: [] };
    }
    if (invocation.args.length > 2) return usageError("mark", USAGE);

    const input = invocation.args[0] ?? "";
    const found = resolveTarget("mark", input, context);
    if (!found.ok) return found.result;

    if (invocation.args.length === 1) {
      return {
        status: "error",
        blocks: [
          text("mark: missing state", "error"),
          text(`usage: ${USAGE}`, "muted"),
          stateList(found.kind),
          text("只想看它现在标的是什么，用 status。", "muted"),
        ],
        actions: [],
      };
    }

    const wanted = invocation.args[1] ?? "";

    if (found.kind === "course") {
      const course = found.course;
      if (wanted === "clear") {
        const existing = context.progress.find((record) => record.course === course.id);
        return existing === undefined
          ? { status: "ok", blocks: [text(`${course.title} 本来就没有标记。`, "muted")], actions: [] }
          : {
              status: "ok",
              blocks: [text(`已清除 ${course.title} 的标记。`)],
              actions: [{ type: "set-progress", course: course.id, state: null }],
            };
      }
      if (!validState(wanted)) {
        // 照 Unix 的习惯直说哪个参数不合法，不猜"你是不是想输入 learning"。
        // 特别提一句"这是课程"，否则把理解度的词用在课程上时，读者会以为是自己记错了词。
        return {
          status: "error",
          blocks: [text(`mark: invalid state: ${wanted}`, "error"), text(`${course.title} 是一门课程，可用的状态是：`, "muted"), stateList("course")],
          actions: [],
        };
      }
      return {
        status: "ok",
        blocks: [text(`${course.title} 已标记为${STATE_LABELS[wanted]}。`)],
        actions: [{ type: "set-progress", course: course.id, state: wanted }],
      };
    }

    const module = found.module;
    if (wanted === "clear") {
      const existing = context.understanding.find((record) => record.module === module.path);
      return existing === undefined
        ? { status: "ok", blocks: [text(`${module.title} 本来就没有标记。`, "muted")], actions: [] }
        : {
            status: "ok",
            blocks: [text(`已清除 ${module.title} 的标记。`)],
            actions: [{ type: "set-understanding", module: module.path, state: null }],
          };
    }
    if (!validUnderstandingState(wanted)) {
      return {
        status: "error",
        blocks: [text(`mark: invalid state: ${wanted}`, "error"), text(`${module.title} 是一段源码，可用的状态是：`, "muted"), stateList("module")],
        actions: [],
      };
    }
    return {
      status: "ok",
      blocks: [text(`${module.title} 已标记为${UNDERSTANDING_LABELS[wanted]}。`)],
      actions: [{ type: "set-understanding", module: module.path, state: wanted }],
    };
  },
};
