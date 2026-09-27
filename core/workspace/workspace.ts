/**
 * @module        统一编辑接口——读者能在界面上改的每一样东西，都从这一扇门进出
 * @problem       学习状态存在一处、心得存在另一处、学习路径又是一处，各自有各自的读写函数。
 *                网页按钮、终端命令、将来的 AI 助手都要读写它们；如果每个使用者各自去碰存储，
 *                规矩（格式检查、谁能改什么、改之前要不要确认）就会写三遍、漏两遍。
 * @design        这里只定义“有哪些东西、能对它们做什么”，不管它们具体存在哪：
 *                - EDITABLE_RESOURCES：全站可编辑内容的清单（阶段 14.5.1 要求的“盘点”），写清在界面哪里改、终端里怎么改、AI 能不能碰。
 *                - Workspace：一组异步的“列出 / 读 / 写 / 删”。浏览器里由 IndexedDB + localStorage 实现（components/workspace），
 *                  测试里用内存实现；将来如果有云同步，只需要再写一个实现。
 *                - EditProposal + applyProposal：别人想改你的心得文字时，先交一份“改前 / 改后”，
 *                  你点了同意才写入；写入前再核对一次“改前”还是不是现在的样子，免得覆盖掉你刚刚手改的内容。
 *                  AI 助手接上之后，这个想法扩展成了 core/assistant/changes.ts 的“改动单”（能改导图、状态、路径），
 *                  界面上走的是那一条；applyProposal 现在只有测试在用。
 *                这里不引用 React，也不碰浏览器——和命令引擎守的是同一条边界（AGENTS.md 7.1）。
 * @courses       UC Berkeley CS61A（抽象屏障）；MIT 6.031（接口与实现分离、规格说明）；
 *                UC Berkeley CS186 / CMU 15-445（乐观并发控制：写之前检查读到的版本有没有变）
 * @exercises     https://web.mit.edu/6.031/www/sp22/ —— MIT 6.031 关于抽象数据类型、接口与规格说明的阅读和练习
 *                https://cs186berkeley.net/ —— CS186 并发控制相关的作业
 * @prereq        知道“接口”是一份约定：说好有哪些函数、各自做什么，而不管里面怎么实现。
 * @unclear       清单里每样东西的 AI 权限目前只有“能读写 / 只能读”两档，还没有“这一门课的心得不许 AI 看”这种细的设置。
 *                对话里另有一个总开关（只读 / 每次确认 / 自动），在 core/assistant/assistant.ts。
 *                applyProposal 和 changes.ts 的改动单是两套相似的代码，将来可以考虑合并成一套。
 *
 * @letter
 * 这个文件几乎没有真正“干活”的代码，全是约定。可你要是想弄明白“你的东西存在哪、谁能碰、怎么碰”，得从这儿看起。
 *
 * 你能在这个网站上改的东西有好几样：学习状态、理解度、心得文档、导入的文件、导图、学习路径。
 * 它们散在两个地方存（localStorage 和 IndexedDB），而想读写它们的也不止一个：网页上的按钮、终端命令，还有 AI 助手。
 * 要是每一个都自己跑去碰存储，那些规矩（格式对不对、谁能改什么、改之前要不要问你）就得写三遍，还准漏两遍。
 *
 * 所以这里定了一扇统一的门，叫 Workspace：列出、读、写、删，就这几个动作。
 * 它只说“能干什么”，不管东西具体存在哪。浏览器里是 components/workspace/browser-workspace.ts 用 IndexedDB 和 localStorage 实现的；测试里用的是一个内存版的实现；
 * 哪天要做云同步，再写一个实现就行，用它的人一行都不用改。
 * CS61A 管这个叫抽象屏障：屏障这边的人不需要知道那边怎么实现，也就不可能把那边弄坏。
 * 只不过这里站在屏障这边的，除了程序员，还有一个 AI。
 *
 * EDITABLE_RESOURCES 是一张清单，把能改的东西一样样列出来：在界面哪儿改，终端里怎么改，AI 能不能碰。
 * 这张表本来是阶段 14.5 盘点用的，现在 AI 助手也照着它来判断自己能干什么。
 *
 * 最后说说 applyProposal。它是“别人想改你的东西，得先交一份改前改后给你看”的第一个版本，只管心得文档的文字。
 * 后来 AI 助手真接上了，要改的东西多了导图、学习状态、路径这些，这个想法就被扩展成了 core/assistant/changes.ts 里的“改动单”。
 * 现在界面上 AI 走的是改动单那条路，applyProposal 只剩测试在用。它俩的核心是同一句话：写进去之前，再看一眼“改前”是不是还是现在这个样子。
 * AI 想一个回复要好几秒，这几秒里你完全可能又手改了一行。这时候宁可让它的提议作废，也不能把你刚写的那行抹掉。
 * 数据库课里管这个叫乐观并发控制：不锁住数据，但在写入那一刻检查它有没有被人动过。
 */

import type { ProgressState, UnderstandingState } from '../progress/progress.ts';
import { diffLines, type DiffLine } from './diff.ts';
import type { NoteItem } from './items.ts';
import type { PathCanvas } from './learning-paths.ts';

/** 指向“某一样可编辑的东西”。 */
export type ResourceRef =
  | { kind: 'course-status'; course: string }
  | { kind: 'module-understanding'; module: string }
  | { kind: 'note-item'; id: string }
  | { kind: 'learning-path'; id: string };

export type ResourceDescription = {
  kind: ResourceRef['kind'];
  title: string;
  description: string;
  /** 读者在界面上的哪里改它。 */
  editedIn: string;
  /** 终端里对应的命令；没有就写 null。 */
  terminal: string | null;
  /** 将来的 AI 能做什么。“读写”也必须经过 applyProposal 由读者确认。 */
  ai: 'read-write' | 'read';
};

/**
 * 全站“读者能改的东西”的清单。新增任何可编辑的功能，都要先在这里登记一行——
 * 没登记的东西，终端和 AI 就当它不存在。
 */
export const EDITABLE_RESOURCES: readonly ResourceDescription[] = [
  {
    kind: 'course-status',
    title: '课程学习状态',
    description: '一门课标成想学 / 在学 / 学完，或者不标。',
    editedIn: '课程页标题下方“我的状态”；侧边栏课程名后的小圆点只读显示',
    terminal: 'mark <课程> todo|learning|done|clear；status',
    ai: 'read-write',
  },
  {
    kind: 'module-understanding',
    title: '源码理解度',
    description: '一段项目源码标成未读 / 读过 / 读懂了。',
    editedIn: '源码讲解页标题下方“我的理解度”',
    terminal: 'mark <模块路径> unread|read|understood|clear；status',
    ai: 'read-write',
  },
  {
    kind: 'note-item',
    title: '心得条目',
    description: '心得空间里的文档（自己写的或导入的 .md、代码文件）和导图。',
    editedIn: '个人心得区：新建、编辑、导入、重命名、删除；导图里加方块、连箭头',
    terminal: null,
    ai: 'read-write',
  },
  {
    kind: 'learning-path',
    title: '学习路径',
    description: '课程方块和箭头组成的路线图，可以有多条。',
    editedIn: '学习路径区：新建、重命名、删除、拖入课程、连线、整理布局、复制作者示例',
    terminal: null,
    ai: 'read-write',
  },
];

/**
 * 读写这些东西的统一接口。全部是异步的：心得和文件存在 IndexedDB 里，它只提供异步读写；
 * 学习状态虽然在 localStorage 里、本可以同步读，也包成异步，让调用方不必记“哪样是同步的”。
 */
export interface Workspace {
  listItems(space?: string): Promise<NoteItem[]>;
  readItem(id: string): Promise<NoteItem | null>;
  writeItem(item: NoteItem): Promise<void>;
  deleteItem(id: string): Promise<void>;

  listPaths(): Promise<PathCanvas[]>;
  readPath(id: string): Promise<PathCanvas | null>;
  writePath(path: PathCanvas): Promise<void>;
  deletePath(id: string): Promise<void>;

  readStatus(course: string): Promise<ProgressState | null>;
  writeStatus(course: string, state: ProgressState | null): Promise<void>;
  readUnderstanding(module: string): Promise<UnderstandingState | null>;
  writeUnderstanding(module: string, state: UnderstandingState | null): Promise<void>;
}

/** 一份“我想这样改”的提议。目前只支持心得文档的文字——这是 AI 最常要改、也最需要逐行确认的东西。 */
export type EditProposal = {
  ref: { kind: 'note-item'; id: string };
  /** 提议者用一句话说明想做什么，比如“把要点整理成提纲”。 */
  summary: string;
  before: string;
  after: string;
};

/** 给读者看的逐行对比。 */
export function previewProposal(proposal: EditProposal): DiffLine[] {
  return diffLines(proposal.before, proposal.after);
}

export type ApplyResult = { ok: true } | { ok: false; reason: string };

/**
 * 执行一份提议。approved 必须是读者亲手点出来的 true——这个参数存在的意义，
 * 就是让“忘了问读者”在代码里显眼到没法忽略。
 */
export async function applyProposal(workspace: Workspace, proposal: EditProposal, approved: boolean, now: string): Promise<ApplyResult> {
  if (!approved) return { ok: false, reason: '读者没有同意这次修改。' };
  const item = await workspace.readItem(proposal.ref.id);
  if (item === null) return { ok: false, reason: '要改的心得已经不存在了。' };
  if (item.kind !== 'text') return { ok: false, reason: '只能修改文字类的心得。' };
  if (item.text !== proposal.before) return { ok: false, reason: '在提议生成之后，这份心得又被改过了。为了不覆盖你的修改，这次提议作废。' };
  await workspace.writeItem({ ...item, text: proposal.after, updatedAt: now });
  return { ok: true };
}

/** 测试和将来别的环境用的内存实现：什么都不持久化，但行为和浏览器里的实现一致。 */
export function createMemoryWorkspace(): Workspace {
  const items = new Map<string, NoteItem>();
  const paths = new Map<string, PathCanvas>();
  const status = new Map<string, ProgressState>();
  const understanding = new Map<string, UnderstandingState>();
  return {
    async listItems(space) { return [...items.values()].filter((i) => space === undefined || i.space === space).sort((a, b) => a.name.localeCompare(b.name)); },
    async readItem(id) { return items.get(id) ?? null; },
    async writeItem(item) { items.set(item.id, item); },
    async deleteItem(id) { items.delete(id); },
    async listPaths() { return [...paths.values()].sort((a, b) => a.name.localeCompare(b.name)); },
    async readPath(id) { return paths.get(id) ?? null; },
    async writePath(path) { paths.set(path.id, path); },
    async deletePath(id) { paths.delete(id); },
    async readStatus(course) { return status.get(course) ?? null; },
    async writeStatus(course, state) { if (state === null) status.delete(course); else status.set(course, state); },
    async readUnderstanding(module) { return understanding.get(module) ?? null; },
    async writeUnderstanding(module, state) { if (state === null) understanding.delete(module); else understanding.set(module, state); },
  };
}
