/**
 * @module        Tab 补全——按一下 Tab，把命令名或路径的后半截补上
 * @problem       课程路径又长又是英文，/systems/operating-systems/mit-6-s081 这种东西没人愿意一个字母一个字母地敲，
 *                敲错一个字母 cd 就报错。真终端靠 Tab 解决这件事，这里也要有，而且手感要和真终端一样。
 * @design        做成一个纯函数：给它“整行字、光标在哪、你在哪个目录、有哪些命令”，它交回“补完后的整行字、
 *                新的光标位置、候选清单”。它不碰输入框，也不知道网页的存在，所以网页终端和首页的演示终端能共用它，
 *                测试里也能直接调。
 *                判断补什么只看光标前的最后一个词：这个词在行首（或紧跟在 | 后面）就是命令名，查命令表；
 *                在别处就是路径，把它从最后一个 / 切成“目录部分 + 半截名字”，去那个目录里找以半截名字开头的孩子。
 *                只有一个候选才替换；有好几个时一个字都不动，只把候选列出来。
 * @courses       UC Berkeley CS61B（字符串前缀查找；Trie 前缀树就是为“找出所有以某前缀开头的词”设计的）；
 *                MIT Missing Semester（shell 的补全与历史）；MIT 6.S081 / UC Berkeley CS162（路径名解析）；
 *                Stanford CS143 / UC Berkeley CS164（词法分析：先确定光标落在哪个词里）
 * @exercises     https://missing.csail.mit.edu/2020/shell-tools/ —— 在真 shell 里练补全、历史和 fzf 一类的查找工具
 *                https://sp21.datastructur.es/materials/lab/lab9/lab9 —— CS61B 的 Tries lab，补全背后那种数据结构
 * @prereq        会用 cd 和 ls；知道绝对路径和相对路径（读过 core/filesystem/virtual-file-system 那一章更好）。
 * @unclear       真 bash 遇到多个候选时，会先把它们共同的前缀补上（c 补到 c，cs6 补到 cs61），再按第二次 Tab 才列清单。
 *                这里只列清单、不补公共前缀，是第一版留下的行为，目前还没改。
 *                引号里的词不补全（grep 'cs 按 Tab 没反应）。真 bash 能补引号里的路径，这里没做，
 *                因为补完之后引号该不该闭合、闭在哪，处理不好会把你已经敲的东西弄坏。
 *                候选是逐个比较前缀找出来的，没有用 Trie。整棵树三百来个节点，而每次按 Tab 只扫当前那一层目录的孩子，
 *                最多的一层也只有十八个；为这点量先建一棵 Trie，建树的功夫比省下的还多。
 *
 * @letter
 * Tab 这个键你肯定天天按，但我猜你没想过它怎么知道该补什么。我写这个文件之前也没想过，写完发现挺简单的，就两件事。
 *
 * 头一件，看你光标前面那个词是命令还是路径。这个好判断：它前面还有别的词，那就是参数，是路径；前面啥都没有，那就是命令名。
 * 比如 cd pro，pro 前面有个 cd，所以它是路径；单敲一个 pw，那就是在敲命令。
 * 管道稍微绕一下：ls | gr 里，gr 前面明明有字，可紧挨着它的是根竖线，竖线后面是一条新命令，所以 gr 还算命令名。
 * 代码里那个正则 (?:^|[\s|]) 就是在说这个：一个词要么从行首开始，要么从空格后面、竖线后面开始。
 *
 * 第二件，如果是路径，去哪儿找候选。假设你站在 /programming-intro，敲了 cd ../ma。
 * 我从最后一个斜杠那儿切一刀，变成 ../ 和 ma 两半。前半截丢给虚拟文件系统，它说“这是根目录”；
 * 我就去根目录底下找名字以 ma 开头的，找到 mathematics，整行就变成了 cd ../mathematics/。
 * 你看，路径怎么解析这里一行都没写，全甩给了文件系统那一章的 lookup。
 * 好处是 cd 认的路径 Tab 一定也认，不会出现“能 cd 进去但 Tab 补不出来”这种怪事。
 *
 * 补完要不要加空格，这个细节我还挺喜欢的。目录补成 mathematics/，后面不加空格，因为你八成还要往里接着敲；
 * 文件补成 cs61a，后面加个空格，因为已经到底了，你下一步是敲别的参数或者直接回车。
 * bash 也是这样。不信你在自己电脑的终端里随便 cd 到哪儿按一下 Tab，目录名后面都跟着个 /。
 *
 * 然后说说候选不止一个的时候。你在根目录敲个 c 按 Tab，cd、cat、clear 三个都对得上。
 * 这时候我一个字都不改，就把三个列给你看。
 * 帮你挑一个行不行？行是行，可挑错一次你就得先删掉再重敲，挑错两次你就不想再按 Tab 了。
 * 这个项目不做“你是不是想输入 xxx”，也是同一个道理：命令行就是要你自己说清楚，它可以帮你少打几个字，但主意得你来拿。
 *
 * 对了，真 bash 在这种时候会先把几个候选的公共前缀补上，再按一次 Tab 才列清单。我这里没做，@unclear 里记着呢。
 *
 * 学过 CS61B 的话，你可能会嘀咕：找前缀不是该用 Trie 吗？确实是 Trie 的活儿。
 * 不过这里每次只在一层目录里找，最多的一层才十八个孩子，挨个比一遍比先建一棵 Trie 还快。
 * 哪天课程树长到几万个节点、按 Tab 开始卡了，你就回来把它换掉，这一章归你改。
 */
import type { SessionContext } from './command.ts';

export function completeLine(line: string, cursor: number, context: SessionContext, commands: readonly string[]) {
  const prefix = line.slice(0, cursor);
  // 光标前的最后一个词：从行首、空白或 | 之后开始，到光标为止。光标后面的字原样留着，不参与判断。
  const match = prefix.match(/(?:^|[\s|])([^\s|]*)$/);
  if (!match) return { value: line, cursor, candidates: [] as string[] };
  const word = match[1]!;
  const start = cursor - word.length;
  const before = prefix.slice(0, start);

  // 词里有引号或反斜杠，说明你正在写一个带引号的参数。补全可能破坏引号配对，所以干脆不动。
  if (/['"\\]/.test(word)) return { value: line, cursor, candidates: [] as string[] };

  let candidates: string[] = [];
  if (!before.trim() || before.trimEnd().endsWith('|')) {
    // 词在行首或管道后面：这是一个命令名。
    candidates = commands.filter((c) => c.startsWith(word));
  } else {
    // 否则是路径。systems/op 切成目录部分 systems/ 和半截名字 op。
    const slash = word.lastIndexOf('/');
    const base = slash < 0 ? '' : word.slice(0, slash + 1);
    const partial = word.slice(slash + 1);
    // 目录部分交给文件系统解析，和 cd 用的是同一个 lookup，所以 ..、~、绝对路径都自动支持。
    const found = context.fileSystem.lookup(context.currentPath, base || '.');
    if (found.found && found.node.kind === 'directory') {
      candidates = context.fileSystem
        .childrenOf(found.node)
        .filter((n) => n.name.startsWith(partial))
        // 目录带上结尾的 /，你按下一次 Tab 就能接着往里补。
        .map((n) => base + n.name + (n.kind === 'directory' ? '/' : ''));
    }
  }

  // 零个或多个候选：不改你的输入，只把候选交回去让终端列出来。
  if (candidates.length !== 1) return { value: line, cursor, candidates };

  // 唯一候选：目录后面不加空格（你多半还要往里走），文件和命令后面加一个空格。
  const replacement = candidates[0]! + (candidates[0]!.endsWith('/') ? '' : ' ');
  return { value: line.slice(0, start) + replacement + line.slice(cursor), cursor: start + replacement.length, candidates };
}
