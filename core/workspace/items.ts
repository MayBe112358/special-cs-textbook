/**
 * @module        心得空间里的“条目”——你写的文档、导入的文件、画的导图
 * @problem       以前每页只能存一段心得文字。现在一门课的心得空间里可以有好几份文档、导入的 .md 和代码文件、
 *                还有导图。它们需要一个统一的样子，才能一起列出来、一起备份、一起交给将来的 AI 去读。
 * @design        一个条目 = 它属于哪个空间（知识路径，比如 /programming-intro/cs61a）+ 名字 + 种类 + 内容。
 *                种类只有两种：text（文字：你写的文档和导入的文件都是文字，靠文件名后缀决定怎么渲染）
 *                和 canvas（导图）。把“自己写的”和“导入的”都算成 text，是因为导入之后它们一样能打开、能改、能渲染，
 *                区别只记在 origin 里，给人看的时候说明一下来源。
 *                旧版那种“一页一段心得”在这里被转换成一份名叫“我的心得.md”的文档（migrateLegacyNote）。
 * @courses       UC Berkeley CS61A（数据抽象）；CMU 15-445 / UC Berkeley CS186（模式设计与数据迁移）；
 *                MIT Missing Semester（文件名后缀与文件类型）
 * @exercises     https://cs186berkeley.net/ —— CS186 里关于数据模式和迁移的内容
 *                https://missing.csail.mit.edu/2020/data-wrangling/ —— 在真终端里看各种文本文件长什么样
 * @prereq        知道“文件后缀”只是名字的一部分，程序用它来猜文件是什么内容。
 * @unclear       只接受文字文件。图片、PDF 这类二进制文件现在不收——要收的话备份文件会变得很大，
 *                得先想清楚备份怎么装它们。
 *
 * @letter
 * 心得刚上线的时候，每个页面底下只能写一段字。现在一门课的心得空间里，可以有好几份文档、导进来的 .md 和代码文件，还有导图。
 * 这些东西得有个统一的样子，才能一起列出来、一起备份、一起交给 AI 去读。这个文件定的就是这个样子，叫“条目”。
 *
 * 一个条目就是：它属于哪个空间（比如 /programming-intro/cs61a），叫什么名字，是哪一种，里面装了什么。
 * 种类只分两种：text（文字）和 canvas（导图）。
 * 你自己写的文档和导进来的文件都算 text，因为导进来以后它们一样能打开、能改、能渲染，区别只记在 origin 字段里，给你看的时候注明一下来源。
 * 怎么渲染看文件名后缀：.md 按 Markdown 画，.c、.py 这些按代码着色。后缀说到底只是名字的一部分，程序拿它来猜里面是什么内容。
 *
 * 这个文件里最要紧的函数其实是 migrateLegacyNote，它负责把旧心得搬进新格式。
 * 格式一换，最容易出的事故往往不是新功能有 bug，而是老用户的东西“不见了”。其实它们还好好躺在浏览器里，只是新代码不认识它们。
 * 所以换格式有条规矩：新代码必须认得旧数据，第一次碰到时原样搬进新家，一个字都不改。
 *
 * 搬家还有两个讲究。一是能重复跑：旧心得搬过来以后编号是固定算出来的，再跑一次，编号一样，就知道已经搬过了，不会出现两份。
 * 二是新家没写好之前，不拆旧家。
 * 数据库课（CS186、15-445）里管这件事叫 schema migration，模式迁移。这里规模很小，道理是一样的。
 */

import { validPage } from '../notes/notes.ts';
import { validateCanvas, type Canvas, EMPTY_CANVAS } from './canvas.ts';

export type ItemOrigin = 'written' | 'imported' | 'migrated';

export type NoteItem = {
  id: string;
  /** 属于哪个心得空间：知识路径，和课程目录里那一页的位置相同。 */
  space: string;
  /** 显示的名字，也决定文字怎么渲染：以 .md 结尾按 Markdown，别的后缀按对应语言的代码。 */
  name: string;
  kind: 'text' | 'canvas';
  text?: string;
  canvas?: Canvas;
  origin: ItemOrigin;
  createdAt: string;
  updatedAt: string;
};

export const MAX_TEXT_LENGTH = 2_000_000;
const MAX_NAME = 120;
const ID = /^[a-zA-Z0-9_-]{1,64}$/;

function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

/** 名字不能为空、不能太长，也不能带斜杠（斜杠在这里是“位置”的意思，不能出现在名字里）。 */
export function validName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= MAX_NAME && !/[\\/\u0000-\u001f]/.test(name);
}

export function validateItem(value: unknown): NoteItem {
  if (!value || typeof value !== 'object') throw new Error('心得条目格式错误。');
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !ID.test(v.id)) throw new Error('心得条目的编号无效。');
  if (!validPage(v.space)) throw new Error('心得条目所属的位置无效。');
  if (!validName(v.name)) throw new Error('心得条目的名字无效。');
  if (v.origin !== 'written' && v.origin !== 'imported' && v.origin !== 'migrated') throw new Error('心得条目的来源无效。');
  if (!isTime(v.createdAt) || !isTime(v.updatedAt)) throw new Error('心得条目的时间无效。');
  const base = { id: v.id, space: v.space, name: v.name.trim(), origin: v.origin as ItemOrigin, createdAt: v.createdAt, updatedAt: v.updatedAt };
  if (v.kind === 'text') {
    if (typeof v.text !== 'string' || v.text.length > MAX_TEXT_LENGTH) throw new Error('心得文档的内容无效或过大。');
    return { ...base, kind: 'text', text: v.text };
  }
  if (v.kind === 'canvas') return { ...base, kind: 'canvas', canvas: validateCanvas(v.canvas) };
  throw new Error('心得条目的种类无效。');
}

/** 新建一份空文档。名字默认“未命名.md”；同一空间里重名时由调用方用 uniqueName 处理。 */
export function createTextItem(input: { id: string; space: string; name: string; text?: string; origin?: ItemOrigin; now: string }): NoteItem {
  return validateItem({ id: input.id, space: input.space, name: input.name, kind: 'text', text: input.text ?? '', origin: input.origin ?? 'written', createdAt: input.now, updatedAt: input.now });
}

export function createCanvasItem(input: { id: string; space: string; name: string; now: string }): NoteItem {
  return validateItem({ id: input.id, space: input.space, name: input.name, kind: 'canvas', canvas: EMPTY_CANVAS, origin: 'written', createdAt: input.now, updatedAt: input.now });
}

/** 同一空间里已经有“未命名.md”，就叫“未命名 2.md”，以此类推——和电脑上新建文件的习惯一样。 */
export function uniqueName(wanted: string, taken: readonly string[]): string {
  const names = new Set(taken);
  if (!names.has(wanted)) return wanted;
  const dot = wanted.lastIndexOf('.');
  const stem = dot > 0 ? wanted.slice(0, dot) : wanted;
  const ext = dot > 0 ? wanted.slice(dot) : '';
  for (let i = 2; ; i++) {
    const candidate = `${stem} ${i}${ext}`;
    if (!names.has(candidate)) return candidate;
  }
}

/**
 * 把一份心得挪到另一个空间（另一门课、另一个分类）。
 * 只改“属于哪里”，编号不变——所以打开着的标签、暂存的草稿都还认得它。
 * 目标空间里已经有同名的，就像新建时一样在名字后面加个数字，不覆盖别人。
 * taken 是目标空间里现有的名字。挪到原地什么都不做，原样返回。
 */
export function moveItem(item: NoteItem, space: string, taken: readonly string[], now: string): NoteItem {
  if (item.space === space) return item;
  return validateItem({ ...item, space, name: uniqueName(item.name, taken), updatedAt: now });
}

/** 后缀到代码语言的对照表。只列常见的；认不出来的按纯文本显示，不瞎猜。 */
const LANGUAGES: Record<string, string> = {
  md: 'markdown', markdown: 'markdown', txt: 'text',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', java: 'java', py: 'python', js: 'javascript', mjs: 'javascript',
  ts: 'typescript', tsx: 'tsx', jsx: 'jsx', rs: 'rust', go: 'go', rb: 'ruby', scm: 'scheme', ss: 'scheme', rkt: 'racket',
  hs: 'haskell', ml: 'ocaml', sh: 'bash', bash: 'bash', zsh: 'bash', sql: 'sql', json: 'json', yaml: 'yaml', yml: 'yaml',
  toml: 'toml', html: 'html', css: 'css', tex: 'latex', s: 'asm', asm: 'asm', v: 'verilog', sv: 'verilog', lua: 'lua',
  kt: 'kotlin', swift: 'swift', scala: 'scala', r: 'r', m: 'matlab', ipynb: 'json', makefile: 'makefile',
};

/** 这个名字的文件该怎么显示：markdown、某种代码语言，或者 text（原样显示）。 */
export function languageOf(name: string): string {
  const lower = name.toLowerCase();
  if (lower === 'makefile') return 'makefile';
  const dot = lower.lastIndexOf('.');
  return dot < 0 ? 'text' : LANGUAGES[lower.slice(dot + 1)] ?? 'text';
}

/** 能导入的文件：认得后缀的文字文件。 */
export function importable(name: string): boolean {
  return languageOf(name) !== 'text' || /\.txt$/i.test(name);
}

/**
 * 把旧版“一页一段心得”搬成新格式的一份文档。
 * 编号由页面位置算出来，所以同一页搬几次都得到同一个编号——重复运行不会搬出两份。
 */
export function migrateLegacyNote(note: { page: string; text: string; updatedAt: string }): NoteItem {
  const slug = note.page === '/' ? 'root' : note.page.slice(1).replace(/\//g, '_');
  // 编号最长 64 位；路径太长时截短，再接一段由完整路径算出的短哈希，免得两个长路径截成同一个编号。
  const id = 'legacy-' + (slug.length <= 56 ? slug : slug.slice(0, 46) + '-' + hash(note.page));
  return validateItem({ id, space: note.page, name: '我的心得.md', kind: 'text', text: note.text, origin: 'migrated', createdAt: note.updatedAt, updatedAt: note.updatedAt });
}

/** 一个很朴素的字符串哈希（djb2），只用来给过长的路径生成一段稳定的短后缀。 */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(0, 8);
}
