/**
 * @module        cd 命令——请求把当前网页位置切换到知识树里的另一个目录
 * @problem       读者要用相对路径、..、~ 和 - 在课程分类间移动，同时页面地址必须继续是当前位置的唯一真相。
 * @design        路径解析交给无状态虚拟文件系统；找到目录后只返回 navigate 动作，不调用网页路由器。
 *                cd - 所需的 OLDPWD 由外层作为会话上下文传入，它是“上一次在哪”，不是另一份当前位置。
 * @courses       MIT Missing Semester（cd、PWD、OLDPWD、家目录）；MIT 6.S081 与 UCB CS162（目录与路径解析）；
 *                UC Berkeley CS61A（把副作用推到程序边界）
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/
 *                https://pdos.csail.mit.edu/6.S081/2021/labs/fs.html
 * @prereq        用过真终端里的 cd；知道网址变化会让网页进入另一个页面。
 * @unclear       知识树没有符号链接，所以 cd -L 与 cd -P 在这里没有差别；权限错误也尚不存在。
 *
 * @letter
 * cd 最值得看的不是路径怎么拼，而是它最后没有“切换目录”。它只交回一张申请：请导航到这个网址。
 * 真正改地址的是外层网页。这样命令引擎在 Node 测试里仍然能运行，也不会偷偷保存 currentDirectory。
 * 下一次执行命令时，外层再从新网址推导当前位置，于是地址栏一直是唯一真相。
 *
 * cd - 看起来需要打破这条规矩，其实没有。它记的是 OLDPWD——上一次离开的目录，是命令历史的一部分；
 * 它不声称自己是“现在在哪”。现在在哪仍只问网址。分清“当前事实”和“历史记录”，两份数据就不会争话语权。
 */
import type { CommandDefinition, CommandResult } from "../command.ts";
import { text } from "../output.ts";
import { knowledgePathToUrl, lookupError, usageError } from "./shared.ts";

export const cdCommand: CommandDefinition = {
  name: "cd",
  summary: "切换到另一个课程分类",
  usage: "cd [directory]",
  run(invocation, context): CommandResult {
    if (invocation.args.length > 1) return usageError("cd", "cd [directory]");

    const requested = invocation.args[0] ?? "~";
    if (requested === "-" && context.previousPath === null) {
      return { status: "error", blocks: [text("cd: OLDPWD not set", "error")], actions: [] };
    }
    const input = requested === "-" ? context.previousPath ?? "~" : requested;
    const result = context.fileSystem.lookup(context.currentPath, input);
    if (!result.found) return lookupError("cd", requested, result);
    if (result.node.kind !== "directory") {
      return { status: "error", blocks: [text(`cd: not a directory: ${requested}`, "error")], actions: [] };
    }

    return {
      status: "ok",
      blocks: requested === "-" ? [text(result.path)] : [],
      actions: [{ type: "navigate", href: knowledgePathToUrl(result.path), reason: "change-directory" }],
    };
  },
};
