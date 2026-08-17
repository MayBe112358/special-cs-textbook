/**
 * @module        把网址匹配到具体 MDX 文档的通用页面
 * @problem       每新增一篇文档都手写一个页面组件会重复，也容易让不同页面的结构不一致。
 * @design        用一个可选的多段路径接住所有文档地址，再从统一内容源查找并渲染对应 MDX。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript; Stanford CS143 路径匹配与语法结构
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ ; https://web.stanford.edu/class/cs143/
 * @prereq        函数参数、数组、网址路径，以及“找不到页面”应返回 404。
 * @unclear       页面元数据目前只有标题和简介，正式课程字段留到 ROADMAP 1.3。
 *
 * @letter
 * 这个文件像一只通用信封：/docs、/docs/getting-started 或更深的地址都会先到这里，slug 是地址中
 * /docs 后面的各段名字。它把名字交给内容源寻找正文，找不到就明确返回 404；找到后则用同一套标题、
 * 简介、正文和页内目录结构显示。这样新增文档只需新增内容，不必复制页面代码。
 */
import { source } from "@/lib/source";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";
export default async function DocumentationPage(props: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();
  const Content = page.data.body;
  return <DocsPage toc={page.data.toc} full={page.data.full}><DocsTitle>{page.data.title}</DocsTitle><DocsDescription>{page.data.description}</DocsDescription><DocsBody><Content /></DocsBody></DocsPage>;
}
export function generateStaticParams() { return source.generateParams(); }
export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}
