/**
 * @module        命令行语法——把你敲的一整行字，切成“哪几条命令、每条命令带哪些参数”
 * @problem       最省事的做法是按空格切开，第一个词当命令名。可是 grep 'operating systems' 里的空格不该切，
 *                grep 'a|b' 里的竖线也不是管道。只按空格和竖线切，你用引号想表达的意思就丢了。
 *                总得有人一个字一个字地读，边读边记住“我现在在不在引号里”，才能知道眼前这个空格算不算数。
 * @design        一遍扫描，每次读一个字符。要记住的东西只有四样：当前是哪种引号（没有、单引号、双引号）、
 *                正在拼的这个词、这条命令已经拼好的词、整条管道已经拼好的命令。
 *                规则照 bash 的来：单引号里的一切都是字面文字；双引号里反斜杠只对 $ ` " \ 和换行起作用，
 *                对别的字符原样保留；引号外面的反斜杠让下一个字符变成普通文字。
 *                整行读完、确认没有语法错误之后才交出结果；只要有一处错（引号没闭合、管道一端是空的、
 *                用了不支持的 ; & < > 这些符号），就抛出一句错误，一条命令都不交出去。
 *                它只负责切，不认识任何具体命令，command-engine 拿到结果后再去查命令表。
 * @courses       UC Berkeley CS61A（解释器项目的第一步：把输入切成 token）；
 *                Stanford CS143 / UC Berkeley CS164（词法分析、有限状态自动机）；
 *                MIT 6.045J / UC Berkeley CS172（有限自动机与正则语言）；
 *                MIT Missing Semester（shell 的引号与转义）；MIT 6.S081（xv6 shell 的解析）
 * @exercises     https://cs61a.org/ —— CS61A 当前学期主页：解释器单元的项目在学期后半发布（2026 秋季起改用 Gleam 写，不再是 Scheme）
 *                https://www.composingprograms.com/pages/34-interpreters-for-languages-with-combination.html —— CS61A 官方教材 3.4 节：一个计算器语言的解释器，读入—求值的完整例子
 *                https://pdos.csail.mit.edu/6.S081/2021/labs/util.html —— xv6 工具 lab，读 sh.c 能看到真 shell 怎么切命令行
 *                https://missing.csail.mit.edu/2020/course-shell/ —— 引号、空格和转义在真 shell 里的样子
 * @prereq        知道字符串可以按下标一个字符一个字符地读；在终端里用过带空格的参数。
 * @unclear       这不是完整的 shell。变量（$HOME 会原样当作文字）、重定向（> 和 <）、命令替换（`...` 和 $(...)）、
 *                分号和 && 串联、后台任务 & 都没有：前几种直接报 unsupported operator，$ 则被当成普通字符。
 *                行尾多一根竖线（ls |）在真 bash 里不会报错，它会换一行等你把后半条命令敲完；
 *                这里的终端一次只收一行，所以直接报 syntax error。
 *                错误信息只是模仿 bash 的写法，没有逐字对齐（bash 里 token 两边是反引号和单引号，这里两边都是单引号）。
 *
 * @letter
 * 这章很短，可你在终端里敲的每一行字，都得先过它这一关。
 *
 * 先来个小实验，打开你电脑上的终端试试：
 * 敲 echo a    b（中间多敲几个空格），出来的是 a b，空格被挤成一个了；
 * 再敲 echo 'a    b'，这回空格一个都没少。
 * 差别就在那对引号上。在引号外面，空格是用来分开两个参数的；在引号里面，空格就只是个空格。
 * 所以同样是读到一个空格，我得先知道自己在不在引号里，才知道拿它怎么办。
 *
 * 代码里那个 quote 变量就是干这个的。它只有三种值：空的（不在引号里）、单引号、双引号。
 * 每读一个字符，先瞄一眼 quote，再决定这个字符算什么。
 * 这种“揣着一点小记忆，一个字一个字往前读”的东西，学编译原理（CS143、CS164）的时候会听到一个挺吓人的名字，叫有限状态自动机。
 * 其实你看这个文件就知道了，拆开来就是一个 for 循环套几个 if，没什么玄乎的。
 *
 * 单引号和双引号为啥还不一样？这是 bash 定的规矩，我照着搬过来的。
 * 单引号最死板，里面什么都不特殊，反斜杠就是反斜杠。
 * 双引号松一点，反斜杠只在 $ ` " \ 这几个字符前面才管用，放在别的字母前面就原样留着。
 * 所以 grep "\n" 拿到的是反斜杠加一个 n，两个字符，不是换行。这个坑挺多人用了好几年 shell 都没踩明白。
 * 想自己核对的话，终端里 man bash，然后敲 /QUOTING 跳过去，规则都在那一节。
 *
 * 有个小变量你可能会觉得多余：started。它是为了 grep '' 这种写法准备的。
 * 引号里啥都没有，可它确实是一个参数，一个空字符串。
 * 要是只看 word 是不是空来决定收不收这个词，这个空参数就被悄悄吞掉了。
 * 所以我另外记一笔“这个词开过头没有”，碰到引号就算开过头，哪怕里面一个字都没有。
 *
 * 最后说说为什么非要整行读完才交结果。
 * 你想啊，要是我边读边执行，你敲了 mark cs61a done | grep 'x，后面少了个引号。
 * 读到竖线的时候，前半条 mark 已经把你的学习状态改掉了，然后后半条才报错。
 * 你看到一句 syntax error，心想“哦没执行”，其实数据早就动过了。
 * 整行先解析完、有错就一条都不跑，这样“报错”就真的等于“什么都没做”。
 * command-engine 执行前还会把每个命令名再查一遍，也是这个意思。
 *
 * 要是你做过 CS61A 的解释器项目（以前用 Scheme，2026 秋季起换成了 Gleam），会觉得这一步很眼熟：那边也是先把输入切成一个个 token，再交给后面去求值。
 * 看完这章，顺着去读 command-engine 吧，看看切好的命令接下来是怎么被跑起来的。
 */
import type { CommandInvocation } from './command.ts';

export function parsePipeline(line: string): CommandInvocation[] {
  const pipeline: CommandInvocation[] = []; // 整条管道里已经拼好的命令
  let words: string[] = []; // 当前这条命令已经拼好的词
  let word = ''; // 正在拼的词
  let started = false; // 当前这个词开始过没有。'' 是一个空字符串参数，不能因为 word 为空就丢掉它
  let quote = ''; // 当前在哪种引号里：'' 表示不在引号里，否则是 ' 或 "

  // 一个词拼完了（遇到空白或竖线），把它收进 words。
  const flush = () => {
    if (started) {
      words.push(word);
      word = '';
      started = false;
    }
  };
  // 一条命令拼完了（遇到竖线或行尾），第一个词是命令名，其余是参数。
  const finish = () => {
    flush();
    // 竖线前面什么都没有，比如 | ls 或 ls | | grep x。
    if (!words.length) throw new Error("syntax error near unexpected token '|'");
    pipeline.push({ name: words[0]!, args: words.slice(1) });
    words = [];
  };

  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;

    // 单引号里：除了用来收尾的那个单引号，什么都是普通文字，反斜杠也不例外。
    if (quote === "'") {
      if (c === "'") quote = '';
      else word += c;
      continue;
    }

    // 反斜杠：让紧跟着的下一个字符失去特殊含义。
    if (c === '\\') {
      const next = line[++i];
      if (next === undefined) throw new Error('syntax error: trailing escape');
      // 双引号里，反斜杠只转义这几个字符；放在别的字符前面时，反斜杠自己也要留下来。
      if (quote === '"' && !['$', '`', '"', '\\', '\n'].includes(next)) word += '\\';
      // 反斜杠加换行是“续行”，两个字符都不留。
      if (next !== '\n') word += next;
      started = true;
      continue;
    }

    // 双引号里：遇到收尾的双引号就出来，其他字符（包括空格和竖线）都是文字。
    if (quote === '"') {
      if (c === '"') quote = '';
      else word += c;
      continue;
    }

    // 下面都是引号外面的情况。
    if (c === '"' || c === "'") {
      quote = c;
      started = true; // 引号一开，这个词就算开始了，哪怕里面最后什么都没有
      continue;
    }
    if (c === '|') {
      finish();
      continue;
    }
    // 这些符号在 bash 里各有含义（串联、后台、重定向、命令替换），这里一个都没实现，宁可报错也不装作认识。
    if (/[;&<>`]/.test(c)) throw new Error(`syntax error: unsupported operator ${c}`);
    if (/\s/.test(c)) {
      flush(); // 引号外的空白只起分隔作用，连着好几个也只算一次
      continue;
    }
    word += c;
    started = true;
  }

  if (quote) throw new Error('syntax error: unterminated quote');
  flush();
  if (words.length) finish();
  // 读到行尾时 words 是空的、前面却已经有命令，说明最后一根竖线后面什么都没写，比如 ls |。
  else if (pipeline.length) throw new Error("syntax error near unexpected token '|'");
  return pipeline;
}
