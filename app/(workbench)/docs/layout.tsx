/**
 * @module        课程目录这一块的布局——左边是课程树
 * @problem       课程目录需要一棵按分类组织的课程树做侧边栏。
 * @design        只把 Fumadocs 生成的课程树交给共用的 AreaLayout；顶栏、活动栏、终端、标签都在外层 (workbench) 布局里。
 * @courses       CS61B 树结构
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2
 * @prereq        知道 layout 会包住这个文件夹下的所有页面。
 * @unclear       无。
 * @letter
 * 这个文件以前有一百多行，现在只剩几行：三块共用的东西都搬到了 AreaLayout 和外层布局里。
 * 每一块只说清楚自己和别人不一样的那一点——在这里，是“左边放课程树”。
 */
import type { ReactNode } from "react";
import { source } from "@/lib/source";
import { AreaLayout } from "@/components/workbench/area-layout";

export default function DocumentationLayout({ children }: { children: ReactNode }) {
  return <AreaLayout tree={source.getPageTree()}>{children}</AreaLayout>;
}
