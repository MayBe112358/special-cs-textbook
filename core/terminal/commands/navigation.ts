/**
 * @module        pwd、tree、history、clear——四个“看看自己在哪、刚才干了啥”的小命令
 * @problem       在终端里走久了会迷路：我现在在哪？这一层底下都有什么？我刚才敲了哪条命令？屏幕太乱了怎么清掉？
 *                这四个问题每个都小，但少一个，终端用起来就不顺手。
 * @design        pwd 直接读上下文里的 currentPath（它是从网址算出来的），自己不存任何位置。
 *                tree 从起点递归往下走，交回一棵带层级的树（不是一段画好的文字），界面据此画出可折叠的目录树；
 *                -L 限制往下走几层。history 读终端外壳传进来的本次会话历史，可以只看最后 n 条。
 *                clear 不自己清任何东西，只交回一个 clear-screen 动作，由界面去清屏，命令历史原样保留。
 * @courses       MIT Missing Semester（shell 基础：pwd、history、clear；tree 这类小工具）；
 *                UC Berkeley CS61B（树的递归遍历）；UC Berkeley CS61A（递归；把副作用推到边界）；
 *                MIT 6.S081 / UC Berkeley CS162（当前工作目录是进程的一部分状态）
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/ —— 真终端里的 pwd、ls、cd
 *                https://missing.csail.mit.edu/2020/shell-tools/ —— 命令历史、目录导航小工具
 * @prereq        会 cd 和 ls；知道函数可以调用自己（递归）。
 * @unclear       pwd 接受 -L 和 -P，但两者结果一样：这棵树里没有符号链接，“逻辑路径”和“物理路径”没有区别。
 *                参数写错时报的都是 too many arguments，这句话不准：pwd -x 在 bash 里是 invalid option，
 *                tree -L 0 也不是参数太多，是层数不合法。这是共用的 usageError 只有一种说法造成的，还没改。
 *                history 只记这一次打开页面之后敲的命令，刷新就没了；真 shell 会把历史写进 ~/.bash_history。
 *
 * @letter
 * 这四个命令都很小，放一块儿说。
 *
 * 先说 pwd。你可能觉得它最简单，打印一下当前目录嘛。可问题是，“当前目录”存在哪儿？
 * 这个项目有条死规矩：当前位置只有一个真相，就是浏览器地址栏里的网址。
 * 所以 pwd 自己什么都不记，它念出来的那个路径，是外面从网址算好了递给它的。
 * 你用鼠标点侧边栏换了一页，网址变了，pwd 的答案跟着就变了，终端和鼠标永远对得上。
 * 这事儿在 core/terminal/location 那章细说。
 *
 * tree 值得多看两眼，因为它是这个文件里唯一用到递归的地方。
 * 里面那个 visit 函数干的事是：给我一个节点，我交回“这个节点 + 它所有孩子各自的 tree”。
 * 孩子的 tree 怎么来？还是调 visit。一直调到文件为止，文件没有孩子，递归就停了。
 * CS61A 讲递归时有个说法叫“递归的信仰之跃”（recursive leap of faith），这里就是个好例子：
 * 写 visit 的时候你只需要想清楚一层，剩下的层它自己会处理好。
 * 还有一点，tree 交回的是一棵真的树（每个节点带着 children），不是画好的那种 ├── └── 文字。
 * 所以界面能把每一枝做成可以折叠的，你点一下就收起来了。
 * 顺手试试：tree -L 1 | grep sys，树会被摊平成一行行交给 grep，筛完每行还能点。
 *
 * history 就是把你这次敲过的命令编上号列出来，history 2 只看最后两条。
 * 它记在终端外壳里，刷新页面就没了。真 shell 会把历史写到家目录的一个文件里，这里没这么做。
 *
 * 最后是 clear，它最容易被写错。
 * 很多人会顺手把清屏写成“把输出和历史一起清空”，那你清完屏按 ↑ 就翻不到刚才的命令了，挺烦人的。
 * 真终端里 clear 只擦屏幕，历史一条不少。
 * 这里 clear 连屏幕都不自己擦，它只交回一个“请清屏”的动作，外面的界面收到了再去擦。
 * 为啥绕这一下？因为命令引擎不许碰网页（这是 AGENTS.md 里的硬规矩），它能做的只有“说出想干什么”。
 */
import type { CommandDefinition, CommandResult } from '../command.ts';
import type { VfsNode } from '../../filesystem/virtual-file-system.ts';
import { text, type TreeItem } from '../output.ts';
import { lookupError, usageError } from './shared.ts';

export const pwdCommand: CommandDefinition = {
  name: 'pwd',
  summary: '显示当前目录',
  usage: 'pwd [-L|-P]',
  pipeline: true,
  // 当前位置由外面从网址算好传进来，pwd 只负责念出来。
  run: ({ args }, c) => (args.some((a) => a !== '-L' && a !== '-P') ? usageError('pwd', 'pwd [-L|-P]') : { status: 'ok', blocks: [text(c.currentPath)], actions: [] }),
};

export const historyCommand: CommandDefinition = {
  name: 'history',
  summary: '查看会话命令历史',
  usage: 'history [n]',
  pipeline: true,
  run: ({ args }, c) => {
    if (args.length > 1 || (args[0] !== undefined && !/^\d+$/.test(args[0]))) return usageError('history', 'history [n]');
    const history = c.history ?? [];
    // history n 只看最后 n 条，但编号仍然是它在整段历史里的编号，和 bash 一样。
    const start = args[0] === undefined ? 0 : Math.max(0, history.length - Number(args[0]));
    return { status: 'ok', blocks: history.slice(start).map((line, i) => text(`${start + i + 1}  ${line}`)), actions: [] };
  },
};

export const clearCommand: CommandDefinition = {
  name: 'clear',
  summary: '清屏，保留命令历史',
  usage: 'clear',
  // 不自己清屏，只交回一个“请清屏”的动作；命令历史不受影响。
  run: ({ args }) => (args.length ? usageError('clear', 'clear') : { status: 'ok', blocks: [], actions: [{ type: 'clear-screen' }] }),
};

export const treeCommand: CommandDefinition = {
  name: 'tree',
  summary: '可折叠的目录树',
  usage: 'tree [-L level] [path]',
  pipeline: true,
  run: ({ args }, c): CommandResult => {
    let depth = Infinity;
    let path = '.';
    let hasPath = false;
    for (let i = 0; i < args.length; i++) {
      const a = args[i]!;
      if (a === '-L') {
        // -L 后面必须跟一个正整数。
        const n = args[++i];
        if (!n || !/^\d+$/.test(n) || Number(n) < 1) return usageError('tree', 'tree [-L level] [path]');
        depth = Number(n);
      } else if (a.startsWith('-') || hasPath) {
        return usageError('tree', 'tree [-L level] [path]');
      } else {
        path = a;
        hasPath = true;
      }
    }

    const result = c.fileSystem.lookup(c.currentPath, path);
    if (!result.found) return lookupError('tree', path, result);

    // 递归：一个节点的树 = 它自己 + 每个孩子的树。到了 -L 规定的层数，目录就只留个空的 children。
    function visit(node: VfsNode, level: number): TreeItem {
      return {
        label: node.name || '/',
        command: `open ${node.path}`,
        ...(node.kind === 'directory' ? { children: level < depth ? c.fileSystem.childrenOf(node).map((child) => visit(child, level + 1)) : [] } : {}),
      };
    }
    return { status: 'ok', blocks: [{ type: 'tree', root: visit(result.node, 0) }], actions: [] };
  },
};
