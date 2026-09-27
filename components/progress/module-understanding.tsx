/**
 * @module        源码讲解页上的理解度按钮，以及整本教材的理解度
 * @problem       这本教材的正文写在代码注释里，而读代码和读课文有个很大的区别：
 *                你常常"读完了"却不确定自己有没有读懂。如果没有地方记这件事，
 *                几个月后回来只会剩下模糊的印象——"这段我好像看过"，而"看过"恰恰是最没用的状态。
 *                另一头是：读者需要知道自己在整本教材里走到哪了，而不只是当前这一页。
 * @design        标题下面一排分段按钮（未读 / 读过 / 读懂了，再点一次取消），后面跟一小段整体理解度。
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
 * 代码讲解页标题下面那一排按钮，跟课程页上那排长得很像，可量的是两件不一样的事。
 *
 * 课程那条线记的是“我在目录上走到哪了”：想学、在学、学完。
 * 这条线记的是“我把正文读懂了多少”：未读、读过、读懂了。
 * 你可能学完了 CS61A，却还没读懂这个项目里对应的解释器代码；也可能反过来，先读懂了一段代码，才回头去补那门课。两条线本来就不同步，所以不能合成一条。
 *
 * 把“读过”和“读懂了”分成两档，是这条线最要紧的设计。
 * 读完一段代码很容易，读懂它难得多，中间那道坎正是这本教材想帮你跨过去的地方。
 * 要是只有“读了、没读”两档，你就没地方老实承认“我扫过一遍，但没看懂”，而肯承认这一点，恰恰是下一次能读懂的前提。
 * 旁边那个整本教材的百分比，也只算“读懂了”，不算“读过”，道理一样。
 *
 * 这个百分比是你自己的，不是作者的。作者的进度是另一套数据，跟着项目走、人人可见，跟你在这儿点出来的东西完全分开。
 *
 * “读懂了”全凭你自己判断，没有任何检验。要不要配一道题来确认？这本教材的规矩是习题一律用课程官方的，不自己出题，所以这条路先不走。
 */
'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  UNDERSTANDING_LABELS,
  UNDERSTANDING_STATES,
  understandingSummary,
  type ModuleUnderstanding,
  type UnderstandingState,
} from '@/core/progress/progress';
import { readModuleUnderstanding, readUnderstandingSnapshot, subscribeProgress, writeUnderstanding } from './progress-store';
import { StatusRow } from './status-row';

export function ModuleUnderstandingPanel({
  modulePath,
  modulePaths,
  children,
}: {
  modulePath: string;
  modulePaths: string[];
  children?: ReactNode;
}) {
  const [state, setState] = useState<UnderstandingState | null>(null);
  const [all, setAll] = useState<ModuleUnderstanding[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    try {
      setState(readModuleUnderstanding(modulePath)?.state ?? null);
      setAll(readUnderstandingSnapshot().records);
      setReady(true);
      setError('');
    } catch {
      setReady(false);
      setError('本机这一段的记录读不懂，已原样保留，未改动。请检查浏览器存储设置。');
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
      setError('保存失败。本机数据未改动，浏览器可能禁止存储或空间不足。');
      return;
    }
    load();
  }

  const { understood, total: totalModules, percent } = understandingSummary(all, modulePaths);

  return (
    <StatusRow
      label="我的理解度"
      hint={`只保存在这台浏览器，不会公开。终端里的 mark ${modulePath} read 改的是同一份数据。`}
      options={UNDERSTANDING_STATES}
      labels={UNDERSTANDING_LABELS}
      value={state}
      ready={ready}
      onChoose={choose}
      error={error}
    >
      {children}
      {ready ? (
        <span className="text-xs text-fd-muted-foreground" title='只有标成"读懂了"的才计入。'>
          全书读懂 {understood} / {totalModules}（{percent}%）
        </span>
      ) : null}
    </StatusRow>
  );
}
