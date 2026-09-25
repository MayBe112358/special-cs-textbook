/**
 * @module        导图画布的数据与操作——方块、箭头，以及“加一个方块”“连一条线”这些动作本身
 * @problem       心得区的导图和学习路径的导图是同一种东西：一些方块，一些箭头。
 *                如果两边各写一套“拖动、连线、删除”，迟早一边能撤销连线另一边不能，一边允许自己连自己另一边不允许。
 *                将来 AI 帮你整理导图时，也需要一套它能调用、结果可以检查的操作。
 * @design        画布是一份纯数据：nodes（方块，带位置和文字，或者指向一门课）和 edges（从哪个方块指向哪个方块）。
 *                每个操作都是纯函数：收下旧画布，返回新画布，从不修改传进来的那一份。
 *                规则只在这里写一次：不许自己连自己、同一对方块只连一次、删方块时连着它的箭头一起删。
 *                这里不引用 React，也不碰浏览器——画布界面、将来的 AI、测试调用的都是这同一组函数。
 * @courses       UC Berkeley CS61A（不可变数据、数据抽象）；UC Berkeley CS61B（图的表示：邻接表与边集）；
 *                MIT 6.031（不变量与防御性检查）
 * @exercises     https://cs61a.org/ ; https://sp21.datastructur.es/materials/proj/proj2/proj2
 * @prereq        知道“图”由点和边组成；知道一个函数可以不改参数、而是返回一份新的结果。
 * @unclear       还没有撤销 / 重做。因为每次操作都返回新画布，要做撤销只需把旧画布存进一个栈，
 *                这一步留给真正有人需要的时候。
 *
 * @letter
 * 你在 CS61B 里学过图有两种常见存法：邻接表（每个点记着它连向谁）和边集（单独一张“谁连谁”的表）。
 * 这里选了边集。理由很具体：导图最常做的操作是“删掉一个方块”，用边集时只要把所有沾到它的边过滤掉；
 * 用邻接表还得去每个邻居那里把它划掉，多一处就多一个漏删的机会。
 *
 * 另一个选择是“不修改，只返回新的”。画布界面拖动一个方块，每秒要调用几十次 moveNode；
 * 如果它悄悄改了原来那份数据，React 会以为什么都没变、不肯重画。返回新对象，界面就一定知道“变了”。
 * 这和 CS61A 讲的不可变数据是同一件事，只是在这里它有一个很实际的回报：撤销功能几乎是免费的。
 */

import { validCourseId } from '../progress/progress.ts';

export type CanvasNode = {
  id: string;
  x: number;
  y: number;
  /** 自由文字方块的内容。 */
  text?: string;
  /** 指向一门课的方块（学习路径里用）：存课程编号，显示时再去查标题。 */
  course?: string;
};

export type CanvasEdge = { id: string; from: string; to: string };

export type Canvas = { nodes: CanvasNode[]; edges: CanvasEdge[] };

export const EMPTY_CANVAS: Canvas = { nodes: [], edges: [] };

/** 方块的默认大小。界面按这个画，排布算法也按这个留间距。 */
export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 56;

const ID = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_NODES = 2000;
const MAX_TEXT = 2000;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e7;
}

/** 检查一份从存储或备份里读出来的画布；不合格就抛错，说清是哪里不对。 */
export function validateCanvas(value: unknown): Canvas {
  if (!value || typeof value !== 'object') throw new Error('导图格式错误。');
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.nodes) || !Array.isArray(v.edges)) throw new Error('导图缺少方块或箭头列表。');
  if (v.nodes.length > MAX_NODES || v.edges.length > MAX_NODES * 4) throw new Error('导图过大。');
  const nodes = v.nodes.map((raw): CanvasNode => {
    const n = raw as Record<string, unknown>;
    if (typeof n.id !== 'string' || !ID.test(n.id)) throw new Error('导图里有编号无效的方块。');
    if (!finite(n.x) || !finite(n.y)) throw new Error('导图里有位置无效的方块。');
    if (n.text !== undefined && (typeof n.text !== 'string' || n.text.length > MAX_TEXT)) throw new Error('导图方块的文字无效。');
    if (n.course !== undefined && !validCourseId(n.course)) throw new Error('导图方块的课程编号无效。');
    return { id: n.id, x: n.x, y: n.y, ...(n.text !== undefined ? { text: n.text } : {}), ...(n.course !== undefined ? { course: n.course } : {}) };
  });
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) throw new Error('导图里有重复编号的方块。');
  const edges = v.edges.map((raw): CanvasEdge => {
    const e = raw as Record<string, unknown>;
    if (typeof e.id !== 'string' || !ID.test(e.id) || typeof e.from !== 'string' || typeof e.to !== 'string') throw new Error('导图里有无效的箭头。');
    if (!ids.has(e.from) || !ids.has(e.to)) throw new Error('导图里有箭头指向不存在的方块。');
    return { id: e.id, from: e.from, to: e.to };
  });
  return { nodes, edges };
}

/** 生成一个新编号。传入 random 是为了测试时能得到固定结果。 */
export function newId(random: () => number = Math.random): string {
  return Math.floor(random() * 2 ** 48).toString(36).padStart(9, '0') + Date.now().toString(36).slice(-4);
}

export function addNode(canvas: Canvas, node: CanvasNode): Canvas {
  if (canvas.nodes.some((n) => n.id === node.id)) throw new Error('方块编号重复。');
  if (canvas.nodes.length >= MAX_NODES) throw new Error('导图里的方块太多了。');
  return { ...canvas, nodes: [...canvas.nodes, node] };
}

export function moveNode(canvas: Canvas, id: string, x: number, y: number): Canvas {
  return { ...canvas, nodes: canvas.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) };
}

export function setNodeText(canvas: Canvas, id: string, text: string): Canvas {
  return { ...canvas, nodes: canvas.nodes.map((n) => (n.id === id ? { ...n, text: text.slice(0, MAX_TEXT) } : n)) };
}

/** 删方块，连着它的箭头一起删——箭头不能指向一个不存在的方块。 */
export function removeNodes(canvas: Canvas, ids: readonly string[]): Canvas {
  const gone = new Set(ids);
  return {
    nodes: canvas.nodes.filter((n) => !gone.has(n.id)),
    edges: canvas.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to)),
  };
}

/**
 * 连一条箭头。自己连自己、连到不存在的方块、同方向已经连过——这三种情况原样返回，不报错：
 * 在界面上它们都是“松手的位置不对”，不值得弹一句错误。
 */
export function connect(canvas: Canvas, from: string, to: string, id: string): Canvas {
  if (from === to) return canvas;
  const ids = new Set(canvas.nodes.map((n) => n.id));
  if (!ids.has(from) || !ids.has(to)) return canvas;
  if (canvas.edges.some((e) => e.from === from && e.to === to)) return canvas;
  return { ...canvas, edges: [...canvas.edges, { id, from, to }] };
}

export function removeEdges(canvas: Canvas, ids: readonly string[]): Canvas {
  const gone = new Set(ids);
  return { ...canvas, edges: canvas.edges.filter((e) => !gone.has(e.id)) };
}

/** 所有方块占住的范围，用来“查看全部”时把视窗对准它们。空画布给一块默认大小。 */
export function canvasBounds(canvas: Canvas): { x: number; y: number; width: number; height: number } {
  if (canvas.nodes.length === 0) return { x: 0, y: 0, width: 1000, height: 600 };
  const xs = canvas.nodes.map((n) => n.x);
  const ys = canvas.nodes.map((n) => n.y);
  const x = Math.min(...xs) - 40;
  const y = Math.min(...ys) - 40;
  return { x, y, width: Math.max(...xs) + NODE_WIDTH + 40 - x, height: Math.max(...ys) + NODE_HEIGHT + 40 - y };
}
