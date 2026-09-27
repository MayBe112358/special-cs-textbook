/**
 * @module        网址与终端工作目录之间的翻译
 * @problem       浏览器看见的是 /docs/programming-intro/cs61a，虚拟文件系统看见的是
 *                /programming-intro/cs61a；而课程是文件，不能被当作 cd 后的工作目录。
 *                终端每次执行命令前都需要从当前网址得到一个合法目录，不能自己另存当前位置。
 * @design        去掉部署前缀与 /docs 后，把剩余路径交给虚拟文件系统确认；分类直接作为目录，
 *                课程页面使用它的父分类作为工作目录。无法识别的网址保守回到根目录。
 *                认两个入口：/docs（课程目录）和 /notes（个人心得，阶段 14.5 起和课程目录共用同一套知识路径）；
 *                /paths（学习路径）不对应树上的位置，回到根目录。
 *                函数只接收字符串和文件系统，不读取 window，也不依赖 Next。
 * @courses       MIT Missing Semester（工作目录与路径）；MIT 6.S081、UCB CS162（文件和目录）；
 *                软件工程类课程（从单一事实派生状态）
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/ —— 真终端里的工作目录和路径
 *                https://pdos.csail.mit.edu/6.S081/2021/labs/fs.html —— xv6 文件系统 lab，看内核怎么把路径解析成目录
 * @prereq        知道网址由一段段路径组成，文件的上一层是它所在的目录。
 * @unclear       入口前缀写死在一个正则里；将来再多一块区域，要记得在这里登记。
 *
 * @letter
 * cd 那章说过，这个项目里“你现在在哪”只看地址栏。这个文件就是把这句话落到实处的地方。
 *
 * 它只做一件事：把网址翻译成终端里的位置。比如网址是 /docs/systems/operating-systems，终端就站在 /systems/operating-systems。
 * 去掉前面的 /docs，剩下的就是了。线上部署的时候网址前面还多一截 /special-cs-textbook，所以代码是找 /docs 在哪，而不是假设它在最前面。
 *
 * 有个边界情况挺有意思。你打开 CS61A 的课程页，网址是 /docs/programming-intro/cs61a，
 * 按上面的规则，终端应该站在 /programming-intro/cs61a。可 cs61a 是个文件啊，shell 没法站在一个文件里。
 * 所以这种时候，终端站在它所在的那个目录 /programming-intro。你还是能 cat cs61a，也能 ls 看看同一类的其他课。
 * 这不算是“另存了一个位置”，只是按文件系统的规矩，从同一个网址推出一个合法的目录。
 *
 * 阶段 14.5 加了心得区之后，这个函数又多认了一个入口 /notes。心得区的网址和课程目录用的是同一套路径，
 * 你在看 CS61A 的心得时，终端也站在 /programming-intro，和你看课程页的时候一样。
 * 学习路径区 /paths 不对应树上的任何位置，那就回到根目录。
 *
 * 认不出来的网址（比如一门已经删掉的课）一律回根目录。
 * 我觉得这样比报错好：终端总得站在某个地方，站在根目录上，你随时都能 ls 看看自己在哪、再走回去。
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
