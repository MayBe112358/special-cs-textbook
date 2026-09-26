/**
 * @module        个人心得区左边那棵树——和课程目录一模一样的形状，每一项都指向这门课的心得空间
 * @problem       心得要“按课程树排布，每门课对应它的心得”。如果另外手写一棵心得树，
 *                课程目录新加一门课，心得树就得记得跟着加；两棵树迟早长得不一样。
 * @design        不另建树：拿课程目录那棵（lib/source.ts 生成的），把每一项的网址从 /docs/… 换成 /notes/…，
 *                其余一概不动——名字、分组、学习状态的小圆点都原样保留。
 *                最上面那一项“课程目录”换成“心得首页”，指向 /notes。
 *                每一项名字后面再挂一个小数字（NoteCount）：这门课下你写了几份心得，没写过就不画。
 * @courses       UC Berkeley CS61B（树的遍历与变换）；UC Berkeley CS61A（高阶函数：把一个变换应用到每个节点）
 * @exercises     https://sp21.datastructur.es/ —— 树的递归遍历
 * @prereq        知道递归：处理一个节点时，先处理它的每个孩子。
 * @unclear       小数字要等页面在浏览器里跑起来、读完本地数据库才出现，比课程名晚一瞬间（和学习状态圆点一样）。
 *
 * @letter
 * 这是一个很小的递归函数，但它体现了这本教材反复出现的一个做法：同一个事实只存一份，其他地方从它推出来。
 * 心得树不是“另一棵树”，而是“课程树换了一下网址”。所以课程目录怎么长，心得区就怎么长，永远不会漏掉一门课。
 * 你在 CS61B 里写过的树的 map，在这里就是它真实的用处。
 */
import { Fragment, createElement, type ReactNode } from "react";
import type { Folder, Item, Node, Root } from "fumadocs-core/page-tree";
import { NoteCount } from "@/components/notes/note-count";

function toNotesUrl(url: string): string {
  return url.replace(/^\/docs(?=\/|$)/, "/notes");
}

/** 心得网址对应的心得空间：/notes/a/b → /a/b，/notes → /。 */
function spaceOf(notesUrl: string): string {
  return notesUrl.replace(/^\/notes/, "") || "/";
}

/**
 * 名字后面接上“有几份心得”。.ts 里写不了 JSX，用 createElement，等同于 <>{name}<NoteCount space=… /></>。
 * 两个孩子都带 key，理由见 lib/source.ts 的 withDot：传到浏览器后它们是一个数组。
 */
function withCount(name: ReactNode, notesUrl: string): ReactNode {
  return createElement(Fragment, null, createElement(Fragment, { key: "name" }, name), createElement(NoteCount, { key: "count", space: spaceOf(notesUrl) }));
}

function mapNode(node: Node): Node {
  if (node.type === "page") return mapItem(node);
  if (node.type === "folder") return mapFolder(node);
  return node;
}

function mapItem(item: Item): Item {
  const url = toNotesUrl(item.url);
  return { ...item, $id: `notes:${item.$id ?? item.url}`, url, name: withCount(item.name, url) };
}

function mapFolder(folder: Folder): Folder {
  return {
    ...folder,
    // 分类自己也是一个心得空间（它的首页就是那个空间），数字挂在分类名上。
    name: folder.index ? withCount(folder.name, toNotesUrl(folder.index.url)) : folder.name,
    $id: `notes:${folder.$id ?? ""}`,
    index: folder.index ? mapItem(folder.index) : undefined,
    children: folder.children.map(mapNode),
  };
}

export function toNotesTree(catalog: Root): Root {
  return {
    ...catalog,
    $id: "notes-root",
    children: catalog.children.map((node) => {
      // 最上面那一项是课程目录首页，在心得区里它是“心得首页”。
      if (node.type === "page" && node.url === "/docs") return { ...mapItem(node), name: "心得首页" };
      return mapNode(node);
    }),
  };
}
