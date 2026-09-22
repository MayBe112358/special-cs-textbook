/**
 * @module        课程页上的学习状态按钮
 * @problem       读者在课程页上读完简介，最自然的下一个动作是"记一笔：这门我想学"。
 *                如果这件事只能在终端里做，大多数人不会去做——而一个没人用的进度系统等于没有。
 * @design        四个按钮：想学、在学、学完、清除。只在浏览器挂载后读存储（构建时没有浏览器）。
 *                写入和读取都走 progress-store，所以它和终端里的 mark 改的是同一份数据；
 *                订阅变化之后，终端那边一改，这里立刻跟着变。
 * @courses       Harvard CS50x Week 8（表单与交互）；UC Berkeley CS61A（状态与副作用）；
 *                软件工程类课程（同一份数据的多个视图）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 页面交互
 * @prereq        知道网页在服务器上生成时还没有你的浏览器，所以本机数据只能等页面打开后再读。
 * @unclear       状态目前没有时间线（什么时候开始学、学了多久）。真要做，需要先想清楚那份数据给谁看。
 *
 * @letter
 * 这一行按钮是整个学习状态系统里读者唯一会经常碰的部分，所以有两件事写得格外小心。
 *
 * 第一件是"它属于谁"。按钮下面那句话写着"只保存在当前浏览器"，不是免责声明，是事实描述：
 * 这个网站没有服务器，也没有账号，你标的东西不会离开这台机器。
 * 页面上另有一块"作者的心得"，那是跟着项目走、人人可见的内容；
 * 两者从数据到存放位置都完全分开，不会因为你标了什么而改变别人看到的页面。
 *
 * 第二件是"和终端的关系"。你可以点这里，也可以在终端敲 `mark cs61a done`，
 * 效果完全一样——因为它们写的是同一个地方。这不是两套功能做了同步，
 * 而是从一开始就只有一份数据，鼠标和终端只是它的两个入口。
 * 这也是这本教材反复在说的那件事：终端不是装饰，它和界面地位相同。
 */
'use client';
import { useCallback, useEffect, useState } from 'react';
import { PROGRESS_STATES, STATE_LABELS, type ProgressState } from '@/core/progress/progress';
import { readCourseProgress, subscribeProgress, writeProgress } from './progress-store';

export function CourseStatus({ courseId }: { courseId: string }) {
  const [state, setState] = useState<ProgressState | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('正在读取本机记录……');

  const load = useCallback(() => {
    try {
      const record = readCourseProgress(courseId);
      setState(record?.state ?? null);
      setReady(true);
      setMessage(record ? '' : '还没有标记这门课。');
    } catch {
      setReady(false);
      setMessage('本机这门课的记录读不懂，已原样保留，未改动。请检查浏览器存储设置。');
    }
  }, [courseId]);

  // 构建网页时没有浏览器，所以只能等页面挂载后再读；之后订阅变化，终端一改这里就跟着变。
  useEffect(() => {
    load();
    return subscribeProgress(load);
  }, [load]);

  /**
   * 改状态。
   *
   * 这里不写"已标记为在学"这类确认语：写了也留不住——写入之后会广播一声，
   * 订阅者（包括这个组件自己）立刻重新读一遍，把提示盖掉。
   * 更要紧的是它本来就多余：哪个按钮被按下去了，看一眼就知道。
   * 需要说话的只有出事的时候，所以这里只在失败时留下一句。
   */
  function choose(next: ProgressState | null) {
    try {
      writeProgress(courseId, next);
    } catch {
      setMessage('保存失败。本机数据未改动，浏览器可能禁止存储或空间不足。');
      return;
    }
    load();
  }

  return (
    <section aria-label="我的学习状态" className="not-prose my-8 border-t border-fd-border pt-6">
      <h2 className="text-xl font-semibold">我的学习状态</h2>
      <p className="my-2 text-sm text-fd-muted-foreground">
        只保存在当前浏览器，不会公开，也不影响别人看到的页面。终端里的 <code>mark {courseId} learning</code> 改的是同一份数据。
      </p>
      <div className="my-3 flex flex-wrap gap-3">
        {PROGRESS_STATES.map((option) => (
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
            {STATE_LABELS[option]}
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
      <p role="status" className="my-2 text-sm">{message}</p>
    </section>
  );
}
