/**
 * @module        学习路径这一块的布局——左边也是课程树，用来把课程拖到导图上
 * @problem       排学习路线时，手边需要一份完整的课程清单，随时拖一门进来。
 * @design        和课程目录共用同一棵课程树（同一个 AreaLayout）：点课程名照样打开课程介绍，按住拖到画布上就加进路线。
 *                只是分类的那一页被去掉了（lib/paths-tree.ts），点分类只展开收起，不会离开正在编辑的路径。
 * @courses       CS61B 树结构
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2
 * @prereq        知道拖放（drag and drop）会把被拖元素的链接一起带过去。
 * @unclear       无。
 * @letter
 * 这里复用课程树，而不是另做一份“可拖动的课程列表”，是因为两份清单迟早会不一致：
 * 课程目录新加了一门课，拖放列表却忘了加。只有一棵树，就不会有这个问题。
 */
import type { ReactNode } from "react";
import { source } from "@/lib/source";
import { toPathsTree } from "@/lib/paths-tree";
import { AreaLayout } from "@/components/workbench/area-layout";

export default function PathsLayout({ children }: { children: ReactNode }) {
  return <AreaLayout tree={toPathsTree(source.getPageTree())}>{children}</AreaLayout>;
}
