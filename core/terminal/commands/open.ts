/**
 * @module        open 命令——请求让中间正文区打开课程或分类页面
 * @problem       cat 适合快速读简介，但完整课程资源仍在正文页面；终端需要一种不直接依赖 Next 的跳转方式。
 * @design        open 先在虚拟文件系统中严格查找目标，再返回 navigate 动作。课程使用索引里的 url，
 *                分类使用统一的 /docs + 知识路径；命令本身不读取 window，也不调用路由器。
 * @courses       UC Berkeley CS61A（函数式核心与命令式外壳）；MIT Missing Semester（open 的命令行习惯）；
 *                软件工程类课程（副作用边界）
 * @exercises     https://cs61a.org/ ; https://missing.csail.mit.edu/2020/course-shell/
 * @prereq        知道“返回一个动作描述”和“当场执行动作”是两件不同的事。
 * @unclear       open 在不同 Unix 系统并不完全一致（macOS 有系统 open，Linux 常用 xdg-open）；
 *                本项目只定义站内知识节点，不接受外部网址或应用名。
 *
 * @letter
 * 如果你只看页面效果，最直接的实现是在这里写 router.push。我们没有这么做，因为那会让一条课程命令
 * 永远绑在 Next 和浏览器上。现在 open 只回答“目标存在，我想去这个 href”，外层收到后才真正导航。
 * 测试因此可以检查意图而不需要启动浏览器，这就是“把副作用推到边界”的具体样子。
 *
 * 分类也能 open，是因为 ls 的每一项都承诺可点。若分类点不动，这份结构化列表就会对一半条目撒谎。
 * 所以分类网址由同一条规则生成，页面层再负责给没有 MDX 的分类显示一个最小目录页。
 */
import type { CommandDefinition, CommandResult } from "../command.ts";
import { text } from "../output.ts";
import { lookupError, knowledgePathToUrl, usageError } from "./shared.ts";

export const openCommand: CommandDefinition = {
  name: "open",
  summary: "打开课程或分类页面",
  usage: "open <path>",
  run(invocation, context): CommandResult {
    if (invocation.args.length === 0) {
      return { status: "error", blocks: [text("open: missing operand", "error")], actions: [] };
    }
    if (invocation.args.length > 1) return usageError("open", "open <path>");
    const input = invocation.args[0] ?? "";
    const result = context.fileSystem.lookup(context.currentPath, input);
    if (!result.found) return lookupError("open", input, result);
    const href = result.node.kind === "file" ? result.node.url : knowledgePathToUrl(result.path);
    return { status: "ok", blocks: [], actions: [{ type: "navigate", href, reason: "open" }] };
  },
};
