/**
 * @module        访问者两条进度线的数据格式：课程的学习状态，代码的理解度
 * @problem       读者需要记住"这门课我想学 / 在学 / 学完了"，也需要记住"这段代码我读懂了没有"。
 *                这两件事都必须满足三个互相牵制的要求：刷新之后还在；换一台设备看不到
 *                （它是他自己的事，不是公开内容）；而且绝不能和作者的进度混成一份数据——
 *                那是内容状态，跟项目走，人人可见。
 *                它们彼此也不能混：课程是这本教材的目录，代码是正文，走到哪和读懂了多少是两个问题。
 * @design        每门课一条记录，用课程编号（不是页面地址）作标识；解析和校验是纯函数，
 *                真正的读写交给界面层。状态只有三个取值，写成字面量联合类型，拼错在编译期就会被拦下。
 * @courses       UC Berkeley CS61A（数据抽象：先定清楚一条记录长什么样，再谈怎么存）；
 *                UC Berkeley CS186 与 CMU 15-445（数据完整性：读进来的东西不能默认它是对的）；
 *                Harvard CS50x Week 9（浏览器里的持久数据）
 * @exercises     https://cs50.harvard.edu/x/psets/9/finance/ —— 持久数据与输入校验
 *                https://cs186berkeley.net/ —— 官方项目里的数据完整性主题
 * @prereq        知道 JSON 是把对象写成文字的格式；知道读到文字之后还需要检查它的内容。
 * @unclear       课程被删除或改名后，本机会留下一条指向不存在课程的记录。现在的做法是留着不动
 *                （数据是读者的，不该由我们悄悄清理），由查询的一方决定怎么显示。
 *                将来若要做迁移，需要先有一份课程编号的改名记录，那不属于这一步。
 *
 * @letter
 * 这个文件只做一件事：把"一门课的学习状态"这句话，变成一条计算机能存、能检查的记录。
 *
 * 先说为什么用课程编号而不是页面地址。心得那边用的是地址（`/programming-intro/cs61a`），
 * 因为心得是写给"这一页"的——包括分类页、源码讲解页，它们都不是课程。
 * 但学习状态只属于课程，而课程在树上的位置是会变的：CS188 就刚从 `/ai-machine-learning/cs188`
 * 搬到了 `/ai-machine-learning/artificial-intelligence/cs188`。如果状态跟着地址走，
 * 那次搬家会让你之前标过的东西凭空消失。编号 `cs188` 不会变，所以状态跟编号走。
 *
 * 再说为什么状态只有三个词。你可能想加"放弃了""复习中""学了一半"。
 * 但这三个词是有顺序的——想学在前、学完在后，中间是在学——多加一个就要回答它排在哪里。
 * 一个能排序的小集合，后面才好数出"学完 x 门"这样的统计。要扩展并不难，
 * 难的是扩展之后那些统计还说不说得通，所以现在先少。
 *
 * 最后，这个文件里没有一行 `localStorage`。它不知道数据存在哪，也不该知道。
 * 它只回答"一条合格的记录长什么样"和"这段文字读出来是不是一条合格的记录"。
 * 存取是界面的事，检查是这里的事——这样同一套检查，网页用得上，测试也用得上，
 * 而测试不需要一个浏览器才能跑起来。
 */

/** 存到浏览器里时用的键前缀。带版本号，将来格式变了可以并存，不会一上来就读坏旧数据。 */
export const PROGRESS_PREFIX = "special-cs-textbook:progress:v1:";

/**
 * 三种状态，按学习的先后排列。
 *
 * 顺序不只是好看：统计和排序都按这个顺序走，所以它是数据的一部分，不是显示的细节。
 */
export const PROGRESS_STATES = ["todo", "learning", "done"] as const;

/** 一门课在读者那里的状态。三选一，别的词在编译期就通不过。 */
export type ProgressState = (typeof PROGRESS_STATES)[number];

/** 状态的中文说法。命令行和网页都用它，免得同一个状态在两个地方叫不同的名字。 */
export const STATE_LABELS: Record<ProgressState, string> = {
  todo: "想学",
  learning: "在学",
  done: "学完",
};

/** 一条学习状态记录。 */
export type CourseProgress = {
  /** 课程编号，例如 "cs61a"。 */
  course: string;
  /** 三种状态之一。 */
  state: ProgressState;
  /** 最后一次改动的时间，ISO 格式。备份文件里靠它看出哪条更新。 */
  updatedAt: string;
};

/** 是不是一个合格的状态词。 */
export function validState(value: unknown): value is ProgressState {
  return typeof value === "string" && (PROGRESS_STATES as readonly string[]).includes(value);
}

/**
 * 是不是一个合格的课程编号。
 *
 * 只允许小写字母、数字和连字符，且必须以字母或数字开头。这条规则不是随手定的：
 * 编号会被拼进存储键，如果放任 `../` 这类写法，一条记录就能指到别的键上去。
 */
export function validCourseId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value) && value.length <= 100;
}

/** 把一个来路不明的值检查成一条记录；不合格就抛错，绝不"猜一个合理的默认值"。 */
export function validateProgress(value: unknown): CourseProgress {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("学习状态格式不正确。");
  }
  const record = value as Record<string, unknown>;
  if (
    !validCourseId(record.course) ||
    !validState(record.state) ||
    typeof record.updatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(record.updatedAt) ||
    !Number.isFinite(Date.parse(record.updatedAt))
  ) {
    throw new Error("学习状态的课程、状态或保存时间不正确。");
  }
  return { course: record.course, state: record.state, updatedAt: record.updatedAt };
}

/**
 * 读一条记录。
 *
 * 分三种结果：没存过（null）、存过且读得懂（记录）、存过但读不懂（抛错）。
 * 第三种必须抛错而不是当成没存过——那样会把读者的数据默默盖掉。
 */
export function readProgress(raw: string | null, course: string): CourseProgress | null {
  if (raw === null) return null;
  const progress = validateProgress(JSON.parse(raw));
  if (progress.course !== course) throw new Error("学习状态的课程标识与存储位置不一致。");
  return progress;
}

/** 算出某门课该存在哪个键下。 */
export function progressKey(course: string): string {
  if (!validCourseId(course)) throw new Error("课程标识不正确。");
  return PROGRESS_PREFIX + course;
}

/** 按三种状态数一数各有几门。命令行的统计和网页的统计都读它，答案因此永远一致。 */
export function countByState(records: readonly CourseProgress[]): Record<ProgressState, number> {
  const counts: Record<ProgressState, number> = { todo: 0, learning: 0, done: 0 };
  for (const record of records) counts[record.state] += 1;
  return counts;
}

/** 按状态顺序、同状态内按课程编号排好。显示顺序是数据的一部分，不该由每个调用方各排一遍。 */
export function sortProgress(records: readonly CourseProgress[]): CourseProgress[] {
  return [...records].sort((a, b) =>
    a.state === b.state
      ? a.course.localeCompare(b.course)
      : PROGRESS_STATES.indexOf(a.state) - PROGRESS_STATES.indexOf(b.state),
  );
}

/* ------------------------------------------------------------------------ *
 * 第二条进度线：理解度
 *
 * 上面那套记的是"课程"——这本教材的目录，你在目录上走到哪了。
 * 下面这套记的是"代码"——这本教材的正文，你把正文读懂了多少。
 *
 * 它们是两件事，所以分成两套数据、两个存储前缀、两组状态词，从头到尾不合并。
 * 合并会立刻带来一个答不上来的问题：把课程和代码混在一起算出来的那个百分比，
 * 到底在说什么？"我学完 3 门课、读懂 5 段代码"没法加成一个数字。
 * 分开之后，每条线各自的百分比都说得清。
 *
 * 还有一处关键差别：课程按编号存，代码按位置存。
 * 因为课程编号全站唯一，而源码模块的名字会撞车——真实源码里就有两个 layout.tsx。
 * 撞车的东西不能当标识，所以这一条用完整位置（/internals/core/terminal/commands/mark）。
 * ------------------------------------------------------------------------ */

/** 存理解度用的键前缀。 */
export const UNDERSTANDING_PREFIX = "special-cs-textbook:understanding:v1:";

/** 三种理解程度，按读的深浅排列。 */
export const UNDERSTANDING_STATES = ["unread", "read", "understood"] as const;

/** 一段代码在读者那里的理解程度。 */
export type UnderstandingState = (typeof UNDERSTANDING_STATES)[number];

/** 理解度的中文说法。 */
export const UNDERSTANDING_LABELS: Record<UnderstandingState, string> = {
  unread: "未读",
  read: "读过",
  understood: "读懂了",
};

/** 一条理解度记录。module 是源码模块的完整位置，不是名字——名字会撞车。 */
export type ModuleUnderstanding = {
  /** 源码模块在知识树里的位置，例如 "/internals/core/terminal/commands/mark"。 */
  module: string;
  /** 三种理解程度之一。 */
  state: UnderstandingState;
  /** 最后一次改动的时间，ISO 格式。 */
  updatedAt: string;
};

export function validUnderstandingState(value: unknown): value is UnderstandingState {
  return typeof value === "string" && (UNDERSTANDING_STATES as readonly string[]).includes(value);
}

/**
 * 是不是一个合格的模块位置。
 *
 * 和课程编号那条规则同样的用意：位置会被拼进存储键，所以 `..` 这类写法必须挡在外面，
 * 否则一条记录就能写到别的键上去。只允许"斜杠开头、各段由小写字母数字和连字符组成"。
 */
export function validModulePath(value: unknown): value is string {
  return typeof value === "string" && /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(value) && value.length <= 300;
}

export function validateUnderstanding(value: unknown): ModuleUnderstanding {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("理解度格式不正确。");
  }
  const record = value as Record<string, unknown>;
  if (
    !validModulePath(record.module) ||
    !validUnderstandingState(record.state) ||
    typeof record.updatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(record.updatedAt) ||
    !Number.isFinite(Date.parse(record.updatedAt))
  ) {
    throw new Error("理解度的模块、状态或保存时间不正确。");
  }
  return { module: record.module, state: record.state, updatedAt: record.updatedAt };
}

export function readUnderstanding(raw: string | null, module: string): ModuleUnderstanding | null {
  if (raw === null) return null;
  const record = validateUnderstanding(JSON.parse(raw));
  if (record.module !== module) throw new Error("理解度的模块标识与存储位置不一致。");
  return record;
}

export function understandingKey(module: string): string {
  if (!validModulePath(module)) throw new Error("模块标识不正确。");
  return UNDERSTANDING_PREFIX + module;
}

export function countByUnderstanding(
  records: readonly ModuleUnderstanding[],
): Record<UnderstandingState, number> {
  const counts: Record<UnderstandingState, number> = { unread: 0, read: 0, understood: 0 };
  for (const record of records) counts[record.state] += 1;
  return counts;
}

/**
 * 整体理解度：读懂了的模块占全部模块的百分之多少。
 *
 * 两个地方要留意。一是分母用的是"这本教材一共有多少段代码"，不是"你标过多少段"——
 * 否则标了一段读懂就是 100%，那个数字会好看得毫无意义。
 * 二是"读过"不算数：这条线量的是读懂，读过而没读懂正是这本教材最想帮你越过的那道坎。
 *
 * 返回整数百分比，向下取整。没有模块时返回 0，而不是让它变成 NaN。
 */
export function understandingSummary(records: readonly ModuleUnderstanding[], modulePaths: readonly string[]) {
  // 旧记录继续保留，但统计只计算当前目录里的模块，避免超过 100%。
  const current = new Set(modulePaths);
  const understood = new Set(records.filter(record => current.has(record.module) && record.state === 'understood').map(record => record.module)).size;
  return { understood, total: current.size, percent: current.size === 0 ? 0 : Math.floor(understood / current.size * 100) };
}

export function understandingPercent(records: readonly ModuleUnderstanding[], modulePaths: readonly string[]): number {
  return understandingSummary(records, modulePaths).percent;
}

export function sortUnderstanding(records: readonly ModuleUnderstanding[]): ModuleUnderstanding[] {
  return [...records].sort((a, b) =>
    a.state === b.state
      ? a.module.localeCompare(b.module)
      : UNDERSTANDING_STATES.indexOf(a.state) - UNDERSTANDING_STATES.indexOf(b.state),
  );
}
