/**
 * @module        页面标题上方那一行路径：~ / programming-intro / cs50x
 * @problem       Fumadocs 默认的面包屑只写“编程入门”这样的中文标题。它能让你往上走一层，
 *                却没告诉你这一页在终端里叫什么——而这本教材希望鼠标和终端说的是同一种语言。
 * @design        直接把网址里的知识路径写出来，用等宽字体，每一段都能点，点了就去那一层。
 *                它和终端提示符 /programming-intro $ 是同一个东西的两种样子：一个告诉你“这一页在哪”，
 *                一个告诉你“终端现在站在哪”（课程页的提示符是它的上一层，因为课程是文件，不是目录）。
 *                路径从地址推出来，不另存状态。
 * @courses       MIT Missing Semester（路径、工作目录）；Stanford CS147（让界面说出系统模型）
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/
 * @prereq        知道“/a/b/c”是一层套一层的位置，~ 是这棵树的根。
 * @unclear       路径段用的是英文目录名，不懂英文的读者可能更想看中文标题；中文标题就在下面那行大字里。
 *
 * @letter
 * 这一行小字其实是一次悄悄的教学：你每打开一页，都会看到它在这棵树里的“地址”长什么样。
 * 看多了，你在终端里敲 cd systems/compilers 的时候，脑子里自然就有那张图——不用背，是被看会的。
 * 这也是为什么这里宁可显示有点生硬的英文目录名，也不换成更好读的中文：
 * 中文标题只在网页上有，而目录名是你在终端里真正要敲的东西。
 */
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function PathBreadcrumb() {
  // /docs/programming-intro/cs50x/ → ["programming-intro", "cs50x"]
  const segments = usePathname().replace(/^\/docs\/?/, '').split('/').filter(Boolean);
  return (
    <nav aria-label="当前位置" className="flex min-w-0 flex-wrap items-center gap-x-1 font-mono text-xs text-fd-muted-foreground">
      <Link href="/docs" className="hover:text-fd-primary hover:underline" title="课程目录的根">~</Link>
      {segments.map((segment, index) => {
        const href = `/docs/${segments.slice(0, index + 1).join('/')}`;
        const last = index === segments.length - 1;
        return (
          <span key={href} className="flex items-center gap-x-1">
            <span aria-hidden="true">/</span>
            {last ? (
              <span aria-current="page" className="text-fd-foreground">{segment}</span>
            ) : (
              <Link href={href} className="hover:text-fd-primary hover:underline">{segment}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
