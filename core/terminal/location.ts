/**
 * @module        网址与终端工作目录之间的翻译
 * @problem       浏览器看见的是 /docs/programming-intro/cs61a，虚拟文件系统看见的是
 *                /programming-intro/cs61a；而课程是文件，不能被当作 cd 后的工作目录。
 *                终端每次执行命令前都需要从当前网址得到一个合法目录，不能自己另存当前位置。
 * @design        去掉部署前缀与 /docs 后，把剩余路径交给虚拟文件系统确认；分类直接作为目录，
 *                课程页面使用它的父分类作为工作目录。无法识别的网址保守回到根目录。
 *                函数只接收字符串和文件系统，不读取 window，也不依赖 Next。
 * @courses       MIT Missing Semester（工作目录与路径）；MIT 6.S081、UCB CS162（文件和目录）；
 *                软件工程类课程（从单一事实派生状态）
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/
 *                https://pdos.csail.mit.edu/6.S081/2021/labs/fs.html
 * @prereq        知道网址由一段段路径组成，文件的上一层是它所在的目录。
 *                阶段 14.5 起，个人心得区的网址（/notes/programming-intro/cs61a）和课程目录用的是同一套知识路径，
 *                所以这里认两个入口：/docs 和 /notes。在心得区里，终端的位置和你正在看的那门课一致。
 *                学习路径区（/paths）不对应知识树里的某个位置，终端回到根目录。
 * @unclear       入口前缀写死在一个正则里；将来再多一块区域，要记得在这里登记。
 *
 * @letter
 * 这个函数是“地址栏是唯一真相”真正落地的地方。终端不保存 currentDirectory；每次要执行命令，
 * 都重新把 usePathname 给出的地址翻译成知识树目录。鼠标导航、浏览器后退、复制链接新开页面，
 * 最后都会改变或恢复同一个地址，所以终端不需要接收任何“侧边栏刚被点击了”的通知。
 *
 * 课程页面有个小边界：/programming-intro/cs61a 在树里是一份文件，而 shell 不能站在文件里面。
 * 因此打开课程时，提示符停在它所属的 /programming-intro；你仍能 cat cs61a，也能 ls 看同目录课程。
 * 这不是藏一份不同位置，而是从同一个网址按文件系统规则推导出合法工作目录。
 */
import type { VirtualFileSystem } from "../filesystem/virtual-file-system.ts";

export function pathnameToWorkingDirectory(
  pathname: string,
  fileSystem: VirtualFileSystem,
): string {
  // 找到第一段完整的 docs 或 notes（前面可能还有 GitHub Pages 的部署前缀）。
  const entry = /\/(?:docs|notes)(?=\/|$)/.exec(pathname);
  if (entry === null) return fileSystem.root.path;

  const afterDocs = pathname.slice(entry.index + entry[0].length).replace(/\/+$/, "");
  const knowledgePath = afterDocs === "" ? "/" : afterDocs;
  const node = fileSystem.nodeAt(knowledgePath);
  if (node === null) return fileSystem.root.path;
  return node.kind === "directory" ? node.path : node.parentPath;
}
