/**
 * @module        学习路径（导图版）——课程方块加箭头，以及把旧版“排成一列”的路径换过来
 * @problem       真实的学习路线很少是一条直线：学完 CS61A 可以同时开始 CS61B 和 CS61C，
 *                数学课可以和编程课并行。“按顺序排成一列”画不出这种分叉。
 * @design        一条路径 = 名字 + 一张画布（见 canvas.ts）。画布上的方块带课程编号，箭头表示“学完这个再学那个”。
 *                一门课在同一条路径里只出现一次，所以课程方块的编号直接用 “c-课程编号”——
 *                加重复的课时一眼就能发现，也不用另外查表。
 *                旧版的路径（courses 数组）换成一排从左到右的方块，相邻两个之间连一条箭头：
 *                旧版的“顺序”一点不丢，只是换了一种画法。
 *                “整理布局”复用阶段 12 知识图谱的分层排布算法：没有先修的放最左边，越往后的越靠右。
 * @courses       UC Berkeley CS61B（有向无环图、拓扑排序）；CMU 15-445 / UC Berkeley CS186（数据迁移）
 * @exercises     https://sp21.datastructur.es/ —— Graphs、Topological Sort 相关作业
 * @prereq        知道“先修关系”可以画成一张有方向的图；知道拓扑排序是按依赖先后排队。
 * @unclear       路径里允许画出环（A→B→A），不拦着：这是读者自己的草稿，不是课程的真实先修。
 *                整理布局时环里的课会被放在最左边一列，和知识图谱原来的处理一样。
 *
 * @letter
 * 为什么把路径从“列表”换成“图”？
 *
 * 列表隐含了一个假设：学习是一件接一件的事。但你大概已经发现，真实情况更像一张网——
 * 有的课可以并行，有的课之间根本没有先后。列表逼你为它们编一个顺序，而这个顺序是假的。
 * 图不需要你编：你只画出你确定的“学完 A 再学 B”，没有箭头的地方就是“随你”。
 *
 * 这也是 CS61B 讲图时反复强调的一点：选对数据结构，问题本身就会变简单。
 * 换过来以后，“我下一门可以学什么”变成了一个很自然的问题——所有箭头指向我、而我已经学完了的那些课。
 */

import { validCourseId } from '../progress/progress.ts';
import { layoutGraph } from '../knowledge/graph.ts';
import { validateCanvas, addNode, connect, NODE_WIDTH, type Canvas } from './canvas.ts';

export type PathCanvas = { id: string; name: string; canvas: Canvas; updatedAt: string };

const ID = /^[a-zA-Z0-9-]{1,100}$/;

export function validatePathCanvas(value: unknown): PathCanvas {
  if (!value || typeof value !== 'object') throw new Error('学习路径格式错误。');
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !ID.test(v.id)) throw new Error('路径编号无效。');
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 100) throw new Error('路径名称须为 1～100 个字符。');
  if (typeof v.updatedAt !== 'string' || !Number.isFinite(Date.parse(v.updatedAt))) throw new Error('路径时间无效。');
  const canvas = validateCanvas(v.canvas);
  const courses = canvas.nodes.flatMap((n) => (n.course ? [n.course] : []));
  if (new Set(courses).size !== courses.length) throw new Error('同一门课在一条路径里出现了两次。');
  return { id: v.id, name: v.name.trim(), canvas, updatedAt: v.updatedAt };
}

export function courseNodeId(course: string): string {
  return 'c-' + course;
}

/** 往路径里加一门课。已经在里面了就原样返回——一门课在一条路径里只出现一次。 */
export function addCourse(canvas: Canvas, course: string, x: number, y: number): Canvas {
  if (!validCourseId(course)) throw new Error('课程编号无效。');
  if (canvas.nodes.some((n) => n.course === course)) return canvas;
  return addNode(canvas, { id: courseNodeId(course), x, y, course });
}

/** 一串课程排成一行、依次连上箭头。旧版路径和作者的示例路线都走这里。 */
export function canvasFromCourseList(courses: readonly string[]): Canvas {
  let canvas: Canvas = { nodes: [], edges: [] };
  courses.forEach((course, index) => {
    canvas = addCourse(canvas, course, 40 + index * (NODE_WIDTH + 60), 40);
    if (index > 0) canvas = connect(canvas, courseNodeId(courses[index - 1]!), courseNodeId(course), `e-${index}`);
  });
  return canvas;
}

/** 旧版（阶段 9 那种按顺序排列的）路径换成导图版。 */
export function migrateLegacyPath(old: { id: string; name: string; courses: string[]; updatedAt: string }): PathCanvas {
  return validatePathCanvas({ id: old.id, name: old.name, canvas: canvasFromCourseList(old.courses), updatedAt: old.updatedAt });
}

/** 路径里有哪些课，按方块从左到右、从上到下的位置排。给终端和将来的 AI 读的时候用。 */
export function coursesIn(canvas: Canvas): string[] {
  return [...canvas.nodes]
    .filter((n) => n.course)
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((n) => n.course!);
}

/** 整理布局：按箭头分层，没有前置的在最左边。只挪位置，不增删任何方块和箭头。 */
export function arrange(canvas: Canvas): Canvas {
  const { positions } = layoutGraph(canvas.nodes.map((n) => n.id), canvas.edges);
  return { ...canvas, nodes: canvas.nodes.map((n) => ({ ...n, x: positions[n.id]!.x, y: positions[n.id]!.y })) };
}
