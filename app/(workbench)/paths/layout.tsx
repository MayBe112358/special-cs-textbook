/**
 * @module        学习路径这一块的布局——左边也是课程树，用来把课程拖到导图上
 * @problem       排学习路线时，手边需要一份完整的课程清单，随时拖一门进来。
 * @design        和课程目录共用同一棵课程树（同一个 AreaLayout）：点课程名照样打开课程介绍，按住拖到画布上就加进路线。
 *                只是分类的那一页被去掉了（lib/paths-tree.ts），点分类只展开收起，不会离开正在编辑的路径。
 * @courses       UC Berkeley CS61B（树的表示与变换）；Stanford CS147（信息架构：同一份结构在不同场景下的用法）
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2 —— CS61B Gitlet：用树组织数据
 * @prereq        知道拖放（drag and drop）会把被拖元素的链接一起带过去。
 * @unclear       分类在这里没有介绍页可看；想看分类介绍，要切回课程目录那一块。
 * @letter
 * 学习路径区左边还是课程树，用来把课拖进画布。
 *
 * 这里复用课程树，而不是另做一份“能拖的课程列表”，是因为两份清单早晚会对不上：
 * 课程目录新加了一门课，拖放列表却忘了加，你就会纳闷“这门课怎么拖不进来”。只有一棵树，就不会有这个问题。
 *
 * 唯一的改动是把分类自己那一页去掉了（lib/paths-tree.ts）。这样在这里点分类名只会展开、收起，不会一下子跳走，离开你正在排的路线。
 */
import type { ReactNode } from "react";
import { source } from "@/lib/source";
import { toPathsTree } from "@/lib/paths-tree";
import { AreaLayout } from "@/components/workbench/area-layout";

export default function PathsLayout({ children }: { children: ReactNode }) {
  return <AreaLayout tree={toPathsTree(source.getPageTree())}>{children}</AreaLayout>;
}
