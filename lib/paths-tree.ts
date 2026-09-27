/**
 * @module        学习路径区左边那棵课程树——分类只展开收起，不跳走
 * @problem       在学习路径区排路线时，要展开分类找课程、把课程拖进画布。可课程目录那棵树里，
 *                点分类名会跳到那个分类的介绍页——一下子就离开了正在编辑的路径，很别扭。
 * @design        拿课程目录那棵树，去掉每个分类自己的那一页（folder.index）和最上面的“课程目录”首页：
 *                没有自己页面的分类，在 Fumadocs 里点一下就只是展开 / 收起。课程仍然是链接：点它打开课程介绍，按住拖进画布就加进路线。
 * @courses       UC Berkeley CS61B（树的变换）
 * @exercises     https://sp21.datastructur.es/ —— CS61B 讲树的那几周
 * @prereq        知道同一棵树可以按不同用途“改一改”再拿来用。
 * @unclear       依赖 Fumadocs 的约定：没有 index 页的分类点了只展开收起。升级 Fumadocs 后要确认这个行为没变。
 * @letter
 * 同一棵课程树，在三块里有三种用法。
 * 课程目录里，点哪儿都是“去看”；心得区里，点哪儿都是“去写”；学习路径区里，分类只是用来“翻找”的，课程才是“拿来用”的。
 * 树的形状一点没变，变的只是每个节点被点下去时的意思。
 *
 * 这个文件做的事情很简单：把每个分类自己的那一页去掉，再去掉最上面的“课程目录”首页。
 * 在 Fumadocs 里，一个没有自己页面的分类，点一下就只会展开或收起。这样你在排路线的时候翻找课程，就不会一不小心跳走了。
 */
import type { Folder, Node, Root } from "fumadocs-core/page-tree";

function strip(node: Node): Node {
  if (node.type !== "folder") return node;
  const { index: _index, ...rest } = node;
  return { ...rest, $id: `paths:${node.$id ?? ""}`, children: node.children.map(strip) } satisfies Folder;
}

export function toPathsTree(catalog: Root): Root {
  return {
    ...catalog,
    $id: "paths-root",
    children: catalog.children.filter((n) => !(n.type === "page" && n.url === "/docs")).map(strip),
  };
}
