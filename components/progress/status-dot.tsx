/**
 * @module        侧边栏条目后面的小圆点——你把这门课 / 这段代码标到了哪一步
 * @problem       学习状态原来只能点进课程页、或者在终端里敲 status 才看得到。侧边栏是你最常看的地方，
 *                在那里扫一眼就知道“哪些在学、哪些学完了”，比一页页点进去快得多。
 * @design        不改 Fumadocs 的侧边栏组件，而是在生成侧边栏那棵树时（lib/source.ts），
 *                把每门课的名字换成“名字 + 这个小圆点”。圆点自己去读浏览器存储、自己订阅变化，
 *                所以终端里敲 mark、课程页上点按钮，侧边栏都会立刻跟着变。
 *                圆点只有三种样子：空心（想学）、黄色（在学 / 读过）、绿色（学完 / 读懂了）；没标就什么都不画。
 *                颜色之外还有一段只给读屏软件读的文字，看不见颜色的人也能知道状态。
 * @courses       UC Berkeley CS61A（观察者：谁变了就通知谁）；Stanford CS147 / UCB CS160（状态可见性、
 *                不只用颜色传达信息）；CS50x Week 8（浏览器存储）
 * @exercises     https://cs61a.org/ ; https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        知道 localStorage 只存在读者自己的浏览器里；知道“订阅”就是请别人在变化时叫你一声。
 * @unclear       页面在服务器上生成时读不到浏览器存储，所以圆点要等页面在浏览器里跑起来之后才出现，
 *                会比课程名晚一瞬间。这是纯静态网站换来的代价，没有更好的办法。
 *
 * @letter
 * 这个圆点很小，但它背后是一个你会在很多地方再遇到的问题：同一份数据，好几个地方同时在显示。
 *
 * 你在课程页上点“在学”，侧边栏的圆点要变黄；你在终端里敲 mark cs61a done，课程页的按钮和这个圆点都要变。
 * 一种做法是让按钮改完之后“去通知侧边栏”，让终端改完之后“去通知按钮和侧边栏”——
 * 每多一个显示的地方，就要多记住一条通知线，迟早会漏。
 *
 * 这里用的是另一种做法：谁都不通知谁。改数据的人只做一件事——写进存储，然后喊一声“变了”；
 * 所有显示这份数据的地方各自订阅这一声，听到了就自己重新读一遍。
 * 新加一个显示位置（比如这个圆点），不用改任何已有的代码，只要让它也去订阅。
 * 这就是“观察者模式”，CS61A 讲到可变数据的时候会碰到它的影子。
 */
'use client';
import { useEffect, useState } from 'react';
import { STATE_LABELS, UNDERSTANDING_LABELS } from '@/core/progress/progress';
import { readCourseProgress, readModuleUnderstanding, subscribeProgress } from './progress-store';

type Dot = { state: 'todo' | 'learning' | 'done'; label: string };

/** 两条进度线各自的状态，统一换算成圆点的三种样子。 */
function readDot(target: { course?: string; module?: string }): Dot | null {
  try {
    if (target.course !== undefined) {
      const record = readCourseProgress(target.course);
      return record ? { state: record.state, label: STATE_LABELS[record.state] } : null;
    }
    if (target.module !== undefined) {
      const record = readModuleUnderstanding(target.module);
      // “未读”和没标一样，不画圆点：侧边栏里满屏空心圈只会变成噪音。
      if (!record || record.state === 'unread') return null;
      return { state: record.state === 'read' ? 'learning' : 'done', label: UNDERSTANDING_LABELS[record.state] };
    }
  } catch {
    // 存储读不懂时，这里只是不画；具体哪里坏了由课程页上的那一栏负责说明。
  }
  return null;
}

export function StatusDot({ course, module }: { course?: string; module?: string }) {
  const [dot, setDot] = useState<Dot | null>(null);

  useEffect(() => {
    const load = () => setDot(readDot({ course, module }));
    load();
    return subscribeProgress(load);
  }, [course, module]);

  if (dot === null) return null;
  return (
    <span data-status-dot className="ms-auto inline-flex shrink-0 items-center" title={`我：${dot.label}`}>
      <span className="cs-dot animate-cs-fade-in" data-state={dot.state} aria-hidden="true" />
      <span className="sr-only">（我：{dot.label}）</span>
    </span>
  );
}
