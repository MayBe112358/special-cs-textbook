/**
 * @module        Windows 静态导出预取文件修正
 * @problem       Next.js 16.3.1 在 Windows 上把预取文件中的反斜杠保留成目录，浏览器却请求以点连接的文件名，站内跳转因此退化成整页刷新。
 * @design        构建完成后只为 out 中 __next 开头的嵌套预取文件补上正确文件名，不改依赖包；Linux 产物已经正确，这一步自然不产生复制。
 * @courses       MIT Missing Semester（构建系统与调试）；Harvard CS50x Week 8（浏览器如何请求文件）；UC Berkeley CS162（文件路径）
 * @exercises     https://missing.csail.mit.edu/2020/metaprogramming/ —— Missing Semester：构建流程和可重复产物
 *                https://missing.csail.mit.edu/2020/debugging-profiling/ —— Missing Semester：顺着现象往回查问题
 * @prereq        文件路径在 Windows 用反斜杠，在网址中用正斜杠。
 * @unclear       升级 Next.js 后需要复核这一上游问题；产物恢复正确时此脚本可移除。
 * @letter
 * 这个脚本是一次真实排错留下来的。你可能会碰到一个很怪的现象：直接打开网页没问题，可一点站内链接，终端的命令历史就被清空了。
 *
 * 历史被清空，说明整个页面被刷新了，而不是站内跳转。站内跳转本来应该只换正文、不动终端的。
 * 顺着浏览器的请求往回查，发现浏览器想要的是一个用点连接起来的文件名，比如 __next.docs.cs61a.txt；可在 Windows 上构建出来的，磁盘上却是好几层目录。
 * 文件找不到，Next.js 就退回到整页刷新，终端就跟着没了。
 *
 * 根子在 Next.js 16.3.1 里：它用 Windows 的路径函数收集文件，然后只把正斜杠换成点，漏掉了 Windows 用的反斜杠。
 * 在 Linux 上构建（比如 GitHub 部署的时候）就没这个问题。
 *
 * 修法很克制：不去改 node_modules 里的框架代码，也不重写路由，只是在构建结束以后，把浏览器真正会请求的那个文件名补一份出来。原来的文件留着不动。
 * Linux 上构建出来的产物本来就对，这个脚本在那儿什么都不会复制。
 *
 * 这件事最值得带走的是一句话：编译成功不等于部署能用。构建完了，一定要用静态服务器亲自点一遍。
 * 等哪天 Next.js 修好了这个问题，这个脚本就可以删了。
 */
import { copyFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('out');
let copied = 0;
function visit(directory: string, prefix: string[] = []): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const parts = [...prefix, entry.name];
    if (entry.isDirectory()) visit(absolute, parts);
    else if (entry.name.endsWith('.txt')) {
      const start = parts.findIndex((part) => part.startsWith('__next.'));
      if (start >= 0 && start < parts.length - 1) {
        copyFileSync(absolute, join(root, ...parts.slice(0, start), parts.slice(start).join('.')));
        copied++;
      }
    }
  }
}
visit(root);
console.log(`静态预取文件检查完成：补齐 ${copied} 个文件。`);
