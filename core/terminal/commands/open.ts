/**
 * @module        open 命令——请求让中间正文区打开课程、分类或源码讲解页
 * @problem       cat 适合快速读简介，但完整课程资源仍在正文页面；终端需要一种不直接依赖 Next 的跳转方式。
 *                而且想打开一门课时，读者脑子里记得的是"cs50x"，不是它挂在哪个分类下——
 *                如果非得先想起 programming-intro/cs50x 才能打开，终端就比点侧边栏还慢。
 * @design        open 先在虚拟文件系统中严格查找目标，找到就返回 navigate 动作。课程使用索引里的 url，
 *                分类使用统一的 /docs + 知识路径；命令本身不读取 window，也不调用路由器。
 *                路径找不到、而参数又不像路径（不含 /，不是 . .. ~）时，再按名字在全树里找课程和模块：
 *                只认完全相同的名字，恰好一个就打开，多个就列出候选，一个都没有就照原样报 Unix 的错。
 *                考虑过让 cd 也这样做，但 cd 是标准命令，它的行为要和真终端一致；open 本来就是本站定义的命令，
 *                在这里放宽不会教坏读者的肌肉记忆。
 * @courses       UC Berkeley CS61A（函数式核心与命令式外壳）；MIT Missing Semester（open 的命令行习惯、
 *                shell 如何在 PATH 里按名字找程序）；软件工程类课程（副作用边界）
 * @exercises     https://cs61a.org/ ; https://missing.csail.mit.edu/2020/course-shell/
 * @prereq        知道“返回一个动作描述”和“当场执行动作”是两件不同的事；知道终端里敲 ls 时，
 *                并没有写出 /bin/ls，是 shell 替你去几个地方找到了它。
 * @unclear       open 在不同 Unix 系统并不完全一致（macOS 有系统 open，Linux 常用 xdg-open）；
 *                本项目只定义站内知识节点，不接受外部网址或应用名。
 *                按名字找目前只覆盖课程和模块，不覆盖分类；分类名少且短，要不要加，等真的用着不顺手再说。
 *
 * @letter
 * 如果你只看页面效果，最直接的实现是在这里写 router.push。我们没有这么做，因为那会让一条课程命令
 * 永远绑在 Next 和浏览器上。现在 open 只回答“目标存在，我想去这个 href”，外层收到后才真正导航。
 * 测试因此可以检查意图而不需要启动浏览器，这就是“把副作用推到边界”的具体样子。
 *
 * 分类也能 open，是因为 ls 的每一项都承诺可点。若分类点不动，这份结构化列表就会对一半条目撒谎。
 * 所以分类网址由同一条规则生成，页面层再负责给没有 MDX 的分类显示一个最小目录页。
 *
 * 后来加上的“按名字找”，是作者自己用了一段时间之后提出来的：他想敲 cs50x 就打开 CS50x，
 * 却总被要求先说出它在 programming-intro 下面。这其实是真终端早就解决过的问题——
 * 你敲 ls 的时候没写 /bin/ls，shell 会沿着一张叫 PATH 的目录清单替你去找。
 * 这里做的是同一件事，只是“清单”换成了整棵课程树。
 *
 * 有三个地方是故意收紧的，你改它之前请先想想为什么：
 * 第一，先按路径找，找不到才按名字找。当前层有同名的东西时，你指的就是眼前那个，这和真终端一致。
 * 第二，只认完全相同的名字。敲 cs50 不会替你打开 cs50x——“你是不是想找……”会让人不再在意自己敲了什么，
 *       而这本教材希望你将来到了真终端里也敲得准。
 * 第三，同名的有好几个时，列出来让你选，绝不替你挑一个。源码里真有两个 layout，挑错了你都不知道自己看错了页。
 */
import type { CommandDefinition, CommandResult } from "../command.ts";
import { text } from "../output.ts";
import {
  ambiguousNameError,
  entriesNamed,
  lookupError,
  looksLikePath,
  knowledgePathToUrl,
  usageError,
} from "./shared.ts";

export const openCommand: CommandDefinition = {
  name: "open",
  summary: "打开课程、分类或源码讲解页；课程名和模块名在任何位置都能直接打开",
  usage: "open <path | name>",
  run(invocation, context): CommandResult {
    if (invocation.args.length === 0) {
      return { status: "error", blocks: [text("open: missing operand", "error")], actions: [] };
    }
    if (invocation.args.length > 1) return usageError("open", "open <path | name>");
    const input = invocation.args[0] ?? "";
    const result = context.fileSystem.lookup(context.currentPath, input);
    if (result.found) {
      const href = result.node.kind === "file" ? result.node.url : knowledgePathToUrl(result.path);
      return { status: "ok", blocks: [], actions: [{ type: "navigate", href, reason: "open" }] };
    }

    // 写成路径的，就是在说“就在这个位置”；没找到就是没有，不再去别处替他找。
    if (looksLikePath(input)) return lookupError("open", input, result);

    const named = entriesNamed(input, context);
    const matches = [...named.courses, ...named.modules];
    if (matches.length > 1) return ambiguousNameError("open", input, named);
    const match = matches[0];
    // 一个都没有时，报的还是按路径找失败的那句话——读者看到的错误和真终端一样。
    if (match === undefined) return lookupError("open", input, result);
    return { status: "ok", blocks: [], actions: [{ type: "navigate", href: match.url, reason: "open" }] };
  },
};
