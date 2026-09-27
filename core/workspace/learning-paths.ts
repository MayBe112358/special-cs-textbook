/**
 * @module        学习路径（导图版）——课程方块加箭头，以及把旧版“排成一列”的路径换过来
 * @problem       真实的学习路线很少是一条直线：学完 CS61A 可以同时开始 CS61B 和 CS61C，
 *                数学课可以和编程课并行。“按顺序排成一列”画不出这种分叉。
 * @design        一条路径 = 名字 + 一张画布（见 canvas.ts）。画布上的方块带课程编号，箭头表示“学完这个再学那个”。
 *                一门课在同一条路径里只出现一次，所以课程方块的编号直接用 “c-课程编号”——
 *                加重复的课时一眼就能发现，也不用另外查表。
 *                旧版的路径（courses 数组）换成一排从左到右的方块，相邻两个之间连一条箭头：
 *                旧版的“顺序”一点不丢，只是换了一种画法。
 *                “整理布局”复用 core/knowledge/graph.ts 的分层排布（拓扑排序）：没有前置的放最左边，越往后的越靠右。
 * @courses       UC Berkeley CS61B（有向无环图、拓扑排序）；CMU 15-445 / UC Berkeley CS186（数据迁移）
 * @exercises     https://sp21.datastructur.es/ —— CS61B 讲图和拓扑排序的那几周，配套 lab 和 homework 从日程表进
 *                https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/ —— 6.006 的图算法习题
 * @prereq        知道“先修关系”可以画成一张有方向的图；知道拓扑排序是按依赖先后排队。
 * @unclear       路径里允许画出环（A→B→A），不拦着：这是读者自己的草稿，不是课程的真实先修。
 *                整理布局时环里的课会被放在最左边一列。
 *                “下一门能学什么”（所有前置都学完了的课）这件事，数据已经够了，但还没有做成功能。
 *
 * @letter
 * 学习路径一开始是个列表：一门接一门排成一行。后来改成了图，这章就聊聊为什么。
 *
 * 列表背后藏着一个假设：学习是一件接一件的事。可你大概早就发现了，实际情况更像一张网。
 * 学完 CS61A，CS61B 和 CS61C 可以同时开始；数学课可以跟编程课并着走；有的课之间压根就没先后。
 * 列表逼着你给它们编一个顺序，而这个顺序是假的。
 * 图就不用编：你只画出你确定的“学完 A 再学 B”，没画箭头的地方，意思就是“随你”。
 *
 * 路径本身的数据很简单：一个名字，加一张画布（方块和箭头的那套，在 canvas.ts）。方块上带着课程编号，箭头表示“学完这个再学那个”。
 * 一门课在同一条路径里只出现一次，所以课程方块的编号直接就叫 c-课程编号。想加一门已经在的课，一查编号就知道重了，不用另外建表。
 *
 * 旧版的列表路径是这么搬过来的：一排从左往右的方块，相邻两个之间连一根箭头。
 * 原来的顺序一点没丢，只是换了个画法。你打开新版时看到的第一张图，就是你以前排的那一串。
 *
 * “整理布局”用的是 core/knowledge/graph.ts 里的分层排法，就是那章讲的拓扑排序：没有前置的站最左边，越往后越靠右。
 * 你画出了环（A→B→A）也不拦着，这是你自己的草稿，不是课程真实的先修关系。整理的时候，环上的课会被放到最左边一列。
 *
 * CS61B 讲图的时候老说一句话：选对了数据结构，问题自己就变简单了。
 * 换成图以后，“我下一门能学什么”就成了一个很自然的问题：所有指向它的箭头，起点我都学完了的那些课。
 * 这个功能现在还没做，但数据已经摆在那儿了，做起来不难。
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
