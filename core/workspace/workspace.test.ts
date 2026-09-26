/**
 * @module        统一编辑接口的测试——画布规则、心得条目、导图版学习路径、逐行对比、改动确认
 * @problem       这一层以后会被网页、终端和 AI 同时调用；规则一旦在这里松动，三处一起出错。
 * @design        全部在内存里跑，不碰浏览器。重点钉住几条“不能被悄悄改掉”的规矩：
 *                操作不修改传入的画布；删方块连带删箭头；旧心得和旧路径搬家时一个字不丢；
 *                没有读者同意、或者内容已经被改过时，提议一律不写入。
 * @courses       UC Berkeley CS61A（测试驱动）；MIT 6.031（按规格写测试）
 * @exercises     https://cs61a.org/ —— 官方 lab 里的测试练习
 * @prereq        知道 assert 失败就说明代码和约定不一致。
 * @unclear       IndexedDB 那一层的读写由浏览器验收覆盖，这里没有模拟。
 * @letter
 * 这些测试里最值得看的是“提议作废”那一条：它模拟了你和 AI 同时改同一份心得。
 * 这种事在真实使用中一年也许只发生几次，但每一次发生，丢的都是你亲手写的字。
 * 越是罕见、越是后果严重的情况，越该写成测试钉住——因为你永远不会在手动点一遍时碰到它。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addNode, connect, moveNode, removeNodes, removeEdges, setNodeText, validateCanvas, EMPTY_CANVAS, canvasBounds } from './canvas.ts';
import { createTextItem, createCanvasItem, migrateLegacyNote, moveItem, uniqueName, languageOf, importable, validateItem } from './items.ts';
import { addCourse, arrange, canvasFromCourseList, coursesIn, migrateLegacyPath, validatePathCanvas } from './learning-paths.ts';
import { diffLines, diffSummary } from './diff.ts';
import { applyProposal, createMemoryWorkspace, EDITABLE_RESOURCES, previewProposal } from './workspace.ts';

const NOW = '2026-09-24T10:00:00.000Z';

test('画布操作返回新画布，不改传入的那一份', () => {
  const one = addNode(EMPTY_CANVAS, { id: 'a', x: 0, y: 0, text: 'A' });
  const two = addNode(one, { id: 'b', x: 300, y: 0, text: 'B' });
  const linked = connect(two, 'a', 'b', 'e1');
  const moved = moveNode(linked, 'a', 10, 20);
  assert.equal(EMPTY_CANVAS.nodes.length, 0);
  assert.equal(two.edges.length, 0);
  assert.deepEqual(linked.nodes.find((n) => n.id === 'a'), { id: 'a', x: 0, y: 0, text: 'A' });
  assert.deepEqual(moved.nodes.find((n) => n.id === 'a'), { id: 'a', x: 10, y: 20, text: 'A' });
  assert.equal(setNodeText(moved, 'b', '新文字').nodes[1]?.text, '新文字');
});

test('连线规则：不连自己、不重复、不连不存在的方块；删方块连带删箭头', () => {
  let c = addNode(addNode(EMPTY_CANVAS, { id: 'a', x: 0, y: 0 }), { id: 'b', x: 1, y: 1 });
  c = connect(c, 'a', 'b', 'e1');
  assert.equal(connect(c, 'a', 'a', 'e2'), c);
  assert.equal(connect(c, 'a', 'b', 'e3'), c);
  assert.equal(connect(c, 'a', 'zzz', 'e4'), c);
  assert.equal(connect(c, 'b', 'a', 'e5').edges.length, 2, '反方向是另一条箭头');
  assert.deepEqual(removeNodes(c, ['b']), { nodes: [{ id: 'a', x: 0, y: 0 }], edges: [] });
  assert.equal(removeEdges(c, ['e1']).edges.length, 0);
  assert.throws(() => addNode(c, { id: 'a', x: 0, y: 0 }), /重复/);
});

test('画布校验拒绝指向不存在方块的箭头和坏位置', () => {
  assert.throws(() => validateCanvas({ nodes: [{ id: 'a', x: 0, y: 0 }], edges: [{ id: 'e', from: 'a', to: 'b' }] }), /不存在/);
  assert.throws(() => validateCanvas({ nodes: [{ id: 'a', x: Number.NaN, y: 0 }], edges: [] }), /位置/);
  assert.deepEqual(canvasBounds(EMPTY_CANVAS), { x: 0, y: 0, width: 1000, height: 600 });
});

test('心得条目：新建、重名、后缀决定渲染方式、只收文字文件', () => {
  const doc = createTextItem({ id: 'd1', space: '/programming-intro/cs61a', name: '未命名.md', now: NOW });
  assert.equal(doc.kind, 'text');
  assert.equal(doc.text, '');
  assert.equal(createCanvasItem({ id: 'c1', space: '/', name: '导图', now: NOW }).canvas?.nodes.length, 0);
  assert.equal(uniqueName('未命名.md', ['未命名.md', '未命名 2.md']), '未命名 3.md');
  assert.equal(uniqueName('Makefile', ['Makefile']), 'Makefile 2');
  assert.equal(languageOf('hw1.PY'), 'python');
  assert.equal(languageOf('notes.md'), 'markdown');
  assert.equal(languageOf('Makefile'), 'makefile');
  assert.equal(languageOf('photo.png'), 'text');
  assert.equal(importable('photo.png'), false);
  assert.equal(importable('readme.txt'), true);
  assert.throws(() => validateItem({ ...doc, name: 'a/b.md' }), /名字/);
  assert.throws(() => validateItem({ ...doc, space: 'not-a-path' }), /位置/);
});

test('旧版心得搬家：一个字不丢，重复搬得到同一个编号', () => {
  const old = { page: '/programming-intro/cs61a', text: '第一行\n第二行', updatedAt: NOW };
  const moved = migrateLegacyNote(old);
  assert.equal(moved.text, old.text);
  assert.equal(moved.space, old.page);
  assert.equal(moved.origin, 'migrated');
  assert.equal(migrateLegacyNote(old).id, moved.id);
  assert.notEqual(migrateLegacyNote({ ...old, page: '/programming-intro/cs61b' }).id, moved.id);
  const longA = migrateLegacyNote({ ...old, page: '/' + 'a'.repeat(60) + '/x' });
  const longB = migrateLegacyNote({ ...old, page: '/' + 'a'.repeat(60) + '/y' });
  assert.notEqual(longA.id, longB.id, '长路径截短后也不能撞编号');
  assert.equal(migrateLegacyNote({ ...old, page: '/' }).space, '/');
});

test('旧版路径换成导图：顺序变成一串箭头，一门课只出现一次', () => {
  const path = migrateLegacyPath({ id: 'p1', name: '我的路线', courses: ['cs50x', 'cs61a', 'cs61b'], updatedAt: NOW });
  assert.deepEqual(coursesIn(path.canvas), ['cs50x', 'cs61a', 'cs61b']);
  assert.deepEqual(path.canvas.edges.map((e) => [e.from, e.to]), [['c-cs50x', 'c-cs61a'], ['c-cs61a', 'c-cs61b']]);
  assert.equal(addCourse(path.canvas, 'cs61a', 0, 0), path.canvas);
  assert.throws(() => validatePathCanvas({ ...path, canvas: { nodes: [...path.canvas.nodes, { id: 'x', x: 0, y: 0, course: 'cs61a' }], edges: [] } }), /两次/);
});

test('整理布局只挪位置：先修在左、后续在右，方块和箭头一个不少', () => {
  const canvas = canvasFromCourseList(['cs61a', 'cs61b']);
  const shuffled = moveNode(moveNode(canvas, 'c-cs61a', 900, 500), 'c-cs61b', 0, 0);
  const arranged = arrange(shuffled);
  const x = (id: string) => arranged.nodes.find((n) => n.id === id)!.x;
  assert.ok(x('c-cs61a') < x('c-cs61b'));
  assert.equal(arranged.edges.length, canvas.edges.length);
  assert.equal(arranged.nodes.length, canvas.nodes.length);
});

test('逐行对比：找出删掉和新加的行', () => {
  const lines = diffLines('a\nb\nc', 'a\nB\nc\nd');
  assert.deepEqual(lines, [
    { type: 'same', text: 'a' },
    { type: 'remove', text: 'b' },
    { type: 'add', text: 'B' },
    { type: 'same', text: 'c' },
    { type: 'add', text: 'd' },
  ]);
  assert.equal(diffSummary(lines), '+2 −1 行');
  assert.equal(diffSummary(diffLines('x', 'x')), '没有变化');
  assert.deepEqual(diffLines('', 'new'), [{ type: 'add', text: 'new' }]);
});

test('改动提议：读者不同意不写；内容被改过就作废；同意且未变才写入', async () => {
  const ws = createMemoryWorkspace();
  const doc = createTextItem({ id: 'd1', space: '/', name: '心得.md', text: '旧内容', now: NOW });
  await ws.writeItem(doc);
  const proposal = { ref: { kind: 'note-item' as const, id: 'd1' }, summary: '改写', before: '旧内容', after: '新内容' };
  assert.equal(previewProposal(proposal).length, 2);

  assert.deepEqual(await applyProposal(ws, proposal, false, NOW), { ok: false, reason: '读者没有同意这次修改。' });
  assert.equal((await ws.readItem('d1'))?.text, '旧内容');

  await ws.writeItem({ ...doc, text: '我刚手改了一行' });
  const stale = await applyProposal(ws, proposal, true, NOW);
  assert.equal(stale.ok, false);
  assert.equal((await ws.readItem('d1'))?.text, '我刚手改了一行');

  await ws.writeItem(doc);
  assert.deepEqual(await applyProposal(ws, proposal, true, NOW), { ok: true });
  assert.equal((await ws.readItem('d1'))?.text, '新内容');
});

test('可编辑内容清单：每一类都登记了界面位置，种类不重复', () => {
  const kinds = EDITABLE_RESOURCES.map((r) => r.kind);
  assert.deepEqual([...new Set(kinds)].sort(), ['course-status', 'learning-path', 'module-understanding', 'note-item']);
  assert.ok(EDITABLE_RESOURCES.every((r) => r.editedIn.length > 0 && r.title.length > 0));
});

test('挪心得：只换空间、编号不变，目标里重名就加数字，挪到原地不动，挪到坏位置报错', () => {
  const doc = createTextItem({ id: 'd1', space: '/programming-intro/cs61a', name: '笔记.md', text: '内容', now: NOW });
  const later = '2026-09-25T10:00:00.000Z';
  const moved = moveItem(doc, '/programming-intro/cs61b', ['笔记.md'], later);
  assert.equal(moved.id, 'd1');
  assert.equal(moved.space, '/programming-intro/cs61b');
  assert.equal(moved.name, '笔记 2.md');
  assert.equal(moved.text, '内容');
  assert.equal(moved.updatedAt, later);
  assert.equal(doc.space, '/programming-intro/cs61a', '不改传入的那一份');
  assert.equal(moveItem(doc, doc.space, [], later), doc);
  assert.throws(() => moveItem(doc, 'no-slash', [], later), /位置/);
});

test('内存实现：按空间列出、删除', async () => {
  const ws = createMemoryWorkspace();
  await ws.writeItem(createTextItem({ id: 'a', space: '/x', name: 'b.md', now: NOW }));
  await ws.writeItem(createTextItem({ id: 'b', space: '/y', name: 'a.md', now: NOW }));
  assert.deepEqual((await ws.listItems('/x')).map((i) => i.id), ['a']);
  assert.equal((await ws.listItems()).length, 2);
  await ws.deleteItem('a');
  assert.equal(await ws.readItem('a'), null);
  await ws.writeStatus('cs61a', 'done');
  assert.equal(await ws.readStatus('cs61a'), 'done');
  await ws.writeStatus('cs61a', null);
  assert.equal(await ws.readStatus('cs61a'), null);
});

test('第 5 版备份：导出再读回，一样不少', async () => {
  const { buildBackup, parseAnyBackup } = await import('./backup.ts');
  const data = {
    progress: [{ course: 'cs61a', state: 'done' as const, updatedAt: NOW }],
    understanding: [{ module: '/internals/core/x', state: 'read' as const, updatedAt: NOW }],
    items: [createTextItem({ id: 'd1', space: '/programming-intro/cs61a', name: '笔记.md', text: '# 标题\n$x^2$', now: NOW })],
    paths: [migrateLegacyPath({ id: 'p1', name: '路线', courses: ['cs61a', 'cs61b'], updatedAt: NOW })],
  };
  const text = buildBackup(data);
  assert.match(text, /笔记\.md/, '中文原样可读');
  assert.deepEqual(parseAnyBackup(text), data);
});

test('第 1～4 版旧备份：旧心得变成文档、旧路径变成导图，编号和打开网站时自动搬家得到的一样', async () => {
  const { parseAnyBackup } = await import('./backup.ts');
  const v4 = JSON.stringify({
    format: 'special-cs-textbook-notes', version: 4,
    notes: [{ page: '/programming-intro/cs61a', text: '旧心得', updatedAt: NOW }],
    progress: [], understanding: [],
    paths: [{ id: 'old', name: '旧路线', courses: ['cs50x', 'cs61a'], updatedAt: NOW }],
  });
  const got = parseAnyBackup(v4);
  assert.equal(got.items[0]?.text, '旧心得');
  assert.equal(got.items[0]?.id, migrateLegacyNote({ page: '/programming-intro/cs61a', text: '旧心得', updatedAt: NOW }).id);
  assert.deepEqual(coursesIn(got.paths[0]!.canvas), ['cs50x', 'cs61a']);
  const v1 = JSON.stringify({ format: 'special-cs-textbook-notes', version: 1, notes: [] });
  assert.deepEqual(parseAnyBackup(v1), { progress: [], understanding: [], items: [], paths: [] });
});

test('第 5 版备份拒绝重复条目和坏数据；导入默认不覆盖本机同编号条目', async () => {
  const { buildBackup, parseAnyBackup, planImport } = await import('./backup.ts');
  const doc = createTextItem({ id: 'd1', space: '/', name: 'a.md', now: NOW });
  assert.throws(() => parseAnyBackup(buildBackup({ progress: [], understanding: [], items: [doc, doc], paths: [] })), /重复/);
  assert.throws(() => parseAnyBackup(JSON.stringify({ format: 'special-cs-textbook-notes', version: 5, progress: [], understanding: [], items: [{ id: 'x' }], paths: [] })), /心得/);
  const other = createTextItem({ id: 'd2', space: '/', name: 'b.md', now: NOW });
  const backup = { progress: [], understanding: [], items: [doc, other], paths: [] };
  const keep = planImport(backup, { itemIds: new Set(['d1']), pathIds: new Set() }, false);
  assert.deepEqual(keep.items.map((i) => i.id), ['d2']);
  assert.equal(keep.conflicts, 1);
  assert.equal(planImport(backup, { itemIds: new Set(['d1']), pathIds: new Set() }, true).items.length, 2);
});
