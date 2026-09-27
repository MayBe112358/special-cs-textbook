/**
 * @module        AI 想改你的东西时交上来的“改动单”——改什么、改前什么样、改后什么样，以及怎么核对后写入
 * @problem       core/workspace/workspace.ts 的 EditProposal 只管“心得文档的文字”。真接上 AI 之后，
 *                它还要能新建文档、画导图、改导图、标学习状态、新建学习路径。每一种都得能给读者看清楚“要变成什么样”，
 *                而且写入那一刻要确认“改前”还是那个样子——否则 AI 想了十秒，这十秒里你手改的内容就被它盖掉了。
 * @design        Change 是一张改动单，按种类区分；每张单都带着“改前”的快照（新建的就没有改前）。
 *                describeChange 把它变成给人看的样子：文字给逐行对比，导图给“加了哪些方块、删了哪些、连了几条线”。
 *                applyChange 执行一张单：approved 必须是 true；写入前重新读一遍，改前对不上就作废，不写。
 *                新建的东西如果和已有的重名，就像手动新建一样在名字后面加数字。
 *                这里不引用 React、不碰浏览器，通过统一编辑接口 Workspace 读写——网页、终端、将来别的入口都走它。
 * @courses       UC Berkeley CS186 / CMU 15-445（乐观并发控制）；UC Berkeley CS61A（数据抽象）；
 *                UC Berkeley CS161（最小权限）
 * @exercises     https://cs186berkeley.net/ —— 并发控制相关的作业
 * @prereq        知道“乐观并发控制”：不锁数据，但在写入那一刻检查它有没有被别人动过。
 * @unclear       删除没有做成改动单：AI 目前不能删你的任何东西。要删请自己动手——这是故意留的一道门槛。
 *
 * @letter
 * AI 想改你的东西，交上来的不是“改好的结果”，而是一张改动单：改什么，改之前是什么样，改完是什么样。
 *
 * 为啥每张单子都得带着“改之前”？想象一下：你让 AI“把 CS61A 的笔记整理成提纲”。它读了你的笔记，想了十来秒，交回一个新版本。
 * 可就在它想的那十秒里，你在另一个标签页又补了一行。
 * 要是直接拿它的版本一盖，你补的那行就没了，而且你根本不会发现。
 * 单子上带着“改之前”，写入的那一刻就能对一下：现在的内容跟 AI 当时读到的不一样了。这时候宁可把这张单子作废，也不能抹掉你写的字。
 *
 * 数据库课管这个叫乐观并发控制。说它“乐观”，是因为它赌大多数时候没人跟你抢；但它从来不拿你的数据去赌，赌输了就作废重来。
 *
 * 单子交上来以后，还得变成你能看懂的样子，这是 describeChange 的活。
 * 文字就给逐行对比，红的删、绿的加；导图就说“加了哪几个方块、删了哪几个、连了几条线”。
 * 你要判断同不同意，就得先看得懂它要干啥。
 *
 * 最后，这里故意没有“删除”这种单子。AI 现在删不了你任何东西，想删得你自己动手。
 * 改错了还能改回来，删错了可就真没了。这道门槛是故意留的。
 */

import type { ProgressState } from '../progress/progress.ts';
import { validState } from '../progress/progress.ts';
import type { Canvas } from '../workspace/canvas.ts';
import { validateCanvas } from '../workspace/canvas.ts';
import { diffLines, type DiffLine } from '../workspace/diff.ts';
import { uniqueName, validateItem, type NoteItem } from '../workspace/items.ts';
import { validatePathCanvas, type PathCanvas } from '../workspace/learning-paths.ts';
import type { ApplyResult, Workspace } from '../workspace/workspace.ts';

export type Change =
  | { kind: 'create-item'; item: NoteItem }
  | { kind: 'edit-text'; itemId: string; name: string; before: string; after: string }
  | { kind: 'replace-canvas'; itemId: string; name: string; before: Canvas; after: Canvas }
  | { kind: 'set-status'; course: string; title: string; before: ProgressState | null; after: ProgressState | null }
  | { kind: 'create-path'; path: PathCanvas };

/** AI 交上来的一张改动单：一句话说明 + 具体改动。 */
export type ChangeRequest = { summary: string; change: Change };

export type ChangePreview = {
  /** 一句话标题，比如“新建文档「提纲.md」”。 */
  title: string;
  /** 文字类改动的逐行对比。 */
  diff?: DiffLine[];
  /** 其他改动的要点。 */
  bullets?: string[];
};

const STATE_NAMES: Record<ProgressState, string> = { todo: '想学', learning: '在学', done: '学完' };

function nodeLabel(node: Canvas['nodes'][number]): string {
  return node.text ?? (node.course ? `课程 ${node.course}` : node.id);
}

/** 两张导图差在哪：加了哪些方块、删了哪些、改了哪些字、箭头多了几条少了几条。 */
export function canvasDelta(before: Canvas, after: Canvas): string[] {
  const old = new Map(before.nodes.map((n) => [n.id, n]));
  const now = new Map(after.nodes.map((n) => [n.id, n]));
  const added = after.nodes.filter((n) => !old.has(n.id)).map(nodeLabel);
  const removed = before.nodes.filter((n) => !now.has(n.id)).map(nodeLabel);
  const renamed = after.nodes.filter((n) => old.has(n.id) && old.get(n.id)!.text !== n.text).map((n) => `「${nodeLabel(old.get(n.id)!)}」→「${nodeLabel(n)}」`);
  const edgeKey = (e: Canvas['edges'][number]) => `${e.from}>${e.to}`;
  const oldEdges = new Set(before.edges.map(edgeKey));
  const newEdges = new Set(after.edges.map(edgeKey));
  const edgesAdded = [...newEdges].filter((k) => !oldEdges.has(k)).length;
  const edgesRemoved = [...oldEdges].filter((k) => !newEdges.has(k)).length;
  const out: string[] = [];
  const list = (xs: string[]) => xs.slice(0, 12).map((x) => `「${x}」`).join('、') + (xs.length > 12 ? ` 等 ${xs.length} 个` : '');
  if (added.length) out.push(`加方块：${list(added)}`);
  if (removed.length) out.push(`删方块：${list(removed)}`);
  if (renamed.length) out.push(`改文字：${renamed.slice(0, 8).join('；')}${renamed.length > 8 ? ` 等 ${renamed.length} 处` : ''}`);
  if (edgesAdded || edgesRemoved) out.push(`箭头：新增 ${edgesAdded} 条，去掉 ${edgesRemoved} 条`);
  return out.length ? out : ['没有实际变化'];
}

export function describeChange(change: Change): ChangePreview {
  switch (change.kind) {
    case 'create-item':
      if (change.item.kind === 'text') {
        return { title: `新建文档「${change.item.name}」（放在 ${change.item.space}）`, diff: diffLines('', change.item.text ?? '') };
      }
      return { title: `新建导图「${change.item.name}」（放在 ${change.item.space}）`, bullets: canvasDelta({ nodes: [], edges: [] }, change.item.canvas!) };
    case 'edit-text':
      return { title: `修改文档「${change.name}」`, diff: diffLines(change.before, change.after) };
    case 'replace-canvas':
      return { title: `修改导图「${change.name}」`, bullets: canvasDelta(change.before, change.after) };
    case 'set-status':
      return {
        title: `把「${change.title}」的学习状态${change.after ? `标成「${STATE_NAMES[change.after]}」` : '清掉'}`,
        bullets: [`现在：${change.before ? STATE_NAMES[change.before] : '没标'}`],
      };
    case 'create-path':
      return { title: `新建学习路径「${change.path.name}」`, bullets: [`${change.path.canvas.nodes.length} 门课，${change.path.canvas.edges.length} 条箭头`] };
  }
}

/**
 * 执行一张改动单。approved 必须是读者亲手点出来的 true（或读者自己选了“自动同意”）。
 * 写入前再读一次，“改前”对不上就作废。
 */
export async function applyChange(workspace: Workspace, change: Change, approved: boolean, now: string): Promise<ApplyResult> {
  if (!approved) return { ok: false, reason: '读者没有同意这次修改。' };
  switch (change.kind) {
    case 'create-item': {
      if (await workspace.readItem(change.item.id)) return { ok: false, reason: '编号撞车了，请重试。' };
      const taken = (await workspace.listItems(change.item.space)).map((i) => i.name);
      await workspace.writeItem(validateItem({ ...change.item, name: uniqueName(change.item.name, taken), createdAt: now, updatedAt: now }));
      return { ok: true };
    }
    case 'edit-text': {
      const item = await workspace.readItem(change.itemId);
      if (!item) return { ok: false, reason: '要改的文档已经不存在了。' };
      if (item.kind !== 'text') return { ok: false, reason: '这不是文字文档。' };
      if (item.text !== change.before) return { ok: false, reason: '在 AI 读过之后，这份文档又被改过了。为了不覆盖你的修改，这次改动作废。' };
      await workspace.writeItem({ ...item, text: change.after, updatedAt: now });
      return { ok: true };
    }
    case 'replace-canvas': {
      const item = await workspace.readItem(change.itemId);
      if (!item) return { ok: false, reason: '要改的导图已经不存在了。' };
      if (item.kind !== 'canvas') return { ok: false, reason: '这不是导图。' };
      if (JSON.stringify(item.canvas) !== JSON.stringify(change.before)) return { ok: false, reason: '在 AI 读过之后，这张导图又被改过了。为了不覆盖你的修改，这次改动作废。' };
      await workspace.writeItem({ ...item, canvas: validateCanvas(change.after), updatedAt: now });
      return { ok: true };
    }
    case 'set-status': {
      if (change.after !== null && !validState(change.after)) return { ok: false, reason: '学习状态无效。' };
      if ((await workspace.readStatus(change.course)) !== change.before) return { ok: false, reason: '这门课的学习状态刚刚被改过了，这次改动作废。' };
      await workspace.writeStatus(change.course, change.after);
      return { ok: true };
    }
    case 'create-path': {
      if (await workspace.readPath(change.path.id)) return { ok: false, reason: '编号撞车了，请重试。' };
      await workspace.writePath(validatePathCanvas({ ...change.path, updatedAt: now }));
      return { ok: true };
    }
  }
}
