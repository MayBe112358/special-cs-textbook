/**
 * @module        把网址匹配到具体 MDX 文档的通用页面
 * @problem       每新增一篇文档都手写一个页面组件会重复，也容易让不同页面的结构不一致；
 *                另外 cd 能进入没有 index.mdx 的分类，这些分类网址也必须有可见结果，不能落到 404。
 * @design        用一个可选的多段路径接住所有文档地址。先从 Fumadocs 内容源找 MDX；找不到时再到知识索引
 *                确认是不是分类，并生成一张最小目录页。静态参数同时列出文档与分类，保持 GitHub Pages 可导出。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript; Stanford CS143 路径匹配与语法结构
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ ; https://web.stanford.edu/class/cs143/
 * @prereq        函数参数、数组、网址路径，以及“找不到页面”应返回 404。
 * @unclear       分类页目前只显示直接子项；它是 cd 的可见落点，不承担完整课程内容展示。
 *
 * @letter
 * 这个文件像一只通用信封：/docs、/docs/getting-started 或更深的地址都会先到这里，slug 是地址中
 * /docs 后面的各段名字。它把名字交给内容源寻找正文，找不到就明确返回 404；找到后则用同一套标题、
 * 简介、正文和页内目录结构显示。正文还必须拿到统一的组件映射：MDX 只说明“这里是代码块”，映射才
 * 决定它应当拥有面板、边框和复制按钮。漏掉这一步，内容虽然出现了，语义对应的界面能力却会丢失。
 * 这样新增文档只需新增内容，不必复制页面代码，也不会让每篇文档各自决定代码块怎么显示。
 *
 * 现在它还会接住“只有文件夹、没有正文”的分类。终端的 cd 必须改变地址栏，否则当前位置就会出现第二份真相；
 * 但地址改变后若只得到 404，cd 又不能算完成。所以这里根据构建时索引画出最小目录，让每个合法分类路径
 * 都有一张静态页面。它没有替课程补内容，只是在网页里诚实展示“这个目录直接包含什么”。
 */
import { getMDXComponents } from "@/components/mdx";
import { createVirtualFileSystem } from "@/core/filesystem/virtual-file-system";
import knowledgeIndexJson from "@/core/knowledge/generated/knowledge-index.json";
import type { KnowledgeIndex } from "@/core/knowledge/knowledge-index";
import { knowledgePathToUrl } from "@/core/terminal/commands/shared";
import { source } from "@/lib/source";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import Link from "next/link";
import { notFound } from "next/navigation";

const knowledgeIndex = knowledgeIndexJson as KnowledgeIndex;
const fileSystem = createVirtualFileSystem(knowledgeIndex);

function slugToKnowledgePath(slug?: string[]): string {
  return slug && slug.length > 0 ? `/${slug.join("/")}` : "/";
}

export default async function DocumentationPage(props: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (page) {
    const Content = page.data.body;
    return <DocsPage toc={page.data.toc} full={page.data.full}><DocsTitle>{page.data.title}</DocsTitle><DocsDescription>{page.data.description}</DocsDescription><DocsBody><Content components={getMDXComponents()} /></DocsBody></DocsPage>;
  }

  const node = fileSystem.nodeAt(slugToKnowledgePath(slug));
  if (!node || node.kind !== "directory") notFound();
  const children = fileSystem.childrenOf(node);
  return (
    <DocsPage toc={[]} full={false}>
      <DocsTitle>{node.title}</DocsTitle>
      {node.description ? <DocsDescription>{node.description}</DocsDescription> : null}
      <DocsBody>
        <ul>
          {children.map((child) => (
            <li key={child.path}>
              <Link href={child.kind === "file" ? child.url : knowledgePathToUrl(child.path)}>
                {child.title}
              </Link>
            </li>
          ))}
        </ul>
      </DocsBody>
    </DocsPage>
  );
}
export function generateStaticParams() {
  const documentParams = source.generateParams();
  const categoryParams = knowledgeIndex.categories
    .filter((category) => category.path !== "/")
    .map((category) => ({ slug: category.path.slice(1).split("/") }));
  return [...documentParams, ...categoryParams];
}
export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (page) return { title: page.data.title, description: page.data.description };
  const node = fileSystem.nodeAt(slugToKnowledgePath(slug));
  if (!node || node.kind !== "directory") notFound();
  return { title: node.title, description: node.description };
}
