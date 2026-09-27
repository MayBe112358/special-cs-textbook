/**
 * @module        心得树上每门课后面的小数字——这门课下你写了几份心得
 * @problem       心得区左边那棵树和课程目录一模一样，一百多门课里哪几门写过心得，只能一门门点进去看。
 *                写了一个学期之后，你想回头翻“我在哪些课上留过东西”，这棵树却什么也不告诉你。
 * @design        和学习状态的小圆点同一个做法：不改 Fumadocs 的侧边栏，而是在生成心得树时（lib/notes-tree.ts）
 *                把每一项的名字换成“名字 + 这个小数字”。数字自己去读浏览器里的心得、自己订阅变化。
 *                树上有两百多项，如果每一项各自去数据库里查一次，打开心得区就是两百多次查询。
 *                所以这里只有一份全站共用的“每个空间有几份”的计数表：第一次有人要时读一遍全部心得、数好，
 *                之后所有小数字都从这张表里取；心得一变（WORKSPACE_CHANGED），表重算一次，再通知所有小数字。
 *                没有心得的课什么都不画，树保持干净。
 * @courses       UC Berkeley CS61A（观察者、记忆化：算一次、多处用）；CMU 15-445 / UC Berkeley CS186（聚合查询 GROUP BY）；
 *                Stanford CS147（状态可见性）
 * @exercises     https://cs61a.org/ —— CS61A 里的记忆化（memoization）
 *                https://cs186berkeley.net/ —— CS186 的 SQL 作业：GROUP BY 与聚合
 * @prereq        知道 useSyncExternalStore 是 React 用来“订阅一份不归 React 管的数据”的官方办法。
 * @unclear       分类上只数“直接写在这个分类下”的心得，不把下面各门课的加起来——加起来的数字看着大，
 *                却说不清具体在哪门课里。要不要改成加总，等真的用起来再看。
 *
 * @letter
 * 心得区左边那棵树上，写过心得的课后面会跟一个小数字。就这么个小数字，背后有两个值得说的决定。
 *
 * 头一个：这件事在数据库里有个正式的写法，GROUP BY space, COUNT(*)，按空间分组、数一数每组几条。
 * 你在 CS186 里会用一行 SQL 写出它，这里是用一个 Map 手写的。
 *
 * 第二个更值得留意：只数一次。
 * 最顺手的写法是让每个小数字自己去问数据库“我这门课有几份”，代码最短，也最好懂。
 * 可树上有两百多项，这么一来，打开心得区就是两百多次查询。
 * 所以这里只有一张全站共用的计数表：第一次有人要的时候，把所有心得读一遍、数好，之后所有小数字都从这张表里拿。
 * 把重复的活提出来只干一次、结果大家共享，这叫记忆化（memoization），CS61A 讲递归的时候就会碰到。
 *
 * 记住的东西也有过期的时候：心得一变，表就得重算。
 * “什么时候让缓存作废”往往比“怎么缓存”难得多，业内有句老话，说计算机里最难的两件事之一就是这个。
 * 这里的答案是跟着 WORKSPACE_CHANGED 这个事件走：心得一有变化，表重算一次，再通知所有小数字重画。
 *
 * 没写过心得的课，后面什么都不显示，树保持干净。
 */
'use client';
import { useSyncExternalStore } from 'react';
import { getWorkspace, subscribeWorkspace } from '@/components/workspace/browser-workspace';

let counts: ReadonlyMap<string, number> = new Map();
const listeners = new Set<() => void>();
let stopWatching: (() => void) | null = null;

/** 读一遍全部心得，按所属空间数好，再叫醒所有小数字。 */
async function recount(): Promise<void> {
  try {
    const items = await (await getWorkspace()).listItems();
    const next = new Map<string, number>();
    for (const item of items) next.set(item.space, (next.get(item.space) ?? 0) + 1);
    counts = next;
  } catch {
    // 浏览器不让用本地数据库时，树上就不画数字；心得区本身会说明原因。
    counts = new Map();
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // 第一个订阅者出现时才开始读、开始监听；最后一个走了就停下。
  if (stopWatching === null) {
    stopWatching = subscribeWorkspace(() => void recount());
    void recount();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) { stopWatching?.(); stopWatching = null; }
  };
}

export function NoteCount({ space }: { space: string }) {
  const count = useSyncExternalStore(subscribe, () => counts.get(space) ?? 0, () => 0);
  if (count === 0) return null;
  return (
    <span data-note-count className="ms-auto shrink-0 rounded-full bg-fd-muted px-1.5 text-[11px] leading-4 tabular-nums text-fd-muted-foreground" title={`这里有 ${count} 份心得`}>
      {count}
      <span className="sr-only"> 份心得</span>
    </span>
  );
}
