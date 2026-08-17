/**
 * @module        文档内容来源的声明
 * @problem       页面导航和正文需要从同一批内容文件生成，否则新增页面时容易漏改其中一处。
 * @design        把 content/docs 作为唯一文档目录，交给 Fumadocs MDX 自动生成页面树。
 * @courses       CS61B 树结构; CMU 15-445 与 UCB CS186 的索引概念
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2
 * @prereq        文件夹、文件，以及“目录可以由文件结构生成”的基本概念。
 * @unclear       当前只有假页面；课程元数据的正式格式要到 ROADMAP 1.3 再确定。
 *
 * @letter
 * 左边的目录并不是手写两遍的菜单。我们只把文档放进 content/docs，这份声明让 Fumadocs 从文件结构
 * 推出页面树。这样正文和目录来自同一个事实来源：以后新增一页时，不会出现正文已经存在、菜单却忘了
 * 加入口的情况。这里先用假页面验证这条链路，正式课程结构留给后面的步骤。
 */
import { defineDocs } from "fumadocs-mdx/config";
export const docs = defineDocs({ dir: "content/docs" });
