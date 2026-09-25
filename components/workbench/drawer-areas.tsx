/**
 * @module        手机侧边栏抽屉顶上的三块入口——课程目录、学习路径、个人心得
 * @problem       手机上没有左侧活动栏的位置，三块之间总得有地方切换。
 * @design        放在抽屉最上面，三个等宽按钮，当前那块填蓝。和活动栏共用同一份清单、同一个“回到上次停留的页面”规则。
 *                宽屏上这一截被 globals.css 整个藏起来（那时有活动栏）。
 * @courses       Stanford CS147（移动端导航）
 * @exercises     https://hci.stanford.edu/courses/cs147/
 * @prereq        知道同一份数据可以有两种显示方式。
 * @unclear       三个按钮放不下图标和文字时只留文字。
 * @letter
 * 活动栏和这里是同一件事在两种屏幕上的样子。它们读的是同一张清单（WORKBENCH_AREAS），
 * 所以将来加第四块，只改一处，两边一起变——这又是“一个事实只写一次”。
 */
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WORKBENCH_AREAS } from './activity-bar';
import { areaOf, useTabs } from './tabs';

export function DrawerAreas() {
  const pathname = usePathname();
  const { tabs, lastVisit } = useTabs();
  const current = areaOf(pathname);
  return (
    <nav aria-label="切换工作区" className="grid grid-cols-3 gap-1.5 text-sm">
      {WORKBENCH_AREAS.map((area) => {
        const last = lastVisit[area.id];
        const href = last && tabs.some((t) => t.url === last) ? last : area.home;
        return (
          <Link key={area.id} href={href} aria-current={current === area.id ? 'page' : undefined} className={`cs-btn ${current === area.id ? 'cs-btn-primary' : ''}`}>
            {area.label}
          </Link>
        );
      })}
    </nav>
  );
}
