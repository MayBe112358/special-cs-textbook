/**
 * @module        文档布局共享选项
 * @problem       各页面需要显示一致的网站名称，又不该在每个页面重复写一遍。
 * @design        只设置站名、点站名回首页、手机顶栏上的标签切换按钮，其余交给 Fumadocs 默认。
 *                三块工作区之间的切换由活动栏（宽屏）和侧边栏抽屉顶上的按钮（手机）负责，不放在这里。
 * @courses       Harvard CS50x Week 8（HTML、CSS、JavaScript）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：导航栏
 * @prereq        知道组件可以接收一组配置来改变显示内容。
 * @unclear       带 key 的写法是为了消掉 React 的警告，依赖 Fumadocs 把这些元素放进列表的方式；升级 Fumadocs 后要看控制台还有没有警告。
 *
 * @letter
 * Fumadocs 的布局要一份“共享选项”，这里给的东西很少：网站叫什么、点标题回哪儿，还有手机顶栏上那个切换标签的按钮。
 *
 * 站名前面那个 ~/ 小标志，跟宽屏顶栏（components/top-bar.tsx）用的是同一个。手机上和电脑上看到的站名长得一样，你不会以为进错了网站。
 *
 * 这里的元素都带着 key，看着有点多余，其实是被逼出来的。
 * 这些元素是在服务器上生成的，传到浏览器时先是一个“待加载”的占位，Fumadocs 把它们塞进一个子元素列表以后才真正加载出来。
 * React 这时候看见“列表里有元素没 key”，就会在控制台报警告。
 * 给它们各加一个 key，警告就没了。这种“功能上完全没问题、但控制台一直在叫”的警告，最好当场处理掉，不然真出事的时候，重要的报错会淹在一堆噪音里。
 */
import { Fragment } from "react";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { MobileTabSwitcher } from "@/components/workbench/tab-bar";
export function baseOptions(): BaseLayoutProps {
  // 和全站顶栏（components/top-bar.tsx）用同一个 ~/ 标志，手机上看到的站名和宽屏一致。
  return {
    nav: {
      url: "/",
      // 手机标题栏里的标签切换（宽屏上标签栏在内容区上方，这个按钮自己会藏起来）。
      // 这里的元素都要带 key：它们在服务器上生成，传到浏览器时先是“待加载”的占位，被 Fumadocs 放进子元素列表后才加载出来，
      // React 那时会把它们当成“列表里没有 key 的元素”报警告（components/workbench/area-layout.tsx 的 DrawerAreas 是同一回事）。
      children: <MobileTabSwitcher key="mobile-tabs" />,
      title: (
        <Fragment key="site-title">
          <span aria-hidden="true" className="rounded-[3px] bg-cs-button px-1.5 font-mono text-xs leading-5 text-cs-button-foreground">~/</span>
          <span className="text-[0.9375rem]">一本特殊的 CS 教材</span>
        </Fragment>
      ),
    },
  };
}
