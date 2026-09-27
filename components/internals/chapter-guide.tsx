/**
 * @module        讲解区的章节目录，以及每篇讲解页页头的“第几章第几篇”和页脚的上一篇、下一篇
 * @problem       阅读顺序（core/knowledge/chapters.ts）算好了，还得让读者看得见：
 *                讲解区首页要按章列出来，每章带导读；读到某一篇时，要知道自己在第几章、下一篇去哪。
 * @design        三样东西，都在构建时画好，不需要浏览器做任何事：
 *                ChapterGuide：讲解区首页的主体，每章一个小标题（能从右边页内目录跳过去）、一段导读、一串按顺序编号的文章；
 *                每篇后面挂着理解度小圆点（和侧边栏同一个 StatusDot），读过几篇一眼看得到。
 *                ReadingPositionLine：讲解页标题下面一行小字“第 1 章 · 命令引擎 · 第 3 / 6 篇”，点章节名回到目录里那一章。
 *                readingFooter：交给 Fumadocs 页脚的上一篇、下一篇，替换它默认那种“按侧边栏顺序”的翻页。
 *                groupByChapter：把任意一组模块按章节分组，课程页的“本课对应的项目实现”用它。
 *                章节清单在模块加载时就和索引对账（buildChapters），写错了构建直接失败。
 * @courses       Harvard CS50x Week 8（HTML 的语义：有序列表、标题层级）；Stanford CS147（导航与信息架构：同一批内容的两种组织方式）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：用标题和列表组织一页内容
 *                https://cs147.stanford.edu/ —— Stanford CS147 的信息架构与可用性作业
 * @prereq        读过 core/knowledge/chapters 那一篇；知道 <ol> 是有序列表。
 * @unclear       侧边栏还是按仓库目录排，和这里的章节顺序不一样；两种顺序并存会不会让人困惑，要等读者用过才知道。
 *                终端里还没有按章节看的命令（比如列出第 2 章），现在只能在网页上看章节。
 *
 * @letter
 * 这个文件把阅读顺序摆到了三个地方：讲解区首页、每篇的页头、每篇的页脚。挨个说一下为什么是这三处。
 *
 * 首页是给“我从哪儿开始读”的人看的。每章先给一段导读，再列文章，因为你决定读不读一章之前，想知道的是“它讲什么、我够不够格读”，而不是一串文件名。
 * 每篇后面那个小圆点跟侧边栏上的是同一个，你读懂了几篇、卡在哪一章，扫一眼就知道。
 *
 * 页头那一行小字是给“顺着链接跳进来的人”看的。你可能是从课程页的“本课对应的项目实现”点进来的，根本不知道这篇在书里排在哪。
 * 告诉你“这是第 2 章第 5 篇”，你就知道前面还有些什么，要不要先回去补。
 *
 * 页脚是给“一篇接一篇读下去的人”看的。Fumadocs 默认的上一页、下一页是照侧边栏顺序走的，而侧边栏是按文件夹排的，
 * 读完命令引擎，“下一页”可能跳到一个八竿子打不着的文件。这里把它换成了阅读顺序，读完一章最后一篇，下一篇就是下一章的第一篇。
 *
 * 三处用的是同一份章节数据，不会出现“首页说它在第 2 章、页头说在第 3 章”这种事。
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import chaptersJson from '@/content/internals-chapters.json';
import knowledgeIndexJson from '@/core/knowledge/generated/knowledge-index.json';
import type { KnowledgeIndex, ModuleEntry } from '@/core/knowledge/knowledge-index';
import { buildChapters, readingPosition, type ChapterFile } from '@/core/knowledge/chapters';
import { StatusDot } from '@/components/progress/status-dot';
import type { TOCItemType } from 'fumadocs-core/toc';

const index = knowledgeIndexJson as KnowledgeIndex;
const moduleByPath = new Map<string, ModuleEntry>(index.modules.map((m) => [m.path, m]));
// 构建时对账：清单里写了不存在的模块、写了两次，这里就抛错，构建失败并指出是哪一条。
const chapters = buildChapters(chaptersJson as ChapterFile, index.modules.map((m) => m.path));
const CHAPTERS_URL = '/docs/internals';

/** @module 那一行里破折号后面那半句，没有就用整行。 */
function subtitleOf(module: ModuleEntry): string {
  const line = module.comment.module;
  const at = line.indexOf('——');
  return at < 0 ? line : line.slice(at + 2).trim();
}

function chapterLabel(number: number, appendix: boolean): string {
  return appendix ? '附录' : `第 ${number} 章`;
}

/** 讲解区首页的页内目录：每章一项。 */
export function chapterTableOfContents(): TOCItemType[] {
  return [
    ...chapters.map((c) => ({ title: `${chapterLabel(c.number, c.appendix)}　${c.title}`, url: `#chapter-${c.id}`, depth: 2 })),
    { title: '按仓库目录看', url: '#by-folder', depth: 2 },
  ];
}

export function ChapterGuide({ children }: { children?: ReactNode }) {
  return (
    <>
      <p>{(chaptersJson as ChapterFile).intro}</p>
      {chapters.map((chapter) => (
        <section key={chapter.id}>
          <h2 id={`chapter-${chapter.id}`}>
            {chapterLabel(chapter.number, chapter.appendix)}　{chapter.title}
          </h2>
          <p>{chapter.intro}</p>
          <ol className="not-prose my-4 divide-y divide-fd-border overflow-hidden rounded-md border border-fd-border">
            {chapter.modules.map((path, i) => {
              const module = moduleByPath.get(path)!;
              return (
                <li key={path}>
                  <Link href={module.url} className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-baseline gap-x-2 px-4 py-2.5 transition-colors hover:bg-cs-hover">
                    <span className="font-mono text-xs text-fd-muted-foreground">{chapter.appendix ? '' : `${chapter.number}.${i + 1}`}</span>
                    <span className="min-w-0">
                      <span className="font-medium text-fd-foreground group-hover:text-fd-primary">{module.title}</span>
                      <span className="block text-sm leading-relaxed text-fd-muted-foreground">{subtitleOf(module)}</span>
                    </span>
                    <StatusDot module={module.path} />
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {children}
    </>
  );
}

/** 把一组模块按章节分组，章节和章内顺序都照阅读顺序。课程页“本课对应的项目实现”用它。 */
export function groupByChapter(paths: readonly string[]) {
  const wanted = new Set(paths);
  return chapters
    .map((chapter) => ({
      id: chapter.id,
      label: `${chapterLabel(chapter.number, chapter.appendix)}　${chapter.title}`,
      modules: chapter.modules.filter((path) => wanted.has(path)).map((path) => moduleByPath.get(path)!),
    }))
    .filter((group) => group.modules.length > 0);
}

/** 讲解页标题下面那一行：第几章、第几篇。不在任何一章里（理论上不会发生）就不画。 */
export function ReadingPositionLine({ modulePath }: { modulePath: string }) {
  const position = readingPosition(chapters, modulePath);
  if (position === null) return null;
  const { chapter, index: at } = position;
  return (
    <p className="text-sm text-fd-muted-foreground">
      <Link href={`${CHAPTERS_URL}#chapter-${chapter.id}`} className="hover:text-fd-primary">
        {chapterLabel(chapter.number, chapter.appendix)} · {chapter.title}
      </Link>
      {' · '}第 {at} / {chapter.modules.length} 篇
    </p>
  );
}

/** 交给 Fumadocs 页脚的上一篇、下一篇，按阅读顺序而不是侧边栏顺序。 */
export function readingFooter(modulePath: string) {
  const position = readingPosition(chapters, modulePath);
  const item = (path: string | null) => {
    if (path === null) return undefined;
    const module = moduleByPath.get(path)!;
    return { name: module.title, description: subtitleOf(module), url: module.url };
  };
  return { items: { previous: item(position?.previous ?? null), next: item(position?.next ?? null) } };
}
