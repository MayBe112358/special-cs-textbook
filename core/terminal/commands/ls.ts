/**
 * @module        ls 命令——列出知识树当前位置直接包含的分类、课程和源码模块
 * @problem       终端使用者看不到侧边栏时，需要用和真 Unix 相同的方式回答“这里有什么”。
 * @design        ls 只查询虚拟文件系统，输出保留每一项的名字、标题与可执行命令。
 *                可点击不是 React 写进命令，而是列表项携带一条绝对路径 open 命令，由界面决定是否画成按钮。
 * @courses       MIT Missing Semester（ls 与相对路径）；UC Berkeley CS61B（树的子节点遍历）；
 *                Stanford CS143 与 UCB CS164（结构化中间表示）
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/ —— 在真终端里练 ls、cd 和相对路径
 *                https://sp21.datastructur.es/materials/proj/proj2/proj2 —— CS61B Gitlet，也是用树组织“目录里有什么”
 * @prereq        知道目录可以包含文件或下一层目录。
 * @unclear       只有 ls [path] 这一种用法：没有 -a、-l，没有通配符，一次也只能列一个目标。
 *                知识树里没有隐藏文件和权限，所以 -a、-l 就算做了也没什么可显示的。
 *                找不到时的报错学的是 zsh 里 cd 的格式；真 ls 在 bash 里说的是 ls: cannot access 'nope': No such file or directory。
 *
 * @letter
 * ls 你肯定熟：看看这儿都有啥。它在这个终端里多了一个本事，列出来的每一项都能点。
 *
 * 能点这件事，ls 自己其实一点都不知道。它从头到尾没碰过按钮，也不知道网页长什么样。
 * 它只是给每一项多带了一句话：“要是有人点我，就当对方敲了 open /xxx”。
 * 界面拿到这句话，觉得可以画成按钮，就画成按钮了。测试拿到它，直接比对这句话对不对就行，都不用开浏览器。
 * 命令只管说清楚“点了该干啥”，怎么画交给界面，这是整个终端的套路，后面每个命令都这么干。
 *
 * 有个小细节你可能不会注意：点击用的是完整路径，不是只写个名字。
 * 想象一下，你在 /programming-intro 里 ls，看到 cs61a；然后 cd 到了 /mathematics；
 * 这时候你往上翻，点刚才那个 cs61a。
 * 如果点击命令只写了 open cs61a，它会在 /mathematics 底下找 cs61a，当然找不到。
 * 写成 open /programming-intro/cs61a，不管你后来跑到哪儿，点它都能打开当时列出来的那一项。
 * 多写几个字，换来的是旧输出永远靠谱。
 *
 * 还有两个和真 ls 一样的地方，顺手说一下。
 * ls 后面跟一个文件而不是目录，比如 ls programming-intro/cs61a，它就只列这个文件自己。
 * 路径不存在的话，报的是 ls: no such file or directory: nope。这句话的格式是照着 zsh（macOS 默认的那个 shell）里 cd 报错的样子写的，
 * 整个终端的“找不到”都统一成这一种说法，在 shared 那章里定的。
 */
import type { CommandDefinition, CommandResult } from "../command.ts";
import { list } from "../output.ts";
import { lookupError, usageError } from "./shared.ts";

export const lsCommand: CommandDefinition = {
  name: "ls",
  pipeline: true,
  summary: "列出当前位置下有什么",
  usage: "ls [path]",
  run(invocation, context): CommandResult {
    if (invocation.args.length > 1) return usageError("ls", "ls [path]");
    const input = invocation.args[0] ?? ".";
    const result = context.fileSystem.lookup(context.currentPath, input);
    if (!result.found) return lookupError("ls", input, result);

    const nodes = result.node.kind === "directory"
      ? context.fileSystem.childrenOf(result.node)
      : [result.node];

    return {
      status: "ok",
      blocks: [
        list(nodes.map((node) => ({
          label: node.name || "/",
          description: node.title,
          command: `open ${node.path}`,
          kind: node.kind,
        }))),
      ],
      actions: [],
    };
  },
};
