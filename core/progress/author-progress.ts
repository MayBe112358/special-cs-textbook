/**
 * @module        作者公开的两条进度线：他学到哪了、他把这本教材的正文读懂了多少
 * @problem       读者在一门课的页面上会想知道一件事：写这本教材的人自己学到哪了？
 *                这个问题的答案必须满足两个条件，而它们正好和访问者自己的进度相反——
 *                它要人人可见（不是只有作者那台机器上看得到），它要跟着项目走
 *                （谁 fork 走这份仓库，谁就带走这份进度）。
 *                所以它不能存在浏览器里，只能是内容：一个写在仓库里的文件。
 *                真正的危险在于"分不清"：如果两份进度混进同一套数据，
 *                读者清空自己的记录时就会把作者的一起抹掉，而那是仓库内容，本不该被他碰到。
 * @design        作者进度单独一个内容文件（content/author-progress.json），
 *                单独一套读取函数，和访问者那套只共用状态词的定义——因为说的是同一件事，
 *                "学完"就该是同一个"学完"。除此之外两边没有任何共享的存取路径。
 *                这个文件是手写的，所以读进来要当成来路不明的数据严格检查：状态词写错、
 *                课程编号写错，都要当场抛错，而不是安静地显示成空白。
 * @courses       UC Berkeley CS61A（数据抽象：先定清楚一条记录长什么样）；
 *                Stanford CS143 与 UCB CS164（把一份手写文件读成结构化数据，错在哪要说得出来）；
 *                UC Berkeley CS186 与 CMU 15-445（数据完整性：读进来的东西不能默认它是对的）
 * @exercises     https://cs61a.org/proj/scheme/ —— 把一份手写的文本读成结构化数据并报错
 *                https://web.stanford.edu/class/cs143/ —— 官方 project 里的词法与语法检查
 * @prereq        知道 JSON 是把对象写成文字的格式；知道"内容"和"读者本机的数据"是两回事，
 *                前者跟着仓库走，后者跟着浏览器走。
 * @unclear       作者进度目前只有状态，没有"什么时候学的"。要加时间就得回答一个更难的问题：
 *                那个时间是给谁看的？读者关心的多半是"他现在到哪了"，不是一份编年史。
 *                想清楚之前先不加。
 *
 * @letter
 * 这个文件和它旁边的 progress.ts 长得很像，你可能第一反应是：为什么不合并？
 *
 * 因为它们只是形状像，身份完全不同。
 *
 * progress.ts 管的是你的进度。它存在你的浏览器里，换一台设备就没了，谁也看不见，
 * 你随时可以清空它——那是你的东西。这个文件管的是作者的进度，它是仓库里的一个文件，
 * 和课程简介、代码注释一样属于这本教材的内容：任何人打开网站看到的都是同一份，
 * 你 fork 走这个项目，它跟着一起走。
 *
 * 分开不只是"存两个地方"这么简单，它带来一条硬保证：你在浏览器里做的任何事都碰不到作者的进度。
 * 清空浏览器数据、换个浏览器、把私人心得全删了——作者那一栏一个字都不会变，
 * 因为那些操作根本够不着仓库里的文件。反过来也一样，作者改自己的进度不会动到你的记录。
 * 如果当初图省事把两者放进同一份数据再用一个字段区分，这条保证就要靠"别写错分支"来维持，
 * 而这种保证是维持不住的。让两件事从存放位置上就分开，比写十行小心翼翼的判断管用。
 *
 * 两边唯一共用的，是状态词本身——todo / learning / done、unread / read / understood。
 * 这是故意的：作者说"学完"和你说"学完"应该是同一件事，否则两栏并排放着就没法比。
 * 共用一句话的定义，不等于共用一份数据。这个区别，是这整个文件的中心。
 *
 * 最后说说为什么读这份文件要这么严格。
 *
 * 它是手打出来的——作者自己编辑，没有界面替他挡住错字。如果他把 done 写成 finished，
 * 最省事的做法是"不认识就当没标"，于是页面上什么都不显示。麻烦的是他看不出哪里错了：
 * 页面就是空的，和还没标过长得一模一样。所以这里选择当场抛错，让构建直接失败并指出是哪一条。
 * 同样的道理也适用于指向不存在的课程：checkAuthorTargets 会把这种条目拦下来。
 *
 * 这和 progress.ts 对待坏数据的态度看起来相反——那边遇到指向已删除课程的记录会照实留着。
 * 不是标准不一致，是对象不同：那是读者的数据，我们无权替他清理；这是作者的内容，
 * 错了就该在他发布之前被拦住。谁该承担错误，决定了程序该宽容还是该严厉。
 */
import {
  validCourseId,
  validModulePath,
  validState,
  validUnderstandingState,
  type ProgressState,
  type UnderstandingState,
} from "./progress.ts";

/** 内容文件的位置。错误信息里要报出来，读者才知道该去改哪个文件。 */
export const AUTHOR_PROGRESS_FILE = "content/author-progress.json";

/** 作者公开的两条进度线。课程按编号记，代码按位置记，和访问者那套的理由相同。 */
export type AuthorProgress = {
  /** 课程编号 → 状态，例如 "cs61a": "learning"。 */
  courses: Readonly<Record<string, ProgressState>>;
  /** 源码模块位置 → 理解程度，例如 "/internals/core/terminal/command-engine": "understood"。 */
  modules: Readonly<Record<string, UnderstandingState>>;
};

/** 这个文件只收这两项。多一项少一项都当错处理，免得写错的那项被悄悄忽略。 */
const TOP_LEVEL_KEYS = ["courses", "modules"] as const;

/** 确认某一层是"用花括号包起来的那种对象"，数组和 null 都不算。 */
function plainObject(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${AUTHOR_PROGRESS_FILE} 的 ${where} 应该是一个对象（用 {} 包起来），现在不是。`);
  }
  return value as Record<string, unknown>;
}

/**
 * 把内容文件读成两条进度线。
 *
 * 任何一处不合格都抛错，不返回"尽量能用的一半"。这份数据是手写的内容，
 * 半对半错地显示出去，比构建失败难查得多。
 */
export function parseAuthorProgress(value: unknown): AuthorProgress {
  const root = plainObject(value, "最外层");

  for (const key of Object.keys(root)) {
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      throw new Error(`${AUTHOR_PROGRESS_FILE} 里有一项不认识的 "${key}"。这个文件只收 courses 和 modules。`);
    }
  }
  for (const key of TOP_LEVEL_KEYS) {
    if (!(key in root)) {
      throw new Error(`${AUTHOR_PROGRESS_FILE} 缺少 "${key}" 这一项。暂时没有内容就写成 "${key}": {}。`);
    }
  }

  const courses: Record<string, ProgressState> = {};
  for (const [course, state] of Object.entries(plainObject(root.courses, "courses"))) {
    // 编号的规则和访问者那边共用一条：只认小写字母、数字和连字符，路径符号一律挡在外面。
    if (!validCourseId(course)) {
      throw new Error(`${AUTHOR_PROGRESS_FILE} 的 courses 里 "${course}" 不是合格的课程编号：只能用小写字母、数字和连字符。`);
    }
    if (!validState(state)) {
      throw new Error(
        `${AUTHOR_PROGRESS_FILE} 的 courses 里 "${course}" 写成了 ${JSON.stringify(state)}，只能是 todo、learning、done 之一。`,
      );
    }
    courses[course] = state;
  }

  const modules: Record<string, UnderstandingState> = {};
  for (const [module, state] of Object.entries(plainObject(root.modules, "modules"))) {
    if (!validModulePath(module)) {
      throw new Error(`${AUTHOR_PROGRESS_FILE} 的 modules 里 "${module}" 不是合格的模块位置：要以斜杠开头的完整位置。`);
    }
    if (!validUnderstandingState(state)) {
      throw new Error(
        `${AUTHOR_PROGRESS_FILE} 的 modules 里 "${module}" 写成了 ${JSON.stringify(state)}，只能是 unread、read、understood 之一。`,
      );
    }
    modules[module] = state;
  }

  return { courses, modules };
}

/** 作者给这门课标了什么。没标过是 null——"没标"和"标了想学"是两回事。 */
export function authorCourseState(progress: AuthorProgress, course: string): ProgressState | null {
  return Object.prototype.hasOwnProperty.call(progress.courses, course) ? progress.courses[course] : null;
}

/** 作者把这一段代码读到什么程度了。没标过是 null。 */
export function authorModuleState(progress: AuthorProgress, module: string): UnderstandingState | null {
  return Object.prototype.hasOwnProperty.call(progress.modules, module) ? progress.modules[module] : null;
}

/**
 * 检查作者标的东西是不是都还在树上。
 *
 * 形式对不代表指得对：把 cs61a 打成 cs16a 一样是合格的编号，但树上没有这门课，
 * 于是那条记录哪一页都不会显示——作者看到的是"我明明标了却没出现"，还查不出原因。
 * 所以这里在构建时就把它拦下来。访问者那边遇到指向已删除课程的记录会照实留着，
 * 因为那是他的数据；这边是内容，错了就该在发布前被挡住。
 */
export function checkAuthorTargets(
  progress: AuthorProgress,
  known: { courseIds: readonly string[]; modulePaths: readonly string[] },
): void {
  const courseIds = new Set(known.courseIds);
  for (const course of Object.keys(progress.courses)) {
    if (!courseIds.has(course)) {
      throw new Error(`${AUTHOR_PROGRESS_FILE} 标了课程 "${course}"，但课程树里没有这门课。请对照侧边栏里的课程编号。`);
    }
  }

  const modulePaths = new Set(known.modulePaths);
  for (const module of Object.keys(progress.modules)) {
    if (!modulePaths.has(module)) {
      throw new Error(`${AUTHOR_PROGRESS_FILE} 标了源码 "${module}"，但项目里没有这一段。请对照 internals 分支里的位置。`);
    }
  }
}
