/**
 * @module        心得区的每一页——心得首页，以及每门课（每个分类、每段源码）的心得空间
 * @problem       心得空间要有自己的网址，这样标签页、终端、浏览器后退才能认得它；
 *                网站又是静态导出的，每一个网址都得在构建时生成一页。
 * @design        和课程目录用同一套知识路径：/notes/programming-intro/cs61a 对应 /docs/programming-intro/cs61a。
 *                构建时为知识树里的每个位置生成一页（generateStaticParams），页面本身只是个壳：
 *                作者的心得（内容文件）在构建时就写进去；你自己的心得在浏览器里读出来。
 *                打开某一份心得用查询参数 ?item=<编号>，不需要为它单独生成页面——它只存在于你的浏览器里，构建时根本不知道它。
 * @courses       CS50x Week 8（静态网站与动态内容）；UC Berkeley CS61A（数据从哪来）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：静态网站里放什么
 * @prereq        知道静态导出的网站在构建时就把每一页生成好了，没有服务器在你打开时现做。
 * @unclear       每个位置都生成一页心得空间，页数和课程目录一样多，构建产物因此变大；只有一个空壳，内容很少。
 * @letter
 * 这一页上有两种数据，来路完全不一样。
 * 一种是构建网站的时候就有的：作者的心得、课程的标题。它们直接写进页面，谁打开看到的都一样。
 * 另一种只有你的浏览器知道：你自己写的心得。它得等页面在你的浏览器里跑起来以后，再去本地数据库里读。
 *
 * 这条分界线，就是 AGENTS.md 7.4 里说的“内容状态”和“访问者状态”的分界线。从第一天起就要求把它俩分开，这一页把它画得清清楚楚。
 *
 * 网站是静态导出的，每个网址都得在构建时生成一页。
 * 所以这里用 generateStaticParams 给知识树上的每个位置都生成一页心得空间：每门课、每个分类，连每段源码都有。
 * 可你打开的某一份具体心得（?item=编号）没法这么做，它只存在你的浏览器里，构建的时候压根不知道有它。
 * 所以它不单独生成页面，而是用问号后面的查询参数来说“这一页里打开哪一份”。
 */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import authorNotesJson from "@/content/author-notes.json";
import { createVirtualFileSystem } from "@/core/filesystem/virtual-file-system";
import knowledgeIndexJson from "@/core/knowledge/generated/knowledge-index.json";
import type { KnowledgeIndex } from "@/core/knowledge/knowledge-index";
import { knowledgePathToUrl } from "@/core/terminal/commands/shared";
import { NotesSpace, type AuthorNote, type SpaceOption } from "@/components/notes/notes-space";
import type { VfsNode } from "@/core/filesystem/virtual-file-system";

const knowledgeIndex = knowledgeIndexJson as KnowledgeIndex;
const fileSystem = createVirtualFileSystem(knowledgeIndex);
const authorNotes = authorNotesJson as Record<string, AuthorNote[]>;

/**
 * 全部心得空间，按侧边栏那棵树的顺序排好（先父后子），带上层级深度。
 * “挪到别的课”的下拉框用它，心得首页用它写出每份心得属于哪门课。
 */
function listSpaces(): SpaceOption[] {
  const spaces: SpaceOption[] = [];
  const walk = (node: VfsNode, depth: number) => {
    if (node.path !== "/") spaces.push({ path: node.path, title: node.title, depth });
    if (node.kind === "directory") for (const child of fileSystem.childrenOf(node)) walk(child, depth + 1);
  };
  walk(fileSystem.root, -1);
  return spaces;
}
const spaces = listSpaces();

function toPath(slug?: string[]): string {
  return slug && slug.length > 0 ? `/${slug.join("/")}` : "/";
}

export function generateStaticParams() {
  const paths = [
    ...knowledgeIndex.categories.map((c) => c.path),
    ...knowledgeIndex.courses.map((c) => c.path),
    ...knowledgeIndex.modules.map((m) => m.path),
  ];
  return paths.map((path) => ({ slug: path === "/" ? [] : path.slice(1).split("/") }));
}

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await props.params;
  const node = fileSystem.nodeAt(toPath(slug));
  if (!node) notFound();
  return { title: node.path === "/" ? "个人心得" : `心得 · ${node.title}` };
}

export default async function NotesPage(props: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await props.params;
  const path = toPath(slug);
  const node = fileSystem.nodeAt(path);
  if (!node) notFound();
  const docHref = node.kind === "file" ? node.url : knowledgePathToUrl(node.path);
  return (
    <main className="flex min-w-0 flex-col [grid-area:main]">
      {/* 读查询参数（?item=）的组件要包在 Suspense 里，静态导出才能通过。 */}
      <Suspense fallback={<p className="p-6 text-sm text-fd-muted-foreground">正在打开……</p>}>
        <NotesSpace space={path} title={node.title} docHref={path === "/" ? null : docHref} authorNotes={authorNotes[path] ?? []} spaces={spaces} />
      </Suspense>
    </main>
  );
}
