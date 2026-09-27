/**
 * @module        课程页标题下面的学习状态按钮
 * @problem       读者在课程页上读完简介，最自然的下一个动作是"记一笔：这门我想学"。
 *                如果这件事只能在终端里做，大多数人不会去做——而一个没人用的进度系统等于没有。
 * @design        一排分段按钮：想学、在学、学完，再点一次已选的那档就取消（样子由 status-row 负责）。
 *                只在浏览器挂载后读存储（构建时没有浏览器）。
 *                写入和读取都走 progress-store，所以它和终端里的 mark 改的是同一份数据；
 *                订阅变化之后，终端那边一改，这里立刻跟着变。
 * @courses       Harvard CS50x Week 8（表单与交互）；UC Berkeley CS61A（状态与副作用）；
 *                软件工程类课程（同一份数据的多个视图）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 页面交互
 * @prereq        知道网页在服务器上生成时还没有你的浏览器，所以本机数据只能等页面打开后再读。
 * @unclear       状态目前没有时间线（什么时候开始学、学了多久）。真要做，需要先想清楚那份数据给谁看。
 *
 * @letter
 * 这一排按钮，是整个学习状态系统里你最常碰的部分，所以有两件事做得格外小心。
 *
 * 第一件是“它归谁”。鼠标停在“我的状态”上，会看到一句“只保存在这台浏览器，不会公开”。这不是免责声明，是在如实告诉你：这个网站没有服务器、没有账号，你标的东西不会离开这台电脑。
 * 同一行里那个紫色的“作者：学完”，跟心得页上“作者的心得”一样，是跟着项目走、谁都看得见的内容。
 * 两边从数据到存放的地方完全分开，你标了什么，都不会改变别人看到的页面。
 *
 * 第二件是“它跟终端的关系”。你可以在这儿点，也可以在终端敲 mark cs61a done，效果一模一样，因为它们写的是同一个地方。
 * 这不是两套功能互相同步，而是从一开始就只有一份数据，鼠标和终端只是它的两个入口。
 * 这本教材一直在说：终端不是装饰，它跟界面平起平坐。
 */
'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { PROGRESS_STATES, STATE_LABELS, type ProgressState } from '@/core/progress/progress';
import { readCourseProgress, subscribeProgress, writeProgress } from './progress-store';
import { StatusRow } from './status-row';

export function CourseStatus({ courseId, children }: { courseId: string; children?: ReactNode }) {
  const [state, setState] = useState<ProgressState | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    try {
      setState(readCourseProgress(courseId)?.state ?? null);
      setReady(true);
      setError('');
    } catch {
      setReady(false);
      setError('本机这门课的记录读不懂，已原样保留，未改动。请检查浏览器存储设置。');
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
      setError('保存失败。本机数据未改动，浏览器可能禁止存储或空间不足。');
      return;
    }
    load();
  }

  return (
    <StatusRow
      label="我的状态"
      hint={`只保存在这台浏览器，不会公开。终端里的 mark ${courseId} learning 改的是同一份数据。`}
      options={PROGRESS_STATES}
      labels={STATE_LABELS}
      value={state}
      ready={ready}
      onChoose={choose}
      error={error}
    >
      {children}
    </StatusRow>
  );
}
