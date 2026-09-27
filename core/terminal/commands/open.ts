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
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/ —— 真终端里 PATH 是什么、shell 怎么按名字找到程序
 *                https://cs61a.org/ —— CS61A 的作业里反复练“纯函数算结果、外层负责副作用”
 * @prereq        知道“返回一个动作描述”和“当场执行动作”是两件不同的事；知道终端里敲 ls 时，
 *                并没有写出 /bin/ls，是 shell 替你去几个地方找到了它。
 * @unclear       open 在不同 Unix 系统并不完全一致（macOS 有系统 open，Linux 常用 xdg-open）；
 *                本项目只定义站内知识节点，不接受外部网址或应用名。
 *                按名字找目前只覆盖课程和模块，不覆盖分类；分类名少且短，要不要加，等真的用着不顺手再说。
 *
 * @letter
 * open 就是“在正文区打开这一页”。要是只图省事，这里写一句 router.push 跳过去就完了。
 *
 * 我没这么写。因为那样的话，open 这条命令就永远离不开 Next 和浏览器了，想在 Node 里跑个测试都跑不起来。
 * 现在它只说一句“目标找到了，我想去这个网址”，外面收到了再去跳。
 * 测试只需要检查它想去的网址对不对，不用真打开浏览器。
 * 这就是 CS61A 里常说的“把副作用推到边界”：核心只算、不动手，动手的事留给最外面那一层。
 *
 * 分类也能 open，这是被 ls 逼出来的。ls 列出来的每一项都能点，要是分类点了没反应，那 ls 就是在对一半的条目撒谎。
 * 所以分类的网址也按同一条规则生成，页面那边再给没有正文的分类显示一个简单的目录页。
 *
 * 后来加了个“按名字找”，这个是作者自己用了一阵子提出来的。
 * 作者想敲 open cs50x 就打开 CS50x，结果每次都得先想起它在 programming-intro 底下。确实挺烦。
 * 其实真终端早就解决过这个问题：你敲 ls 的时候没写 /bin/ls 吧？shell 会顺着一张叫 PATH 的目录清单替你去找。
 * 这里干的是一样的事，只不过清单换成了整棵课程树。
 *
 * 不过有三个地方我故意收得很紧，你要改的话先想想为啥：
 *
 * 一是先按路径找，找不到才按名字找。你当前目录里就有一个同名的，那你说的肯定是眼前这个，真终端也是这么认的。
 *
 * 二是名字得一模一样。敲 open cs50 不会帮你打开 cs50x。
 * “你是不是想找……”这种贴心，会让人慢慢不在意自己敲的是什么，到了真终端里就吃亏了。
 *
 * 三是撞名了就列出来让你挑，绝不替你挑。源码里有五个文件都叫 layout，替你挑一个，挑错了你都不知道自己看的是哪页。
 *
 * 还有一点你可能会好奇：cd 为什么不也这样放宽？
 * 因为 cd 是标准命令，它得跟真终端一模一样，你在这儿练出来的手感才能带走。
 * open 是这个网站自己定义的命令，在它身上放宽一点，不会教坏你的肌肉记忆。
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

    // 写成路径的，就是在说“就在这个位置”；没找到就是没有，不再去别处替读者找。
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
