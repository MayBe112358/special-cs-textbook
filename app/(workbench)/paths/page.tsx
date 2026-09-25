/**
 * @module        学习路径页面入口
 * @problem       访问者需要一个固定地址管理自己的路线。
 * @design        构建时只传课程目录，私人路径到浏览器挂载后才读取。
 *                阶段 14.5 起路径是导图（components/paths/paths-workbench.tsx），当前是哪一条写在 ?path= 里。
 * @courses       CS50x Web；CS61A 数据边界
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 页面导航
 * @prereq        静态 HTML 不能包含尚未打开页面的读者的私人数据。
 * @unclear       路径不提供跨设备链接分享，迁移依靠备份。
 * @letter
 * 我把公开课程目录和私人路径的相遇点放在这里。网页可以提前生成，但你的选择不能被提前猜出来。
 * 因此页面只交给编辑器一张公开清单，编辑器打开后再读本机数据，仍然不需要服务器或账号。
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
