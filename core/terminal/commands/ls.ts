/**
 * @module        ls 命令——列出知识树当前位置直接包含的分类与课程
 * @problem       终端使用者看不到侧边栏时，需要用和真 Unix 相同的方式回答“这里有什么”。
 * @design        ls 只查询虚拟文件系统，输出保留每一项的名字、标题与可执行命令。
 *                可点击不是 React 写进命令，而是列表项携带一条绝对路径 open 命令，由界面决定是否画成按钮。
 * @courses       MIT Missing Semester（ls 与相对路径）；UC Berkeley CS61B（树的子节点遍历）；
 *                Stanford CS143 与 UCB CS164（结构化中间表示）
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/
 *                https://sp21.datastructur.es/materials/proj/proj2/proj2
 * @prereq        知道目录可以包含文件或下一层目录。
 * @unclear       这一阶段只实现 ls [path]，还没有 -a、-l、通配符和多个目标；知识树也没有隐藏项或权限位。
 *
 * @letter
 * 真终端的 ls 输出看起来只是一排名字，但这里不能把它们提前拼成一段文字。每一项将来要能被点击，
 * 所以命令交回的是“名字、说明、点击时等价执行什么”这三件仍有结构的信息。界面可以把它画成按钮，
 * 测试可以直接检查目标，命令本身却完全不知道按钮是什么。
 *
 * 点击命令使用完整路径，而不是只写孩子的名字。这样你先 ls，再 cd 到别处，回头点击旧输出时，
 * 它仍会打开当时列出的那一项，不会把同一个短名字误解到新目录下。保留上下文比省几个字符更重要。
 */
import type { CommandDefinition, CommandResult } from "../command.ts";
import { list } from "../output.ts";
import { lookupError, usageError } from "./shared.ts";

export const lsCommand: CommandDefinition = {
  name: "ls",
  summary: "列出当前位置的分类与课程",
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
        }))),
      ],
      actions: [],
    };
  },
};
