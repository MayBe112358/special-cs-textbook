/**
 * @module        文档区域的三栏布局
 * @problem       读者需要同时看到全站目录、当前正文和本页小标题，还需要一个跨页面常驻的终端入口。
 *                而终端贴在视口底部，会盖住正文的最后几行和侧边栏最下面几项——三栏必须知道
 *                自己实际能用的高度只到终端上沿为止，否则总有内容永远滚不出来。
 * @design        使用 Fumadocs DocsLayout 让页面树驱动左侧栏，再把它整个交给 TerminalDock 包起来：
 *                终端在底部占一条，文档区自动缩短。缩短的办法不是自己写一套滚动容器去跟框架抢，
 *                而是用 Fumadocs 自己留出的 --fd-docs-height——侧边栏、页内目录的 sticky 高度
 *                和容器最小高度都从它算，改一个数就够了。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript（盒模型、定位、CSS 变量）; CS61B 树结构
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ ; https://sp21.datastructur.es/materials/proj/proj2/proj2
 * @prereq        页面布局、树形目录，React 的 children 表示被布局包住的正文，
 *                以及 CSS 变量会沿 DOM 往下继承。
 * @unclear       --fd-docs-height 是 Fumadocs 内部的约定名，不是它承诺过的公开接口；
 *                将来升级 Fumadocs 时要顺手确认这个名字还在。真换了名字，现象是侧边栏底部又被盖住。
 *
 * @letter
 * 三栏并不是三份互不相干的数据：左边来自全部文档组成的树，中间是当前页面，右边来自当前页面的
 * 小标题。我们把布局交给 Fumadocs，是为了先得到可靠的导航骨架；等假页面能完整走通，才有资格把
 * 真实课程放进这棵树。终端放在这里还有一个容易忽略的理由：布局跨课程页面保留，命令历史才是真正的
 * “本次会话”，而不是每点一篇课程就被清空的一次性组件。
 *
 * 这一行 containerProps 值得多说一句，因为它是一次“先读框架、再动手”的示范。
 *
 * 终端占了底部一条，文档区就得变矮。直觉的做法是自己套一层固定高度的盒子、把三栏塞进去、
 * 再给它开一个内部滚动条。这会立刻和 Fumadocs 打架：它的侧边栏和页内目录用的是 sticky
 * （跟着页面滚，滚到位置就贴住），高度写死成一屏。你在外面套一个更矮的盒子，它们并不知道，
 * 于是照样按一屏算，多出来的部分继续戳到终端底下去。
 *
 * 翻了一下它的源码，发现这件事人家早想过了：容器上有个 --fd-docs-height，默认 100dvh，
 * 而侧边栏高度、页内目录高度、容器最小高度全都是从这个数算出来的。也就是说它留了一个旋钮，
 * 专门用来回答“这个布局实际能用多高”。我们要做的只是把答案从“一整屏”改成“一整屏减去终端”。
 *
 * 这就是为什么值得先读一遍再写：自己造的那套要写几十行 CSS、还要和框架的 sticky 长期角力；
 * 用它留的旋钮只要一行，而且以后它自己改进布局时我们跟着受益。代价是这个变量名不算公开承诺，
 * 升级时要看一眼——所以上面 @unclear 里写清楚了它坏掉时长什么样。这类“借了别人内部实现”的地方
 * 不写下来才是真危险：出问题时症状（侧边栏底部被盖住）和原因（一个变量改名了）隔得太远，
 * 三个月后没人想得到要去那儿找。
 */
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { CSSProperties, ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";
import { TerminalDock } from "@/components/terminal/terminal";

/** --fd-terminal-height 由 TerminalDock 挂在外层，随终端展开/折叠变化，这里只是减掉它。 */
const docsContainerStyle = {
  "--fd-docs-height": "calc(100dvh - var(--fd-terminal-height, 0px))",
} as CSSProperties;

export default function DocumentationLayout({ children }: { children: ReactNode }) {
  return (
    <TerminalDock>
      <DocsLayout
        {...baseOptions()}
        tree={source.getPageTree()}
        containerProps={{ style: docsContainerStyle }}
      >
        {children}
      </DocsLayout>
    </TerminalDock>
  );
}
