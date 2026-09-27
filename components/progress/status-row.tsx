/**
 * @module        标题下面那一行：“我的状态”加一排分段按钮，旁边可以再挂作者的标签或整体百分比
 * @problem       课程页的“想学 / 在学 / 学完”和讲解页的“未读 / 读过 / 读懂了”，是同一种交互：
 *                几个互斥的选项、再点一次取消、只在出事时说话。两处各写一遍，样子和脾气迟早会分叉。
 * @design        这里只管“长什么样、怎么点”，不管数据存在哪——读写存储由调用方传进来。
 *                选项做成分段按钮（cs-seg）：互斥的几个选项挨在一起，按下的那个填满蓝色，
 *                比四个散开的按钮更像“一个开关的几档”。原来单独的“清除”按钮去掉了，
 *                改成再点一次已按下的那档就取消——少一个按钮，也少一个要解释的概念。
 *                平时这一行不说话；只有存储读写失败时，才在下面冒出一句红字。
 * @courses       Stanford CS147 / UC Berkeley CS160（直接操作、状态可见、减少多余控件）；
 *                UC Berkeley CS61A（把“怎么显示”和“数据在哪”分开的抽象）
 * @exercises     https://cs147.stanford.edu/ —— 课程设计作业里的交互评审
 * @prereq        知道 React 组件可以接收函数作为参数，由调用方决定“点了之后做什么”。
 * @unclear       “再点一次取消”对第一次来的人不一定显而易见，这里靠按钮的悬停提示补救；
 *                有没有人因此找不到“清除”，要等真实读者用过才知道。
 *
 * @letter
 * 课程页标题正下方那一行：“我的状态”，后面跟一排分段按钮。
 *
 * 这一行原来在页面最底下，后来挪到了标题下面。理由很朴素：你打开一门课，最常干的两件事是“看简介”和“记一笔”。
 * 简介在最上面，记一笔的按钮却得滚到底才找得到，那它基本就不会被用。挪上来以后，它离你的视线就一行字，又小到不会抢正文的风头。
 *
 * 另一个改动是去掉了“清除”按钮。原来四个按钮里有一个的意思是“以上都不是”，其实就是在说“这组可以一个都不选”。
 * 分段按钮天生就能表达这件事：再点一下按下去的那个，它就弹起来了。跟手机上很多开关是一个习惯，不用新学。
 * 不过这对第一次来的人不一定一眼能看出来，所以按钮上加了悬停提示。有没有人因此找不到“清除”，得等真有人用过才知道。
 */
'use client';
import type { ReactNode } from 'react';

export function StatusRow<T extends string>({
  label,
  hint,
  options,
  labels,
  value,
  ready,
  onChoose,
  error,
  children,
}: {
  /** 这一行叫什么，比如“我的状态”。 */
  label: string;
  /** 悬停在名字上时的说明：数据存在哪、和终端哪条命令是同一份。 */
  hint: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | null;
  /** 存储读到之前按钮是灰的：这时还不知道该按下哪一个，不能让人先点。 */
  ready: boolean;
  onChoose: (next: T | null) => void;
  /** 只在出事时有值。 */
  error: string;
  /** 挂在分段按钮后面的东西：作者的标签、整体百分比。 */
  children?: ReactNode;
}) {
  return (
    <div className="not-prose mb-4 mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="text-fd-muted-foreground" title={hint}>{label}</span>
      <div className="cs-seg" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={!ready}
            aria-pressed={value === option}
            title={value === option ? '再点一次取消' : undefined}
            onClick={() => onChoose(value === option ? null : option)}
          >
            {labels[option]}
          </button>
        ))}
      </div>
      {children}
      <p role="status" className={error ? 'basis-full text-xs text-cs-error' : 'sr-only'}>{error}</p>
    </div>
  );
}
