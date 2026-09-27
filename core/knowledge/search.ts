/**
 * @module        站内搜索——在课程和代码讲解里找出包含你敲的那几个词的条目
 * @problem       目录树只能回答“某个东西放在哪”。可你常常只记得一个词：一个课程编号，或者某封信里读到过的“拓扑排序”。
 *                这时候得有一个地方，让你输一个词，它把所有提到这个词的课程和代码讲解都列出来。
 *                网站是纯静态的，没有服务器帮你搜，所以这件事只能在你的浏览器里做。
 * @design        材料全部来自构建时生成的知识索引，不另外建一份。每个条目被拼成一段纯文本：
 *                课程拼标题、一句话简介和先修要求，代码模块拼标题和整个注释块。
 *                你的查询和这段文本都先做同一种规整（全角转半角、大写转小写），再逐词检查是否出现；
 *                敲了几个词，每个词都要出现才算命中。
 *                打分很粗：路径最后一段和查询词完全相同加 100，标题里有加 20，路径里有加 10，正文里有加 1。
 *                分高的在前，同分的按路径字母顺序排，最多交回 30 条。
 *                顶栏的搜索框、终端的 search 命令、AI 助手的搜索工具，三处都调这一个函数。
 * @courses       UC Berkeley CS186 / CMU 15-445（索引与查询、全表扫描）；Stanford CS276（信息检索：倒排索引、打分与排序）；
 *                UC Berkeley CS61B（字符串匹配）；UC Berkeley CS61A（数据抽象：把两种条目变成同一种形状）；
 *                Stanford CS224N（中文分词为什么难）
 * @exercises     https://15445.courses.cs.cmu.edu/fall2024/homework1/ —— CMU 15-445 的 SQL 作业，体会“按条件在一张表里找行”
 *                https://sp21.datastructur.es/materials/proj/proj2/proj2 —— CS61B Gitlet，用映射表组织和查找数据
 * @prereq        知道字符串有“包含”这个操作（"abcde" 包含 "bcd"）；知道列表可以按一个分数排序。
 * @unclear       目前只是子串匹配，所以有两个很明显的毛病。
 *                一是会误中：搜 os 会命中 postcss-config，因为 postcss 里正好有 o、s 两个字母连在一起。
 *                二是排序不懂“哪篇讲得多”：搜“解释器”时，几十篇注释都只是在正文里提到这个词，每篇都得 1 分，
 *                只好按字母顺序排，真正以解释器为主题的命令引擎那一章反而排不到前面。
 *                课程这一边只搜标题、简介和先修要求，不搜课程页正文，所以搜“操作系统 调度”什么都找不到。
 *                改进的方向是倒排索引加按词频打分（CS276 前几讲的内容），或者给 @module、@courses 这些字段更高的权重；
 *                这些都还没做。
 *
 * @letter
 * 说到“搜索”，你脑子里可能是个很复杂的东西。先说实话，这个文件里的搜索笨得很：
 * 把每个条目拼成一长串字，然后挨个问“你里面有没有这个词”。完事。
 * 数据库课管这个叫全表扫描，就是一条一条看过去，一条都不跳。
 *
 * 听着慢，但算算账：一百三十门课加一百二十来个代码模块，两百多条，每条几千字。
 * 浏览器挨个扫一遍，你根本感觉不到。这么点量，笨办法完全够用。
 * 真要涨到几万条，那才轮到 CS276 里讲的倒排索引：提前记好“每个词都出现在哪几条里”，查的时候直接翻表，不用一条条看。
 *
 * 有两个小地方我想拎出来说说。
 *
 * 一个是 normalize 里那个 NFKC。中文输入法有时候会打出全角字母，ＣＳ６１Ａ 和 CS61A 你看着一样，电脑可不这么认为，它俩在电脑眼里是完全不同的字符。
 * NFKC 是 Unicode 定的一种规整方法，会把全角的字母数字变回半角。
 * 查询和正文都过一遍，再统一转小写，这样你不管用什么输入法、大小写怎么敲，都能搜到同一门课。
 * 不信你去顶栏搜索框里敲个 ＣＳ６１Ａ 试试。
 *
 * 另一个是中文怎么切词。英文词跟词之间有空格，天生就切好了，中文可没有。
 * “拓扑排序”算一个词，还是“拓扑”加“排序”两个？这叫中文分词，本身就是个大坑，得靠词典或者统计模型。
 * 我偷了个懒，干脆不切正文，只看你敲的那串字有没有原封不动、连着出现在正文里。
 * 你敲了空格，我才把查询切开，而且每一段都得出现。
 * 所以搜“命令 引擎”能找到命令引擎那章，搜“引擎命令”就一条都没有。
 *
 * 这么偷懒是有代价的，我都老老实实写在 @unclear 里了，建议你去瞅一眼，尤其是搜 os 那个例子，挺好笑的。
 * 我没打算把这些毛病藏起来，因为它们正好就是信息检索这门课要解决的问题。
 * 等你学完 CS276 前几讲，大概就知道这个文件该怎么改了，到时候这章交给你重写。
 *
 * 还有一点：顶栏的搜索框、终端的 search、AI 助手的搜索工具，三个地方调的都是这一个函数。
 * 要是各写各的，早晚会出现“搜索框里搜得到、终端里搜不到”这种事，到时候你都不知道该信哪边。
 */
import type { KnowledgeIndex } from './knowledge-index.ts';
import type { Paragraph } from './doc-comment.ts';

export type SearchHit = { kind: 'course' | 'module'; title: string; path: string; url: string; excerpt: string; score: number };

// 全角转半角、兼容字符转标准写法，再转小写。查询和正文都要经过它，比较才公平。
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();

// 注释块解析出来是一段一段的（普通文字、代码块），搜索时把它们接回一整段纯文本。
function paragraphs(values: Paragraph[]) {
  return values.map((p) => (p.kind === 'text' ? p.text : p.lines.join('\n'))).join('\n');
}

export function searchKnowledge(index: KnowledgeIndex, query: string, limit = 30): SearchHit[] {
  // 你敲的空格是唯一的切分依据；中文不做分词。
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  // 先把课程和代码模块整理成同一种形状：标题、路径、网址、一段正文。后面的比较和打分就不用分两种写了。
  const courses = index.courses.map((c) => ({
    kind: 'course' as const,
    title: c.title,
    path: c.path,
    url: c.url,
    // 课程只有简介和先修要求进了索引，课程页的正文不在这里。
    body: [c.description, ...(c.prereq?.knowledge ?? []), ...(c.prereq?.courses ?? [])].join(' '),
  }));
  const modules = index.modules.map((m) => ({
    kind: 'module' as const,
    title: m.title,
    path: m.path,
    url: m.url,
    // @exercises 基本全是链接，没有放进来；所以搜 https 一条都搜不到，不会把每个模块都列一遍。
    body: [m.comment.module, ...[m.comment.problem, m.comment.design, m.comment.courses, m.comment.prereq, m.comment.unclear, m.comment.letter].map(paragraphs)].join('\n'),
  }));

  return [...courses, ...modules]
    .flatMap((doc) => {
      const title = normalize(doc.title);
      const body = normalize(doc.body);
      const path = normalize(doc.path);
      const haystack = title + ' ' + path + ' ' + body;
      // 每个词都得出现，少一个就不算。
      if (!terms.every((term) => haystack.includes(term))) return [];

      // 打分：路径最后一段正好是这个词（你敲的就是课程编号）最重要，其次是标题、路径，最后是正文。
      const score = terms.reduce(
        (sum, term) => sum + (path.split('/').at(-1) === term ? 100 : 0) + (title.includes(term) ? 20 : 0) + (path.includes(term) ? 10 : 0) + 1,
        0,
      );

      // 摘要从第一个词在正文里出现的位置往前退 25 个字开始截，让你看到这个词的上下文。
      const found = body.indexOf(terms[0]!);
      const start = Math.max(0, found - 25);
      return [{ kind: doc.kind, title: doc.title, path: doc.path, url: doc.url, excerpt: (start ? '…' : '') + doc.body.slice(start, start + 160), score }];
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}
