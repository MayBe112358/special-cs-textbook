/**
 * @module        首页的“接着来”——你上次停在哪，一眼找回去
 * @problem       标签全关掉之后会回到首页。对第一次来的人，首页要讲清这是什么；
 *                但对天天来的人，首页更该是一张“接着来”的清单：在学的课、最近写的心得、自己排的路线。
 * @design        三样东西都存在读者自己的浏览器里（学习状态在 localStorage，心得和路径在 IndexedDB），
 *                服务器生成页面时看不到它们，所以这一块只能在浏览器里现读现画。
 *                一样都没有（第一次来的人）就整块不显示——空着的“继续”区只会让新读者困惑。
 *                读取走的是和心得区、学习路径区同一套接口（browser-workspace），不自己去碰数据库。
 * @courses       CMU 15-445 / UC Berkeley CS186（按时间排序取前几条）；Stanford CS147（为回访用户设计）；
 *                CS50x Week 8（浏览器存储）
 * @exercises     https://15445.courses.cs.cmu.edu/ —— CMU 15-445 里排序与取前几条的查询
 * @prereq        知道 localStorage 和 IndexedDB 都是浏览器里的存储；知道 Promise 表示“稍后才有的结果”。
 * @unclear       “最近”只看每份心得的修改时间，打开过但没改的心得不算“最近”。
 *
 * @letter
 * 第一次来的人，是看不到这一块的。这是故意的。
 *
 * 一个写着“继续学习：（无）”的空框框，对新读者一点信息都没有，只会让人犯嘀咕：我是不是漏了哪一步？
 * 所以这里的规矩是：有东西才出来，没东西就当它不存在。
 * 等你标了一门“在学”、写了一份心得、排了一条路线，下次回到首页，它们就会排在这儿等你：在学的课、最近改过的心得、你的路线。
 *
 * 有个小地方值得一提。这些东西全存在你自己的浏览器里（学习状态在 localStorage，心得和路线在 IndexedDB），而网页是提前生成好的，生成的时候根本不知道你存了什么。
 * 所以这块一开始总是空的，得等浏览器读完了才画得出来。
 * 读的这段时间里，这里什么都不显示，而不是先显示“空”、再跳成“有东西”。不然页面会“闪”一下，看着很廉价。
 *
 * 读数据走的是心得区、学习路径区用的同一套接口（browser-workspace），它自己不去碰数据库。
 * 将来数据换了地方存，这里一行都不用改。
 */
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { readProgressSnapshot, subscribeProgress } from '@/components/progress/progress-store';
import { getWorkspace, subscribeWorkspace } from '@/components/workspace/browser-workspace';

export type CourseLink = { id: string; title: string; url: string };

type Recent = {
  learning: CourseLink[];
  notes: { id: string; name: string; where: string; href: string; updatedAt: string }[];
  paths: { id: string; name: string; updatedAt: string }[];
};

function when(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return '';
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  return iso.slice(0, 10);
}

export function ContinuePanel({ courses, titles }: { courses: CourseLink[]; titles: Record<string, string> }) {
  const [recent, setRecent] = useState<Recent | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const byId = new Map(courses.map((c) => [c.id, c]));
      const learning = readProgressSnapshot().records
        .filter((r) => r.state === 'learning')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .flatMap((r) => byId.get(r.course) ?? [])
        .slice(0, 6);
      let notes: Recent['notes'] = [];
      let paths: Recent['paths'] = [];
      try {
        const ws = await getWorkspace();
        notes = (await ws.listItems())
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 5)
          .map((item) => ({
            id: item.id,
            name: item.name,
            where: titles[item.space] ?? item.space,
            href: `/notes${item.space === '/' ? '' : item.space}?item=${item.id}`,
            updatedAt: item.updatedAt,
          }));
        paths = (await ws.listPaths()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
      } catch {
        // 浏览器不让用 IndexedDB（比如某些隐私模式）：心得和路径这两栏就不显示，不影响首页其他部分。
      }
      if (alive) setRecent({ learning, notes, paths });
    };
    void load();
    const offProgress = subscribeProgress(() => void load());
    const offWorkspace = subscribeWorkspace(() => void load());
    return () => { alive = false; offProgress(); offWorkspace(); };
  }, [courses, titles]);

  if (!recent || (recent.learning.length === 0 && recent.notes.length === 0 && recent.paths.length === 0)) return null;

  return (
    <section aria-labelledby="home-continue" className="cs-home-section animate-cs-fade-in">
      <h2 id="home-continue" className="cs-home-eyebrow">接着来</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {recent.learning.length > 0 ? (
          <div className="cs-home-panel">
            <h3 className="cs-home-panel-title">在学的课</h3>
            <ul className="space-y-0.5">
              {recent.learning.map((course) => (
                <li key={course.id}>
                  <Link href={course.url} className="cs-home-row">
                    {/* 和侧边栏里“在学”的那个圆点是同一个样子。 */}
                    <span aria-hidden="true" className="cs-dot shrink-0" data-state="learning" />
                    <span className="truncate">{course.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {recent.notes.length > 0 ? (
          <div className="cs-home-panel">
            <h3 className="cs-home-panel-title">最近的心得</h3>
            <ul className="space-y-0.5">
              {recent.notes.map((note) => (
                <li key={note.id}>
                  <Link href={note.href} className="cs-home-row">
                    <span className="truncate">{note.name}</span>
                    <span className="ml-auto shrink-0 truncate pl-2 text-xs text-fd-muted-foreground">{note.where} · {when(note.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {recent.paths.length > 0 ? (
          <div className="cs-home-panel">
            <h3 className="cs-home-panel-title">我的学习路径</h3>
            <ul className="space-y-0.5">
              {recent.paths.map((path) => (
                <li key={path.id}>
                  <Link href={`/paths?path=${path.id}`} className="cs-home-row">
                    <span className="truncate">{path.name}</span>
                    <span className="ml-auto shrink-0 pl-2 text-xs text-fd-muted-foreground">{when(path.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
