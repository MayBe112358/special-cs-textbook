/**
 * @module        学习路径（导图版）的编辑界面——课程方块、箭头、多条路径
 * @problem       自己组学习路线时，真实的样子是一张网：几门课可以并行，有的必须先后。
 *                “排成一列”画不出来；而且排路线时手边需要整棵课程树，随时拖一门进来。
 * @design        上面一排路径标签（可以有多条，切换 / 新建 / 改名 / 删除，删除在原地确认）；
 *                下面是通用画布（canvas-board.tsx），方块是课程卡片：标题、课程编号、你的学习状态小圆点。
 *                加课程的三种方式：从左边课程树把课程直接拖进画布；在工具栏的“添加课程”框里搜；复制作者的示例路线。
 *                双击课程方块打开课程介绍（新开一个标签）。“整理布局”按箭头分层排好（core/workspace/learning-paths.ts 的 arrange）。
 *                改动停手 0.4 秒后自动保存，Ctrl+Z 撤销。当前路径写在网址里（?path=编号），所以每条路径可以是一个标签。
 *                手机上画布只能看、不能改，下面附一份按从左到右顺序排好的课程清单。
 *                旧版“按顺序排列”的路径在第一次打开时已经自动换成一串用箭头连起来的方块（browser-workspace.ts）。
 * @courses       UC Berkeley CS61B（有向图）；Stanford CS147（直接操作、拖放）；CS50x Week 8（拖放事件）
 * @exercises     https://sp21.datastructur.es/ —— CS61B 讲图的那几周
 *                https://cs147.stanford.edu/ —— Stanford CS147 的原型与可用性测试作业
 * @prereq        知道拖放时，被拖的链接会把它的网址放进 dataTransfer 里带过来。
 * @unclear       一门课在一条路径里只能出现一次；想表达“同一门课学两遍”目前做不到。
 *
 * @letter
 * 学习路径的编辑界面。上面一排是你的几条路线，下面是那块画布，方块是一张张课程卡片：标题、编号，还有你给它标的学习状态小圆点。
 *
 * 加课程有三种办法：从左边课程树里直接把课拖进画布；在工具栏的“添加课程”框里搜；或者把作者那条示例路线整条复制过来，再改成你自己的。
 *
 * 第一种办法值得多说两句，因为它几乎没写什么代码。
 * 左边那棵课程树没有为“能拖的课程”另写一套列表，就是课程目录里普普通通的链接。
 * 浏览器本来就支持拖链接：你拖一个链接的时候，浏览器会自动把它的网址塞进 dataTransfer 里带过来。
 * 画布收到这个网址，按网址查出是哪门课，加一个方块，完事。
 * 不用发明什么新的拖放协议，链接天生就能拖。借用平台本来就有的能力，往往比自己造一套更稳。
 *
 * 当前是哪条路线，写在网址里（?path=编号）。所以每条路线都能单独占一个标签，刷新了还在，浏览器的后退键也管用。
 * 这还是那句老话：地址栏是唯一的真相。
 *
 * 改动停手 0.4 秒以后自动存，Ctrl+Z 撤销，跟心得导图一个脾气。
 * 双击课程方块，会新开一个标签打开这门课的介绍。
 * “整理布局”按箭头分层排好，用的是 graph 那章的拓扑排序。
 *
 * 手机上画布只能看，不能改：屏幕太小，手指拖方块、连箭头太容易误操作。所以下面另附一份按从左到右排好的课程清单，看路线够用了。
 */
'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CourseEntry } from '@/core/knowledge/knowledge-index';
import { newId, NODE_WIDTH, type Canvas } from '@/core/workspace/canvas';
import { addCourse, arrange, canvasFromCourseList, coursesIn, validatePathCanvas, type PathCanvas } from '@/core/workspace/learning-paths';
import { getWorkspace, subscribeWorkspace } from '@/components/workspace/browser-workspace';
import { StatusDot } from '@/components/progress/status-dot';
import { CanvasBoard } from '@/components/canvas/canvas-board';
import { tabKey, useTabs } from '@/components/workbench/tabs';

type Example = { name: string; description: string; courses: string[] };

/** 从被拖进来的网址认出是哪门课：去掉域名、部署前缀和结尾斜杠，再按课程页网址查。 */
function courseFromDrop(data: DataTransfer, byUrl: Map<string, CourseEntry>): CourseEntry | null {
  const raw = (data.getData('text/uri-list') || data.getData('text/plain')).split('\n')[0]?.trim();
  if (!raw) return null;
  try {
    const path = new URL(raw, window.location.href).pathname.replace(/\/+$/, '');
    const at = path.indexOf('/docs/');
    return at < 0 ? null : byUrl.get(path.slice(at)) ?? null;
  } catch {
    return null;
  }
}

function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const list = window.matchMedia('(min-width: 768px)');
    const update = () => setWide(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, []);
  return wide;
}

function AddCourse({ courses, onAdd, present }: { courses: CourseEntry[]; onAdd: (c: CourseEntry) => void; present: Set<string> }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const hits = q ? courses.filter((c) => (c.id + ' ' + c.title).toLowerCase().includes(q)).slice(0, 8) : [];
  return (
    <div className="relative">
      <label className="sr-only" htmlFor="path-add-course">添加课程</label>
      <input id="path-add-course" className="cs-input w-56 shadow-sm" placeholder="添加课程：输入名称或编号" value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { onAdd(hits[0]); setQuery(''); } if (e.key === 'Escape') setOpen(false); }} />
      {open && hits.length > 0 ? (
        <ul className="absolute left-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-md border border-fd-border bg-fd-popover py-1 shadow-cs-pop">
          {hits.map((c) => (
            <li key={c.id}>
              <button type="button" disabled={present.has(c.id)} onMouseDown={(e) => e.preventDefault()} onClick={() => { onAdd(c); setQuery(''); }}
                className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm hover:bg-cs-hover disabled:opacity-50">
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                <span className="font-mono text-xs text-fd-muted-foreground">{present.has(c.id) ? '已在路径里' : c.id}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function PathsWorkbench({ courses, example }: { courses: CourseEntry[]; example: Example }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const wide = useWide();
  const { pin } = useTabs();
  const [paths, setPaths] = useState<PathCanvas[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 自己保存时写下的时间戳。数据库变了、重新读回来时，如果是自己刚存的那一版，就不去重置画布。 */
  const ownWrites = useRef(new Set<string>());

  const byId = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const byUrl = useMemo(() => new Map(courses.map((c) => [c.url, c])), [courses]);

  const load = useCallback(async () => {
    try {
      const ws = await getWorkspace();
      setPaths(await ws.listPaths());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '读不到本机的学习路径。');
    }
  }, []);
  useEffect(() => { void load(); return subscribeWorkspace(() => void load()); }, [load]);

  const selectedId = params.get('path') ?? paths?.[0]?.id ?? null;
  const active = paths?.find((p) => p.id === selectedId) ?? null;

  // 切换路径时，画布换成那条路径的；同一条路径被别处改了（比如导入备份、另一个标签页），也跟着换。
  // 但自己刚存进去的那一版不算“被别处改了”——那时画布上可能已经有更新的改动，不能被旧快照盖掉。
  const shownId = useRef<string | null>(null);
  useEffect(() => {
    const switched = shownId.current !== (active?.id ?? null);
    shownId.current = active?.id ?? null;
    if (!switched && active && ownWrites.current.has(active.updatedAt)) return;
    setCanvas(active?.canvas ?? null);
    if (switched) { setConfirmingDelete(false); setRenaming(false); }
  }, [active?.id, active?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = active ? `路径 · ${active.name}` : '学习路径'; }, [active]);

  function go(id: string) {
    router.push(`${pathname.replace(/\/+$/, '')}?path=${id}`);
  }

  async function savePath(next: PathCanvas) {
    const ws = await getWorkspace();
    ownWrites.current.add(next.updatedAt);
    await ws.writePath(validatePathCanvas(next));
  }

  async function create(fromExample: boolean) {
    const trimmed = name.trim();
    if (!fromExample && !trimmed) { setStatus('先给新路径起个名字。'); return; }
    const path: PathCanvas = {
      id: newId(),
      name: fromExample ? example.name : trimmed.slice(0, 100),
      canvas: fromExample ? canvasFromCourseList(example.courses.filter((c) => byId.has(c))) : { nodes: [], edges: [] },
      updatedAt: new Date().toISOString(),
    };
    try {
      await savePath(path);
      setName(''); setCreating(false);
      setStatus(fromExample ? '已复制作者的示例。现在它是你的路径了，之后怎么改都和示例无关。' : '');
      go(path.id);
    } catch (e) {
      setStatus(`新建失败：${e instanceof Error ? e.message : '浏览器存储不可用'}`);
    }
  }

  async function rename() {
    if (!active) return;
    const trimmed = name.trim();
    if (!trimmed) { setStatus('名字不能为空。'); return; }
    await savePath({ ...active, name: trimmed.slice(0, 100), updatedAt: new Date().toISOString() });
    setRenaming(false); setStatus('');
  }

  async function remove() {
    if (!active) return;
    const ws = await getWorkspace();
    await ws.deletePath(active.id);
    setStatus(`已删除「${active.name}」。课程、心得和学习状态不受影响。`);
    router.push(pathname.replace(/\/+$/, ''));
  }

  function change(next: Canvas, commit: boolean) {
    setCanvas(next);
    if (!commit || !active) return;
    // 动手改过的路径，标签就固定下来，不会被下一次单击替换掉。
    pin(tabKey(pathname, params.toString()));
    setStatus('正在保存……');
    if (timer.current) clearTimeout(timer.current);
    const target = active;
    timer.current = setTimeout(() => {
      savePath({ ...target, canvas: next, updatedAt: new Date().toISOString() })
        .then(() => setStatus('已自动保存'))
        .catch((e) => setStatus(`保存失败：${e instanceof Error ? e.message : '浏览器存储不可用'}`));
    }, 400);
  }

  /** 新加的课放在最右边那一列的右侧，和已有方块对齐。 */
  function addAt(course: CourseEntry, at?: { x: number; y: number }) {
    if (!canvas) return;
    if (canvas.nodes.some((n) => n.course === course.id)) { setStatus(`${course.title} 已经在这条路径里了。`); return; }
    const right = canvas.nodes.reduce((m, n) => Math.max(m, n.x), -Infinity);
    const pos = at ?? (canvas.nodes.length === 0 ? { x: 40, y: 40 } : { x: right + NODE_WIDTH + 60, y: canvas.nodes[canvas.nodes.length - 1]!.y });
    change(addCourse(canvas, course.id, Math.round(pos.x), Math.round(pos.y)), true);
  }

  const present = new Set(canvas?.nodes.flatMap((n) => (n.course ? [n.course] : [])) ?? []);

  const pathTabs = (
    <div className="flex flex-wrap items-center gap-2 border-b border-fd-border px-3 py-2">
      {(paths ?? []).map((p) => (
        <button key={p.id} type="button" aria-pressed={p.id === active?.id} onClick={() => go(p.id)} className={`cs-btn ${p.id === active?.id ? 'cs-btn-primary' : ''}`}>
          {p.name}<span className="tabular-nums opacity-70">{p.canvas.nodes.length}</span>
        </button>
      ))}
      {creating ? (
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void create(false); }}>
          <label className="sr-only" htmlFor="new-path-name">新路径名称</label>
          <input id="new-path-name" autoFocus className="cs-input w-52" placeholder="比如「先打系统基础」" value={name} maxLength={100}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setCreating(false); setName(''); } }} />
          <button type="submit" className="cs-btn cs-btn-primary">新建</button>
          <button type="button" className="cs-btn" onClick={() => { setCreating(false); setName(''); }}>取消</button>
        </form>
      ) : (
        <button type="button" className="cs-btn" onClick={() => { setCreating(true); setRenaming(false); setName(''); }}>+ 新建路径</button>
      )}
      <button type="button" className="cs-btn" onClick={() => void create(true)} title={example.description}>复制作者的示例</button>
      {active ? (
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {renaming ? (
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void rename(); }}>
              <label className="sr-only" htmlFor="rename-path">路径的新名字</label>
              <input id="rename-path" autoFocus className="cs-input w-48" value={name} maxLength={100} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(false); }} />
              <button type="submit" className="cs-btn cs-btn-primary">确定</button>
            </form>
          ) : confirmingDelete ? (
            <>
              <span className="text-sm">删除「{active.name}」？</span>
              <button type="button" className="cs-btn cs-btn-danger" autoFocus onClick={() => void remove()}>确定删除</button>
              <button type="button" className="cs-btn" onClick={() => setConfirmingDelete(false)}>取消</button>
            </>
          ) : (
            <>
              <button type="button" className="cs-btn" onClick={() => { setRenaming(true); setCreating(false); setName(active.name); }}>改名</button>
              <button type="button" className="cs-btn" onClick={() => setConfirmingDelete(true)}>删除这条路径</button>
            </>
          )}
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-[calc(var(--fd-docs-height)-var(--fd-docs-row-3))] min-w-0 flex-col">
      {pathTabs}
      {error ? <p role="alert" className="px-4 py-2 text-sm text-cs-error">{error}</p> : null}
      <p role="status" className="px-4 pt-1 text-xs text-fd-muted-foreground empty:hidden">{status}</p>

      {paths === null ? <p className="p-6 text-sm text-fd-muted-foreground">正在读取……</p> : !active || !canvas ? (
        <div className="mx-auto max-w-xl space-y-3 px-6 py-12 text-center">
          <h1 className="text-xl font-semibold">学习路径</h1>
          <p className="text-sm leading-relaxed text-fd-muted-foreground">
            把课程拖到画布上变成方块，用箭头连成你自己的路线：可以分叉、可以并行。路径只保存在这台浏览器里。
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="cs-btn cs-btn-primary" onClick={() => { setCreating(true); setName(''); }}>新建第一条路径</button>
            <button type="button" className="cs-btn" onClick={() => void create(true)}>复制作者的示例</button>
          </div>
          <p className="text-xs text-fd-muted-foreground">作者的示例：{example.description}</p>
        </div>
      ) : (
        <>
          <CanvasBoard
            key={active.id}
            canvas={canvas}
            onChange={change}
            textNodes={false}
            readOnly={!wide}
            onOpenNode={(node) => { const c = node.course ? byId.get(node.course) : undefined; if (c) router.push(c.url); }}
            onExternalDrop={(event, at) => {
              const course = event.dataTransfer ? courseFromDrop(event.dataTransfer, byUrl) : null;
              if (course) addAt(course, { x: at.x - NODE_WIDTH / 2, y: at.y - 28 });
              else setStatus('只能把课程目录里的课程拖进来。');
            }}
            toolbar={wide ? (
              <>
                <AddCourse courses={courses} present={present} onAdd={(c) => addAt(c)} />
                <button type="button" className="cs-btn shadow-sm" disabled={canvas.nodes.length < 2} onClick={() => change(arrange(canvas), true)} title="按箭头分层：没有前置的放最左边">整理布局</button>
              </>
            ) : null}
            renderNode={(node) => {
              const course = node.course ? byId.get(node.course) : undefined;
              return (
                <div className="flex min-h-14 flex-col justify-center gap-0.5 px-3 py-2" title={course ? `${course.title}（双击打开课程介绍）` : undefined}>
                  <span className="flex items-center gap-2 text-sm font-medium leading-snug">
                    <span className="min-w-0 flex-1 truncate">{course?.title ?? node.course ?? '（已不在课程目录）'}</span>
                    {node.course ? <StatusDot course={node.course} /> : null}
                  </span>
                  <span className="font-mono text-[11px] text-fd-muted-foreground">{node.course}</span>
                </div>
              );
            }}
            emptyHint={wide ? <>从左边的课程树把课程拖到这里，或者在左上角“添加课程”框里搜。<br />再从一个方块右边的圆点拖出箭头，连到下一门课。</> : <>这条路径还是空的。在电脑上打开可以编辑。</>}
          />
          {!wide ? (
            <section aria-label="路径里的课程" className="border-t border-fd-border px-4 py-3">
              <h2 className="mb-2 text-sm font-semibold">按从左到右的顺序</h2>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {coursesIn(canvas).map((id) => {
                  const c = byId.get(id);
                  return <li key={id}>{c ? <Link className="text-fd-primary" href={c.url}>{c.title}</Link> : id}</li>;
                })}
              </ol>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
