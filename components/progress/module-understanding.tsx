/**
 * @module        源码讲解页上的理解度按钮，以及整本教材的理解度
 * @problem       这本教材的正文写在代码注释里，而读代码和读课文有个很大的区别：
 *                你常常"读完了"却不确定自己有没有读懂。如果没有地方记这件事，
 *                几个月后回来只会剩下模糊的印象——"这段我好像看过"，而"看过"恰恰是最没用的状态。
 *                另一头是：读者需要知道自己在整本教材里走到哪了，而不只是当前这一页。
 * @design        三个按钮（未读 / 读过 / 读懂了）加一行整体理解度。
 *                百分比的分母是全部模块数，由页面在构建时传进来——组件自己不去数，
 *                因为它只看得见当前这一页，数不出整本有多少段代码。
 *                读写都走 progress-store，所以它和终端里的 mark 改的是同一份数据。
 * @courses       Harvard CS50x Week 8（表单与交互）；UC Berkeley CS61A（状态与副作用）；
 *                UC Berkeley CS61B（同一份数据的多个视图）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 页面交互
 * @prereq        知道网页在服务器上生成时还没有你的浏览器，所以本机数据只能等页面打开后再读。
 * @unclear       "读懂了"完全由读者自己判断，没有任何检验。要不要配一道题来确认，
 *                得先想清楚那道题由谁出——这本教材的规矩是习题一律用课程官方的，自编题不在选项里。
 *
 * @letter
 * 这一行按钮和课程页上那一行长得很像，但它们量的是两件不同的事，值得说清楚为什么要分开。
 *
 * 课程那条线记的是"我在目录上走到哪了"：想学、在学、学完。
 * 这条线记的是"我把正文读懂了多少"：未读、读过、读懂了。
 * 你可能学完了 CS61A，却还没读懂这个项目里对应的解释器代码；
 * 也可能反过来，先读懂了一段代码，才回头去补对应的课。两条线不同步，所以不能合成一条。
 *
 * 特意把"读过"和"读懂了"分成两档，是这条线最要紧的设计。
 * 读完一段代码很容易，读懂它难得多——中间那道坎正是这本教材想帮你越过的地方。
 * 如果只有"读了/没读"两档，你就没有地方诚实地承认"我扫过一遍但没懂"，
 * 而承认这件事，恰恰是下一次能读懂的前提。上面那个百分比也只算"读懂了"，
 * 不算"读过"，理由是一样的。
 *
 * 顺带一说：这个百分比是**你的**，不是作者的。作者自己的进度是另一套数据，跟着项目走、人人可见，
 * 和你在这里点出来的东西从存储到显示都完全分开。
 */
'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  UNDERSTANDING_LABELS,
  UNDERSTANDING_STATES,
  understandingSummary,
  type ModuleUnderstanding,
  type UnderstandingState,
} from '@/core/progress/progress';
import { readModuleUnderstanding, readUnderstandingSnapshot, subscribeProgress, writeUnderstanding } from './progress-store';

export function ModuleUnderstandingPanel({
  modulePath,
  modulePaths,
}: {
  modulePath: string;
  modulePaths: string[];
}) {
  const [state, setState] = useState<UnderstandingState | null>(null);
  const [all, setAll] = useState<ModuleUnderstanding[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('正在读取本机记录……');

  const load = useCallback(() => {
    try {
      const record = readModuleUnderstanding(modulePath);
      setState(record?.state ?? null);
      setAll(readUnderstandingSnapshot().records);
      setReady(true);
      setMessage(record ? '' : '还没有标记这一段。');
    } catch {
      setReady(false);
      setMessage('本机这一段的记录读不懂，已原样保留，未改动。请检查浏览器存储设置。');
    }
  }, [modulePath]);

  // 构建网页时没有浏览器，所以只能等页面挂载后再读；之后订阅变化，终端一改这里就跟着变。
  useEffect(() => {
    load();
    return subscribeProgress(load);
  }, [load]);

  /** 只在出事时说话。哪个按钮被按下去了看一眼就知道，确认语写了也会被随后的重读盖掉。 */
  function choose(next: UnderstandingState | null) {
    try {
      writeUnderstanding(modulePath, next);
    } catch {
      setMessage('保存失败。本机数据未改动，浏览器可能禁止存储或空间不足。');
      return;
    }
    load();
  }

  const { understood, total: totalModules, percent } = understandingSummary(all, modulePaths);

  return (
    <section aria-label="我的理解度" className="not-prose my-8 border-t border-fd-border pt-6">
      <h2 className="text-xl font-semibold">我的理解度</h2>
      <p className="my-2 text-sm text-fd-muted-foreground">
        只保存在当前浏览器，不会公开。终端里的 <code>mark {modulePath} read</code> 改的是同一份数据。
      </p>
      <div className="my-3 flex flex-wrap gap-3">
        {UNDERSTANDING_STATES.map((option) => (
          <button
            key={option}
            type="button"
            disabled={!ready}
            aria-pressed={state === option}
            onClick={() => choose(state === option ? null : option)}
            className={`rounded border px-3 py-1 disabled:opacity-50 ${
              state === option ? 'border-fd-primary bg-fd-primary/10 font-semibold' : ''
            }`}
          >
            {UNDERSTANDING_LABELS[option]}
          </button>
        ))}
        <button
          type="button"
          disabled={!ready || state === null}
          onClick={() => choose(null)}
          className="rounded border px-3 py-1 disabled:opacity-50"
        >
          清除
        </button>
      </div>
      <p className="my-2 text-sm">
        {ready ? (
          <>
            整本教材的理解度：<strong>{understood} / {totalModules}（{percent}%）</strong>
            <span className="text-fd-muted-foreground">　只有标成"读懂了"的才计入。</span>
          </>
        ) : null}
      </p>
      <p role="status" className="my-2 text-sm">{message}</p>
    </section>
  );
}
