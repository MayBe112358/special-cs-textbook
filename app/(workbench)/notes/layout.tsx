/**
 * @module        个人心得这一块的布局——左边是一棵和课程目录同样形状的心得树
 * @problem       心得要按课程树排布，每门课对应它的心得空间。
 * @design        把课程树换一下网址（lib/notes-tree.ts），交给共用的 AreaLayout。
 * @courses       UC Berkeley CS61B（树的表示与变换）；Stanford CS147（信息架构：同一份结构在不同场景下的用法）
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2 —— CS61B Gitlet：用树组织数据
 * @prereq        知道 layout 会包住这个文件夹下的所有页面。
 * @unclear       心得树每一项后面的小数字要等浏览器读完本地数据才出现，比课程名晚一瞬间。
 * @letter
 * 心得区左边那棵树，是借课程目录的树改出来的，只换了网址（lib/notes-tree.ts）。
 * 所以两边永远一样长：课程目录多了一门课，心得区自动就多了一个心得空间，不用谁记着去加。
 *
 * 这个文件本身只有几行，因为三块工作区共用的东西都在 AreaLayout 和外层布局里了。
 * 它只说清楚自己跟别人不一样的那一点：左边放的是心得树。
 */
import type { ReactNode } from "react";
import { source } from "@/lib/source";
import { toNotesTree } from "@/lib/notes-tree";
import { AreaLayout } from "@/components/workbench/area-layout";

export default function NotesLayout({ children }: { children: ReactNode }) {
  return <AreaLayout tree={toNotesTree(source.getPageTree())}>{children}</AreaLayout>;
}
