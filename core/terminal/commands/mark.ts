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
 * @unclear       一次只能标一样东西。批量标记（"把系统那一支全标成想学"）还做不到：
 *                管道只能筛结果，不能把 find 挑出的一组东西拆成参数喂给 mark（真 shell 里靠 xargs），
 *                而且 mark 本身也没有接进管道。
 *
 * @letter
 * mark 就是给东西打个记号：一门课学到哪了，一段代码读懂了没有。
 *
 *     mark cs61a learning
 *     mark /internals/core/terminal/syntax understood
 *
 * 同一条命令，标课程用一套词（todo、learning、done），标代码用另一套（unread、read、understood），两套词不重样，所以不会混。
 * 你用不着先想“我现在该用哪条命令”，指着哪个，它就标哪个。
 * 词写错了也不要紧，它会告诉你这个东西能用哪几个词，比如 mark cs61a nope 会把 todo、learning、done、clear 列给你。
 *
 * 这个命令虽然短，却踩在两条线上。
 *
 * 第一条线是：数据是谁的。你标的东西只存在你自己的浏览器里，不上传，作者看不到，换台电脑也带不过去，除非你自己导出备份再导进去。
 * 这是故意的。你学到哪是你自己的事；再说这个网站压根没有服务器、没有账号，它连你是谁都不知道。
 *
 * 第二条线是：代码能碰什么。命令引擎不许碰浏览器，整个 core 目录里找不到一行 window、一行 localStorage。
 * 碰了的话，它就没法脱离浏览器跑测试了。
 * 那 mark 要改你浏览器里的数据，怎么办？它不动手，只递一张申请单：算出“cs61a 应该改成 learning”，把这句话装进一个动作交出去，真正往浏览器里写的是外面那层界面代码。
 * 测试的时候，只要检查 mark cs61a learning 有没有交出这张单子就行，全程不需要浏览器。
 *
 * 有件事你可能会想试：先 find -status todo 挑出一堆课，再一口气全标掉。现在还做不到。
 * 管道只能在上一条的结果里“筛”，还不能把一组东西拆开当成参数喂给下一条命令，真 shell 里干这活的是 xargs，这里还没有。@unclear 里记着。
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
