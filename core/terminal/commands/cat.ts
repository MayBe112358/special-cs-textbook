/**
 * @module        cat 命令——在终端里显示课程或源码模块的简介
 * @problem       读者有时只想快速看一门课是什么，不值得为一句简介离开当前页面。
 * @design        课程在虚拟文件系统里是文件，description 就是它可读的内容；分类是目录，按 Unix 的方式拒绝 cat。
 *                支持依次读取多个目标，和真 cat 可以连接多个文件的基本行为一致。
 * @courses       MIT Missing Semester（cat 与标准输出）；MIT 6.S081 与 UCB CS162（文件和目录是不同节点）；
 *                UC Berkeley CS61A（遍历输入并汇总结构化结果）
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/ —— 真终端里的 cat 和标准输出
 *                https://pdos.csail.mit.edu/6.S081/2021/labs/util.html —— xv6 工具 lab，读一读 xv6 自带的 cat.c 有多短
 * @prereq        知道 cat 在真终端里把文件内容打印到屏幕。
 * @unclear       这里的“文件内容”是索引里那句简介：课程读它 frontmatter 里的 description，
 *                源码模块读它注释块里 @module 那一行。都不是整篇正文——整篇正文在网页上，用 open 打开。
 *                真 cat 会把整个文件倒出来，这里没有，因为终端那一小块地方装不下一封信。
 *                将来如果要 cat 出更多（比如只读 @problem 那一段），得先想清楚参数怎么写，别急着加选项。
 *
 * @letter
 * 在真终端里，cat 就是把一个文件的内容倒到屏幕上。这里的 cat 也是这个意思，只是“文件的内容”换成了一句简介。
 *
 * 你试试：
 *
 *     cat programming-intro/cs61a
 *     cat systems
 *
 * 第一条出来一句话，“以函数、抽象和解释器为主线的程序设计导论”；第二条报 cat: systems: Is a directory。
 * 这句报错不光是在学真 Unix 说话。它在告诉你这棵树的规矩：目录只负责装东西、起名字，能读的内容都在文件里。
 * 课程是文件，所以能 cat；分类是目录，所以不能。
 *
 * 你可能好奇 cat 是怎么读到简介的，它难道去打开了课程页那个 .mdx 文件？没有，也打不开。
 * 这是个纯静态网站，你的浏览器根本碰不到仓库里的文件。
 * 简介是在构建网站的时候就被收集好、放进知识索引里的，cat 读的是那份索引。
 * “构建的时候收集，浏览的时候查询”，这是这个网站能做成纯静态的关键，后面很多地方都是这个套路。
 *
 * 后来树上多了一种文件：项目自己的源码模块。比如你 cd 到 /internals/core/terminal，再 cat command-engine，
 * 读到的是那个源文件顶部 @module 那一行。
 * 好玩的是，为了支持这个，cat 一个字都没改。因为它问文件系统要的一直是“这个文件的简介”，从来没问过“这门课的简介”。
 * 它只依赖课程和模块的共同点，所以来了一种新东西，它照样能读。
 *
 * 最后，cat 可以一次读好几个，读到一半有一个出错了，前面读好的照样显示，后面的也接着读，最后整体算失败。
 * 真 cat 也是这样：cat a nope b 会把 a 和 b 都打出来，中间夹一句 nope 找不到。
 */
import type { CommandDefinition, CommandResult } from "../command.ts";
import type { OutputBlock } from "../output.ts";
import { text } from "../output.ts";

export const catCommand: CommandDefinition = {
  name: "cat",
  pipeline: true,
  summary: "显示课程或源码模块的简介",
  usage: "cat <file> [...]",
  run(invocation, context): CommandResult {
    if (invocation.args.length === 0) {
      return { status: "error", blocks: [text("cat: missing operand", "error")], actions: [] };
    }

    const blocks: OutputBlock[] = [];
    let failed = false;
    for (const input of invocation.args) {
      const result = context.fileSystem.lookup(context.currentPath, input);
      if (!result.found) {
        failed = true;
        blocks.push(text(`cat: ${input}: ${result.reason}`, "error"));
      } else if (result.node.kind === "directory") {
        failed = true;
        blocks.push(text(`cat: ${input}: Is a directory`, "error"));
      } else {
        blocks.push(text(result.node.description));
      }
    }

    return { status: failed ? "error" : "ok", blocks, actions: [] };
  },
};
