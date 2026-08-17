/**
 * @module        文档区域的三栏布局
 * @problem       读者需要同时看到全站目录、当前正文和本页小标题，才能在长文档中定位。
 * @design        直接使用 Fumadocs DocsLayout，并让自动生成的页面树驱动左侧栏。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript; CS61B 树结构
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ ; https://sp21.datastructur.es/materials/proj/proj2/proj2
 * @prereq        页面布局、树形目录，以及 React 的 children 表示被布局包住的正文。
 * @unclear       大规模课程树的折叠体验要到 ROADMAP 1.2 才能验证。
 *
 * @letter
 * 三栏并不是三份互不相干的数据：左边来自全部文档组成的树，中间是当前页面，右边来自当前页面的
 * 小标题。我们把布局交给 Fumadocs，是为了先得到可靠的导航骨架；等假页面能完整走通，才有资格把
 * 真实课程放进这棵树。
 */
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";
export default function DocumentationLayout({ children }: { children: ReactNode }) {
  return <DocsLayout {...baseOptions()} tree={source.getPageTree()}>{children}</DocsLayout>;
}
