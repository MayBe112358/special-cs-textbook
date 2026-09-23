/**
 * @module        MDX 内容可使用的网页组件入口
 * @problem       Markdown 描述内容，却仍需要一套组件把标题、列表和代码块画成网页。
 * @design        沿用 Fumadocs 默认组件，只额外登记一个 Mermaid——
 *                构建时的插件把 mermaid 代码块换成了 <Mermaid />，这里必须告诉 MDX 它是谁。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        Markdown 基础语法，以及 React 组件是可复用页面片段的概念。
 * @unclear       公式与代码着色不经过这张表：它们在构建时就变成了普通标签，不需要组件接手。
 *
 * @letter
 * MDX 写的是“这段是标题、那段是列表”，组件负责把这些含义变成真实标签。我们现在直接采用默认映射，
 * 是为了先确认内容、导航和路由彼此接得上。以后若要换某一种内容的画法，只需在这个集中入口替换。
 */
import { Mermaid } from "@/components/diagrams/mermaid";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultMdxComponents, Mermaid, ...components };
}
export const useMDXComponents = getMDXComponents;
