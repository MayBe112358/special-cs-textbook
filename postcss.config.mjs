/**
 * @module        Tailwind CSS 的构建配置
 * @problem       Fumadocs 的默认样式需要在构建时被整理成浏览器能读取的 CSS。
 * @design        只启用 Tailwind CSS 4 官方插件；颜色、字体、间距写在 app/globals.css 和组件的 class 里，不在这里。
 * @courses       Harvard CS50x Week 8（HTML、CSS）；MIT Missing Semester（构建工具）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：用 CSS 排一个页面
 * @prereq        知道 CSS 决定网页元素如何排版和显示。
 * @unclear       Tailwind 4 的配置大多搬进了 CSS 文件本身（@theme 等），这里几乎只剩一个开关；升级 Tailwind 时看一眼官方迁移说明。
 *
 * @letter
 * 这份文件本身不决定页面长什么样，它只是告诉构建工具：用 Tailwind CSS 4 的官方插件去处理样式。
 *
 * 网站的颜色、字体、间距这些，都写在 app/globals.css 和各个组件的 class 里。这里只负责把那些写法翻译成浏览器能读的 CSS，是一条流水线的入口。
 * 一行配置，就是全部内容。
 */
export default { plugins: { "@tailwindcss/postcss": {} } };
