/**
 * @module        静态导出瘦身——删掉构建产物里浏览器永远不会来要的文件
 * @problem       Next.js 静态导出时，每一页除了 index.html，还会写一份 index.txt 和一份 __next._full.txt。
 *                两份内容一字不差（都是这一页完整的 RSC 数据，约 130 KB，里面有整棵课程树），
 *                六百多页乘下来各占约 80 MB，整个网站因此多出将近五分之一。GitHub Pages 整站上限 1 GB。
 * @design        只删一样：__next._full.txt。依据是查过 Next.js 16 客户端路由的源码，也在浏览器里实测过：
 *                - 静态导出模式下，客户端预取只请求 __next._tree.txt、__next._index.txt 和各段自己的
 *                  __next.<段>.txt（node_modules/next/dist/client/components/segment-cache/cache.js 里
 *                  addSegmentPathToUrlInOutputExportMode）；
 *                - 预取没赶上时，跳转会退回去请求整页的 index.txt（router-reducer/fetch-server-response.js），
 *                  所以 index.txt 必须留着；
 *                - __next._full.txt 在客户端代码里没有任何地方拼得出来，它是给有服务器的部署准备的。
 *                不改 Next.js 本身，也不碰别的文件；删完打印删了多少，方便核对。
 * @courses       MIT Missing Semester（构建工具与产物）；UC Berkeley CS162 / CS168（缓存、按需加载）
 * @exercises     https://missing.csail.mit.edu/2020/metaprogramming/ —— Missing Semester：构建系统
 * @prereq        知道静态网站就是一堆文件，浏览器要哪个就下载哪个；没人要的文件只占地方。
 * @unclear       依据的是当前版本 Next.js 的行为。升级 Next.js 后要重新确认客户端还是不请求 _full
 *                （办法：打开网站点几个页面，看浏览器网络面板里有没有 _full.txt 的 404）。
 *
 * @letter
 * 网站为什么有 460 MB？这个脚本是顺着这个问题查出来的第一个答案。
 *
 * 查的过程值得记一下，因为它比结论更有用。
 * 第一步，按文件类型把构建产物分堆称重：html 多少、txt 多少、js 多少。结果 txt 占了三分之二。
 * 第二步，挑一页，把它的每个文件都打开看。发现有两个 130 KB 左右的文件，内容一字不差：index.txt 和 __next._full.txt。
 * 第三步，不去猜哪个有用，而是让浏览器真的把网站点一遍，把它请求过的文件都记下来。结果这两个文件一次都没被请求过。
 *
 * 到这儿能不能两个都删？还不行。“这次没被请求”不等于“永远不会被请求”。
 * 于是又去读了 Next.js 客户端路由的源码，发现 index.txt 在“预取没赶上”的时候会被拿来用（网速慢的时候就会遇到），只有 _full.txt 在客户端代码里根本拼不出来，它是给有服务器的部署准备的。
 * 所以只删 _full.txt。六百多页，一页一份，一共省下八九十兆。
 *
 * 测量告诉你“哪里可疑”，源码告诉你“能不能动”。两样都查过了才下手。
 * 不然你省下的那 80 MB，可能换来某个网速慢的读者点不开页面，而你在自己电脑上永远复现不出来。
 *
 * 这个结论是针对现在这个版本的 Next.js 的。哪天升级了，要重新确认一遍：打开网站点几个页面，看浏览器网络面板里有没有请求 _full.txt 却 404 的。
 */
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('out');
const UNUSED = '__next._full.txt';
let removed = 0;
let bytes = 0;

function visit(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) visit(absolute);
    else if (entry.name === UNUSED) {
      bytes += statSync(absolute).size;
      rmSync(absolute);
      removed++;
    }
  }
}

visit(root);
console.log(`静态导出瘦身完成：删掉 ${removed} 个 ${UNUSED}，共 ${(bytes / 1048576).toFixed(1)} MB。`);
