/**
 * @module        把 MDX 文件转换成 Fumadocs 可查询的页面集合
 * @problem       页面路由和侧边栏都需要用统一方式查找文档，不能各自理解一次文件目录。
 * @design        使用 Fumadocs loader 包装自动生成的文档集合，并统一放在 /docs 地址下。
 * @courses       CS61B 树结构; CMU 15-445 与 UCB CS186 的索引概念
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2
 * @prereq        对象、函数，以及网址路径和磁盘路径不是同一种东西。
 * @unclear       正式课程页面的字段与校验规则要到 ROADMAP 1.3 和 2.1 再补充。
 *
 * @letter
 * 你可以把 loader 想成图书馆的登记台：MDX 文件是书，文件夹是书架，而页面路由只向登记台询问
 * “这个网址对应哪一本”。侧边栏也从同一个登记结果拿到整棵目录树。把这层单独放在这里，是为了
 * 避免页面组件自己到处翻文件；数据入口越集中，未来生成知识索引时越不容易出现两套答案。
 */
import { docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";
export const source = loader({ baseUrl: "/docs", source: docs.toFumadocsSource() });
