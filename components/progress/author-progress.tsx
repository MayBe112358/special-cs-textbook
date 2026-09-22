/**
 * @module        页面上"作者的进度"那一栏
 * @problem       读者在一门课的页面上会想知道：写这本教材的人自己学到哪了、这段代码他读懂了没有。
 *                难的不是把这个数字显示出来，是让读者一眼看出它不是自己的——
 *                页面上同时还有一栏"我的学习状态"，两栏挨着放，长得像就会被当成同一件事。
 * @design        整栏只读：没有按钮，点不动，标题直接写"作者的进度"，
 *                下面一句话说清它是公开内容、你那栏是本机数据。
 *                作者的数据在构建时就从内容文件读好，所以这一栏是服务端渲染的静态文字，
 *                不等浏览器、不会闪一下才出现——而访问者那两栏必须等页面挂载后才读得到。
 *                这个差别本身就是最好的区分：一个是内容，一个是你的。
 * @courses       Harvard CS50x Week 8（HTML 与页面结构）；UC Berkeley CS61A（数据抽象）；
 *                软件工程类课程（同一屏上并列显示两份来源不同的数据）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 页面组织与公开内容
 * @prereq        知道这个网站没有服务器：作者的进度是构建时写死进页面的，你的进度是打开页面后才读的。
 * @unclear       两栏并排是否真的分得清，只能靠人眼验收。如果将来有人反馈弄混了，
 *                该改的是这里的措辞和位置，而不是把两份数据合并。
 *
 * @letter
 * 这一栏的代码短得有点可疑——真正花心思的地方不在代码里，在"它不做什么"。
 *
 * 它没有按钮。你在这一栏上点不动任何东西，因为作者的进度不是你能改的：
 * 它写在仓库的 content/author-progress.json 里，改它要改仓库，而不是改你的浏览器。
 * 如果这里放一个看起来能按的按钮，不管按下去发生什么，都会让人以为两栏是同一套东西。
 *
 * 它也没有等待状态。你不会看到"正在读取……"，因为根本没什么可读的——
 * 作者的状态在网站被构建成静态文件的那一刻就已经写进这一页的 HTML 了。
 * 下面那栏"我的学习状态"则会先显示一句"正在读取本机记录……"，
 * 因为它要等浏览器把 localStorage 交给它。这一下细微的时间差，恰好如实地说出了两者的身份。
 *
 * 最后是那句你可能会跳过的小字："公开内容，随项目保存。"它不是免责声明，是这本教材的一条规矩：
 * 作者也只是这本教材的读者之一，他的进度是被展示的内容，不是别人的目标。
 * 你比他快或者比他慢，都不说明什么——这棵课程树上本来就没有一条规定的路线。
 */
import authorProgressJson from '@/content/author-progress.json';
import knowledgeIndexJson from '@/core/knowledge/generated/knowledge-index.json';
import {
  authorCourseState,
  authorModuleState,
  checkAuthorTargets,
  parseAuthorProgress,
} from '@/core/progress/author-progress';
import { STATE_LABELS, UNDERSTANDING_LABELS } from '@/core/progress/progress';

/**
 * 内容文件只在这里读一次，构建时就读。
 *
 * 放在模块最外层是故意的：文件写错了，构建当场失败，错误信息指出是哪一条，
 * 而不是等网站发布出去之后，作者发现自己标过的东西一个都没显示。
 */
const authorProgress = parseAuthorProgress(authorProgressJson);
checkAuthorTargets(authorProgress, {
  courseIds: knowledgeIndexJson.courses.map((course) => course.id),
  modulePaths: knowledgeIndexJson.modules.map((module) => module.path),
});

/** 两条线共用的外壳。只读，没有按钮，这是它和下面那栏最要紧的区别。 */
function AuthorLine({ state, empty, mine }: { state: string | null; empty: string; mine: string }) {
  return (
    <section aria-label="作者的进度" className="not-prose my-8 border-t border-fd-border pt-6">
      <h2 className="text-xl font-semibold">作者的进度</h2>
      <p className="my-2 text-sm text-fd-muted-foreground">
        公开内容，随项目保存，所有读者看到的都一样。下面的「{mine}」是你自己的，只存在这台浏览器里，两者互不影响。
      </p>
      <p className="my-3">{state === null ? <span className="text-fd-muted-foreground">{empty}</span> : <strong>{state}</strong>}</p>
    </section>
  );
}

/** 课程页上的那一栏：作者这门课学到哪了。 */
export function AuthorCourseProgress({ courseId }: { courseId: string }) {
  const state = authorCourseState(authorProgress, courseId);
  return (
    <AuthorLine
      state={state === null ? null : STATE_LABELS[state]}
      empty="作者还没有公开这门课的进度。"
      mine="我的学习状态"
    />
  );
}

/** 源码讲解页上的那一栏：作者把这一段读到什么程度了。 */
export function AuthorModuleProgress({ modulePath }: { modulePath: string }) {
  const state = authorModuleState(authorProgress, modulePath);
  return (
    <AuthorLine
      state={state === null ? null : UNDERSTANDING_LABELS[state]}
      empty="作者还没有公开这一段的理解度。"
      mine="我的理解度"
    />
  );
}
