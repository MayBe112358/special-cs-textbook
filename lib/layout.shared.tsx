/**
 * @module        文档布局共享选项
 * @problem       各页面需要显示一致的网站名称，又不该在每个页面重复写一遍。
 * @design        只设置导航标题，保留 Fumadocs 的其余默认布局与默认样式。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        知道组件可以接收一组配置来改变显示内容。
 * @unclear       正式导航内容与站点名称展示方式要在后续内容步骤验证。
 *
 * @letter
 * 这一步最重要的是看清框架原本提供了什么，所以这里只告诉它网站叫什么。颜色、字体、动画都没有
 * 藏在这里提前决定。等功能链路走通后再谈外观，我们才知道是在修饰真正能用的东西。
 */
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
export function baseOptions(): BaseLayoutProps {
  return { nav: { title: "一本特殊的 CS 教材" } };
}
