/**
 * @module        把网址匹配到一页内容的通用页面——MDX 文档、分类目录、源码讲解都从这里出去
 * @problem       每新增一篇文档都手写一个页面组件会重复，也容易让不同页面的结构不一致；
 *                另外 cd 能进入没有 index.mdx 的分类，这些分类网址也必须有可见结果，不能落到 404。
 *                源码讲解页更是一份都不存在于内容目录：它们是构建时从源码注释现生成的，
 *                如果没人接住这些地址，终端里能 cd 过去的地方在浏览器里全是 404。
 * @design        用一个可选的多段路径接住所有文档地址，按三种可能依次尝试：
 *                先从 Fumadocs 内容源找 MDX（课程和分类首页）；再看知识索引里那个位置是不是源码模块，
 *                是就用注释块画出讲解页；最后当作分类，画一张最小目录页。
 *                静态参数把文档、分类、模块三种地址一起列出来，保持 GitHub Pages 可导出。
 *                课程页最后那一栏“本课对应的项目实现”不写在 MDX 里，而是在这里接上去——
 *                它是算出来的结果，写进内容文件就等于把算得出的东西又抄了一份。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript; Stanford CS143 路径匹配与语法结构
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ ; https://web.stanford.edu/class/cs143/
 * @prereq        函数参数、数组、网址路径，以及“找不到页面”应返回 404。
 * @unclear       分类页目前只显示直接子项；它是 cd 的可见落点，不承担完整课程内容展示。
 *                三种情况现在按顺序试，靠的是“同一个位置不会同时是两样东西”这个前提，
 *                而这个前提由索引脚本的唯一性检查保证。要是哪天那个检查被拿掉，这里会悄悄只显示第一种。
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
 *
 * 第三种情况是源码讲解页，它值得单独说一句，因为它和前两种的来源完全不同。
 * 课程页的内容躺在 content 里，是一份写好的文件；而讲解页的内容躺在项目自己的源码注释里，
 * 构建时才被扫成数据。也就是说这个网站有一部分页面，是它自己的源代码变出来的。
 * 这听起来有点奇怪，但它正是这本教材的设定：课程是目录，源码是正文。
 * 既然是正文，它就该和课程页一样有地址、能被链接、能被 cd 进去——所以它们从同一只信封里出去。
 */
import { CourseModules } from "@/components/internals/cross-links";
import { ModulePage } from "@/components/internals/module-page";
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
  const node = fileSystem.nodeAt(slugToKnowledgePath(slug));

  const page = source.getPage(slug);
  if (page) {
    const Content = page.data.body;
    // 课程页最后要接上“本课对应的项目实现”，那一栏不写在 MDX 里，它是从源码注释算出来的。
    const course = node?.kind === "file" && node.source.kind === "course" ? node.source.course : null;
    return (
      <DocsPage toc={page.data.toc} full={page.data.full}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        <DocsBody>
          <Content components={getMDXComponents()} />
          {course === null ? null : <CourseModules courseId={course.id} />}
        </DocsBody>
      </DocsPage>
    );
  }

  if (!node) notFound();
  // 源码模块没有 MDX 文件，它那一页是从注释块现画出来的。
  if (node.kind === "file") {
    if (node.source.kind !== "module") notFound();
    return <ModulePage module={node.source.module} />;
  }
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
  // 分类目录和源码模块都没有 MDX 文件，Fumadocs 数不到它们，所以这里照着知识索引补上，
  // 否则静态导出时这些地址会直接变成 404——而终端的 cd 和 open 都会走到它们。
  const knowledgeParams = [
    ...knowledgeIndex.categories.filter((category) => category.path !== "/"),
    ...knowledgeIndex.modules,
  ].map((entry) => ({ slug: entry.path.slice(1).split("/") }));
  return [...documentParams, ...knowledgeParams];
}
export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (page) return { title: page.data.title, description: page.data.description };
  const node = fileSystem.nodeAt(slugToKnowledgePath(slug));
  if (!node) notFound();
  if (node.kind === "file" && node.source.kind !== "module") notFound();
  return { title: node.title, description: node.description };
}
