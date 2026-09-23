/**
 * @module        代码讲解页——把一个源文件顶部的注释块画成一张能读的网页
 * @problem       这本教材的正文写在源码注释里，可注释只有打开源文件的人才看得到。
 *                读者要读它，就得先装编辑器、先会用仓库、先知道该翻哪个文件——这几道门槛把绝大多数人挡在外面了。
 *                注释块已经被扫进索引，接下来缺的是最后一段路：让它在网站上有一张自己的页面，
 *                和课程页并排站着，能被链接、能被 cd 进去、能被分享。
 * @design        页面结构直接照搬注释块的字段顺序：先说它解决什么问题、为什么这样设计，
 *                再说对应哪些课、去做哪个官方作业，最后才是那封长信。理由是读者进来时通常在问
 *                “这是干嘛的、我要不要读”，让他先拿到判断依据，再决定要不要花二十分钟读信。
 *                正文用最普通的 h2、p、ul 交给 Fumadocs 的 DocsBody 排版，不写任何自定义样式：
 *                第一版不碰外观是项目的硬规矩，而且长文的可读性本来就是它默认给得最好的东西。
 *                页内目录（右边那一栏）由这里现算，不是让 Fumadocs 去解析正文——
 *                因为这页的标题是固定那几个，我们本来就知道它们是什么，没必要绕一圈再认回来。
 * @courses       Harvard CS50x Week 8（HTML 的语义标签：标题、段落、列表各自表示什么）；
 *                UC Berkeley CS61A（数据抽象：页面只是同一份数据的一种视图）；
 *                前端框架与渲染（这一块在任何 CS 课程体系里都是空白，正是这本教材的独有价值）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 用语义标签写一页真正的网页
 *                https://cs61a.org/ —— 抽象屏障：谁该知道数据长什么样
 * @prereq        知道网页由标题、段落、列表这些块拼成；知道 React 组件就是一段可复用的页面。
 * @unclear       注释里的例子块一律不着色：格式里还没有“这一段是什么语言”的写法，按扩展名猜会涂错。
 *                页面上现在没有“去仓库看真正的源码”那种链接，因为项目还没有在任何地方登记过自己的仓库地址。
 *                等它有了（大概是 ROADMAP 阶段 15 写 README 的时候），这里应该补上——
 *                毕竟这一页讲的就是那个文件，读者想看原件是很自然的事。
 *
 * @letter
 * 你现在读的这段话，很可能就显示在你眼前那一页的最下面——因为这个组件正是用来显示 @letter 的。
 * 这种“自己讲自己”的感觉有点绕，但它恰好说明了这本教材的设定：源码和正文是同一样东西。
 *
 * 有一个决定值得说说：为什么页面上把 @unclear（还没讲透的地方）原样显示出来，而不是藏起来。
 *
 * 一般的文档不会这么干。文档要显得权威，所以它只写已经想明白的部分，不确定的地方要么不写，
 * 要么含糊带过。但这本教材是一个人一边学一边写的，藏起来的代价是：读者会以为每一处都想清楚了，
 * 于是当他读不懂某一段时，他会默认是自己的问题。而实际上，有些地方本来就还没讲透。
 *
 * 把“这里我没讲透”明明白白写在页面上，等于告诉读者：卡在这里不是你笨，是这本书还没写到位。
 * 这些位置将来正是最该被补上的章节——它们是这本教材的待办清单，写在读者看得见的地方。
 *
 * 另一个小决定：@courses 那一栏显示的是注释里的原话，而不是只显示几个能点的课程链接。
 * 因为注释里提到的课，这个网站不一定收录（比如 Stanford CS143）。只显示能点的，
 * 等于悄悄把没收录的那几门抹掉了；而它们恰恰是这棵课程树将来该长出来的枝。
 * 宁可给你一个点不动的课名，也不假装那门课不存在。
 */
import { AuthorModuleProgress } from "@/components/progress/author-progress";
import { ModuleUnderstandingPanel } from "@/components/progress/module-understanding";
import knowledgeIndexJson from "@/core/knowledge/generated/knowledge-index.json";
import { PageNotes } from "@/components/notes/page-notes";
import { ModuleCourses } from "@/components/internals/cross-links";
import type { ModuleEntry } from "@/core/knowledge/knowledge-index";
import type { Paragraph } from "@/core/knowledge/doc-comment";
import type { TOCItemType } from "fumadocs-core/toc";
import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import type { ReactNode } from "react";

/**
 * 页面上的每一节：内部编号、显示出来的标题。数组顺序就是页面上从上到下的顺序。
 *
 * 正文和右侧目录都照着这一份生成。要是两边各写一遍，改动一个标题就得记得改两处，
 * 漏一处的表现是“目录里点某一节跳不过去”——这种毛病不会报错，只会让人觉得网站有点坏。
 */
const SECTIONS = [
  { id: "problem", heading: "它解决什么问题" },
  { id: "design", heading: "为什么这样设计" },
  { id: "courses", heading: "对应哪些课程" },
  { id: "exercises", heading: "去做哪个官方作业" },
  { id: "prereq", heading: "读懂这里需要先学" },
  { id: "unclear", heading: "还没讲透的地方" },
  { id: "letter", heading: "写给未来读者的信" },
] as const;

/** 页面上那几节的编号，例如 "problem"。 */
type SectionId = (typeof SECTIONS)[number]["id"];


/**
 * 把一组段落画成正文：普通段落是一段话，缩进的例子块画成和 MDX 里同一个样子的代码块。
 *
 * 例子块交给 ServerCodeBlock，但语言写死成 text——也就是不上色。这是想清楚之后的选择，不是没做完。
 *
 * 注释里的例子块目前装的几乎都是终端里的样子（一条命令、一行报错），不是 TypeScript 代码。
 * 如果按这个文件的扩展名当成 TS 去着色，那段文字会被涂上一堆按错误语法分出来的颜色：
 * 看着热闹，每一种颜色都不代表任何东西。颜色在代码里是有含义的（这是关键字、那是字符串），
 * 涂错了比不涂更糟。
 *
 * 真正的解法是让写注释的人自己说清楚“这一段是什么语言”，而注释格式里还没有这个写法。
 * 等注释里第一次出现真的代码样例时，该补的是那个格式，不是在这里猜。
 *
 * 另外要留意：在终端里 cat 同一个模块，拿到的仍然是纯文字。这也是故意的——
 * 命令的输出是结构化数据，怎么画是网页这一层的事，不属于数据本身。
 */
export function Paragraphs({ paragraphs }: { paragraphs: Paragraph[] }) {
  return (
    <>
      {paragraphs.map((paragraph, index) =>
        paragraph.kind === "text" ? (
          <p key={index}>{paragraph.text}</p>
        ) : (
          <ServerCodeBlock
            key={index}
            code={paragraph.lines.join("\n")}
            lang="text"
            // 和 MDX 里的代码块用同一对主题，免得同一个网站里两种代码长得不一样。
            themes={{ light: "github-light", dark: "github-dark" }}
          />
        ),
      )}
    </>
  );
}

function Section({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <>
      <h2 id={id}>{heading}</h2>
      {children}
    </>
  );
}

/**
 * 一张代码讲解页的右侧目录。
 *
 * 这几节是固定的，所以直接照着 SECTIONS 生成，不去解析已经画好的正文。
 * 反过来做（先画页面、再从页面里认出标题）也能work，但那是把自己知道的事情先扔掉再猜回来。
 */
export function moduleTableOfContents(): TOCItemType[] {
  return SECTIONS.map((section) => ({
    title: section.heading,
    url: `#${section.id}`,
    depth: 2,
  }));
}

/** @module 那一行里破折号后面那半句；没有破折号就没有副标题。 */
function moduleSubtitle(moduleLine: string): string | null {
  const at = moduleLine.indexOf("——");
  return at < 0 ? null : moduleLine.slice(at + "——".length).trim();
}

export function ModulePage({ module }: { module: ModuleEntry }) {
  const subtitle = moduleSubtitle(module.comment.module);
  const { comment } = module;

  // 每一节里放什么。上面 SECTIONS 决定顺序和标题，这里只决定内容，两件事各管各的。
  const content: Record<SectionId, ReactNode> = {
    problem: <Paragraphs paragraphs={comment.problem} />,
    design: <Paragraphs paragraphs={comment.design} />,
    courses: (
      <>
        <Paragraphs paragraphs={comment.courses} />
        <ModuleCourses module={module} />
      </>
    ),
    exercises: (
      <ul>
        {comment.exercises.map((exercise, index) => (
          <li key={index}>
            {exercise.url === null ? (
              <span>{exercise.note}</span>
            ) : (
              <>
                <a href={exercise.url} target="_blank" rel="noreferrer">
                  {exercise.url}
                </a>
                {exercise.note === "" ? null : <span> —— {exercise.note}</span>}
              </>
            )}
          </li>
        ))}
      </ul>
    ),
    prereq: <Paragraphs paragraphs={comment.prereq} />,
    unclear: <Paragraphs paragraphs={comment.unclear} />,
    letter: <Paragraphs paragraphs={comment.letter} />,
  };

  return (
    <DocsPage toc={moduleTableOfContents()} full={false}>
      <DocsTitle>{module.title}</DocsTitle>
      {subtitle === null ? null : <DocsDescription>{subtitle}</DocsDescription>}
      <DocsBody>
        <p>
          源文件：<code>{module.file}</code>
        </p>
        {SECTIONS.map((section) => (
          <Section key={section.id} id={section.id} heading={section.heading}>
            {content[section.id]}
          </Section>
        ))}
        {/* 作者的理解度是内容，构建时就写死在这一页里；下面那栏要等浏览器打开后才读得到。 */}
        <AuthorModuleProgress modulePath={module.path} />
        {/* 理解度只属于源码模块：课程页和分类页各有各的进度线，这一栏只在讲解页出现。
            整本教材有多少段代码，组件自己数不出来——它只看得见当前这一页，所以由这里传进去。 */}
        <ModuleUnderstandingPanel
          key={module.path}
          modulePath={module.path}
          modulePaths={knowledgeIndexJson.modules.map(module => module.path)}
        />
        <PageNotes key={module.path} pageId={module.path} />
      </DocsBody>
    </DocsPage>
  );
}
