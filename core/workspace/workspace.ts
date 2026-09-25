/**
 * @module        统一编辑接口——读者能在界面上改的每一样东西，都从这一扇门进出
 * @problem       学习状态存在一处、心得存在另一处、学习路径又是一处，各自有各自的读写函数。
 *                网页按钮、终端命令、将来的 AI 助手都要读写它们；如果每个使用者各自去碰存储，
 *                规矩（格式检查、谁能改什么、改之前要不要确认）就会写三遍、漏两遍。
 * @design        这里只定义“有哪些东西、能对它们做什么”，不管它们具体存在哪：
 *                - EDITABLE_RESOURCES：全站可编辑内容的清单（阶段 14.5.1 要求的“盘点”），写清在界面哪里改、终端里怎么改、AI 能不能碰。
 *                - Workspace：一组异步的“列出 / 读 / 写 / 删”。浏览器里由 IndexedDB + localStorage 实现（components/workspace），
 *                  测试里用内存实现；将来如果有云同步，只需要再写一个实现。
 *                - EditProposal + applyProposal：别人（主要是将来的 AI）想改你的东西时，先交一份“改前 / 改后”，
 *                  你点了同意才写入；写入前再核对一次“改前”还是不是现在的样子，免得覆盖掉你刚刚手改的内容。
 *                这里不引用 React，也不碰浏览器——和命令引擎守的是同一条边界（AGENTS.md 7.1）。
 * @courses       UC Berkeley CS61A（抽象屏障）；MIT 6.031（接口与实现分离、规格说明）；
 *                UC Berkeley CS186 / CMU 15-445（乐观并发控制：写之前检查读到的版本有没有变）
 * @exercises     https://web.mit.edu/6.031/www/ —— 抽象数据类型与接口相关的阅读和练习
 * @prereq        知道“接口”是一份约定：说好有哪些函数、各自做什么，而不管里面怎么实现。
 * @unclear       权限目前只有“AI 能读写 / 只能读”两档，还没有“这一门课的心得不许 AI 看”这种细的设置。
 *                等真正接上 AI、有人提出需要时再加。
 *
 * @letter
 * 这个文件没有一行真正“干活”的代码，它全是约定。但它可能是这一阶段最重要的文件。
 *
 * 想象一下将来的场景：你在右边的聊天窗口里说“帮我把 CS61A 的心得整理成提纲”。
 * AI 需要知道：心得在哪？能读吗？能改吗？改完怎么让你确认？
 * 如果这些问题的答案散落在十几个组件里，AI 就只能靠猜——而猜错的代价是你的笔记。
 * 有了这个文件，答案都在这里：EDITABLE_RESOURCES 告诉它有哪些东西，Workspace 告诉它怎么读写，
 * applyProposal 保证它改之前必须经过你。
 *
 * 这和 CS61A 讲的“抽象屏障”是一回事，只是屏障这一边站着的不止是别的程序员，还有一个 AI。
 * 屏障越清楚，站在另一边的人（或者机器）越不需要知道里面的细节，也越不可能弄坏它。
 *
 * applyProposal 里那句“再核对一次改前是不是现在的样子”，数据库课里叫乐观并发控制：
 * 不锁住数据，但在写入那一刻检查它有没有被别人动过。AI 生成回复要好几秒，这几秒里你完全可能又改了一行——
 * 这时候宁可让它的提议作废，也不能把你刚写的那行抹掉。
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
