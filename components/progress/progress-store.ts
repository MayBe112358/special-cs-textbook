/**
 * @module        两条进度线在浏览器这一侧的读写与通知
 * @problem       同一份进度数据有两个入口：页面上的按钮，和终端里的 mark 命令。
 *                两边都要能改，也都要在对方改完之后立刻跟着变——否则你在终端标了"学完"，
 *                回到页面却还显示"在学"，就等于同一件事有了两份说法。
 *                另一头是 core 的硬规矩：命令引擎里不许出现 localStorage，否则它就没法脱离浏览器测试。
 * @design        把"浏览器相关的那部分"单独收在这个文件里：只有它碰 localStorage。
 *                core/progress 负责"一条记录长什么样"，这里负责"记录存在哪、改完怎么通知别人"。
 *                通知用一个自定义事件广播给本页的所有订阅者，再加上浏览器自带的 storage 事件覆盖别的标签页。
 * @courses       Harvard CS50x Week 9（浏览器存储）；UC Berkeley CS61A（状态与副作用的边界）；
 *                软件工程类课程（同一份数据的多个视图如何保持一致）
 * @exercises     https://cs50.harvard.edu/x/psets/9/finance/ —— 数据读写与状态更新
 * @prereq        知道 localStorage 属于"这个浏览器 + 这个网站"，刷新不丢，换设备就没了。
 * @unclear       两个标签页同时改同一门课时，后写的一方会覆盖先写的（每条记录很小，没有做合并）。
 *                心得那边因为是长文本才做了冲突检测；状态只有三个词，冲突的代价小得多。
 *
 * @letter
 * 这个文件存在的唯一理由，是一条边界。
 *
 * 你在终端里敲 mark cs61a done，最后总得有一个字真的写进浏览器的存储里。可这一下不能发生在命令里：命令引擎必须能在一台没有浏览器的电脑上跑起来接受检验。
 * 所以命令只递出一张“我想把 cs61a 改成 done”的申请单，真正动手写存储的是这里。整个网站里碰学习状态和理解度存储的，只有这一个文件。
 *
 * 然后是通知。课程页上的按钮、侧边栏的小圆点、终端，这几个组件互不认识，却都在显示同一份数据。
 * 谁改完了，别人怎么知道？最省事的写法是让终端直接去调按钮的刷新函数，可那样它俩就绑死了，以后每多一个能改状态的地方，就得多改好几处。
 * 这里用的是广播：谁写完了就喊一声“变了”，想知道的自己订阅。喊的人根本不用管有几个人在听。
 *
 * 最后说说读不懂的记录。要是本机某一条记录坏了，读快照的时候会跳过它，而不是让整个终端崩掉。
 * 但跳过不等于删掉，它还原样躺在存储里。只有你明确地去重新标那门课，它才会被覆盖；导入备份的时候更严，只要有一条读不懂，整次导入都拒绝。
 * “显示不出来”和“已经没了”是两回事，这个区别得守住。
 */
'use client';
import {
  PROGRESS_PREFIX,
  UNDERSTANDING_PREFIX,
  progressKey,
  readProgress,
  readUnderstanding,
  understandingKey,
  validCourseId,
  validModulePath,
  type CourseProgress,
  type ModuleUnderstanding,
  type ProgressState,
  type UnderstandingState,
} from '@/core/progress/progress';

/** 本页内广播用的事件名。别的标签页靠浏览器自带的 storage 事件。 */
const CHANGED_EVENT = 'special-cs-textbook:progress-changed';

export type ProgressSnapshot = {
  /** 读得懂的全部记录。 */
  records: CourseProgress[];
  /** 读不懂的那些课程编号；它们的数据仍在存储里，只是这次没显示出来。 */
  broken: string[];
};

/** 把本机全部学习状态读成一份快照。任何一条坏掉都不会影响其余的。 */
export function readProgressSnapshot(): ProgressSnapshot {
  const records: CourseProgress[] = [];
  const broken: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PROGRESS_PREFIX)) continue;
      const course = key.slice(PROGRESS_PREFIX.length);
      try {
        const record = readProgress(localStorage.getItem(key), course);
        if (record) records.push(record);
      } catch {
        broken.push(course);
      }
    }
  } catch {
    // 浏览器可能整个禁用存储（无痕模式、隐私设置）。这时没有数据可读，不是数据出了问题。
    return { records: [], broken: [] };
  }
  return { records, broken };
}

/** 读一门课的状态；读不懂时抛错，由调用方决定怎么说。 */
export function readCourseProgress(course: string): CourseProgress | null {
  if (!validCourseId(course)) return null;
  return readProgress(localStorage.getItem(progressKey(course)), course);
}

/**
 * 改一门课的状态，null 表示清除。
 *
 * 写完广播一声，页面上的按钮和终端各自会去重新读一遍。
 */
export function writeProgress(course: string, state: ProgressState | null): void {
  const key = progressKey(course);
  if (state === null) {
    localStorage.removeItem(key);
  } else {
    const record: CourseProgress = { course, state, updatedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(record));
  }
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

/**
 * 订阅状态变化，返回取消订阅的函数。
 *
 * 两个来源：本页的自定义事件（按钮或终端刚改完），以及浏览器的 storage 事件（别的标签页改了）。
 * storage 事件只在"别的标签页"触发，所以两者不会重复，但也缺一不可。
 */
export function subscribeProgress(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(PROGRESS_PREFIX) || event.key.startsWith(UNDERSTANDING_PREFIX)) listener();
  };
  window.addEventListener(CHANGED_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

/* ---------------- 第二条进度线：理解度 ---------------- */

export type UnderstandingSnapshot = {
  records: ModuleUnderstanding[];
  broken: string[];
};

/** 把本机全部理解度读成一份快照。规则和上面那条线完全一样：一条坏掉不影响其余的。 */
export function readUnderstandingSnapshot(): UnderstandingSnapshot {
  const records: ModuleUnderstanding[] = [];
  const broken: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(UNDERSTANDING_PREFIX)) continue;
      const module = key.slice(UNDERSTANDING_PREFIX.length);
      try {
        const record = readUnderstanding(localStorage.getItem(key), module);
        if (record) records.push(record);
      } catch {
        broken.push(module);
      }
    }
  } catch {
    return { records: [], broken: [] };
  }
  return { records, broken };
}

/** 读一段代码的理解度；读不懂时抛错，由调用方决定怎么说。 */
export function readModuleUnderstanding(module: string): ModuleUnderstanding | null {
  if (!validModulePath(module)) return null;
  return readUnderstanding(localStorage.getItem(understandingKey(module)), module);
}

/** 改一段代码的理解度，null 表示清除。写完广播，和上面那条线共用同一个事件。 */
export function writeUnderstanding(module: string, state: UnderstandingState | null): void {
  const key = understandingKey(module);
  if (state === null) {
    localStorage.removeItem(key);
  } else {
    const record: ModuleUnderstanding = { module, state, updatedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(record));
  }
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

/** 导入后主动通知当前页；浏览器自己的 storage 事件只通知其他标签页。 */
export function notifyProgressChanged() {
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}
