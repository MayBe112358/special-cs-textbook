/**
 * @module        个人心得这一块的布局——左边是一棵和课程目录同样形状的心得树
 * @problem       心得要按课程树排布，每门课对应它的心得空间。
 * @design        把课程树换一下网址（lib/notes-tree.ts），交给共用的 AreaLayout。
 * @courses       CS61B 树结构
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2
 * @prereq        知道 layout 会包住这个文件夹下的所有页面。
 * @unclear       无。
 * @letter
 * 心得区没有自己的树，它借用课程目录的树，只换了网址。这样两边永远一样长——课程目录多一门课，心得区就多一个空间。
 */
import type { ReactNode } from "react";
import { source } from "@/lib/source";
import { toNotesTree } from "@/lib/notes-tree";
import { AreaLayout } from "@/components/workbench/area-layout";

export default function NotesLayout({ children }: { children: ReactNode }) {
  return <AreaLayout tree={toNotesTree(source.getPageTree())}>{children}</AreaLayout>;
}
