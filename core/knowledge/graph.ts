/**
 * @module        有向图的分层排布——给一堆方块和箭头算出位置，让箭头都从左指向右
 * @problem       学习路径是一张你自己画的图：方块是课程，箭头表示“先学这个再学那个”。
 *                方块拖来拖去画久了会乱成一团，你需要一个“整理布局”按钮，按一下就排整齐：
 *                没有前置的课站在最左边，每门课都站在它所有前置课的右边。
 *                “谁在谁右边”要从箭头里算出来，这就是这个文件做的事。
 * @design        layoutGraph 只认编号和箭头，不关心方块代表课程还是别的东西。算法是拓扑排序的一种写法（Kahn 算法）：
 *                先数出每个节点有几条箭头指向它（入度），入度为 0 的先放进队列；
 *                每从队列里取出一个节点，就把它指向的节点的入度减一，减到 0 的再放进队列。
 *                取出的同时算层数：一个节点的层数 = 它所有前置里最大的层数 + 1，所以它一定排在所有前置的右边。
 *                层数决定横坐标，同一层里按编号的字母顺序从上往下排，决定纵坐标。
 *                如果图里有环（A 指向 B，B 又指回 A），环上的节点入度永远减不到 0，队列处理完它们还剩着，
 *                这些节点单独报告出来，放在第 0 层，不会让程序卡死。
 *                buildCourseGraph 是另一半：把课程页上的 prereqCourses 变成一条条箭头。
 * @courses       UC Berkeley CS61B（图的表示、拓扑排序）；UC Berkeley CS170 / MIT 6.006（DAG、拓扑排序、最长路径）；
 *                MIT 6.042J（有向图与偏序关系）；Princeton Algorithms（有向图一章）
 * @exercises     https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-spring-2015/ —— 6.042J 讲有向图与偏序的那几讲，配套习题在课程页里
 *                https://sp21.datastructur.es/materials/proj/proj2/proj2 —— CS61B Gitlet 的提交历史就是一张 DAG
 *                https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/ —— 6.006 的图算法习题
 * @prereq        知道图是“点加箭头”；知道队列是“先进先出”；最好在 CS61B 或 6.006 里见过拓扑排序。
 * @unclear       同一层里只按编号字母顺序排，完全没考虑箭头交叉。课一多，箭头会互相穿过去，看着乱。
 *                专门的分层画法（Sugiyama 框架）会在层内反复调整顺序来减少交叉，这里没做。
 *                环上的节点被一股脑放在第 0 层，只是“不崩溃”，谈不上排得好看。
 *                buildCourseGraph 原本服务于知识图谱页，那个页面在阶段 14.5 删掉之后，它现在只有测试在调用；
 *                留着它，是因为“从先修关系自动生成一张起始路径图”这件事以后可能会做，但目前还没人提。
 *                另外，全站 130 门课里只有 24 门在课程页上写了明确的先修课程编号，其余要么没有先修，要么只写成了文字。
 *
 * @letter
 * 这章聊的东西，你多半在算法课上见过：拓扑排序。它在这儿有个特别实在的用处，就是学习路径里那个“整理布局”按钮。
 *
 * 先别看代码，想想你自己会怎么排课。
 * 你知道 CS61B 得先学 CS61A，CS61C 得先学 CS61A 和 CS61B。现在让你把这几门从左往右排好，你会怎么排？
 * 大概是先把“啥都不用先学”的挑出来放最左边，划掉；再看剩下的里面哪些现在也不用等了，放第二列；就这么一轮一轮来，直到排完。
 * 恭喜，你刚才就是手动跑了一遍 Kahn 算法。
 * 代码里的 incoming 记的是每门课“还在等几门前置”，queue 就是“已经不用等了”的那一拨。
 *
 * 这里有个地方挺容易想岔的。一门课排第几列，不看它离起点最近多远，要看最远多远。
 * CS61C 既要 CS61A（第 0 列），又要 CS61B（第 1 列），那它只能站第 2 列。
 * 要是站第 1 列，就跟 CS61B 挤一块了，箭头得竖着连，看着就别扭。
 * 所以代码里写的是 Math.max(已有的层数, 前置的层数 + 1)，每碰到一门前置，都可能把它往右再推一格。
 * 这个叫最长路径分层，6.006 讲 DAG 上的最长路径，用的就是同一个思路。
 *
 * 再说说环。学习路径是你自己画的，一不小心画出个 A → B → A 太正常了。
 * 真正的先修关系里不该有环（有环的话谁都没法开始学），可画布不会拦着你。
 * 环上的课，等待数永远减不到 0，所以永远进不了队列。
 * 队列跑完以后还剩下的，就是环上的课，或者被环挡住的课，全收进 cyclic 里。
 * 我没用递归去“一路往回找前置”，因为递归碰到环会一直转圈，转到栈溢出，页面直接卡死。
 * 用队列就没这个问题，环顶多让几个节点剩下来，程序照样能跑完。
 *
 * 最后得坦白一句：这个排法说实话不太好看。同一列里谁上谁下，我就是按名字字母顺序排的，压根没管箭头会不会交叉。
 * 课一多，箭头就开始互相穿来穿去。
 * 怎么排才能让交叉最少，是图可视化里一个专门的问题，而且还是 NP 困难的（这词啥意思，CS170 会告诉你），实际的工具都是拿近似办法凑的。
 * 你要是学到这儿了，欢迎回来把这章改漂亮点。
 */
import type { CourseEntry } from './knowledge-index.ts';

export type GraphEdge = { from: string; to: string };
export type GraphPosition = { x: number; y: number };

export function layoutGraph(ids: readonly string[], edges: readonly GraphEdge[]) {
  // incoming：每个节点还有几条箭头指着它（还在等几个前置）。outgoing：每个节点指向谁。
  const incoming = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  for (const edge of edges) {
    // 指向不存在的节点的箭头直接忽略，不让一条坏数据弄垮整个排布。
    if (!incoming.has(edge.from) || !incoming.has(edge.to)) continue;
    incoming.set(edge.to, incoming.get(edge.to)! + 1);
    outgoing.get(edge.from)!.push(edge.to);
  }

  // 一开始就不用等的节点先入队。排个序，同样的图每次排出来都一样。
  const queue = ids.filter((id) => incoming.get(id) === 0).sort();
  const layers = new Map(ids.map((id) => [id, 0]));
  const processed = new Set<string>();
  // 用下标遍历而不是 shift()：队列只往后加，不用真的把前面的删掉。
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    processed.add(id);
    for (const to of outgoing.get(id)!) {
      // 取最大值：后继要站在它所有前置的右边，而不只是某一个前置的右边。
      layers.set(to, Math.max(layers.get(to)!, layers.get(id)! + 1));
      incoming.set(to, incoming.get(to)! - 1);
      if (incoming.get(to) === 0) queue.push(to);
    }
  }

  // 队列走完还没处理到的，要么在环上，要么被环挡住了。
  const cyclic = ids.filter((id) => !processed.has(id));

  // 算坐标：层数决定横坐标，同一层里按编号字母顺序往下排。
  const counts = new Map<number, number>();
  const positions: Record<string, GraphPosition> = {};
  for (const id of [...ids].sort()) {
    const layer = processed.has(id) ? layers.get(id)! : 0; // 环上的节点统一放第 0 层
    const row = counts.get(layer) ?? 0;
    counts.set(layer, row + 1);
    positions[id] = { x: 40 + layer * 310, y: 40 + row * 85 };
  }

  const values = Object.values(positions);
  return {
    positions,
    cyclic,
    width: Math.max(1000, ...values.map((p) => p.x + 280)),
    height: Math.max(600, ...values.map((p) => p.y + 90)),
  };
}

// 把课程页上写的先修课程编号变成箭头：从先修指向后续。
export function buildCourseGraph(courses: readonly CourseEntry[]) {
  const ids = new Set(courses.map((c) => c.id));
  const edges: GraphEdge[] = [];
  const missing: string[] = [];
  for (const course of courses) {
    // Set 去重：同一个先修写了两遍也只算一条箭头。
    for (const from of new Set(course.prereq?.courses ?? [])) {
      if (ids.has(from)) edges.push({ from, to: course.id });
      else missing.push(`${from} → ${course.id}`); // 先修写了一门本站没收录的课
    }
  }
  return {
    nodes: courses.map((c) => ({ id: c.id, title: c.title, url: c.url })),
    edges,
    missing,
    // prereq 为 null 表示“没记录”，和“记录了没有先修”（空数组）不是一回事。
    unrecorded: courses.filter((c) => c.prereq === null).map((c) => c.id),
  };
}
