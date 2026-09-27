/**
 * @module        MDX 内容可使用的网页组件入口
 * @problem       Markdown 描述内容，却仍需要一套组件把标题、列表和代码块画成网页。
 * @design        沿用 Fumadocs 默认组件，只额外登记一个 Mermaid——
 *                构建时的插件把 mermaid 代码块换成了 <Mermaid />，这里必须告诉 MDX 它是谁。
 * @courses       Harvard CS50x Week 8（HTML、CSS、JavaScript）；Stanford CS143（把一种语言翻译成另一种）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：HTML 标签各表示什么
 * @prereq        Markdown 基础语法，以及 React 组件是可复用页面片段的概念。
 * @unclear       公式与代码着色不经过这张表：它们在构建时就变成了普通标签，不需要组件接手。
 *
 * @letter
 * 课程页是用 MDX 写的：Markdown 里可以夹 React 组件。MDX 只说“这段是标题、那段是列表”，真正把它们画成网页标签的，是这里登记的组件。
 *
 * 现在几乎全用 Fumadocs 的默认组件，只多登记了一个 Mermaid。
 * 原因是构建的时候有个插件，会把课程页里的 ```mermaid 代码块换成 <Mermaid /> 组件；不在这里告诉 MDX“Mermaid 是谁”，构建时它就会报“找不到这个组件”。
 *
 * 公式和代码着色不经过这张表：它们在构建的时候就已经变成普通的 HTML 标签了，不需要组件来接手。
 * 以后要是想换掉某一种内容的画法，比如给表格加个横向滚动，就在这一个集中的入口替换，不用去改每一篇课程页。
 */
import { Mermaid } from "@/components/diagrams/mermaid";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultMdxComponents, Mermaid, ...components };
}
export const useMDXComponents = getMDXComponents;
