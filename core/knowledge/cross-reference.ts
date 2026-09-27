/**
 * @module        课程与代码之间的连线——从 @courses 那段话里认出本站收录的课程
 * @problem       这本教材要合上一个环：读者在课程页上应该看到“学完它可以读哪些代码”，
 *                在代码讲解页上应该看到“读懂它需要先学哪些课”。这两个方向的链接必须自动生成，
 *                因为手写的对应表和注释迟早会各说各话，而且没人知道该信哪一份。
 *                可注释里的 @courses 是一段人话（“UC Berkeley CS61A（解释器）；Stanford CS143……”），
 *                不是一串编号。所以中间缺一步：把那段散文和课程清单对上号。
 * @design        规则只有一条，写在这里一处：课程编号在那段话里出现过，就算连上线。
 *                对比时把两边都规整成小写、用短横线连起来的词串（“MIT 6.S081”→“mit-6-s081”），
 *                再要求整段编号作为完整的一节出现，不是随便一个子串——否则 cs61a 会在 cs61ab 里蒙对。
 *                考虑过另外两种做法，都放弃了：
 *                （1）在注释里另加一个 @courseIds 字段，专门写编号。它最准，但要改 AGENTS.md 定下的字段表，
 *                     而且同一件事要写两遍（课名一遍、编号一遍），迟早对不上。
 *                （2）用课程标题去匹配。标题是一整句（“MIT 6.S081 Operating System Engineering”），
 *                     而注释里只会提它的一小截，匹配不上的时候比匹配上的时候多。
 *                认不出来是正常结果，不是错误：注释里本来就会提到本站没收录的课（Stanford CS143 就是），
 *                那段原话在讲解页上完整保留，只是没有链接可点。
 * @courses       UC Berkeley CS61A（数据抽象与匹配）；MIT 6.042J（关系：一门课和一段代码之间的多对多关系）；
 *                CMU 15-445 与 UCB CS186（外键、连接、反向索引）；Stanford CS143（把文本对上符号表）
 * @exercises     https://15445.courses.cs.cmu.edu/fall2023/project1/ —— CMU 15-445 项目一：缓冲池，体会“查找”背后的数据结构
 *                https://cs61a.org/ —— CS61A 的数据抽象：先定表示，再定操作
 * @prereq        知道“一段代码可以对应多门课，一门课也可以对应多段代码”这种关系叫多对多。
 * @unclear       目前认的是课程编号，而编号取自文件名。哪天有人把 cs61a.mdx 改名成 berkeley-cs61a.mdx，
 *                所有写着“CS61A”的注释就会集体断线，而且不会有任何报错——这是这条规则最脆的地方。
 *                将来如果课程数量涨到几百门，或者出现编号相互包含的课，可能需要在课程里显式登记别名。
 *                注释里常被提到、但课程树还没收录的课：Stanford CS147（三十来处）、UCB CS164、UCB CS160（各十几处），
 *                以及 CS294、CS155、CS276、CS172 等。它们在讲解页上显示为点不动的课名。
 *
 * @letter
 * 这个文件解决一个很具体的小麻烦：注释里写的是“UC Berkeley CS61A（解释器）”，课程清单里那门课的编号是 cs61a。
 * 明明说的是同一门课，字面上却完全对不上。
 *
 * 最老实的办法，是让写注释的人直接把编号写上。我没这么干，倒不是偷懒。
 * 注释是写给人看的信，信里写“UC Berkeley CS61A（解释器项目）”很自然，写个“cs61a”就开始像配置文件了。
 * 再说，一件事要是得写两遍（课名一遍、编号一遍），哪天改了一边忘了另一边，你根本看不出来。
 * 所以我让程序去认。麻烦留给程序，别留给写信的人。
 *
 * 认的办法是先把两边捏成同一个形状。“MIT 6.S081”里有空格、有点、有大写字母，编号是 mit-6-s081。
 * 把不是字母数字的东西都换成短横线，字母全转小写，前者就变成了 mit-6-s081，两边长得一模一样。
 * 这一步叫规范化（normalize）：比较两样东西之前，先把它们变成同一种写法。搜索、去重、判断相等的地方，你会一次次见到它。
 *
 * 然后有个特别容易写错的地方。规范化完了，要是直接问“这段话里有没有 cs61a 这几个字”，那一门叫 cs61 的课，就会在“CS61A”里蒙对。
 * 所以得要求编号作为完整的一节出现：两边头尾各补一个短横线再找，-cs61a- 只能对上真正的那一节 cs61a，对不上 cs61ab 里的一截。
 * 这种“子串蒙对了”的 bug 很阴，你手上那几个例子它全对，课一多才开始出错。
 *
 * 最后聊聊它认不出来的时候。注释里提到的课，本站不一定收了。
 * 我数了一下，现在的注释里 Stanford CS147（人机交互）被提了三十来次，UCB CS164 和 CS160 各十几次，可课程树里都还没有这几门。
 * 程序认不出编号，就不生成链接，但那段原话会一字不改地显示在讲解页上。
 * 我宁可给你一个点不动的课名，也不假装那门课不存在。这些点不动的名字，正好就是课程树下一步该补上的地方。
 */
import type { CourseEntry, ModuleEntry } from "./knowledge-index.ts";

/**
 * 把一段文字碾成“用短横线连起来的小写词串”，两端各补一个短横线。
 *
 * 补短横线是为了让“整词出现”这件事可以用最朴素的包含判断表达：
 * 想知道 cs61a 是不是整整一节，就看碾平后的文字里有没有 -cs61a- 这一段。
 */
function toDashedTokens(value: string): string {
  const dashed = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `-${dashed}-`;
}

/**
 * 在一段 @courses 原话里，认出哪些本站课程被点到了名。
 *
 * 返回的顺序照 courseIds 传进来的顺序（也就是课程在树里的顺序），
 * 这样同一段话在任何地方生成的链接顺序都一样——不然页面每次重新构建，链接就换个排法。
 */
export function matchCourseIds(coursesText: string, courseIds: readonly string[]): string[] {
  const haystack = toDashedTokens(coursesText);
  return courseIds.filter((id) => haystack.includes(toDashedTokens(id)));
}

/**
 * 从一门课的角度反过来看：哪些源码模块在自己的 @courses 里点了它的名。
 *
 * 这个方向没有任何人写过——作者只在源码里写了“这段代码对应 CS61A”，
 * 反过来的那一半必须把所有模块过一遍才知道。这个动作叫反向查找。
 */
export function modulesForCourse(modules: readonly ModuleEntry[], courseId: string): ModuleEntry[] {
  return modules.filter((module) => module.courseIds.includes(courseId));
}

/** 从一个模块的角度看：它对应到本站的哪几门课。本站没收录的课不会凭空出现。 */
export function coursesForModule(
  courses: readonly CourseEntry[],
  courseIds: readonly string[],
): CourseEntry[] {
  return courses.filter((course) => courseIds.includes(course.id));
}
