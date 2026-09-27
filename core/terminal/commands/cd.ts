/**
 * @module        cd 命令——请求把当前网页位置切换到知识树里的另一个目录
 * @problem       读者要用相对路径、..、~ 和 - 在课程分类间移动，同时页面地址必须继续是当前位置的唯一真相。
 * @design        路径解析交给无状态虚拟文件系统；找到目录后只返回 navigate 动作，不调用网页路由器。
 *                cd - 所需的 OLDPWD 由外层作为会话上下文传入，它是“上一次在哪”，不是另一份当前位置。
 * @courses       MIT Missing Semester（cd、PWD、OLDPWD、家目录）；MIT 6.S081 与 UCB CS162（目录与路径解析）；
 *                UC Berkeley CS61A（把副作用推到程序边界）
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/ —— 真终端里的 cd、..、~、cd -
 *                https://pdos.csail.mit.edu/6.S081/2021/labs/fs.html —— xv6 文件系统 lab，目录和路径在内核里长什么样
 * @prereq        用过真终端里的 cd；知道网址变化会让网页进入另一个页面。
 * @unclear       知识树没有符号链接，所以 cd -L 与 cd -P 在这里没有差别；权限错误也尚不存在。
 *
 * @letter
 * cd 这个命令，说出来你可能不信：它从来没有真的“换过目录”。
 *
 * 它干的事是这样的：你敲 cd systems，它去树上查一下 systems 在不在、是不是目录，没问题的话，交回一张条子，上面写着“请跳到 /docs/systems 这个网址”。
 * 然后它就完事了。真正去改网址的是外面的网页。网址一变，下一条命令执行之前，外面再从新网址算出“现在在哪”，递给命令。
 * 所以整个过程中没有任何地方存着一个“当前目录”变量，位置永远只看地址栏。
 *
 * 绕这么一大圈图啥？你想想另一种写法：终端自己存一个 currentDirectory。
 * 那你用鼠标点了侧边栏，终端得收到通知去更新它；你按了浏览器的后退键，终端也得收到通知；你把网址复制到新标签页打开，终端又得从头算一遍。
 * 漏掉任何一个，终端和页面就对不上了，提示符说你在 A，页面显示的是 B。
 * 只认地址栏一个真相，这些情况全都自动对上，因为它们最后改的都是同一个网址。
 *
 * 还有个附带的好处：cd 只交回条子、不碰网页，所以它在 Node 里跑测试完全没问题，不需要开浏览器。
 *
 * cd - 是个有意思的例外，看起来像是要破戒。
 * cd - 的意思是“回到上一次待的地方”，那总得有人记着上一次在哪吧？
 * 确实有人记着，外面把它当 previousPath 递进来，对应真 shell 里的 OLDPWD 变量。
 * 但它记的是“历史”，不是“现在”。现在在哪还是只问网址，上一次在哪才问这个记录。两件事分开，谁也不跟谁抢。
 * 刚打开页面就敲 cd -，会看到 cd: OLDPWD not set，因为还没有“上一次”。bash 里也是这句。
 *
 * 最后说一个你可能会踩到的地方：cd 进不了课程。
 * cd programming-intro/cs61a 会报 not a directory，因为在这棵树里，课程是文件，分类才是目录。
 * 这是这本教材的设定：课程是目录里的一页，不是一个可以走进去的地方。
 */
import type { CommandDefinition, CommandResult } from "../command.ts";
import { text } from "../output.ts";
import { knowledgePathToUrl, lookupError, usageError } from "./shared.ts";

export const cdCommand: CommandDefinition = {
  name: "cd",
  summary: "切换到另一个目录",
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
