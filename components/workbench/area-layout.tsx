/**
 * @module        工作区三块共用的三栏布局——课程目录、学习路径、个人心得都用它
 * @problem       读者需要同时看到全站目录、当前正文和本页小标题，还需要一个跨页面常驻的终端入口。
 *                而终端贴在视口底部，会盖住正文的最后几行和侧边栏最下面几项——三栏必须知道
 *                自己实际能用的高度只到终端上沿为止，否则总有内容永远滚不出来。
 * @design        使用 Fumadocs DocsLayout 让页面树驱动左侧栏，再把它整个交给 TerminalDock 包起来（在外层 app/(workbench)/layout.tsx）：
 *                终端在底部占一条，文档区自动缩短。缩短的办法不是自己写一套滚动容器去跟框架抢，
 *                而是用 Fumadocs 自己留出的 --fd-docs-height——侧边栏、页内目录的 sticky 高度
 *                和容器最小高度都从它算，改一个数就够了。
 *                阶段 14.5 起三块都用这一个布局，只是左边那棵树不同：课程目录和学习路径用课程树，
 *                个人心得用一棵同样形状、但每一项都指向心得空间的树。header 那一格在宽屏上换成了标签栏。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript（盒模型、定位、CSS 变量）; CS61B 树结构
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：盒模型、定位和 CSS 变量
 *                https://sp21.datastructur.es/materials/proj/proj2/proj2 —— CS61B Gitlet：树形结构的组织
 * @prereq        页面布局、树形目录，React 的 children 表示被布局包住的正文，
 *                以及 CSS 变量会沿 DOM 往下继承。
 * @unclear       --fd-docs-height 是 Fumadocs 内部的约定名，不是它承诺过的公开接口；
 *                将来升级 Fumadocs 时要顺手确认这个名字还在。真换了名字，现象是侧边栏底部又被盖住。
 *
 * @letter
 * 课程目录、学习路径、个人心得这三块，用的都是这一个布局：左边一棵树，中间正文，右边本页小标题。三块的差别只在左边那棵树长什么样。
 *
 * 这个文件真正值得看的，是一行 containerProps，它是“先读框架源码、再动手”的一个好例子。
 *
 * 问题是这样的：终端占了底部一条，内容区就得变矮，不然侧边栏最下面几项会一直被压在终端底下。
 * 最直觉的做法，是自己套一个固定高度的盒子，把三栏塞进去，再给它开一个内部滚动条。
 * 这么干会立刻和 Fumadocs 打起来。它的侧边栏和页内目录用的是 sticky（跟着页面滚，滚到位置就贴住），高度写死成一整屏。
 * 你在外面套一个更矮的盒子，它们根本不知道，照样按一整屏算，多出来那截继续戳到终端底下去。
 *
 * 翻了一下 Fumadocs 的源码才发现，人家早就想到这件事了：容器上有个变量叫 --fd-docs-height，默认是一整屏（100dvh），侧边栏的高度、页内目录的高度、容器的最小高度，全都是从这个数算出来的。
 * 等于说它留了一个旋钮，专门回答“这个布局实际能用多高”。
 * 我们要做的，只是把答案从“一整屏”改成“一整屏减去终端的高度”。一行就够了。
 *
 * 自己造一套得写几十行 CSS，还得跟框架的 sticky 长年掰手腕；用它留的旋钮只要一行，以后它自己改进布局，我们还能跟着沾光。
 * 代价是这个变量名不是 Fumadocs 公开承诺过的接口，哪天升级它可能就改名了。
 * 所以 @unclear 里写清楚了坏掉时是什么样子：侧边栏底部又被盖住。
 * 这种“借用了别人内部实现”的地方，不写下来才是真危险。症状（侧边栏底部被盖住）和原因（某个变量改了名）隔得太远，三个月后谁也想不到要去那儿找。
 */
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { Root } from "fumadocs-core/page-tree";
import type { CSSProperties, ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { WorkbenchHeader } from "@/components/workbench/tab-bar";
import { DrawerAreas } from "@/components/workbench/drawer-areas";

/**
 * --fd-terminal-height 由 TerminalDock 挂在外层，随终端展开/折叠变化，这里只是减掉它。
 * 宽屏上：--fd-banner-height 是顶栏（TopBar）的高度，侧边栏和页内目录停在它下面；
 * --fd-header-height 是标签栏的高度（Fumadocs 原本给手机标题栏用的那一格，宽屏上换成了标签栏）。
 */
const docsContainerStyle = {
  "--fd-docs-height": "calc(100dvh - var(--fd-terminal-height, 0px))",
} as CSSProperties;

export function AreaLayout({ tree, children }: { tree: Root; children: ReactNode }) {
  return (
    <DocsLayout
      {...baseOptions()}
      tree={tree}
      slots={{ header: WorkbenchHeader }}
      // key 不能省：这个元素在服务器上生成，传到浏览器时先是一个“待加载”的占位，Fumadocs 把它放进子元素列表那一刻，
      // React 还认不出它是个固定位置的元素；等它加载出来，React 看到的是“列表里一个没有 key 的元素”，就会报警告。
      sidebar={{ collapsible: false, banner: <DrawerAreas key="drawer-areas" /> }}
      containerProps={{ style: docsContainerStyle, className: "md:[--fd-banner-height:2.75rem] md:[--fd-header-height:2.1875rem]" }}
    >
      {children}
    </DocsLayout>
  );
}
