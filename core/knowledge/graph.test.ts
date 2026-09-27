/**
 * @module        图分层与课程关系的测试——拿几张小图，检查“整理布局”排出来的先后对不对
 * @problem       排布错了，学习路径上的箭头会往回指，读者会以为后续课排在了先修前面；
 *                图里有环时写得不小心，程序会一直转圈，页面直接卡死。这两种错在界面上都不好一眼看出来。
 * @design        每个测试一张手画的小图：分叉又汇合的菱形、CS61A→CS61B→CS61C 那种“有一条捷径”的图、两个节点互指的环、空图。
 *                只检查“谁在谁左边”“是不是同一列”“环有没有被报出来”，不检查具体的像素坐标——
 *                坐标哪天调整了间距，测试不该跟着红。
 * @courses       UC Berkeley CS61B（图、拓扑排序）；UC Berkeley CS170 / MIT 6.006（DAG 上的最长路径）；
 *                MIT 6.042J（有向图与偏序）
 * @exercises     https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/ —— 6.006 的图算法习题
 *                https://sp21.datastructur.es/materials/lab/lab3/lab3 —— CS61B Lab 3：怎么写测试来抓错
 * @prereq        读过 core/knowledge/graph 那一章。
 * @unclear       只测了排布的相对位置，没测“交叉多不多”，因为现在的排法本来就不管交叉。
 *                buildCourseGraph 现在只有这里在调用（见 graph 那章的 @unclear）。
 *
 * @letter
 * 这个文件里的测试都很短，每个就是一张小图加几句“我觉得应该这样”。挑两个聊聊。
 *
 * 第二个测试叫“后继站在所有前置的右边”，用的就是 graph 那章里 CS61A、CS61B、CS61C 的例子：
 * a 指向 b，b 指向 c，a 还直接指向 c。
 * 要是有人把分层写成了“离起点最近多远”，c 会被排到第 1 列，跟 b 挤在一起。这个测试就是专门等着抓这种错的。
 * 我写 graph 那封信的时候拿这个例子讲了半天，光讲不够，得有个测试盯着，不然哪天改坏了，信还在那儿说得头头是道。
 *
 * 环那个测试更有意思：它能跑完，本身就是在测东西。
 * 要是 layoutGraph 用递归去找前置，碰到 a→b→a 就会一直绕下去，这个测试根本结束不了，npm test 会卡在那儿。
 * 它能正常结束，还把两个节点都报成了 cyclic，说明程序既没卡死，也没把环上的课偷偷扔掉。
 *
 * 顺带一提，第一个测试里那门先修写成 null 的课 c，是在检查另一件小事：“没记录先修”和“记录了没有先修”不是一回事。
 * 前者是不知道，后者是知道答案是“没有”。程序得分得清，不然就会把“我们还没查”说成“不需要先学什么”。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutGraph, buildCourseGraph } from './graph.ts';
import type { CourseEntry } from './knowledge-index.ts';

const course = (id: string, prereq: string[] | null): CourseEntry => ({
  id,
  title: id,
  description: '',
  path: '/' + id,
  url: '/docs/' + id,
  categoryPath: '/',
  file: id + '.mdx',
  prereq: prereq === null ? null : { courses: prereq, knowledge: [] },
});

test('关系从内容自动生成，未知先修不冒充无先修', () => {
  // b 把 a 写了两遍，只该算一条箭头；c 的先修是 null（没记录），要单独报出来。
  const g = buildCourseGraph([course('a', []), course('b', ['a', 'a']), course('c', null)]);
  assert.deepEqual(g.edges, [{ from: 'a', to: 'b' }]);
  assert.deepEqual(g.unrecorded, ['c']);
  assert.equal(g.nodes.length, 3);
});

test('分叉和汇合按先修分层，每个位置不同', () => {
  // 菱形：a 分出 b、c，又在 d 汇合。
  const layout = layoutGraph(['a', 'b', 'c', 'd'], [
    { from: 'a', to: 'b' },
    { from: 'a', to: 'c' },
    { from: 'b', to: 'd' },
    { from: 'c', to: 'd' },
  ]);
  assert.ok(layout.positions.a!.x < layout.positions.b!.x);
  assert.ok(layout.positions.b!.x < layout.positions.d!.x);
  assert.notEqual(layout.positions.b!.y, layout.positions.c!.y);
  assert.deepEqual(layout.cyclic, []);
});

test('后继站在所有前置的右边，而不只是最近那个前置的右边', () => {
  // CS61A → CS61B → CS61C，另外 CS61A 也直接指向 CS61C。CS61C 得排在 CS61B 右边一列。
  const layout = layoutGraph(['cs61a', 'cs61b', 'cs61c'], [
    { from: 'cs61a', to: 'cs61b' },
    { from: 'cs61b', to: 'cs61c' },
    { from: 'cs61a', to: 'cs61c' },
  ]);
  assert.ok(layout.positions.cs61a!.x < layout.positions.cs61b!.x);
  assert.ok(layout.positions.cs61b!.x < layout.positions.cs61c!.x);
});

test('循环被报告且不会递归卡死，空图合法', () => {
  assert.equal(layoutGraph(['a', 'b'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]).cyclic.length, 2);
  assert.deepEqual(layoutGraph([], []).positions, {});
});
