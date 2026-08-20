/**
 * @module        把 MDX 文件转换成 Fumadocs 可查询的页面集合，并让分类文件夹也拥有自己的网址
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
 * @courses       CS61B 树结构; CMU 15-445 与 UCB CS186 的索引概念; 软件工程类课程（单一事实来源）
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2
 * @prereq        对象、函数，以及网址路径和磁盘路径不是同一种东西。
 * @unclear       knowledgePathToUrl 现在住在 core/terminal/commands/shared.ts 里，可这里和分类页面都要用它，
 *                它已经不只是“命令共用”的工具了。等下一次真的要动这块时，它更该和 location.ts
 *                （网址 → 知识路径）搬到一起，让两个方向的翻译放在同一个地方。这次不顺手改，
 *                是因为那会把这一步扩散成一次跨多文件的改动。
 *
 * @letter
 * 你可以把 loader 想成图书馆的登记台：MDX 文件是书，文件夹是书架，而页面路由只向登记台询问
 * “这个网址对应哪一本”。侧边栏也从同一个登记结果拿到整棵目录树。把这层单独放在这里，是为了
 * 避免页面组件自己到处翻文件；数据入口越集中，未来生成知识索引时越不容易出现两套答案。
 *
 * 下面这个转换器是「终端和鼠标是同一个东西的两个面」真正合上的地方，值得多说两句。
 *
 * 图书馆的登记台默认只登记书，不登记书架——文件夹在 Fumadocs 眼里没有网址，它只是一个能折叠的标题。
 * 这在普通文档站里没问题，因为没人会“停在一个书架上”。但我们的终端可以：cd systems 之后，
 * 你就站在那个分类里，地址栏是 /docs/systems。这时侧边栏去问“当前页面是哪一个”，得到的答案是“没有”，
 * 于是它什么也不做——你在终端里明明走到了系统那一支，左边却毫无反应。
 *
 * 修法不是给侧边栏加一条“终端刚才 cd 了”的通知。那样就有两条真相在同步了，迟早不同步。
 * 我们做的是让书架也被登记：把知识索引里那条分类记录的网址挂到文件夹上。之后 Fumadocs 自己那套
 * “找到当前页面 → 沿路展开 → 高亮它”的逻辑就会照常运转，因为现在它确实找得到了。
 * 谁也不用通知谁，两边都只是在读同一个地址。
 *
 * 顺带得到的一件事是：分类在侧边栏里也能点了。这不是附赠的小功能，它是同一条要求的另一半——
 * 鼠标点到的地方，终端必须也能站上去；终端能站的地方，鼠标也得点得到。少了任何一半，
 * “两个面”就只剩一个面。
 */
import { docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";
import knowledgeIndexJson from "@/core/knowledge/generated/knowledge-index.json";
import type { KnowledgeIndex } from "@/core/knowledge/knowledge-index";
import { knowledgePathToUrl } from "@/core/terminal/commands/shared";

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
    .filter((category) => category.parentPath !== null)
    .map((category) => [category.path.slice(1), knowledgePathToUrl(category.path)]),
);

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  pageTree: {
    transformers: [
      {
        folder(node, folderPath) {
          const url = categoryUrlByFolderPath.get(folderPath);
          // 已经自带 index 页面的文件夹不动它——那是内容作者的决定，不该被这里覆盖。
          if (node.index !== undefined || url === undefined) return node;
          return { ...node, index: { type: "page" as const, name: node.name, url } };
        },
      },
    ],
  },
});
