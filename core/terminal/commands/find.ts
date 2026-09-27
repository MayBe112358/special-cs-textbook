/**
 * @module        find——从一个位置往下，把整棵子树翻一遍，挑出符合条件的课程和模块
 * @problem       侧边栏一次只能展开一层，ls 也只看一层。可你常想问跨好几层的问题：
 *                “系统这一支下面，名字里带 6 的课有哪些？”“我在学的课都在哪？”“哪些课把 CS61A 当先修？”
 *                这种问题得把整棵子树都翻一遍才答得上来。
 * @design        从起点开始深度优先走遍每个节点，每个节点拿所有条件挨个试，全过的才留下（条件之间是“并且”）。
 *                -name、-path、-type 照 GNU find 的意思来：-name 只看名字，-path 看从起点开始拼出来的整条路径，
 *                -type f/d 分文件和目录；-name 和 -path 支持 * 和 ? 两种通配符。
 *                -status 和 -prereq 是本站自己加的（按你的学习状态筛、按先修课筛），help 里标明了是扩展。
 *                输出是可点的列表，每一行带着 open 命令，接 grep 之后照样能点。
 * @courses       MIT Missing Semester（find 与通配符）；UC Berkeley CS61B（树的深度优先遍历）；
 *                UC Berkeley CS186 / CMU 15-445（多个条件取交集的查询，相当于 WHERE a AND b）；
 *                Stanford CS143 / UC Berkeley CS164（把通配符翻译成正则表达式）
 * @exercises     https://missing.csail.mit.edu/2020/shell-tools/ —— “Finding files” 一节，在真终端里练 find
 *                https://15445.courses.cs.cmu.edu/fall2024/homework1/ —— 用 SQL 写带多个条件的查询
 * @prereq        会 cd、ls；知道 * 在命令行里表示“任意几个字符”。
 * @unclear       只支持上面五个条件，而且只能是“并且”；GNU find 的 -o（或）、!（非）、括号、-exec 都没有。
 *                -status 和 -prereq 在真终端里不存在，别拿去系统里敲。
 *                不写起点时，路径是以 ./ 开头显示的（真 find 也这样），所以 find -path '/systems/*' 什么都找不到，
 *                得写 find / -path '/systems/*'，或者 find -path './systems/*'。
 *
 * @letter
 * find 大概是这个终端里“鼠标做不到”最明显的一个命令。你试试这几条：
 *
 *     find systems -name '*6*' -type f
 *     find / -prereq cs61a
 *     find -status learning
 *
 * 第一条是“系统这一支底下，名字里带 6 的课”；第二条是“哪些课把 CS61A 当先修”；
 * 第三条是“我现在在学哪几门”。用侧边栏的话，你得一个一个分类点开，挨个看过去。
 *
 * 做法说穿了很朴素：从起点开始，把底下每个节点都走一遍，每个都拿条件试一下，合格的留下。
 * 代码里那个 visit 就是在走：先看自己合不合格，然后是目录的话，挨个钻进孩子里接着看。
 * 这叫深度优先遍历，CS61B 讲树的时候一定会讲。
 *
 * 条件之间是“并且”的关系，全都满足才留下。学数据库的时候你会发现这就是 SQL 里的 WHERE a AND b。
 *
 * 有个小坑我特意照着真 find 留下了：不写起点的时候，列出来的路径是以 ./ 开头的。
 * 所以你敲 find -path '/systems/*' 会啥都找不到，因为它看到的路径长这样：./systems/...，对不上 /systems/*。
 * 真 find 也是这样，你在自己电脑上敲 find . -name '*.txt'，出来的一行行也都带着 ./。
 * 我没有替你把它“修”掉，因为到了真终端你还是会遇到它，不如现在就习惯。
 *
 * 再说说那个 glob 函数。你敲的 *6* 是通配符，不是正则表达式。
 * 我把它一个字一个字翻成正则：* 变成 .*，? 变成 .，其他在正则里有特殊含义的符号（比如点）前面加个反斜杠，
 * 让它老老实实当普通字符。最后前后套上 ^ 和 $，意思是“整个名字都得对上”，而不是名字里某一段对上就行。
 * 所以 -name 'cs6*' 能找到 cs61a，-name '6*' 就找不到，因为 cs61a 不是以 6 开头的。
 *
 * 最后，-status 这个条件一次查询里用了两份数据：课程树是公开的，学习状态是你浏览器里自己的。
 * find 把两边拿来一起看，但它只读不写，两份数据还是各存各的，谁也不会混进谁那里。
 */
import type { CommandDefinition, CommandResult } from '../command.ts';
import type { VfsNode } from '../../filesystem/virtual-file-system.ts';
import { list, text, type ListItem } from '../output.ts';
import { lookupError } from './shared.ts';

// 把通配符翻译成正则：* → .*，? → .，其余正则特殊字符前面加反斜杠，前后加 ^ $ 要求整个名字都对上。
function glob(pattern: string): RegExp {
  let source = '';
  for (const char of pattern) {
    if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    // String.fromCharCode(92) 就是反斜杠。
    else if ('.+^${}()|[]'.includes(char) || char.charCodeAt(0) === 92) source += String.fromCharCode(92) + char;
    else source += char;
  }
  return new RegExp('^' + source + '$');
}

export const findCommand: CommandDefinition = {
  name: 'find',
  summary: '递归查找；-status/-prereq 是本站扩展',
  usage: 'find [path] [-name pattern] [-path pattern] [-type f|d] [-status todo|learning|done|unmarked] [-prereq course]',
  pipeline: true,
  run: ({ args }, c): CommandResult => {
    // 第一个参数不以 - 开头的话，它是起点；否则起点就是当前目录。
    const options = new Map<string, string>();
    let start = '.';
    let i = 0;
    if (args[0] && !args[0].startsWith('-')) {
      start = args[0];
      i++;
    }
    // 剩下的参数必须两个一组：条件名、条件值。
    for (; i < args.length; i++) {
      const key = args[i]!;
      const value = args[++i];
      if (!['-name', '-path', '-type', '-status', '-prereq'].includes(key) || value === undefined) {
        return { status: 'error', blocks: [text(`find: invalid predicate: ${key}`, 'error')], actions: [] };
      }
      options.set(key, value);
    }
    if (options.has('-type') && !['f', 'd'].includes(options.get('-type')!)) {
      return { status: 'error', blocks: [text('find: invalid argument to -type', 'error')], actions: [] };
    }
    if (options.has('-status') && !['todo', 'learning', 'done', 'unmarked'].includes(options.get('-status')!)) {
      return { status: 'error', blocks: [text('find: invalid argument to -status', 'error')], actions: [] };
    }

    const found = c.fileSystem.lookup(c.currentPath, start);
    if (!found.found) return lookupError('find', start, found);

    const names = options.has('-name') ? glob(options.get('-name')!) : null;
    const paths = options.has('-path') ? glob(options.get('-path')!) : null;
    const rows: ListItem[] = [];

    // 深度优先：先判断自己，再挨个钻进孩子。display 是从起点拼出来的路径，-path 比的就是它。
    function visit(node: VfsNode, display: string) {
      const course = node.kind === 'file' && node.source.kind === 'course' ? node.source.course : null;
      // 没标过状态的课算 unmarked；不是课程的节点没有状态。
      const state = course ? (c.progress.find((p) => p.course === course.id)?.state ?? 'unmarked') : null;
      const passes =
        (!names || names.test(node.name)) &&
        (!paths || paths.test(display)) &&
        (!options.has('-type') || options.get('-type') === (node.kind === 'directory' ? 'd' : 'f')) &&
        (!options.has('-status') || state === options.get('-status')) &&
        (!options.has('-prereq') || course?.prereq?.courses.includes(options.get('-prereq')!));
      if (passes) rows.push({ label: display, description: node.title, command: `open ${node.path}` });
      if (node.kind === 'directory') {
        for (const child of c.fileSystem.childrenOf(node)) visit(child, display.replace(/\/$/, '') + '/' + child.name);
      }
    }

    // 起点怎么写就怎么显示（. 就显示成 ./xxx），和真 find 一致；~ 显示成 /。
    visit(found.node, start === '~' ? '/' : start.replace(/\/$/, '') || '/');
    return { status: 'ok', blocks: [list(rows)], actions: [] };
  },
};
