/**
 * @module        search 命令——在终端里做站内搜索，结果能点、能接着用管道筛
 * @problem       顶栏已经有搜索框了，终端还要一个 search，是因为终端能做搜索框做不到的事：把结果交给下一条命令。
 *                比如 search 解释器 | grep CS61A，意思是“提到解释器的条目里，再挑出和 CS61A 有关的”。
 *                搜索框只能给你一张列表，你没法对这张列表再提问。
 * @design        自己不搜，把参数原样交给 core/knowledge/search 里那个共用函数，然后把每条结果换成终端的列表行：
 *                左边是路径，右边是标题和摘要，每一行都带着一条 open 命令，点一下就打开那一页。
 *                结果是结构化的列表，不是一段纯文本，所以 grep 拿到的仍然是一行一行的条目，筛完了每行还能点。
 *                敲 search 不带参数时，照 Unix 的习惯只打印用法，不去猜你想搜什么。
 * @courses       MIT Missing Semester（数据整理：用管道把小工具串起来）；UC Berkeley CS61A（函数组合）；
 *                UC Berkeley CS186 / CMU 15-445（先查询、再在结果上过滤）；Stanford CS276（信息检索）
 * @exercises     https://missing.csail.mit.edu/2020/data-wrangling/ —— 在真终端里用 grep、sed、sort 串起一条数据处理流水线
 * @prereq        知道管道 | 是“把左边的输出交给右边”；读过 core/knowledge/search 那一章会更清楚结果是怎么来的。
 * @unclear       最多只给 30 条，多出来的直接截掉，终端里不会提示“还有更多”；词太宽的时候请多加一个词缩小范围。
 *                搜索本身的毛病（子串误中、排序粗糙）都在 core/knowledge/search 的 @unclear 里。
 *
 * @letter
 * 这个文件就这么几行，因为它基本啥也没干。真正的搜索在 core/knowledge/search 里，这儿只是把终端和那个函数接上。
 *
 * 有意思的是它交回去的东西。它没把结果拼成一段字打印出来，而是交回一个列表，每一行有三样：路径、描述，还有一条“点了以后执行什么”的命令。
 * 为啥这么麻烦？你把它接进管道就明白了。在终端里敲：
 *
 *     search 解释器 | grep CS61A
 *
 * grep 拿到的不是一坨字，是一行一行的条目。它按 CS61A 筛掉一部分，剩下那几行，点开用的 open 命令还跟着呢，照样能点。
 * 要是 search 交出去的是纯文本，grep 筛完就只剩字了，你想打开哪条，还得自己把路径抄下来再敲一遍 open。
 *
 * 真 Unix 的管道里流的是纯文本，简单是真简单，局限也在这儿。
 * 这个终端让管道里流的是带结构的数据，有点像 PowerShell 的路子。
 * 这块在 core/terminal/output 那章里讲得更细，看完这里可以接着去翻。
 */
import type { CommandDefinition } from '../command.ts';
import { searchKnowledge } from '../../knowledge/search.ts';
import { list, text } from '../output.ts';

export const searchCommand: CommandDefinition = {
  name: 'search',
  summary: '搜索课程与代码讲解（中英文，最多30条）',
  usage: 'search <keywords...>',
  pipeline: true,
  run: ({ args }, c) => {
    if (!args.length) return { status: 'error', blocks: [text('usage: search <keywords...>', 'error')], actions: [] };
    // 多个参数用空格接回一句查询；search 'a b' 和 search a b 在这里是一样的。
    const hits = searchKnowledge(c.knowledge, args.join(' '));
    return {
      status: 'ok',
      // 每一行都带着 open 命令，经过 grep 筛选之后仍然能点。
      blocks: [list(hits.map((hit) => ({ label: hit.path, description: hit.title + ' — ' + hit.excerpt, command: `open ${hit.path}` })))],
      actions: [],
    };
  },
};
