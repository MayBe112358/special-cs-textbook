/**
 * @module        一门课的心得空间——这门课下你写的文档、导入的文件、画的导图，以及作者的心得
 * @problem       心得不再是“课程页底下一个输入框”：一门课可能有好几份笔记、几个作业代码文件、一张知识导图。
 *                它们需要一个家：能列出来、能新建、能导入、能改名、能删，点开就能读和写。
 * @design        网址 /notes/<知识路径> 是这门课的心得空间；加上 ?item=<编号> 就是打开其中一份。
 *                这样每一份心得都有自己的地址，标签页、浏览器后退、复制链接全都自然成立（地址是唯一真相）。
 *                列表长得像编辑器的资源管理器：图标、名字、类型和更新时间；改名在原地改，删除在原地确认。
 *                文件可以点“导入文件…”选，也可以直接拖进这一块。只收认得的文字文件（.md 和常见代码），
 *                单个文件最大 2 MB；收不了的会告诉你是哪几个、为什么。
 *                作者的心得（content/author-notes.json）放在最上面，紫色标题，只读——和你自己的分得清。
 *                数据全部通过统一编辑接口（components/workspace/browser-workspace.ts）读写，不直接碰存储。
 * @courses       Stanford CS147（信息架构、直接操作）；UC Berkeley CS61A（数据抽象）；CS50x Week 8–9（文件与表单）
 * @exercises     https://hci.stanford.edu/courses/cs147/
 * @prereq        知道网址里 ? 后面的部分叫查询参数，可以用来说明“这一页里具体打开哪样东西”。
 *                每一行还能“移动”：从下拉框里选另一门课（顺序和缩进照侧边栏那棵树），挪过去编号不变；
 *                旧链接（比如还开着的标签）打开时发现心得已经不在这个空间，就自动换到它的新地址。
 * @unclear       还不能在空间里建子文件夹。
 *
 * @letter
 * 为什么每一份心得要有自己的网址，而不是“点一下在页面里展开”？
 *
 * 因为网址是这个网站所有东西的约定：终端靠它知道你在哪，标签页靠它记住你开过什么，
 * 你把链接发给自己（或者存成书签）靠它找回来。一份没有网址的心得，这三件事都做不到。
 * 这里的 ?item= 看起来是个小细节，它让心得和课程页一样成了这个网站的一等公民。
 */
'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { createCanvasItem, createTextItem, importable, languageOf, MAX_TEXT_LENGTH, moveItem, uniqueName, validName, type NoteItem } from '@/core/workspace/items';
import { newId } from '@/core/workspace/canvas';
import { getWorkspace, subscribeWorkspace } from '@/components/workspace/browser-workspace';
import { discardDraft, readDraft, writeDraft } from '@/components/workspace/drafts';
import { tabKey, useDirtyTab, useTabs } from '@/components/workbench/tabs';
import { TextEditor } from './text-editor';
import { BackupPanel } from './backup-panel';
import { CanvasEditor } from '@/components/canvas/canvas-editor';

export type AuthorNote = { title: string; source?: string; text: string };
/** 一个心得空间：知识路径、标题，以及它在树里的深度（0 是最外层的分类），下拉框按深度缩进。 */
export type SpaceOption = { path: string; title: string; depth: number };

/** 心得空间的网址：/notes 加上知识路径。 */
function spaceHref(space: string): string {
  return `/notes${space === '/' ? '' : space}`;
}

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

function when(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

function kindLabel(item: NoteItem): string {
  if (item.kind === 'canvas') return '导图';
  const lang = languageOf(item.name);
  return lang === 'markdown' ? 'Markdown' : lang === 'text' ? '文本' : lang;
}

export function ItemIcon({ item }: { item: NoteItem }) {
  if (item.kind === 'canvas') {
    return <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0 text-cs-dir" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="1.5" y="2" width="5" height="3.5" rx=".6" /><rect x="9.5" y="10.5" width="5" height="3.5" rx=".6" /><path d="M4 5.5v3h8v2" /></svg>;
  }
  const md = languageOf(item.name) === 'markdown';
  return <svg viewBox="0 0 16 16" aria-hidden="true" className={`size-4 shrink-0 ${md ? 'text-fd-primary' : 'text-cs-warn'}`} fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3.5 1.5h6l3 3v10h-9z" />{md ? <path d="M5.5 11V8l1.5 1.5L8.5 8v3M10.5 8v3" /> : <path d="M6.5 8 5 9.5 6.5 11M9.5 8 11 9.5 9.5 11" />}</svg>;
}

/** 读这个空间（或全部空间）的心得，数据一变就重新读。 */
function useItems(space: string | undefined) {
  const [items, setItems] = useState<NoteItem[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const ws = await getWorkspace();
      setItems(await ws.listItems(space));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '读不到本机的心得。');
    }
  }, [space]);
  useEffect(() => { void load(); return subscribeWorkspace(() => void load()); }, [load]);
  return { items, error };
}

function AuthorNotes({ notes }: { notes: AuthorNote[] }) {
  if (notes.length === 0) return null;
  return (
    <section aria-label="作者的心得" className="cs-card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="cs-eyebrow text-cs-author">作者的心得</h2>
        <span className="text-xs text-fd-muted-foreground">公开内容，随项目保存，只读</span>
      </div>
      {notes.map((note, i) => (
        <article key={i} className="space-y-1">
          <h3 className="font-medium">{note.title}</h3>
          <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">{note.text}</p>
          {note.source ? <p className="text-xs text-fd-muted-foreground">{note.source}</p> : null}
        </article>
      ))}
    </section>
  );
}

/** 列表里的一行：点名字打开，改名在原地改，删除在原地确认。 */
function ItemRow({ item, href, subtitle, spaces }: { item: NoteItem; href: string; subtitle?: ReactNode; spaces: SpaceOption[] }) {
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [target, setTarget] = useState(item.space);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(item.name);
  const [error, setError] = useState('');
  async function rename() {
    const next = name.trim();
    if (next === item.name) { setRenaming(false); return; }
    if (!validName(next)) { setError('名字不能为空，也不能含有斜杠。'); return; }
    const ws = await getWorkspace();
    const taken = (await ws.listItems(item.space)).filter((i) => i.id !== item.id).map((i) => i.name);
    if (taken.includes(next)) { setError('这个空间里已经有同名的心得了。'); return; }
    await ws.writeItem({ ...item, name: next, updatedAt: new Date().toISOString() });
    setRenaming(false); setError('');
  }
  async function move() {
    if (target === item.space) { setMoving(false); return; }
    try {
      const ws = await getWorkspace();
      const taken = (await ws.listItems(target)).map((i) => i.name);
      await ws.writeItem(moveItem(item, target, taken, new Date().toISOString()));
      setMoving(false); setError('');
    } catch (e) {
      setError(`没挪成：${e instanceof Error ? e.message : '浏览器存储不可用'}`);
    }
  }
  async function remove() {
    const ws = await getWorkspace();
    await ws.deleteItem(item.id);
    discardDraft(item.id);
  }
  return (
    <li className="group flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 transition-colors hover:bg-cs-hover">
      <ItemIcon item={item} />
      {renaming ? (
        <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); void rename(); }}>
          <label className="sr-only" htmlFor={`rename-${item.id}`}>新名字</label>
          <input id={`rename-${item.id}`} autoFocus className="cs-input min-w-0 flex-1" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setRenaming(false); setName(item.name); setError(''); } }} />
          <button type="submit" className="cs-btn cs-btn-primary">确定</button>
        </form>
      ) : moving ? (
        <form className="flex min-w-0 flex-1 flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void move(); }}>
          <span className="truncate text-sm">把「{item.name}」挪到</span>
          <label className="sr-only" htmlFor={`move-${item.id}`}>目标课程</label>
          <select id={`move-${item.id}`} autoFocus className="cs-input min-w-48 max-w-full flex-1" value={target} onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setMoving(false); setTarget(item.space); } }}>
            {spaces.map((s) => (
              <option key={s.path} value={s.path}>{'  '.repeat(Math.max(0, s.depth))}{s.title}{s.path === item.space ? '（现在的位置）' : ''}</option>
            ))}
          </select>
          <button type="submit" className="cs-btn cs-btn-primary">确定</button>
          <button type="button" className="cs-btn" onClick={() => { setMoving(false); setTarget(item.space); }}>取消</button>
        </form>
      ) : (
        <Link href={href} className="min-w-0 flex-1 truncate text-fd-foreground hover:text-fd-primary hover:underline">{item.name}</Link>
      )}
      {!renaming && !moving ? (
        <span className="text-xs text-fd-muted-foreground">
          {subtitle}{kindLabel(item)} · {when(item.updatedAt)}{item.origin === 'imported' ? ' · 导入' : item.origin === 'migrated' ? ' · 旧版心得' : ''}
        </span>
      ) : null}
      {!renaming && !moving ? (
        <span className="flex items-center gap-1">
          {confirming ? (
            <>
              <span className="text-xs">删除「{item.name}」？</span>
              <button type="button" className="cs-btn cs-btn-danger" autoFocus onClick={() => void remove()}>确定删除</button>
              <button type="button" className="cs-btn" onClick={() => setConfirming(false)}>取消</button>
            </>
          ) : (
            <>
              <button type="button" className="cs-btn opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100" onClick={() => setRenaming(true)}>改名</button>
              <button type="button" className="cs-btn opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100" onClick={() => { setTarget(item.space); setMoving(true); }}>移动</button>
              <button type="button" className="cs-btn opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100" onClick={() => setConfirming(true)}>删除</button>
            </>
          )}
        </span>
      ) : null}
      {error ? <p role="alert" className="basis-full text-xs text-cs-error">{error}</p> : null}
    </li>
  );
}

/** 一门课的心得空间：作者的心得 + 你的心得列表 + 新建 / 导入。 */
function SpaceOverview({ space, authorNotes, pathname, spaces }: { space: string; authorNotes: AuthorNote[]; pathname: string; spaces: SpaceOption[] }) {
  const router = useRouter();
  const { items, error } = useItems(space);
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const base = pathname.replace(/\/+$/, '');

  async function create(kind: 'text' | 'canvas') {
    const ws = await getWorkspace();
    const taken = (await ws.listItems(space)).map((i) => i.name);
    const now = new Date().toISOString();
    const item = kind === 'text'
      ? createTextItem({ id: newId(), space, name: uniqueName('未命名.md', taken), now })
      : createCanvasItem({ id: newId(), space, name: uniqueName('导图', taken), now });
    await ws.writeItem(item);
    router.push(`${base}?item=${item.id}`);
  }

  async function importFiles(files: FileList | File[]) {
    const list = [...files];
    if (list.length === 0) return;
    const ws = await getWorkspace();
    const taken = (await ws.listItems(space)).map((i) => i.name);
    const skipped: string[] = [];
    const created: NoteItem[] = [];
    for (const file of list) {
      if (!importable(file.name)) { skipped.push(`${file.name}（不是认得的文字文件）`); continue; }
      if (file.size > MAX_IMPORT_BYTES) { skipped.push(`${file.name}（超过 2 MB）`); continue; }
      const text = await file.text();
      if (text.length > MAX_TEXT_LENGTH) { skipped.push(`${file.name}（内容太长）`); continue; }
      const name = uniqueName(file.name.replace(/[\\/]/g, '_'), taken);
      taken.push(name);
      created.push(createTextItem({ id: newId(), space, name, text, origin: 'imported', now: new Date().toISOString() }));
    }
    await ws.putMany(created, []);
    setMessage(
      (created.length ? `已导入 ${created.length} 个文件。` : '') +
      (skipped.length ? `没有导入：${skipped.join('、')}。` : ''),
    );
    if (created.length === 1 && skipped.length === 0) router.push(`${base}?item=${created[0]!.id}`);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void importFiles(event.dataTransfer.files);
  }

  return (
    <div
      className="relative space-y-6"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}
    >
      <AuthorNotes notes={authorNotes} />

      <section aria-label="我的心得" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-base font-semibold">我的心得</h2>
          <button type="button" className="cs-btn cs-btn-primary" onClick={() => void create('text')}>新建文档</button>
          <button type="button" className="cs-btn" onClick={() => void create('canvas')}>新建导图</button>
          <button type="button" className="cs-btn" onClick={() => fileInput.current?.click()}>导入文件…</button>
          <input ref={fileInput} type="file" multiple className="sr-only" accept=".md,.markdown,.txt,.c,.h,.cpp,.cc,.hpp,.java,.py,.js,.mjs,.ts,.tsx,.jsx,.rs,.go,.rb,.scm,.ss,.rkt,.hs,.ml,.sh,.sql,.json,.yaml,.yml,.toml,.html,.css,.tex,.s,.asm,.v,.sv,.lua,.kt,.swift,.scala,.r,.m"
            onChange={(e) => { if (e.target.files) void importFiles(e.target.files); e.target.value = ''; }} />
        </div>
        {error ? <p role="alert" className="text-sm text-cs-error">{error}</p> : null}
        {items === null ? <p className="text-sm text-fd-muted-foreground">正在读取……</p> : items.length === 0 ? (
          <div className="rounded-md border border-dashed border-fd-border px-4 py-8 text-center text-sm text-fd-muted-foreground">
            这里还没有你的心得。新建一份文档、画一张导图，或者把笔记和代码文件直接拖进来。
          </div>
        ) : (
          <ul className="divide-y divide-fd-border overflow-hidden rounded-md border border-fd-border">
            {items.map((item) => <ItemRow key={item.id} item={item} href={`${base}?item=${item.id}`} spaces={spaces} />)}
          </ul>
        )}
        <p role="status" className="text-sm text-fd-muted-foreground empty:hidden">{message}</p>
      </section>

      {dragging ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center rounded-md border-2 border-dashed border-cs-button bg-cs-active/70 text-sm font-medium text-fd-foreground">
          松手导入到这门课的心得里（.md 和代码文件）
        </div>
      ) : null}
    </div>
  );
}

/** 心得首页：最近写过的心得、全部作者心得的入口、备份与恢复。 */
function NotesHome({ spaces, authorNotes }: { spaces: SpaceOption[]; authorNotes: AuthorNote[] }) {
  const titles = useMemo(() => new Map(spaces.map((s) => [s.path, s.title])), [spaces]);
  const { items, error } = useItems(undefined);
  const recent = (items ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
  return (
    <div className="space-y-6">
      <AuthorNotes notes={authorNotes} />
      <section aria-label="最近的心得" className="space-y-2">
        <h2 className="text-base font-semibold">最近的心得</h2>
        {error ? <p role="alert" className="text-sm text-cs-error">{error}</p> : null}
        {items === null ? <p className="text-sm text-fd-muted-foreground">正在读取……</p> : recent.length === 0 ? (
          <p className="rounded-md border border-dashed border-fd-border px-4 py-8 text-center text-sm text-fd-muted-foreground">
            还没有心得。在左边的树里选一门课，就能在它的心得空间里新建文档、导入文件、画导图。
          </p>
        ) : (
          <ul className="divide-y divide-fd-border overflow-hidden rounded-md border border-fd-border">
            {recent.map((item) => (
              <ItemRow key={item.id} item={item} href={`${spaceHref(item.space)}?item=${item.id}`} subtitle={<>{titles.get(item.space) ?? item.space} · </>} spaces={spaces} />
            ))}
          </ul>
        )}
      </section>
      <BackupPanel />
    </div>
  );
}

/** 打开的一份心得：文档用编辑器，导图用画布。 */
function ItemView({ id, space, backHref, tabUrl }: { id: string; space: string; backHref: string; tabUrl: string }) {
  const router = useRouter();
  const [item, setItem] = useState<NoteItem | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const { pin } = useTabs();

  useEffect(() => {
    let alive = true;
    void (async () => {
      const ws = await getWorkspace();
      const found = await ws.readItem(id);
      if (!alive) return;
      setItem(found);
      if (found?.kind === 'text') setText(readDraft(id) ?? found.text ?? '');
    })();
    return () => { alive = false; };
  }, [id]);

  // 这份心得已经被挪到别的课了（比如从还开着的旧标签打开）：换到它现在的地址，“← 全部心得”才回得对地方。
  useEffect(() => {
    if (item && item.space !== space) router.replace(`${spaceHref(item.space)}?item=${item.id}`);
  }, [item, space, router]);

  // 标签名用这份心得的名字。
  useEffect(() => { if (item) document.title = item.name; }, [item]);

  const saved = item?.kind === 'text' ? item.text ?? '' : '';
  const dirty = item?.kind === 'text' && text !== saved;
  useDirtyTab(tabUrl, dirty, () => discardDraft(id));

  function change(next: string) {
    setText(next);
    writeDraft(id, next);
    setStatus('');
    pin(tabUrl);
  }

  const save = useCallback(async () => {
    if (!item || item.kind !== 'text') return;
    setSaving(true);
    try {
      const ws = await getWorkspace();
      const next = { ...item, text, updatedAt: new Date().toISOString() };
      await ws.writeItem(next);
      discardDraft(id);
      setItem(next);
      setStatus('已保存');
    } catch (e) {
      setStatus(`保存失败：${e instanceof Error ? e.message : '浏览器存储不可用'}。你写的内容还在编辑器里。`);
    } finally {
      setSaving(false);
    }
  }, [item, text, id]);

  // Ctrl+S 保存（也拦下浏览器“另存网页”那个默认动作）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  if (item === undefined) return <p className="p-6 text-sm text-fd-muted-foreground">正在打开……</p>;
  if (item === null) {
    return (
      <div className="space-y-3 p-6">
        <p>这份心得已经不存在了（可能被删掉了）。</p>
        <Link className="cs-btn" href={backHref}>回到这门课的心得</Link>
      </div>
    );
  }
  return (
    <div className="flex min-h-[calc(var(--fd-docs-height)-var(--fd-docs-row-3))] flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-fd-border px-4 py-2">
        <Link href={backHref} className="text-sm text-fd-muted-foreground hover:text-fd-primary" title="回到这门课的心得列表">← 全部心得</Link>
        <ItemIcon item={item} />
        <h1 className="min-w-0 truncate text-base font-semibold">{item.name}</h1>
        <span className="text-xs text-fd-muted-foreground">{kindLabel(item)} · 更新于 {when(item.updatedAt)}{dirty ? ' · 有未保存的修改' : ''}</span>
        <span role="status" className="ml-auto text-xs text-fd-muted-foreground">{status}</span>
      </div>
      {item.kind === 'text'
        ? <TextEditor item={item} text={text} onChange={change} onSave={() => void save()} saving={saving} />
        : <CanvasEditor item={item} />}
    </div>
  );
}

/** 心得区的一页：没有 ?item 时是空间概览（或首页），有 ?item 时打开那一份。 */
export function NotesSpace({ space, title, docHref, authorNotes, spaces }: {
  space: string;
  title: string;
  /** 课程介绍页的地址；心得首页没有。 */
  docHref: string | null;
  authorNotes: AuthorNote[];
  /** 全部心得空间，按树的顺序：“移动”的下拉框和心得首页的“属于哪门课”都用它。 */
  spaces: SpaceOption[];
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const itemId = params.get('item');
  const tabUrl = tabKey(pathname, params.toString());

  // 从一份心得回到列表时，页面还是同一页（只是去掉了 ?item），网页标题要自己改回来，标签名才对。
  useEffect(() => {
    if (!itemId) document.title = space === '/' ? '个人心得' : `心得 · ${title}`;
  }, [itemId, space, title]);

  if (itemId) return <ItemView key={itemId} id={itemId} space={space} backHref={pathname} tabUrl={tabUrl} />;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <header className="space-y-1">
        <p className="font-mono text-xs text-fd-muted-foreground">{space === '/' ? '~/notes' : `~/notes${space}`}</p>
        <h1 className="text-2xl font-semibold md:text-[1.75rem]">{space === '/' ? '个人心得' : title}</h1>
        <p className="text-sm text-fd-muted-foreground">
          {space === '/'
            ? '和课程目录一样的一棵树，每门课一个心得空间。你写的一切都只存在这台浏览器里，记得定期导出备份。'
            : <>这门课的心得空间。{docHref ? <Link className="text-fd-primary hover:underline" href={docHref}>查看课程介绍 →</Link> : null}</>}
        </p>
      </header>
      {space === '/' ? <NotesHome spaces={spaces} authorNotes={authorNotes} /> : <SpaceOverview space={space} authorNotes={authorNotes} pathname={pathname} spaces={spaces} />}
    </div>
  );
}
