/**
 * @module        统一编辑接口在浏览器里的实现——心得条目和学习路径存进 IndexedDB，状态仍在 localStorage
 * @problem       core/workspace/workspace.ts 只说了“能做什么”，总得有人真的把数据存下来。
 *                导入的笔记和代码文件可能有好几兆，localStorage 大约只有 5MB 且只能存字符串，装不下；
 *                IndexedDB 是浏览器自带的小数据库，容量大得多，还支持事务。
 * @design        一个数据库、两张表：items（心得条目，按所属空间建索引）和 paths（导图版学习路径）。
 *                学习状态和理解度仍用原来的 progress-store（终端要同步读它们，不能改成异步）。
 *                每次写入之后广播一个 WORKSPACE_CHANGED 事件，界面上显示这些数据的地方各自重新读——
 *                和学习状态那套“谁都不通知谁，只喊一声变了”的做法一样。
 *                第一次打开时做一次搬家：旧版每页一段的心得、旧版按顺序排列的路径，换成新格式写进来，
 *                确认写进去了，才删掉 localStorage 里的旧记录。
 * @courses       UC Berkeley CS186 / CMU 15-445（事务、索引）；CS50x Week 8（浏览器存储）；
 *                UC Berkeley CS61A（接口与实现）
 * @exercises     https://cs186berkeley.net/ —— B+ 树索引与事务
 * @prereq        知道 IndexedDB 的操作都是异步的：发出请求，稍后在回调里拿到结果。
 * @unclear       Safari 的隐私模式和部分国产浏览器会限制 IndexedDB；打不开时界面会提示“浏览器不允许本地存储”，
 *                但不会退回到 localStorage 去硬存。
 *
 * @letter
 * IndexedDB 的原生接口很啰嗦：打开数据库是一个请求，开事务是一个对象，读一条又是一个请求，
 * 结果全靠 onsuccess、onerror 回调送回来。这个文件做的第一件事，是把它包成一个个返回 Promise 的小函数，
 * 这样上层就可以写 await readItem(id)，读起来像同步代码。
 *
 * 这其实就是 CS61A 讲的“把复杂的东西藏在一个简单的接口后面”，只是这一次被藏起来的是浏览器自己的 API。
 *
 * 搬家那一段请留意顺序：先写新，再删旧。反过来的话，写新的那一步万一失败（空间不够、浏览器拒绝），
 * 旧的已经删了——你的心得就真的没了。先写新再删旧，最坏的情况也只是新旧两份都在，下次再搬一次。
 */
'use client';

import { NOTE_PREFIX, readNote } from '@/core/notes/notes';
import { PATH_PREFIX, readPath as readLegacyPath } from '@/core/paths/paths';
import type { ProgressState, UnderstandingState } from '@/core/progress/progress';
import { migrateLegacyNote, validateItem, type NoteItem } from '@/core/workspace/items';
import { migrateLegacyPath, validatePathCanvas, type PathCanvas } from '@/core/workspace/learning-paths';
import type { Workspace } from '@/core/workspace/workspace';
import { readCourseProgress, readModuleUnderstanding, writeProgress, writeUnderstanding } from '@/components/progress/progress-store';

export const WORKSPACE_CHANGED = 'special-cs-textbook:workspace-changed';

const DB_NAME = 'special-cs-textbook';
const DB_VERSION = 1;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('浏览器本地数据库出错。'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('写入没有完成，已整批撤销。'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('这个浏览器不允许本地存储心得。')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' }).createIndex('space', 'space');
      if (!db.objectStoreNames.contains('paths')) db.createObjectStore('paths', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('打不开浏览器的本地数据库。'));
    req.onblocked = () => reject(new Error('另一个标签页正占着本地数据库，请关掉它再试。'));
  });
}

/** 告诉所有正在显示这些数据的地方：变了，重新读一遍。 */
export function notifyWorkspaceChanged(): void {
  window.dispatchEvent(new Event(WORKSPACE_CHANGED));
}

export function subscribeWorkspace(listener: () => void): () => void {
  window.addEventListener(WORKSPACE_CHANGED, listener);
  return () => window.removeEventListener(WORKSPACE_CHANGED, listener);
}

/** 读的时候也校验：数据库里万一混进一条坏记录，跳过它，不让整张列表都打不开。 */
function validOnly<T>(values: unknown[], validate: (v: unknown) => T): T[] {
  return values.flatMap((v) => { try { return [validate(v)]; } catch { return []; } });
}

function createBrowserWorkspace(db: IDBDatabase): Workspace & { putMany(items: NoteItem[], paths: PathCanvas[]): Promise<void> } {
  const store = (name: 'items' | 'paths', mode: IDBTransactionMode) => db.transaction(name, mode).objectStore(name);
  async function write(name: 'items' | 'paths', op: (s: IDBObjectStore) => void) {
    const tx = db.transaction(name, 'readwrite');
    op(tx.objectStore(name));
    await done(tx);
    notifyWorkspaceChanged();
  }
  return {
    async listItems(space) {
      const s = store('items', 'readonly');
      const raw = await request(space === undefined ? s.getAll() : s.index('space').getAll(space));
      return validOnly(raw, validateItem).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    },
    async readItem(id) {
      const raw = await request(store('items', 'readonly').get(id));
      return raw === undefined ? null : validateItem(raw);
    },
    async writeItem(item) { const checked = validateItem(item); await write('items', (s) => s.put(checked)); },
    async deleteItem(id) { await write('items', (s) => s.delete(id)); },
    async listPaths() {
      const raw = await request(store('paths', 'readonly').getAll());
      return validOnly(raw, validatePathCanvas).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    },
    async readPath(id) {
      const raw = await request(store('paths', 'readonly').get(id));
      return raw === undefined ? null : validatePathCanvas(raw);
    },
    async writePath(path) { const checked = validatePathCanvas(path); await write('paths', (s) => s.put(checked)); },
    async deletePath(id) { await write('paths', (s) => s.delete(id)); },
    async readStatus(course) { return readCourseProgress(course)?.state ?? null; },
    async writeStatus(course, state: ProgressState | null) { writeProgress(course, state); },
    async readUnderstanding(module) { return readModuleUnderstanding(module)?.state ?? null; },
    async writeUnderstanding(module, state: UnderstandingState | null) { writeUnderstanding(module, state); },
    /** 导入备份用：一整批放在同一个事务里，失败时浏览器整批撤销。 */
    async putMany(items, paths) {
      const tx = db.transaction(['items', 'paths'], 'readwrite');
      for (const item of items) tx.objectStore('items').put(validateItem(item));
      for (const path of paths) tx.objectStore('paths').put(validatePathCanvas(path));
      await done(tx);
      notifyWorkspaceChanged();
    },
  };
}

export type BrowserWorkspace = ReturnType<typeof createBrowserWorkspace>;

/**
 * 旧数据搬家：localStorage 里每页一段的心得、按顺序排列的路径。
 * 已经搬过的（新库里有同编号的）不再覆盖——新库里的那份可能已经被你改过了。
 */
async function migrateLegacy(ws: BrowserWorkspace): Promise<void> {
  const noteKeys: string[] = [];
  const pathKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(NOTE_PREFIX)) noteKeys.push(key);
    else if (key?.startsWith(PATH_PREFIX)) pathKeys.push(key);
  }
  if (noteKeys.length === 0 && pathKeys.length === 0) return;
  const items: NoteItem[] = [];
  const paths: PathCanvas[] = [];
  const movable: string[] = [];
  for (const key of noteKeys) {
    try {
      const note = readNote(localStorage.getItem(key), key.slice(NOTE_PREFIX.length));
      if (note && note.text.trim() !== '') { const item = migrateLegacyNote(note); if (!(await ws.readItem(item.id))) items.push(item); }
      movable.push(key);
    } catch { /* 读不懂的旧记录原样留着，不删 */ }
  }
  for (const key of pathKeys) {
    try {
      const old = readLegacyPath(localStorage.getItem(key), key.slice(PATH_PREFIX.length));
      if (old) { const path = migrateLegacyPath(old); if (!(await ws.readPath(path.id))) paths.push(path); }
      movable.push(key);
    } catch { /* 同上 */ }
  }
  await ws.putMany(items, paths);
  // 新家写好了，才拆旧家。
  for (const key of movable) localStorage.removeItem(key);
}

let opening: Promise<BrowserWorkspace> | null = null;

/** 全站共用一个数据库连接；第一次调用时打开并搬家。 */
export function getWorkspace(): Promise<BrowserWorkspace> {
  opening ??= openDatabase().then(async (db) => {
    const ws = createBrowserWorkspace(db);
    await migrateLegacy(ws);
    return ws;
  }).catch((error) => { opening = null; throw error; });
  return opening;
}
