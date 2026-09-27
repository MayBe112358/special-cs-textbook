/**
 * @module        页面标题下面那个紫色小标签——"作者：学完"
 * @problem       读者在一门课的页面上会想知道：写这本教材的人自己学到哪了、这段代码作者读懂了没有。
 *                难的不是把这个数字显示出来，是让读者一眼看出它不是自己的——
 *                页面上同时还有一栏"我的学习状态"，两栏挨着放，长得像就会被当成同一件事。
 * @design        一个只读的小标签：没有按钮，点不动，文字直接写"作者：学完"，悬停时说清它是公开内容。
 *                它和"我的状态"那排分段按钮挨着放，但长得完全不一样——按钮是蓝色、能按；它是紫色、是一段话。
 *                紫色在全站只用来标"作者写的东西"（心得卡片也是），不和任何访问者数据共用。
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
 * 页面标题下面那个紫色小标签：“作者：学完”。它的代码短得有点可疑，因为真正花心思的地方不在代码里，而在“它不做什么”。
 *
 * 它没有按钮，你在上面点不动任何东西。因为作者的进度不是你能改的：它写在仓库的 content/author-progress.json 里，要改就得改仓库，而不是改你的浏览器。
 * 这里要是放一个看着能按的东西，不管按下去发生啥，都会让人误以为这一栏和你自己的状态是同一套东西。
 *
 * 它也没有“正在读取……”这种等待状态，因为根本没什么可读的：作者的状态在网站构建成静态文件的那一刻，就已经写进这一页的 HTML 里了。
 * 旁边你自己的状态按钮，得等浏览器把 localStorage 交给它，才知道该亮哪一个。
 * 这一下细微的时间差，恰好如实说出了两者的身份：一个是写死在书里的内容，一个是你自己在书上做的记号。
 *
 * 它原来是页面底部单独一栏，后来挪到了标题下面，跟你的状态按钮排在一行。放在一起才方便对照，区分它们的任务就交给了形状和颜色，而不是距离。
 *
 * 鼠标停上去会看到一句小字：“作者公开的进度：随项目保存，所有读者看到的都一样，和你自己的标记互不影响。”
 * 作者也只是这本教材的读者之一，作者的进度是展示出来的内容，不是给你定的目标。
 * 你比作者快还是慢都说明不了什么，这棵课程树上本来就没有一条规定好的路线。
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

/** 两条线共用的样子。作者没公开时什么都不画——一个写着"未公开"的标签只是噪音。 */
function AuthorChip({ state }: { state: string | null }) {
  if (state === null) return null;
  return (
    <span className="cs-chip cs-chip-author" title="作者公开的进度：随项目保存，所有读者看到的都一样，和你自己的标记互不影响。">
      <span aria-hidden="true">作者：</span>
      <span className="sr-only">作者的进度：</span>
      {state}
    </span>
  );
}

/** 课程页上：作者这门课学到哪了。 */
export function AuthorCourseProgress({ courseId }: { courseId: string }) {
  const state = authorCourseState(authorProgress, courseId);
  return <AuthorChip state={state === null ? null : STATE_LABELS[state]} />;
}

/** 源码讲解页上：作者把这一段读到什么程度了。 */
export function AuthorModuleProgress({ modulePath }: { modulePath: string }) {
  const state = authorModuleState(authorProgress, modulePath);
  return <AuthorChip state={state === null ? null : UNDERSTANDING_LABELS[state]} />;
}
