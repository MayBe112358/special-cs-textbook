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
 * @exercises     https://15445.courses.cs.cmu.edu/fall2023/project1/ —— 索引：反着查为什么要单独建一份
 *                https://cs61a.org/ —— 数据抽象：先定表示，再定操作
 * @prereq        知道“一段代码可以对应多门课，一门课也可以对应多段代码”这种关系叫多对多。
 * @unclear       目前认的是课程编号，而编号取自文件名。哪天有人把 cs61a.mdx 改名成 berkeley-cs61a.mdx，
 *                所有写着“CS61A”的注释就会集体断线，而且不会有任何报错——这是这条规则最脆的地方。
 *                将来如果课程数量涨到几百门，或者出现编号相互包含的课，可能需要在课程里显式登记别名。
 *
 * @letter
 * 这个文件解决的是一个很具体的问题：注释里写的是“UC Berkeley CS61A（解释器）”，
 * 而课程清单里那门课的编号是 cs61a。它们指的是同一件事，可字符串上完全不一样。
 *
 * 最老实的做法当然是让作者在注释里直接写编号。我没这么做，理由不是懒。
 * 注释是写给人读的一封信，信里出现“UC Berkeley CS61A（解释器项目）”是自然的，
 * 出现“cs61a”就开始像配置文件了。而且一旦要求两样都写，同一件事就有了两个说法，
 * 哪天课名改了、编号没改，你根本看不出来。所以我选择让程序去认，把不方便留给程序。
 *
 * 认的办法是这样：把两边都碾成同一种形状。“MIT 6.S081”里有空格、有点、有大写，
 * 而编号是 mit-6-s081；把非字母数字的东西统统换成短横线、字母全变小写之后，
 * 前者变成 mit-6-s081，两边就长得一样了。这一步有个通用的名字叫规范化（normalize）：
 * 比较两样东西之前，先把它们变成同一种写法。你以后在搜索、去重、判等的地方会反复见到它。
 *
 * 然后是一个我第一版写错的细节。规范化之后如果直接问“这段话里有没有 cs61a 这几个字符”，
 * 那么一门叫 cs61 的课会在“CS61A”里蒙对，而 cs61a 也会在某个假想的 cs61ab 里蒙对。
 * 修法是把整段话也切成短横线连起来的词，再要求编号作为完整的一节出现——
 * 也就是两边都在头尾补一个短横线之后再找。这样 -cs61a- 只会匹配到真正的 cs61a 那一节。
 * 这类“子串匹配蒙对了”的 bug 很典型：它在你测试的那几个例子上全对，等课程多了才开始出错。
 *
 * 最后说说这条规则的诚实边界。注释里提到的课，本站不一定收录：Stanford CS143 和 UCB CS164
 * 在好几个文件的 @courses 里出现过，但课程树里现在没有它们。这时候程序认不出编号，就不生成链接——
 * 而那段原话仍然一字不改地显示在讲解页上。这是有意的：**这本教材宁可给你一个点不动的课名，
 * 也不假装那门课不存在。**那些点不动的名字，正是这棵课程树将来该补上的地方。
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
