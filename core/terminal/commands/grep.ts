/**
 * @module        grep——从上一条命令的结果里，只留下匹配的那些
 * @problem       ls、find、search 一出来就是一长串，你只想要其中几行。
 *                而且筛完以后，留下的那几行最好还能点，不然筛得再准也还得手抄路径。
 * @design        filterBlocks 按输出块的种类分别筛：纯文字按换行拆成一行行来筛；列表按“标签 + 说明”筛，
 *                匹配就把原来那个条目对象整个留下（open 命令也就跟着留下了）；树先摊平成一行行再筛。
 *                匹配规则照 GNU grep：默认是基础正则（BRE），( ) + ? | { } 都是普通字符，前面加反斜杠才有特殊含义；
 *                -E 是扩展正则（ERE），反过来；-F 完全按字面匹配；-i 不分大小写；-v 反过来留下不匹配的。
 *                翻译好的正则交给 JavaScript 的 RegExp 去跑。为了不让一个写坏的正则把浏览器卡死，
 *                反向引用、POSIX 字符类这类不支持的写法直接报错，看着像“嵌套重复”的模式也直接拒绝。
 *                后面跟文件名时（grep Python programming-intro/cs61a），筛的是那门课的一句话简介。
 * @courses       MIT Missing Semester（数据整理：grep、正则、管道）；
 *                Stanford CS143 / UC Berkeley CS164（正则表达式与有限自动机）；MIT 6.045J / UC Berkeley CS172（正则语言）；
 *                UC Berkeley CS61A（高阶函数：filter 接收一个“判断函数”）；Stanford CS155 / UC Berkeley CS161（正则拒绝服务 ReDoS）
 * @exercises     https://missing.csail.mit.edu/2020/data-wrangling/ —— 用 grep、sed、正则整理数据
 *                https://regexone.com/ —— 不是课程作业，但 Missing Semester 在这一讲里推荐了它，用来练正则
 * @prereq        知道管道是把左边的结果交给右边；见过 . 和 * 在正则里的意思更好。
 * @unclear       只支持 -i -v -F -E 四个选项，GNU grep 的 -n -c -o -r -w 这些都没有。
 *                防卡死的检查很粗糙：只要出现两个 .*，比如 '.*x.*'，就会被当成“太复杂”拒绝，其实这个模式完全没问题。
 *                正经的办法是换一个保证线性时间的正则引擎（比如 RE2 那种），这里没做。
 *                基础正则和扩展正则的翻译只处理了常见的几个符号，不保证和 GNU grep 在所有边角情况下一致。
 *
 * @letter
 * 先看 grep 在这个终端里最常干的事：
 *
 *     ls | grep -E 'math|web'
 *
 * ls 列出根目录下十几个分类，grep 只留下名字里带 math 或 web 的三个。重点是，留下的这三行你还能点。
 *
 * 能点，是因为 grep 压根没把它们当字看。ls 交过来的是一个列表，每个条目是个小对象，里面有名字、说明、点了以后执行什么。
 * grep 看的是名字加说明，觉得匹配，就把整个对象原封不动地留下来。对象里的 open 命令自然也在。
 * 用 CS61A 的话说，这就是个 filter：给它一个“判断留不留”的函数，它帮你过一遍列表。
 *
 * 然后是正则的两种方言，这个挺容易把人绕晕。你试试这两条：
 *
 *     ls | grep 'math\|web'
 *     ls | grep -E 'math|web'
 *
 * 结果一样。不加 -E 的时候，竖线是个普通字符，得写成 \| 才表示“或”；加了 -E，竖线直接就是“或”。
 * 括号、加号、问号、大括号也是这样。这是 GNU grep 的老规矩，一个叫基础正则（BRE），一个叫扩展正则（ERE）。
 * 为啥要搞两套？历史原因，早年的 grep 就是这么定的，后来想改也改不动了，只好加了个 -E。
 * 我在翻译的时候照着这套规矩来，这样你在这儿养成的习惯，拿到真终端里也能用。
 *
 * 再说说为什么有些正则我直接拒绝。你试试 grep -E '(a+)+'，它会报 pattern too complex。
 * 这种“重复里面套重复”的写法，碰到某些特定的字符串时，JavaScript 的正则引擎会开始疯狂试各种拆法，
 * 试的次数随字符串长度指数级增长，页面就卡死了。这个现象有个名字叫 ReDoS，正则拒绝服务，安全课里会讲。
 * 我的防法很土：看着像嵌套重复的就不让跑。
 * 土到什么程度呢？'.*x.*' 这种完全没问题的写法也会被误伤。@unclear 里记着，等你学完自动机理论，可以回来把它改聪明点。
 * 有意思的是，同样是 '(a+)+'，不加 -E 就能跑：在基础正则里括号和加号都是普通字符，它只是在找“(a+)+”这五个字。
 */
import type { CommandDefinition, CommandResult } from '../command.ts';
import { list, text, type OutputBlock, type ListItem, type TreeItem } from '../output.ts';

// 按输出块的种类筛选。accept 是“这一行留不留”的判断函数。
export function filterBlocks(blocks: readonly OutputBlock[], accept: (value: string) => boolean): OutputBlock[] {
  const out: OutputBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'text') {
      // 纯文字：按换行拆开，一行一行地筛。
      for (const line of block.text.split('\n')) if (accept(line)) out.push({ ...block, text: line });
    } else if (block.type === 'list') {
      // 列表：看标签加说明，留下的是原来那个条目对象，open 命令也跟着留下。
      out.push(list(block.items.filter((item) => accept(item.label + (item.description ? ' ' + item.description : '')))));
    } else {
      // 树：先摊平成一行一行，再筛。筛完就不再是树了，变成一个列表。
      const rows: ListItem[] = [];
      const walk = (item: TreeItem) => {
        if (accept(item.label)) rows.push({ label: item.label, command: item.command });
        item.children?.forEach(walk);
      };
      walk(block.root);
      out.push(list(rows));
    }
  }
  return out;
}

export const grepCommand: CommandDefinition = {
  name: 'grep',
  summary: '筛选管道结果或文件简介',
  usage: 'grep [-i] [-v] [-F|-E] [--] pattern [file ...]',
  pipeline: true,
  run: ({ args }, c): CommandResult => {
    // 先读选项。-iv 这种合在一起的写法也认；-- 表示“后面的都不是选项了”。
    let insensitive = false;
    let invert = false;
    let fixed = false;
    let extended = false;
    let i = 0;
    for (; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === '--') {
        i++;
        break;
      }
      if (!arg.startsWith('-') || arg === '-') break;
      for (const flag of arg.slice(1)) {
        if (flag === 'i') insensitive = true;
        else if (flag === 'v') invert = true;
        else if (flag === 'F') fixed = true;
        else if (flag === 'E') extended = true;
        else return { status: 'error', blocks: [text(`grep: invalid option -- ${flag}`, 'error')], actions: [] };
      }
    }

    const pattern = args[i++];
    if (pattern === undefined) return { status: 'error', blocks: [text('grep: missing pattern', 'error')], actions: [] };

    let match: (s: string) => boolean;
    try {
      if (fixed) {
        // -F：纯字面匹配，不用正则。
        const needle = insensitive ? pattern.toLowerCase() : pattern;
        match = (s) => (insensitive ? s.toLowerCase() : s).includes(needle);
      } else {
        // 不支持的写法直接拒绝：反向引用 \1、POSIX 字符类 [[:alpha:]]、JavaScript 专有的 (?...)。
        if (pattern.length > 200 || /\\[1-9]|\[\[:|\(\?/.test(pattern)) throw new Error('unsupported regular expression; use -F for literal text');

        // 把 GNU 的正则翻译成 JavaScript 的正则。
        // 基础正则（默认）里 ( ) + ? | { } 是普通字符、加反斜杠才特殊，正好和 JavaScript 反过来，所以要翻转一下。
        let source = '';
        let bracket = false; // 在 [...] 里面时，这些符号本来就是普通字符，不用翻转
        for (let j = 0; j < pattern.length; j++) {
          const char = pattern[j]!;
          if (char === '\\') {
            const next = pattern[++j];
            if (next === undefined) throw new Error('trailing backslash');
            source += !extended && '()+?|{}'.includes(next) ? next : '\\' + next;
            continue;
          }
          if (char === '[') bracket = true;
          if (char === ']') bracket = false;
          source += !extended && !bracket && '()+?|{}'.includes(char) ? '\\' + char : char;
        }

        // 限制嵌套重复，避免读者输入让浏览器长时间卡住。
        if (/\([^)]*[+*][^)]*\)[+*{]|\.\*.*\.\*/.test(source)) throw new Error('pattern too complex');
        const re = new RegExp(source, insensitive ? 'i' : '');
        match = (s) => re.test(s);
      }
    } catch (error) {
      return { status: 'error', blocks: [text(`grep: ${error instanceof Error ? error.message : 'invalid pattern'}`, 'error')], actions: [] };
    }

    // 默认筛上一条命令交过来的结果；后面跟了文件名的话，改成筛那些文件的简介（- 表示管道输入）。
    let blocks: readonly OutputBlock[] = c.stdin ?? [];
    if (i < args.length) {
      const files: OutputBlock[] = [];
      for (const input of args.slice(i)) {
        if (input === '-') {
          files.push(...(c.stdin ?? []));
          continue;
        }
        const f = c.fileSystem.lookup(c.currentPath, input);
        if (!f.found || f.node.kind === 'directory') {
          return { status: 'error', blocks: [text(`grep: ${input}: ${f.found ? 'Is a directory' : f.reason}`, 'error')], actions: [] };
        }
        files.push(text(f.node.description));
      }
      blocks = files;
    }
    return { status: 'ok', blocks: filterBlocks(blocks, (s) => (invert ? !match(s) : match(s))), actions: [] };
  },
};
