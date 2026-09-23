/**
 * @module        文档内容来源的声明，以及正文的排版能力
 * @problem       两件事在这里汇合。一是页面导航和正文要从同一批内容文件生成，
 *                否则新增页面时容易漏改其中一处。二是 Markdown 本身只认得标题、段落、列表，
 *                它不认识数学公式，也不认识流程图——而一本计算机科学教材写着写着一定会用到这两样。
 * @design        把 content/docs 作为唯一文档目录，交给 Fumadocs MDX 自动生成页面树；
 *                再往它的处理链上挂三个插件：公式交给 KaTeX，流程图交给 mermaid，
 *                代码着色沿用 Fumadocs 自带的 shiki（默认就开着，这里不动它）。
 *                公式在构建时就算成 HTML，流程图留到浏览器里画——理由见下面的信。
 * @courses       CS61B 树结构；CMU 15-445 与 UCB CS186 的索引概念；
 *                Stanford CS143 与 UCB CS164（一份文本经过一串处理器逐步变形，正是编译器的形状）
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2 —— 数据组织与索引
 *                https://web.stanford.edu/class/cs143/ —— 官方 project：多趟处理同一棵语法树
 * @prereq        知道网站是先"构建"再"打开"的：有些活可以在构建那一刻干完，
 *                有些活只能等读者打开页面才干得了。
 * @unclear       公式和流程图目前只在 MDX 课程页里可用；源码讲解页的正文来自代码注释，
 *                那条路还没有接这两个插件。等真的有人想在注释里写公式时再说。
 *
 * @letter
 * 这个文件现在做的事，用一句话说就是：往一条流水线上挂东西。
 *
 * 一份 .mdx 文件变成网页，中间要经过好几双手。先有人把文字读成一棵树（哪里是标题、哪里是段落），
 * 再有人在这棵树上改改补补，最后有人把树写成 HTML。每一双手就是一个插件，
 * 我们在这里说清楚要请哪几位、按什么顺序上场。
 *
 * 名字里的 remark 和 rehype 是两班人：remark 处理"还是 Markdown 的时候"，
 * rehype 处理"已经快变成 HTML 的时候"。所以 remarkMath 负责认出 `$E=mc^2$` 这是个公式，
 * rehypeKatex 负责把它画成一堆带位置的标签。一个管认，一个管画，分工就是这么来的。
 * 你学完任何一门编译课之后回头看这两个词，会发现它就是"前端认语法、后端生成代码"的老套路。
 *
 * 有意思的是三样东西的时机各不相同，而这个差别不是随便定的：
 *
 * 公式在构建时就算完。读者打开页面时，那个根号、那个分数线已经是现成的标签了，
 * 浏览器只需要下载一份字体。代价是每个公式都在 HTML 里占一段位置。
 *
 * 代码着色也在构建时做完。shiki 用的是真正的语法规则（和编辑器同一套），
 * 所以它必须在一台装得下这些规则的机器上跑——那就是构建机，不是你的手机。
 *
 * 流程图偏偏只能等到浏览器里再画。因为图的配色要跟着深色/浅色主题走，
 * 而主题是你打开网站那一刻才决定的，构建的时候没人知道。
 *
 * 这三条摆在一起，就是这本教材想让你看见的那个判断：**一件事应该在什么时候做**。
 * 能在构建时做完的，就别让每个读者的浏览器重做一遍；
 * 但依赖"读者是谁、他选了什么"的事，构建时怎么猜都是错的。
 */
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

export const docs = defineDocs({ dir: "content/docs" });

export default defineConfig({
  mdxOptions: {
    // 插件排在 Fumadocs 自带的那串前面：先认出公式和流程图，再交给它做标题、代码块那些事。
    remarkPlugins: (plugins) => [remarkMath, remarkMdxMermaid, ...plugins],
    rehypePlugins: (plugins) => [rehypeKatex, ...plugins],
  },
});
