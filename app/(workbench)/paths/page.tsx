/**
 * @module        学习路径页面入口
 * @problem       访问者需要一个固定地址管理自己的路线。
 * @design        构建时只传课程目录，私人路径到浏览器挂载后才读取。
 *                阶段 14.5 起路径是导图（components/paths/paths-workbench.tsx），当前是哪一条写在 ?path= 里。
 * @courses       Harvard CS50x Week 8–9（静态页面与浏览器存储）；UC Berkeley CS61A（公开数据与私人数据的边界）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：页面导航
 * @prereq        静态 HTML 不能包含尚未打开页面的读者的私人数据。
 * @unclear       路径不提供跨设备链接分享，迁移依靠备份。
 * @letter
 * 这个文件是公开的课程目录和你私人的学习路线碰头的地方。
 *
 * 网页是提前生成好的，可你的路线不可能被提前猜出来。
 * 所以这里只把公开的课程清单和作者的示例路线交给编辑器；编辑器在你的浏览器里打开以后，再去读你自己存的路线。
 * 全程不需要服务器，也不需要账号。
 *
 * 那个 <Suspense> 不能省。编辑器要读网址里的 ?path=，而静态导出的时候，Next.js 要求读查询参数的组件必须包在 Suspense 里，不然构建直接失败。
 * 这个坑踩过一次，所以这里专门留了一行注释。
 */
import { Suspense } from 'react';
import { PathsWorkbench } from '@/components/paths/paths-workbench';
import index from '@/core/knowledge/generated/knowledge-index.json';
import example from '@/content/path-example.json';
import type { CourseEntry } from '@/core/knowledge/knowledge-index';

export const metadata = { title: '学习路径' };

export default function PathsPage() {
  return (
    <main className="flex min-w-0 flex-col [grid-area:main]">
      {/* 读查询参数（?path=）的组件要包在 Suspense 里，静态导出才能通过。 */}
      <Suspense fallback={<p className="p-6 text-sm text-fd-muted-foreground">正在打开……</p>}>
        <PathsWorkbench courses={index.courses as CourseEntry[]} example={example} />
      </Suspense>
    </main>
  );
}
