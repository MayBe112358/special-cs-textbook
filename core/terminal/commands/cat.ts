/**
 * @module        cat 命令——在终端里显示课程或源码模块的简介
 * @problem       读者有时只想快速看一门课是什么，不值得为一句简介离开当前页面。
 * @design        课程在虚拟文件系统里是文件，description 就是它可读的内容；分类是目录，按 Unix 的方式拒绝 cat。
 *                支持依次读取多个目标，和真 cat 可以连接多个文件的基本行为一致。
 * @courses       MIT Missing Semester（cat 与标准输出）；MIT 6.S081 与 UCB CS162（文件和目录是不同节点）；
 *                UC Berkeley CS61A（遍历输入并汇总结构化结果）
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/
 *                https://pdos.csail.mit.edu/6.S081/2021/labs/fs.html
 * @prereq        知道 cat 在真终端里把文件内容打印到屏幕。
 * @unclear       这里的“文件内容”是索引里那句简介：课程读它 frontmatter 里的 description，
 *                源码模块读它注释块里 @module 那一行。都不是整篇正文——整篇正文在网页上，用 open 打开。
 *                真 cat 会把整个文件倒出来，这里没有，因为终端那一小块地方装不下一封信。
 *                将来如果要 cat 出更多（比如只读 @problem 那一段），得先想清楚参数怎么写，别急着加选项。
 *
 * @letter
 * 这条命令故意把课程当文件、分类当目录。于是 cat cs61a 能读到简介，而 cat systems 会收到 Is a directory。
 * 这不只是模仿一句报错：它在教同一个边界——目录负责组织名字，文件才承载可读内容。
 *
 * 注意 cat 没去磁盘打开 MDX。浏览器里的静态网站根本拿不到仓库文件系统；构建阶段已经把允许公开的简介
 * 放进知识索引，命令只读那份结构化数据。把“构建时收集”和“运行时查询”分开，网站才能留在纯静态部署里。
 *
 * 从 ROADMAP 阶段 5 起，树上多了一种文件：项目自己的源码模块。cat command-engine 读到的，
 * 是那个源文件顶部注释里 @module 的那一行。这条命令一个字都没改就支持了它——
 * 因为它问文件系统要的一直是“这份文件的简介”，而不是“这门课的简介”。
 * 一个只依赖共同点的命令，遇到新种类的东西时不用跟着改，这就是抽象最实在的好处。
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
