/**
 * @module        MDX 内容可使用的网页组件入口
 * @problem       Markdown 描述内容，却仍需要一套组件把标题、列表和代码块画成网页。
 * @design        完整沿用 Fumadocs 默认组件，不在步骤 1.1 自定义任何视觉效果。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        Markdown 基础语法，以及 React 组件是可复用页面片段的概念。
 * @unclear       公式、流程图与代码高亮的扩展能力要到 ROADMAP 13 再验证。
 *
 * @letter
 * MDX 写的是“这段是标题、那段是列表”，组件负责把这些含义变成真实标签。我们现在直接采用默认映射，
 * 是为了先确认内容、导航和路由彼此接得上。以后若要换某一种内容的画法，只需在这个集中入口替换。
 */
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultMdxComponents, ...components };
}
export const useMDXComponents = getMDXComponents;
