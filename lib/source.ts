/**
 * @module        把 MDX 文件转换成 Fumadocs 可查询的页面集合，并让分类文件夹和源码讲解也进入侧边栏
 * @problem       页面路由和侧边栏都需要用统一方式查找文档，不能各自理解一次文件目录。
 *                还有一个更要命的问题：Fumadocs 默认只把「有 MDX 文件的东西」当成页面，
 *                而我们的分类（systems、operating-systems……）只是文件夹，没有自己的 MDX。
 *                于是终端 cd 到 /docs/systems 之后，侧边栏在这棵树里找不到任何“当前页面”，
 *                既不会展开那一支，也不会高亮那一项——鼠标和终端就变成了两个互不认账的世界。
 * @design        用 Fumadocs loader 包装自动生成的文档集合，并统一放在 /docs 地址下。
 *                在构建页面树时插一个转换器：凡是知识索引里认得的分类文件夹，就给它挂上一条
 *                指向自己网址的 index 条目。网址不是在这里现拼的，而是取自那份索引——
 *                和终端的 cd / open、和分类页面的静态参数用的是同一份事实。
 *                考虑过的另一种做法是给每个分类手写一个 index.mdx：Fumadocs 天然支持，改动更小，
 *                但分类标题就会同时存在于 meta.json 和 index.mdx 两处，迟早对不上；
 *                而且每加一个分类都要记得多建一个文件，这正是本项目一直在避免的那种手工登记。
 *                阶段 14 起，课程和源码模块在侧边栏里的名字后面还挂着一个学习状态小圆点（StatusDot）：
 *                也是在这棵树生成时换上去的，Fumadocs 的侧边栏组件一行没改。
 * @courses       UC Berkeley CS61B（树的表示与变换）；CMU 15-445 / UC Berkeley CS186（索引：同一份数据的另一种组织方式）
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2 —— CS61B Gitlet：用树组织数据
 * @prereq        对象、函数，以及网址路径和磁盘路径不是同一种东西。
 * @unclear       源码讲解那一支是整棵接上去的，Fumadocs 并不知道它从哪来；万一将来内容目录里
 *                真的出现一个叫 internals 的文件夹，两边会在同一个位置上打架。
 *                现在没有任何东西拦着这件事发生——真要防，得在索引脚本里加一条检查。
 *                knowledgePathToUrl 现在住在 core/terminal/commands/shared.ts 里，可这里和分类页面都要用它，
 *                它已经不只是“命令共用”的工具了。等下一次真的要动这块时，它更该和 location.ts
 *                （网址 → 知识路径）搬到一起，让两个方向的翻译放在同一个地方。这次不顺手改，
 *                是因为那会把这一步扩散成一次跨多文件的改动。
 *
 * @letter
 * 你可以把 Fumadocs 的 loader 想成图书馆的登记台：.mdx 文件是书，文件夹是书架。页面路由只管问登记台“这个网址对应哪本书”，侧边栏也从同一份登记结果拿到整棵目录树。
 * 数据入口集中在这一个地方，就不会出现页面和侧边栏各说各话的情况。
 *
 * 这个文件里最值得看的，是那个转换器。它是“终端和鼠标是同一个东西的两面”真正合上的地方。
 *
 * 登记台默认只登记书，不登记书架：在 Fumadocs 眼里，文件夹没有网址，只是一个能折叠的标题。
 * 普通文档站这么做没问题，因为没人会“停在一个书架上”。可我们的终端能：你敲 cd systems，就站在那个分类里了，地址栏是 /docs/systems。
 * 这时候侧边栏去问“当前是哪一页”，得到的回答是“没有”，于是它啥也不干。你在终端里明明走到了系统那一支，左边却毫无反应。
 *
 * 修法不是给侧边栏加一条“终端刚才 cd 了”的通知，那样就有两份真相要同步，早晚会不同步。
 * 这里的办法是让书架也被登记：把知识索引里那条分类记录的网址，挂到对应的文件夹上。
 * 之后 Fumadocs 自己那套“找到当前页 → 沿路展开 → 高亮它”的逻辑就照常转起来了，因为现在它真的找得到了。
 * 谁都不用通知谁，两边都只是在读同一个地址。
 * 顺带，分类在侧边栏里也能点了。这不是附赠的，而是同一条要求的另一半：鼠标点得到的地方，终端得能站上去；终端站得上去的地方，鼠标也得点得到。
 *
 * 源码讲解那一支更彻底，它连“书”都没有。课程页在 content 目录里有实实在在的文件，讲解页却是构建时从源码注释里现生成的，内容目录里一个对应的文件都没有，登记台不可能凭空知道它们。
 * 所以这里换了个做法：照着知识索引现搭一棵小树，挂到根上。buildInternalsBranch 递归地把目录变成文件夹节点、把模块变成页面节点，那就是索引里的两张平表被重新看成一棵树的样子。
 *
 * 侧边栏里每门课后面的学习状态小圆点，也是在这棵树生成的时候换上去的。Fumadocs 的侧边栏组件，一行都没改。
 */
import { docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";
import type { Folder, Item, Node } from "fumadocs-core/page-tree";
import knowledgeIndexJson from "@/core/knowledge/generated/knowledge-index.json";
import type { KnowledgeIndex } from "@/core/knowledge/knowledge-index";
import { INTERNALS_PATH, isInternalsPath } from "@/core/knowledge/knowledge-index";
import { knowledgePathToUrl } from "@/core/terminal/commands/shared";
import { StatusDot } from "@/components/progress/status-dot";
import { createElement, Fragment, type ReactNode } from "react";

const knowledgeIndex = knowledgeIndexJson as KnowledgeIndex;

/**
 * 分类文件夹（相对内容目录的路径）→ 这个分类自己的网址。
 *
 * Fumadocs 交给转换器的 folderPath 长得像 "systems/operating-systems"，
 * 正好是知识索引里 path 去掉开头那个斜杠。根目录不在这张表里：它自带 index.mdx，
 * 早就是一个正常页面了，再挂一次只会在侧边栏里多出一个重复条目。
 */
const categoryUrlByFolderPath = new Map(
  knowledgeIndex.categories
    .filter((category) => category.parentPath !== null && !isInternalsPath(category.path))
    .map((category) => [category.path.slice(1), knowledgePathToUrl(category.path)]),
);

/** 课程页网址 → 课程编号。侧边栏要在课程名后面挂学习状态的小圆点，得先知道这一项是哪门课。 */
const courseIdByUrl = new Map(knowledgeIndex.courses.map((course) => [course.url, course.id]));

/**
 * 侧边栏条目的名字：原来的文字，后面跟一个状态圆点。
 * 这里是 .ts 文件写不了 JSX，所以用 createElement 手写；它和 <>{name}<StatusDot … /></> 是同一个东西。
 *
 * 两个孩子都要带 key：这棵树在服务器上生成、再传到浏览器，一路上“两个孩子”会变成一个数组，
 * 浏览器里的 React 看到没有 key 的数组就会报 “Each child in a list should have a unique key”。
 */
function withDot(name: ReactNode, target: { course: string } | { module: string }): ReactNode {
  return createElement(Fragment, null, createElement(Fragment, { key: "name" }, name), createElement(StatusDot, { key: "dot", ...target }));
}

/** 按位置查目录和模块。侧边栏那一支要照着知识索引现搭出来，所以先把两张表变成能查的样子。 */
const categoryByPath = new Map(knowledgeIndex.categories.map((category) => [category.path, category]));
const moduleByPath = new Map(knowledgeIndex.modules.map((module) => [module.path, module]));

/**
 * 把知识索引里的源码讲解那一支，翻译成侧边栏认得的树。
 *
 * 课程那一支不需要这一步：它本来就是 content/docs 里的真文件，Fumadocs 自己扫得到。
 * 源码这一支在内容目录里一个文件都没有——它的每一页都是构建时从源码注释现生成的，
 * 所以必须在这里手工接上去，否则侧边栏根本不知道有这么一支。
 *
 * 每个目录都带一条 index，指向它自己那张目录页。这不是为了好看：终端 cd 到某个目录之后，
 * 侧边栏要靠“当前地址对应哪个节点”来决定展开和高亮哪一项。没有 index 的文件夹在 Fumadocs 眼里
 * 没有网址，于是你在终端里明明走到了那里，左边却毫无反应——lib/source.ts 顶上那封信讲的就是这件事。
 */
function buildInternalsBranch(): Folder | null {
  const rootCategory = categoryByPath.get(INTERNALS_PATH);
  if (rootCategory === undefined) return null; // 一个模块都没扫到时，就不必长出这一支

  function toItem(path: string): Node | null {
    const category = categoryByPath.get(path);
    if (category !== undefined) return toFolder(path);
    const module = moduleByPath.get(path);
    if (module === undefined) return null;
    return { type: "page", $id: module.url, name: withDot(module.title, { module: module.path }), url: module.url } satisfies Item;
  }

  function toFolder(path: string): Folder | null {
    const category = categoryByPath.get(path);
    if (category === undefined || category.url === null) return null;
    return {
      type: "folder",
      $id: category.url,
      name: category.title,
      // 和上面那个 folder 转换器一样：让文件夹自己也是一个能点、能被高亮的页面。
      index: { type: "page", $id: `${category.url}#index`, name: category.title, url: category.url },
      children: category.childPaths
        .map(toItem)
        .filter((node): node is Node => node !== null),
    };
  }

  return toFolder(INTERNALS_PATH);
}

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  pageTree: {
    // 树上每一项默认带一个 $ref（它来自哪个源文件），只在建树排序时有用，侧边栏用不到。
    // 可这棵树会被塞进每一页的 HTML 和预取文件里，三百来页乘下来要多出二十来 MB，所以建完就删掉。
    noRef: true,
    transformers: [
      {
        file(node) {
          const course = courseIdByUrl.get(node.url);
          return course === undefined ? node : { ...node, name: withDot(node.name, { course }) };
        },
        folder(node, folderPath) {
          const url = categoryUrlByFolderPath.get(folderPath);
          // 已经自带 index 页面的文件夹不动它——那是内容作者的决定，不该被这里覆盖。
          if (node.index !== undefined || url === undefined) return node;
          return { ...node, index: { type: "page" as const, name: node.name, url } };
        },
        root(node) {
          const internals = buildInternalsBranch();
          if (internals === null) return node;
          // 挂在最后：课程是这本教材的目录，源码是正文，读者一般先看目录。
          return { ...node, children: [...node.children, internals] };
        },
      },
    ],
  },
});
