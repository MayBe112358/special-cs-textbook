/**
 * @module        首页——陌生人十秒看懂这是什么，老读者一步回到上次停下的地方
 * @problem       以前打开网站根地址会直接跳进课程目录。第一次来的人看到的是一棵课程树和一段说明，
 *                要读好一会儿才明白“这不是又一个课程导航站，而是一本以代码为正文的教材”。
 *                另外，标签全关掉之后总得有个地方落脚：它应该是一张导航页，而不是随便某一页。
 * @design        从上到下回答四个问题，每个问题一屏之内答完：
 *                1. 这是什么？——一句话（课程是目录，代码是正文，习题用官方的）+ 一个能直接敲的演示终端；
 *                2. 我上次停在哪？——“接着来”（只有老读者看得到，见 continue-panel.tsx）；
 *                3. 三部分怎么连起来？——拿 CS61A 真走一遍：课程页 → 命令引擎那封信 → 官方的解释器项目；
 *                4. 从哪进去？——三块工作区的入口，和一张按课程数画的分支地图。
 *                页面上所有数字、例子都是构建时从知识索引里算出来的，不手写：课程多了、注释改了，首页跟着变。
 *                布局用“容器查询”而不是按屏幕宽度：首页左边有一栏宽度可拖的课程树，
 *                真正决定排几列的是首页自己分到多宽，而不是整块屏幕多宽。
 * @courses       Stanford CS147 / UC Berkeley CS160（信息层级、第一印象、为新手和老手分别设计）；
 *                CS50x Week 8（HTML、CSS）；UC Berkeley CS61A（用真实例子解释抽象）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 做一个自己的主页
 *                https://cs147.stanford.edu/ —— 原型与可用性测试
 * @prereq        知道 React 组件可以在服务器上（构建时）运行，读文件、算数据，只把结果变成网页发给浏览器。
 * @unclear       “十秒看懂”是 ROADMAP 阶段 14 的验收标准，只能找真的陌生人来测，代码里测不出来。
 *
 * @letter
 * 首页是这本教材里唯一一个“得说服人”的页面。别的页面都默认你已经决定读下去了，只有这一页要面对一个还在犹豫的人。
 *
 * 所以它的写法跟别处不一样：少讲道理，先给例子。
 * 与其跟你说“课程和代码之间有双向链接”，不如直接把三张卡片摆成一排：CS61A 的课程页、命令引擎那封信、CS61A 官方的解释器项目，中间画上箭头。你看一眼就明白了。
 * 演示终端也是一个道理：与其说“这里有个终端”，不如让它自己敲几条命令给你看。
 *
 * 整页从上到下回答四个问题，每个都争取一屏之内答完：这是什么？我上次看到哪了？三部分怎么连起来？从哪儿进去？
 * 第二个问题只有老读者看得到（continue-panel.tsx），第一次来的人根本没有“上次”，那块就不显示，免得占地方。
 *
 * 还有个决定你可能没注意：这一页上没有一个数字是手写的。
 * “130 门课”“123 封信”这些，都是构建网站的时候从知识索引里数出来的；那张 CS61A 的例子卡片，内容也是从命令引擎的注释里现读的。
 * 手写的数字第一天是对的，第三十天就错了，而且没人会发现。首页上一个错的数字，是一本教材最先丢掉信任的地方。
 *
 * 排版上有个小讲究：首页用的是“容器查询”，不是按屏幕宽度来排列。
 * 因为首页左边还有一栏能拖宽拖窄的课程树，真正决定排几列的，是首页自己分到了多宽，而不是整块屏幕多宽。
 * 你把左边的树拖宽一点，首页会自己从两列变成一列，跟屏幕有多大没关系。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import type { ReactNode } from 'react';
import knowledgeIndexJson from '@/core/knowledge/generated/knowledge-index.json';
import type { KnowledgeIndex } from '@/core/knowledge/knowledge-index';
import { ContinuePanel, type CourseLink } from './continue-panel';
import { DemoTerminal } from './demo-terminal';

const index = knowledgeIndexJson as KnowledgeIndex;
const REPO = 'https://github.com/MayBe112358/special-cs-textbook';

/** 首页“三部分”那一排用的例子：一门课和一段学完它就能读懂的代码。 */
const EXAMPLE_COURSE = 'cs61a';
const EXAMPLE_MODULE = 'core/terminal/command-engine.ts';

type Paragraph = { kind: string; text?: string };
const plain = (blocks: readonly Paragraph[] | undefined) => (blocks ?? []).map((b) => b.text ?? '').join(' ').trim();

function hostOf(url: string): string {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}

/** 从真的源文件里找出 runCommand 的那一行签名；找不到（改名了）就不显示，而不是显示一行假的。 */
function signatureOf(file: string, name: string): string | null {
  try {
    const source = readFileSync(path.join(process.cwd(), file), 'utf8');
    return new RegExp(`^export function ${name}\\([^)]*\\)[^{\\n]*\\{`, 'm').exec(source)?.[0] ?? null;
  } catch {
    return null;
  }
}

function buildData() {
  const topPaths = index.categories.find((c) => c.path === '/')?.childPaths ?? [];
  const branches = topPaths
    .filter((p) => p !== '/internals')
    .flatMap((p) => index.categories.find((c) => c.path === p) ?? [])
    .map((category) => {
      const courses = index.courses.filter((c) => c.categoryPath === category.path || c.categoryPath.startsWith(`${category.path}/`));
      const subs = category.childPaths.flatMap((p) => index.categories.find((c) => c.path === p)?.title ?? []);
      // 分类没有自己的介绍页时 url 是空的，但 /docs/<位置> 这个地址仍然打得开（会列出它下面的课）。
      return { path: category.path, url: category.url ?? `/docs${category.path}`, title: category.title, courses, subs };
    });
  const course = index.courses.find((c) => c.id === EXAMPLE_COURSE);
  const module = index.modules.find((m) => m.file === EXAMPLE_MODULE);
  const readable = index.modules.filter((m) => m.courseIds.includes(EXAMPLE_COURSE)).length;
  const titles: Record<string, string> = Object.fromEntries([
    ...index.categories.map((c) => [c.path, c.title]),
    ...index.courses.map((c) => [c.path, c.title]),
    ...index.modules.map((m) => [m.path, m.title]),
  ]);
  titles['/'] = '心得首页';
  const courseLinks: CourseLink[] = index.courses.map((c) => ({ id: c.id, title: c.title, url: c.url }));
  return { branches, course, module, readable, titles, courseLinks };
}

/* ---------------------------------------------------------------- 小部件 */

function ArrowRight({ className = 'size-4' }: { className?: string }) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ExternalIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

/** 卡片左上角的编号，例如“01 目录”。颜色沿用全站的含义：青色是目录，蓝色是能点出去的链接。 */
function Step({ n, label, tone }: { n: string; label: string; tone: 'dir' | 'code' | 'link' }) {
  const color = tone === 'dir' ? 'text-cs-dir' : tone === 'link' ? 'text-fd-primary' : 'text-fd-foreground';
  return (
    <div className="mb-3 flex items-baseline gap-2 font-mono text-xs">
      <span className="text-fd-muted-foreground">{n}</span>
      <span className={`font-semibold tracking-wide ${color}`}>{label}</span>
    </div>
  );
}

/** 两张卡片之间的箭头。宽的时候横着指，窄的时候竖着指。 */
function Connector({ command, text }: { command: string; text: string }) {
  return (
    <div className="cs-home-connector" aria-hidden="true">
      <span className="cs-home-connector-line" />
      <span className="cs-home-connector-label">
        <code className="font-mono text-[11px] text-fd-foreground">{command}</code>
        <span className="text-[11px] text-fd-muted-foreground">{text}</span>
      </span>
      <span className="cs-home-connector-line cs-home-connector-head" />
    </div>
  );
}

/** 一行注释。@ 开头的字段名用关键字的颜色，其余是注释色——和编辑器里看到的一样。 */
function CommentLine({ tag, children }: { tag?: string; children?: ReactNode }) {
  return (
    <div className="cs-code-line">
      <span className="text-cs-code-comment"> * </span>
      {tag ? <span className="text-cs-code-keyword">{tag.padEnd(11, ' ')}</span> : null}
      <span className="text-cs-code-comment">{children}</span>
    </div>
  );
}

/**
 * 给那一行函数签名上色。只认四种词：关键字、函数名（后面跟着括号）、参数名（后面跟着冒号）、类型名（其余的词）。
 * 这是一个极小的“词法分析”——和命令引擎拆词是同一件事，只是规则换了。
 */
function Signature({ text }: { text: string }) {
  const tokens = [...text.matchAll(/\b(export|function)\b|(\w+)(?=\()|(\w+)(?=:)|(\w+)|([^\w]+)/g)];
  return (
    <div className="cs-code-line">
      {tokens.map((t, i) => {
        const cls = t[1] ? 'text-cs-code-keyword' : t[2] ? 'text-cs-code-func' : t[3] ? 'text-cs-code-var' : t[4] ? 'text-cs-code-type' : undefined;
        return <span key={i} className={cls}>{t[0]}</span>;
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- 三块工作区的小插图 */

function IllustrationTree() {
  const rows = [
    { x: 0, w: 58, open: true },
    { x: 14, w: 74, active: false },
    { x: 14, w: 64, active: true },
    { x: 14, w: 86 },
    { x: 0, w: 48 },
    { x: 0, w: 70, open: true },
    { x: 14, w: 60 },
  ];
  return (
    <svg viewBox="0 0 160 96" className="h-full w-full" aria-hidden="true">
      {rows.map((r, i) => (
        <g key={i} transform={`translate(${12 + r.x} ${8 + i * 12})`}>
          {r.active ? <rect x={-6 - r.x} y={-4} width={160} height={11} className="fill-cs-active" /> : null}
          {r.x === 0 ? <path d={r.open ? 'M0 0l3 3 3-3' : 'M1 -1l3 3-3 3'} className="fill-none stroke-fd-muted-foreground" strokeWidth="1.2" strokeLinecap="round" /> : null}
          <rect x={10} y={-1.5} width={r.w} height={4} rx={2} className={r.active ? 'fill-fd-primary' : r.x === 0 ? 'fill-fd-foreground/55' : 'fill-fd-muted-foreground/45'} />
        </g>
      ))}
    </svg>
  );
}

function IllustrationPaths() {
  const boxes = [[10, 10], [10, 58], [64, 34], [118, 10], [118, 58]] as const;
  return (
    <svg viewBox="0 0 160 96" className="h-full w-full" aria-hidden="true">
      <defs>
        <marker id="home-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0l6 3-6 3z" className="fill-fd-muted-foreground" />
        </marker>
      </defs>
      {[[42, 18, 64, 40], [42, 66, 64, 48], [96, 40, 118, 20], [96, 48, 118, 66]].map(([x1, y1, x2, y2], i) => (
        <path key={i} d={`M${x1} ${y1}C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`} className="fill-none stroke-fd-muted-foreground" strokeWidth="1.2" markerEnd="url(#home-arrow)" />
      ))}
      {boxes.map(([x, y], i) => (
        <g key={i}>
          <rect x={x} y={y} width={32} height={18} rx={3} className={i === 2 ? 'fill-cs-active stroke-fd-primary' : 'fill-fd-background stroke-fd-border'} strokeWidth="1.2" />
          <rect x={x + 6} y={y + 7.5} width={i === 2 ? 20 : 16} height={3} rx={1.5} className={i === 2 ? 'fill-fd-primary' : 'fill-fd-muted-foreground/50'} />
        </g>
      ))}
    </svg>
  );
}

function IllustrationNotes() {
  return (
    <svg viewBox="0 0 160 96" className="h-full w-full" aria-hidden="true">
      <rect x={14} y={6} width={132} height={84} rx={4} className="fill-fd-background stroke-fd-border" strokeWidth="1.2" />
      <rect x={24} y={16} width={52} height={5} rx={2.5} className="fill-fd-foreground/60" />
      <rect x={24} y={28} width={100} height={3} rx={1.5} className="fill-fd-muted-foreground/40" />
      <rect x={24} y={35} width={86} height={3} rx={1.5} className="fill-fd-muted-foreground/40" />
      <rect x={24} y={46} width={112} height={32} rx={3} className="fill-fd-muted" />
      <rect x={30} y={53} width={14} height={3} rx={1.5} className="fill-cs-code-keyword" />
      <rect x={47} y={53} width={26} height={3} rx={1.5} className="fill-cs-code-func" />
      <rect x={36} y={61} width={40} height={3} rx={1.5} className="fill-cs-code-string" />
      <rect x={30} y={69} width={50} height={3} rx={1.5} className="fill-cs-code-comment" />
    </svg>
  );
}

/* ---------------------------------------------------------------- 页面 */

export function Home() {
  const { branches, course, module, readable, titles, courseLinks } = buildData();
  const courseCount = index.courses.length;
  const moduleCount = index.modules.length;
  const signature = module ? signatureOf(module.file, 'runCommand') : null;
  const letter = module ? module.comment.letter.map((p) => ('text' in p ? p.text : '')).filter(Boolean) : [];
  const opening = letter.find((p) => p.startsWith('你在终端敲下')) ?? letter[0] ?? '';
  const courseLine = module ? plain(module.comment.courses).split('；')[0] : '';
  // 没有链接的作业条目（只写了说明的）不放上来：这一栏的意思就是“点出去做”。
  const exercises = (module?.comment.exercises ?? []).flatMap((e) => (e.url ? [{ url: e.url, note: e.note }] : []));
  const maxCourses = Math.max(...branches.map((b) => b.courses.length));

  return (
    <div className="@container mx-auto w-full max-w-[84rem] px-5 pb-16 pt-8 md:px-10 md:pt-12">
      {/* ------------------------------------------------ 1. 这是什么 */}
      <section aria-labelledby="home-title" className="cs-home-hero grid items-center gap-10 @5xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] @5xl:gap-14">
        <div className="min-w-0">
          <p className="mb-5 font-mono text-xs text-fd-muted-foreground">
            <span className="text-cs-prompt">~</span> $ cat README.md
          </p>
          <h1 id="home-title" className="text-[clamp(2.25rem,5.2cqi,3.75rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-fd-foreground">
            一本特殊的 CS 教材
          </h1>
          <p className="mt-5 text-[clamp(1.125rem,2.1cqi,1.5rem)] leading-snug text-fd-foreground">
            {/* 每一小句不从中间断开：窄屏上宁可整句换行，也不要把“官方的”拆成两行。 */}
            <span className="inline-block">课程是<em className="cs-home-key text-cs-dir">目录</em>，</span>
            <span className="inline-block">代码是<em className="cs-home-key font-mono">正文</em>，</span>
            <span className="inline-block">习题用<em className="cs-home-key text-fd-primary">官方的</em>。</span>
          </p>
          <p className="mt-4 max-w-[36rem] text-[0.9375rem] leading-[1.85] text-fd-muted-foreground">
            这里按 CS 自学指南的分类收录了 {courseCount} 门公开课。这个网站自己的源代码就是讲解：
            每个核心文件顶上都有一封写给你的信，告诉你它解决什么问题、学完哪门课就能读懂它。
            练习一律链到课程团队自己发布的作业。
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <Link href="/docs" className="cs-home-cta cs-home-cta-primary">
              浏览课程目录 <ArrowRight />
            </Link>
            {module ? (
              <Link href={module.url} className="cs-home-cta">
                读第一封信
              </Link>
            ) : null}
            <a href={REPO} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground hover:text-fd-foreground">
              <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>
              GitHub
            </a>
          </div>
          <dl className="mt-9 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-fd-border pt-6 @md:grid-cols-4">
            {[
              [String(courseCount), '门公开课'],
              [String(branches.length), '个知识分支'],
              [String(moduleCount), '封写在代码里的信'],
              ['0', '道自编习题'],
            ].map(([value, label]) => (
              <div key={label} className="min-w-0">
                <dt className="sr-only">{label}</dt>
                <dd className="font-mono text-2xl font-semibold tabular-nums text-fd-foreground">{value}</dd>
                <dd className="mt-0.5 text-xs text-fd-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <DemoTerminal />
      </section>

      {/* ------------------------------------------------ 2. 接着来（只有老读者看得到） */}
      <ContinuePanel courses={courseLinks} titles={titles} />

      {/* ------------------------------------------------ 3. 三部分怎么连起来 */}
      {course && module ? (
        <section aria-labelledby="home-parts" className="cs-home-section">
          <h2 id="home-parts" className="cs-home-eyebrow">一本教材的三个部分</h2>
          <p className="cs-home-heading">拿一门真实的课走一遍：从课程页，到读得懂的代码，再到官方的作业。</p>
          <div className="cs-home-chain">
            {/* 目录 */}
            <Link href={course.url} className="cs-home-card group">
              <Step n="01" label="目录 · 课程页" tone="dir" />
              <p className="font-mono text-xs text-cs-dir">{course.path}</p>
              <h3 className="mt-1.5 text-lg font-semibold text-fd-foreground">{course.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">{course.description}</p>
              <p className="mt-4 text-xs text-fd-muted-foreground">
                每门课一页：简介、先修要求、官方资源、官方作业，和“学完能读哪些代码”。
              </p>
              <span className="cs-home-card-more">打开课程页 <ArrowRight className="size-3.5" /></span>
            </Link>

            <Connector command={`refs ${course.id}`} text={`学完能读 ${readable} 段代码`} />

            {/* 正文 */}
            <Link href={module.url} className="cs-home-card cs-home-card-code group">
              <Step n="02" label="正文 · 代码和它顶上的信" tone="code" />
              <div className="cs-code-window">
                <div className="flex items-center gap-2 border-b border-fd-border px-3 py-1.5 font-mono text-[11px] text-fd-muted-foreground">
                  <span className="text-fd-foreground">{module.file.split('/').at(-1)}</span>
                  <span className="truncate">{module.file.split('/').slice(0, -1).join('/')}</span>
                </div>
                <div className="cs-code-body">
                  <div className="cs-code-line text-cs-code-comment">/**</div>
                  <CommentLine tag="@module">{module.comment.module}</CommentLine>
                  <CommentLine tag="@courses">{courseLine}</CommentLine>
                  {exercises[0] ? <CommentLine tag="@exercises">{exercises[0].url} —— {exercises[0].note}</CommentLine> : null}
                  <CommentLine />
                  <CommentLine tag="@letter" />
                  {opening ? <CommentLine>{opening}</CommentLine> : null}
                  <CommentLine>……</CommentLine>
                  <div className="cs-code-line text-cs-code-comment"> */</div>
                  {signature ? <Signature text={signature} /> : null}
                </div>
              </div>
              <span className="cs-home-card-more">读这封信 <ArrowRight className="size-3.5" /></span>
            </Link>

            <Connector command="@exercises" text="读完，去做官方作业" />

            {/* 习题 */}
            <div className="cs-home-card">
              <Step n="03" label="习题 · 官方作业" tone="link" />
              <ul className="space-y-2.5">
                {exercises.map((exercise) => (
                  <li key={exercise.url}>
                    <a href={exercise.url} target="_blank" rel="noreferrer" className="group/ex block rounded-[4px] outline-offset-2">
                      <span className="flex items-center gap-1.5 font-mono text-xs text-fd-primary group-hover/ex:underline">
                        {hostOf(exercise.url)}<ExternalIcon />
                      </span>
                      <span className="mt-0.5 block text-sm leading-snug text-fd-muted-foreground">{exercise.note}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-dashed border-fd-border pt-3 text-xs text-fd-muted-foreground">本站不自编习题，官方作业有完整的框架和说明。</p>
            </div>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------ 4. 从哪进去 */}
      <section aria-labelledby="home-areas" className="cs-home-section">
        <h2 id="home-areas" className="cs-home-eyebrow">三块工作区</h2>
        <p className="cs-home-heading">找课、排路线、写心得，各有一块地方；随时可以在它们之间切换。</p>
        <div className="grid gap-3 @3xl:grid-cols-3">
          {[
            { href: '/docs', title: '课程目录', ill: <IllustrationTree />, text: `${courseCount} 门课按知识领域排成一棵树。每门课一页：讲什么、先修什么、官方资料和作业在哪。`, meta: '也可以用底部的终端走：ls、cd、cat、open' },
            { href: '/paths', title: '学习路径', ill: <IllustrationPaths />, text: '把课程拖到画布上、用箭头连起来，排出你自己的路线。作者的路线只是一个示例，复制之后才变成你的。', meta: '这里不替你规定学习顺序' },
            { href: '/notes', title: '个人心得', ill: <IllustrationNotes />, text: '每门课一个心得空间：写 Markdown、导入本地笔记和代码、画导图。作者的心得也在对应的空间里。', meta: '存在你自己的浏览器里，可以导出备份' },
          ].map((area) => (
            <Link key={area.href} href={area.href} className="cs-home-card group">
              <div className="cs-home-illustration">{area.ill}</div>
              <h3 className="mt-4 flex items-center gap-1.5 text-base font-semibold text-fd-foreground">
                {area.title}
                <ArrowRight className="size-3.5 text-fd-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-fd-primary" />
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-fd-muted-foreground">{area.text}</p>
              <p className="mt-3 text-xs text-fd-muted-foreground/80">{area.meta}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ 5. 课程地图 */}
      <section aria-labelledby="home-map" className="cs-home-section">
        <h2 id="home-map" className="cs-home-eyebrow">课程地图</h2>
        <p className="cs-home-heading">
          {branches.length} 个分支，一个小方块是一门课。同一个分支下并排放着不同学校的同类课，供你比较着挑。
        </p>
        <ul className="grid grid-flow-dense grid-cols-2 gap-3 @2xl:grid-cols-4 @5xl:grid-cols-7">
          {branches.map((branch) => {
            const n = branch.courses.length;
            const size = n >= 25 ? 'cs-home-tile-xl' : n >= 10 ? 'cs-home-tile-lg' : '';
            return (
              <li key={branch.path} className={`cs-home-tile-wrap ${size}`}>
                <Link href={branch.url} className="cs-home-card cs-home-tile group">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold text-fd-foreground group-hover:text-fd-primary">{branch.title}</h3>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-fd-muted-foreground">{n}</span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-cs-dir">{branch.path}/</p>
                  {branch.subs.length > 0 && size ? (
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-fd-muted-foreground">{branch.subs.join(' · ')}</p>
                  ) : null}
                  <div className="cs-home-waffle" aria-hidden="true" style={{ ['--share' as string]: n / maxCourses }}>
                    {branch.courses.map((c) => <span key={c.id} title={c.title} />)}
                  </div>
                  <span className="sr-only">，{n} 门课</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ------------------------------------------------ 6. 快捷键和关于 */}
      <footer className="cs-home-section grid gap-8 border-t border-fd-border pt-8 @3xl:grid-cols-[1fr_auto]">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm @xl:grid-cols-[auto_1fr_auto_1fr]">
          {[
            [['Ctrl', 'K'], '搜索课程和代码讲解'],
            [['Ctrl', '`'], '打开或收起终端'],
            [['Ctrl', 'B'], '收起或展开侧边栏'],
            [['Ctrl', 'Alt', 'I'], 'AI 面板（还没接模型）'],
          ].map(([keys, label]) => (
            <div key={label as string} className="contents">
              <dt className="flex justify-end gap-1">
                {(keys as string[]).map((k) => <kbd key={k} className="cs-kbd">{k}</kbd>)}
              </dt>
              <dd className="text-fd-muted-foreground">{label as string}</dd>
            </div>
          ))}
        </dl>
        <p className="max-w-sm text-xs leading-relaxed text-fd-muted-foreground @3xl:text-right">
          纯静态网站，开源在 <a className="text-fd-primary hover:underline" href={REPO} target="_blank" rel="noreferrer">GitHub</a>。
          你的学习状态、心得和路径只存在你自己的浏览器里；公开评论走 GitHub Discussions。
        </p>
      </footer>
    </div>
  );
}
