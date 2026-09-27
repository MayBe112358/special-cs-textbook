/**
 * @module        Next.js 与 Fumadocs MDX 的构建入口
 * @problem       浏览器不能直接把 MDX 文档变成带导航的网页，构建工具需要知道如何读取这些内容。
 * @design        使用 Fumadocs 官方的 Next.js 插件并保持静态导出；只在线上构建时加入 GitHub Pages 仓库前缀。
 * @courses       Harvard CS50x Week 8（HTML、CSS、JavaScript）；MIT Missing Semester（构建系统）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：静态网页
 *                https://missing.csail.mit.edu/2020/metaprogramming/ —— Missing Semester：构建系统
 * @prereq        知道源文件会先经过构建，再成为浏览器能打开的 HTML、CSS 和 JavaScript。
 * @unclear       如果仓库将来改名，GITHUB_PAGES_BASE_PATH 也要随部署配置一起更新。
 *                transpilePackages 里那一项是为了绕开一个环境限制（见下），换一台机器构建时它不碍事，
 *                但它本不该是这份配置需要操心的事。
 *
 * @letter
 * 这是网站构建的总开关。
 *
 * MDX 是一种“能在 Markdown 里写组件”的格式，浏览器不认识它，所以要在构建的时候，让 Fumadocs 先把它翻译成网页。
 *
 * output: "export" 这一行最要紧：它让 Next.js 把整个网站输出成一堆静态文件，不需要一台一直开着的服务器。
 * 这本教材就是这么部署到 GitHub Pages 上的，也正因为这样，任何人 fork 走都能免费挂出自己的一份。
 *
 * GitHub Pages 会把网站放在 /special-cs-textbook 这个路径下面，本地调试的时候却没有这一层。
 * 所以前缀（basePath）只在部署构建时从环境变量注入，内容里的链接只管写站内地址，不用知道网站最后放在哪儿。
 *
 * transpilePackages: ["shiki"] 那一行，是被环境逼出来的。shiki 默认被当成“外部包”，构建工具会在 .next 里建一个指向它的目录链接（Windows 上叫 junction）。
 * 作者的项目放在一个云盘目录里，那个云盘不支持这种链接，一建就失败，整个构建跟着挂。
 * 这一行等于在说：别建链接了，把 shiki 一起打包进来。代价是产物稍微大一点。换一台普通的电脑构建，它也不碍事。
 */
import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const basePath = process.env.GITHUB_PAGES_BASE_PATH ?? "";

const config = {
  output: "export",
  // 代码着色用的 shiki 默认被当成"外部包"，于是构建工具要在 .next 里建一个指向它的目录链接
  //（Windows 叫 junction）。本项目所在的云盘不支持这种链接，建不出来整个构建就失败。
  // 这一行等于说：别建链接了，把 shiki 一起打包进来。代价是构建产物稍大一点。
  transpilePackages: ["shiki"],
  reactStrictMode: true,
  basePath,
  // GitHub Pages 没有服务器帮忙把 /docs 改写成 /docs.html，目录式地址最稳妥。
  trailingSlash: true,
};
export default createMDX()(config);
