/**
 * @module        手机侧边栏抽屉顶上的三块入口——课程目录、学习路径、个人心得
 * @problem       手机上没有左侧活动栏的位置，三块之间总得有地方切换。
 * @design        放在抽屉最上面，三个等宽按钮，当前那块填蓝。和活动栏共用同一份清单、同一个“回到上次停留的页面”规则。
 *                宽屏上这一截被 globals.css 整个藏起来（那时有活动栏）。
 * @courses       Stanford CS147（移动端导航）
 * @exercises     https://cs147.stanford.edu/ —— Stanford CS147 的原型与可用性测试作业
 * @prereq        知道同一份数据可以有两种显示方式。
 * @unclear       四个按钮放不下图标和文字时只留文字。第四个“AI”不换页面，而是打开全屏的 AI 面板。
 * @letter
 * 手机上没地方放左边那条活动栏，可三块之间总得能切换。所以在侧边栏抽屉的最上面放了一排按钮：课程目录、学习路径、个人心得，再加一个 AI。
 *
 * 它和宽屏上的活动栏，是同一件事在两种屏幕上的样子。
 * 两边读的是同一张清单（WORKBENCH_AREAS），点了以后也用同一条规矩：回到你上次在那一块停留的页面。
 * 所以哪天要再加一块，只改那张清单，两边一起变。一件事只写一次，这话你在这本教材里已经听过很多遍了，这里又是一个例子。
 *
 * 第四个按钮“AI”跟前三个不一样，它不换页面，而是打开一个全屏的 AI 面板。手机屏幕太小，没办法让对话和正文并排待着。
 */
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WORKBENCH_AREAS } from './activity-bar';
import { areaOf, useTabs } from './tabs';
import { setMobileAi } from './side-view';

export function DrawerAreas() {
  const pathname = usePathname();
  const { tabs, lastVisit } = useTabs();
  const current = areaOf(pathname);
  return (
    <nav aria-label="切换工作区" className="grid grid-cols-4 gap-1.5 text-sm">
      {WORKBENCH_AREAS.map((area) => {
        const last = lastVisit[area.id];
        const href = last && tabs.some((t) => t.url === last) ? last : area.home;
        return (
          <Link key={area.id} href={href} aria-current={current === area.id ? 'page' : undefined} className={`cs-btn ${current === area.id ? 'cs-btn-primary' : ''}`}>
            {area.label}
          </Link>
        );
      })}
      <button type="button" className="cs-btn" onClick={() => setMobileAi(true)}>AI</button>
    </nav>
  );
}
