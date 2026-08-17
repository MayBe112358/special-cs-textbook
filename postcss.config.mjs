/**
 * @module        Tailwind CSS 的构建配置
 * @problem       Fumadocs 的默认样式需要在构建时被整理成浏览器能读取的 CSS。
 * @design        只启用 Tailwind CSS 4 官方插件，不添加颜色、字体或其他美化设置。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        知道 CSS 决定网页元素如何排版和显示。
 * @unclear       unknown
 *
 * @letter
 * 这份文件本身不决定页面长什么样，它只是告诉构建工具去处理 Fumadocs 已经提供的默认样式。
 * 现阶段我们刻意不在这里增加审美选择，因为步骤 1.1 要验证的是文档框架能不能工作，而不是好不好看。
 */
export default { plugins: { "@tailwindcss/postcss": {} } };
