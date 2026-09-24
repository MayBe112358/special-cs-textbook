/**
 * @module        知识图谱页面入口
 * @problem       读者需要从目录进入跨分类的先修关系视图。
 * @design        构建时传入公开课程元数据，浏览器只处理拖动与缩放。
 * @courses       CS61B 图；CS50x Web
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 页面组织
 * @prereq        图的关系和图的显示位置是两份不同的数据。
 * @unclear       图只覆盖已有编号的先修，不能替代课程官方的完整要求。
 * @letter
 * 我把图放在独立页面，让阅读教材时不必下载和渲染一大张图。
 * 课程内容仍是唯一来源，页面不另存一份关系清单；这是防止两处说法不一致的最简单办法。
 */
import Link from 'next/link';
import {TopBar} from '@/components/top-bar';
import index from '@/core/knowledge/generated/knowledge-index.json';
import {CourseGraph} from '@/components/graph/course-graph';
export default function GraphPage(){return <><TopBar/><main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 md:px-8 md:pt-10">
  <h1 className="text-2xl font-semibold md:text-3xl">课程先修关系</h1>
  <p className="mb-8 mt-2 text-fd-muted-foreground">从各课程页的先修字段自动画出来的关系图。</p>
  <CourseGraph courses={index.courses}/>
</main></>;}
