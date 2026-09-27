/**
 * @module        课程目录这一块的布局——左边是课程树
 * @problem       课程目录需要一棵按分类组织的课程树做侧边栏。
 * @design        只把 Fumadocs 生成的课程树交给共用的 AreaLayout；顶栏、活动栏、终端、标签都在外层 (workbench) 布局里。
 * @courses       UC Berkeley CS61B（树的表示与变换）；Stanford CS147（信息架构：同一份结构在不同场景下的用法）
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2 —— CS61B Gitlet：用树组织数据
 * @prereq        知道 layout 会包住这个文件夹下的所有页面。
 * @unclear       三块的差别只在左边那棵树；要是将来某一块需要不同的右栏或顶栏，AreaLayout 得再开一个口子。
 * @letter
 * 课程目录这一块的布局，就这么几行：把 Fumadocs 从 content/docs 里生成的课程树，交给三块共用的 AreaLayout。
 *
 * 这个文件以前有一百多行。后来三块工作区要共用顶栏、活动栏、终端、标签页，这些东西就都搬到了外层布局和 AreaLayout 里。
 * 每一块只需要说清楚自己跟别人不一样的那一点。在这里，是“左边放课程树”。
 * 代码越往后写越短，往往说明共用的部分被抽对了地方。
 */
import type { ReactNode } from "react";
import { source } from "@/lib/source";
import { AreaLayout } from "@/components/workbench/area-layout";

export default function DocumentationLayout({ children }: { children: ReactNode }) {
  return <AreaLayout tree={source.getPageTree()}>{children}</AreaLayout>;
}
