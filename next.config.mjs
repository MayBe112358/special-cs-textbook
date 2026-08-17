/**
 * @module        Next.js 与 Fumadocs MDX 的构建入口
 * @problem       浏览器不能直接把 MDX 文档变成带导航的网页，构建工具需要知道如何读取这些内容。
 * @design        使用 Fumadocs 官方的 Next.js 插件并保持静态导出；只在线上构建时加入 GitHub Pages 仓库前缀。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript; The Missing Semester 构建工具
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        知道源文件会先经过构建，再成为浏览器能打开的 HTML、CSS 和 JavaScript。
 * @unclear       如果仓库将来改名，GITHUB_PAGES_BASE_PATH 也要随部署配置一起更新。
 *
 * @letter
 * 你现在看到的是网站构建的总开关。MDX 很像“能在 Markdown 里使用组件的文档”，浏览器却不认识它，
 * 所以我们让 Fumadocs 在构建时先把文档翻译成网页。这里坚持输出纯静态文件，是为了让第一版不依赖
 * 一台一直运行的服务器。GitHub Pages 把项目放在 /special-cs-textbook 下面，而本地没有这层路径，
 * 所以只有部署构建会注入前缀；内容里的链接仍然只写站内地址，不必知道网站最终放在哪里。
 */
import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const basePath = process.env.GITHUB_PAGES_BASE_PATH ?? "";

const config = {
  output: "export",
  reactStrictMode: true,
  basePath,
  // GitHub Pages 没有服务器帮忙把 /docs 改写成 /docs.html，目录式地址最稳妥。
  trailingSlash: true,
};
export default createMDX()(config);
