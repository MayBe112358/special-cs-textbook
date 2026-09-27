/**
 * @module        双向跳转的两块牌子——课程页上的“对应哪些代码”，讲解页上的“对应哪些课”
 * @problem       这本教材的设定是课程当目录、源码当正文，可在这之前两边是断开的：
 *                你在 CS61A 页面上看不出该去读哪段代码，在命令引擎的讲解页上也看不出它对应哪门课。
 *                断开的目录和正文，等于两本书装订在了一起——读者没法从一边走到另一边，那个“环”就没合上。
 * @design        两块牌子都不接受手写的清单，它们只认索引里那份从注释算出来的对应关系（见 [[cross-reference]]）。
 *                所以链接不会过期：你在源码注释的 @courses 里加一门课，重新构建之后，
 *                课程页上立刻多出这个模块，讲解页上也立刻多出这门课，没有第二个地方要改。
 *                对应不上的时候老实说“还没有”，而不是把这一栏藏起来——空着是有信息量的：
 *                它说明这门课目前还没有对应的代码，而那正是这本教材将来该补的地方。
 * @courses       MIT 6.042J（关系与图：一门课和一段代码之间是多对多）；UC Berkeley CS61B（图的邻接表与反向查找）；
 *                CMU 15-445 与 UCB CS186（反向索引：正着查和反着查用的是同一份数据）；
 *                Harvard CS50x Week 8（超链接：网页之间怎么连起来）
 * @exercises     https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-spring-2015/ —— 6.042J 里讲关系与图的几讲和配套习题
 *                https://sp21.datastructur.es/materials/proj/proj2/proj2 —— CS61B Gitlet：用图组织数据、反向查找
 * @prereq        知道网页上的链接可以指向本站另一页；知道“A 指向 B”不等于“B 也指向 A”，反向那一半要另外算。
 * @unclear       现在两边都只列出对方的标题。等模块多起来之后，也许需要按分类分组或者折叠，
 *                但那要等真的多到读不过来时再说，现在提前分组只是凭空猜一个结构。
 *
 * @letter
 * 课程页底下的“本课对应的项目实现”，讲解页上的“读懂这里需要先学”，就是这两块牌子。它们是这本教材“合上环”的那一下。
 *
 * 一本普通教材里，目录和正文天生就连着：目录上写着第 3 章在第 47 页，你翻过去就是了。
 * 这个项目把目录和正文拆成了两样东西，课程页在 content 里，正文在源码注释里。两边各自都挺完整，可它们之间原本一根线都没有。
 * 这两块牌子，就是那些线。
 *
 * 有意思的是，这两块牌子是不对称的。
 * 源码注释里写着“这段代码对应 CS61A”，这是写代码的人亲手写下的一句话，方向是从代码指向课程。
 * 可课程页上要显示的是反过来那一半：“有哪些代码指向了我”。这句话从来没人写过，得由程序把所有模块过一遍，挑出提到这门课的，这个动作叫反向查找。
 *
 * 那为什么不在课程页上也手写一份清单？因为那样同一件事就写了两遍，两遍早晚会不一样。
 * 规矩是：一件事只写一次，另一边由程序算出来。数据库课里管这叫“别存能算出来的东西”，CMU 15-445 或者 CS186 会正面讲它。
 * 所以你在某个源文件的 @courses 里加一门课，重新构建一下，课程页和讲解页两边就同时多了一条链接，没有第二个地方要改。
 *
 * 还有个细节：对不上的时候，这里显示一句“还没有”，而不是干脆把这一栏藏起来。
 * 空栏看着不太体面，但它诚实：它告诉你这门课目前还没有对应的代码。一个把空栏都藏起来的网站，会让人误以为每门课都安排妥当了。
 */
import knowledgeIndexJson from "@/core/knowledge/generated/knowledge-index.json";
import { coursesForModule, modulesForCourse } from "@/core/knowledge/cross-reference";
import type { KnowledgeIndex, ModuleEntry } from "@/core/knowledge/knowledge-index";
import Link from "next/link";

const knowledgeIndex = knowledgeIndexJson as KnowledgeIndex;

/**
 * 课程页最底下那一栏：学完这门课之后，可以回头读项目里的哪些代码。
 *
 * 这一栏没有写在课程的 MDX 里，而是画在这里，原因是它不属于内容作者：
 * 它是从源码注释算出来的结果，写进 MDX 就等于把算出来的东西又抄了一遍。
 */
export function CourseModules({ courseId }: { courseId: string }) {
  const modules = modulesForCourse(knowledgeIndex.modules, courseId);

  return (
    <>
      <h2 id="project-modules">本课对应的项目实现</h2>
      {modules.length === 0 ? (
        <p>
          还没有源码模块在注释里点到这门课。
          这不是遗漏，只是这本教材目前写下的代码还没有和它对上——将来对上了，这里会自己长出来。
        </p>
      ) : (
        <>
          <p>学完这门课，可以回头读项目里的这几段代码。它们的正文就写在源文件顶部的注释里。</p>
          <ul>
            {modules.map((module) => (
              <li key={module.path}>
                <Link href={module.url}>{module.title}</Link>
                <span> —— </span>
                <code>{module.file}</code>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * 讲解页上那一行：这段代码对应到本站已经收录的哪几门课。
 *
 * 它只列得出本站有的课。注释里提到却还没收录的（比如 Stanford CS143），
 * 完整保留在上面那段原话里——那些点不动的名字，正是这棵课程树将来该补的地方。
 */
export function ModuleCourses({ module }: { module: ModuleEntry }) {
  const courses = coursesForModule(knowledgeIndex.courses, module.courseIds);
  if (courses.length === 0) {
    return <p>上面提到的课，本站目前一门都还没有收录。</p>;
  }

  return (
    <p>
      本站收录的对应课程：
      {courses.map((course, index) => (
        <span key={course.id}>
          {index === 0 ? "" : "、"}
          <Link href={course.url}>{course.title}</Link>
        </span>
      ))}
    </p>
  );
}
