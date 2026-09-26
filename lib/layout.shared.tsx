/**
 * @module        文档布局共享选项
 * @problem       各页面需要显示一致的网站名称，又不该在每个页面重复写一遍。
 * @design        只设置导航标题，保留 Fumadocs 的其余默认布局与默认样式。
 *                阶段 14 起，“学习路径 / 知识图谱”两个链接不再交给 Fumadocs 放进侧边栏，
 *                而是由全站顶栏（components/top-bar.tsx）和手机抽屉负责；这里只剩手机顶栏要用的站名。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        知道组件可以接收一组配置来改变显示内容。
 * @unclear       正式导航内容与站点名称展示方式要在后续内容步骤验证。
 *
 * @letter
 * 这一步最重要的是看清框架原本提供了什么，所以这里只告诉它网站叫什么。颜色、字体、动画都没有
 * 藏在这里提前决定。等功能链路走通后再谈外观，我们才知道是在修饰真正能用的东西。
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
