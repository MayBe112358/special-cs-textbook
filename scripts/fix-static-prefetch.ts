/**
 * @module        Windows 静态导出预取文件修正
 * @problem       Next.js 16.3.1 在 Windows 上把预取文件中的反斜杠保留成目录，浏览器却请求以点连接的文件名，站内跳转因此退化成整页刷新。
 * @design        构建完成后只为 out 中 __next 开头的嵌套预取文件补上正确文件名，不改依赖包；Linux 产物已经正确，这一步自然不产生复制。
 * @courses       MIT Missing Semester 构建工具；CS50x Web 开发
 * @exercises     https://missing.csail.mit.edu/2020/metaprogramming/ —— 构建流程和可重复产物
 * @prereq        文件路径在 Windows 用反斜杠，在网址中用正斜杠。
 * @unclear       升级 Next.js 后需要复核这一上游问题；产物恢复正确时此脚本可移除。
 * @letter
 * 你会看到一个奇怪的现象：直接打开网页没问题，点链接却把终端历史清空了。
 * 我沿浏览器请求往回查，发现它要的是一个以点连接的文件名，磁盘上却是几层目录。
 * 框架用 Windows 的路径函数收集文件，再只替换正斜杠，漏掉了反斜杠。
 * 这里不重写路由，也不改 node_modules，而是在构建出口补齐浏览器真正会请求的文件。
 * 原文件留着，正确产物也不受影响。这个例子提醒你：编译成功不等于部署可用，必须用静态服务器亲自点一次。
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
