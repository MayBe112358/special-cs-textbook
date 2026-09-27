/**
 * @module        两条进度线数据格式的测试
 * @problem       这份数据会被存进读者的浏览器、导出成备份文件、再从别处导回来。
 *                中间任何一步都可能塞进坏数据，而"读不懂就当成空白"是最危险的处理方式——
 *                它会把读者攒了几个月的记录一次抹掉。
 * @design        把承诺写成可以反复执行的问题：坏记录要抛错而不是返回默认值；
 *                课程编号里的路径符号要被拦下；统计和排序的结果要稳定。
 * @courses       UC Berkeley CS61A（抽象与测试）；UC Berkeley CS186（数据完整性）
 * @exercises     https://cs61a.org/ —— 官方 lab 里的测试驱动写法
 * @prereq        知道测试是在替读者提前问一遍"如果这里出错会怎样"。
 * @unclear       浏览器真实交互（点按钮、刷新、换标签页）只能靠人工验收，这里只守数据边界。
 *
 * @letter
 * 你可能会嘀咕：这些函数这么简单，也值得写测试？
 *
 * 值得，而且理由跟函数复不复杂没关系。
 * 这份数据的特点是存得久、改得少、丢了很难受。你可能标了两百门课，然后几个月都不去动它。
 * 真出了问题你多半不会马上发现，等发现的时候，已经想不起是哪次改动弄坏的了。
 *
 * 所以这里测的不是“函数能不能跑”，而是几条对你的承诺：
 * 读不懂的数据会喊出来，不会假装它是空的；
 * 编号里带路径符号的（比如 ../x）一律不收，免得一条记录写到别的键上去；
 * 统计和排序每次都给同一个答案。
 * 承诺写成了测试，才不会在某次“顺手改一下”的时候悄悄失效。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  countByState,
  countByUnderstanding,
  progressKey,
  readProgress,
  readUnderstanding,
  sortProgress,
  sortUnderstanding,
  understandingKey,
  understandingPercent,
  validateProgress,
  validateUnderstanding,
  validCourseId,
  validModulePath,
  type CourseProgress,
  type ModuleUnderstanding,
} from "./progress.ts";

const record = (course: string, state: CourseProgress["state"]): CourseProgress => ({
  course,
  state,
  updatedAt: "2026-09-18T00:00:00.000Z",
});

test("没存过是空白，存过且读得懂就还原成记录", () => {
  assert.equal(readProgress(null, "cs61a"), null);
  const raw = JSON.stringify(record("cs61a", "learning"));
  assert.deepEqual(readProgress(raw, "cs61a"), record("cs61a", "learning"));
});

test("读不懂的数据一律抛错，绝不当成空白", () => {
  const broken = [
    "不是 JSON",
    JSON.stringify(null),
    JSON.stringify([record("cs61a", "todo")]),
    JSON.stringify({ ...record("cs61a", "todo"), state: "放弃" }),
    JSON.stringify({ ...record("cs61a", "todo"), updatedAt: "昨天" }),
    JSON.stringify({ ...record("cs61a", "todo"), course: 42 }),
  ];
  for (const raw of broken) assert.throws(() => readProgress(raw, "cs61a"));
});

test("记录里的课程和它存放的位置必须对得上", () => {
  const raw = JSON.stringify(record("cs61a", "done"));
  assert.throws(() => readProgress(raw, "cs61b"));
});

test("课程编号不接受路径符号，免得一条记录写到别的键上", () => {
  for (const bad of ["../notes", "cs61a/../x", "/cs61a", "CS61A", "", "-cs61a", "a".repeat(101)]) {
    assert.equal(validCourseId(bad), false);
    assert.throws(() => progressKey(bad as string));
  }
  assert.equal(validCourseId("mit-6-s081"), true);
  assert.match(progressKey("mit-6-s081"), /mit-6-s081$/);
});

test("坏记录在校验这一关就被挡下", () => {
  assert.throws(() => validateProgress({ course: "cs61a", state: "todo" }));
  assert.deepEqual(validateProgress(record("cs61a", "todo")), record("cs61a", "todo"));
});

test("统计按三种状态分别计数，排序先按学习先后再按编号", () => {
  const records = [record("cs70", "done"), record("cs61a", "todo"), record("cs61b", "done"), record("cs50x", "learning")];
  assert.deepEqual(countByState(records), { todo: 1, learning: 1, done: 2 });
  assert.deepEqual(sortProgress(records).map((r) => r.course), ["cs61a", "cs50x", "cs61b", "cs70"]);
  // 排序不能改动传进来的那个数组——调用方的数据不归它管。
  assert.equal(records[0]?.course, "cs70");
});

/* ---------------- 第二条进度线：理解度 ---------------- */

const understood = (module: string, state: ModuleUnderstanding["state"]): ModuleUnderstanding => ({
  module,
  state,
  updatedAt: "2026-09-18T00:00:00.000Z",
});

test("理解度：读得懂就还原，读不懂一律抛错", () => {
  const path = "/internals/core/terminal/commands/mark";
  assert.equal(readUnderstanding(null, path), null);
  assert.deepEqual(readUnderstanding(JSON.stringify(understood(path, "read")), path), understood(path, "read"));
  for (const raw of [
    "不是 JSON",
    JSON.stringify({ ...understood(path, "read"), state: "看过了" }),
    JSON.stringify({ ...understood(path, "read"), module: "mark" }),
  ]) {
    assert.throws(() => readUnderstanding(raw, path));
  }
});

test("理解度按位置存，不按名字——源码里真有两个同名的 layout", () => {
  const a = "/internals/app/layout";
  const b = "/internals/core/layout";
  assert.notEqual(understandingKey(a), understandingKey(b));
  assert.throws(() => readUnderstanding(JSON.stringify(understood(a, "read")), b));
});

test("模块位置不接受路径符号与非法写法", () => {
  for (const bad of ["internals/core", "/internals/../etc", "/Internals/Core", "/", "", "/a//b"]) {
    assert.equal(validModulePath(bad), false);
    assert.throws(() => understandingKey(bad as string));
  }
  assert.equal(validModulePath("/internals/core/terminal/commands/mark"), true);
});

test("坏记录在校验这一关就被挡下", () => {
  assert.throws(() => validateUnderstanding({ module: "/internals/x", state: "read" }));
  assert.deepEqual(validateUnderstanding(understood("/internals/x", "read")), understood("/internals/x", "read"));
});

test("整体理解度：分母是全部模块，而且只有读懂了才算数", () => {
  const records = [understood("/internals/a", "understood"), understood("/internals/b", "read"), understood("/internals/c", "unread")];
  assert.deepEqual(countByUnderstanding(records), { unread: 1, read: 1, understood: 1 });
  // 标了 3 段、读懂 1 段，而教材一共 47 段 —— 分母是 47，不是 3。
  assert.equal(understandingPercent(records, ['/internals/a', ...Array.from({length:46}, (_,i) => '/internals/other'+i)]), 2);
  assert.equal(understandingPercent(records, ['/internals/a','/internals/b','/internals/c','/internals/d']), 25);
  // 一段都没有时不能变成 NaN。
  assert.equal(understandingPercent([], []), 0);
  assert.equal(understandingPercent([], ['/internals/a']), 0);
});

test("理解度排序先按读的深浅再按位置，且不改动传进来的数组", () => {
  const records = [understood("/internals/b", "understood"), understood("/internals/a", "unread")];
  assert.deepEqual(sortUnderstanding(records).map((r) => r.module), ["/internals/a", "/internals/b"]);
  assert.equal(records[0]?.module, "/internals/b");
});

test("两条线互不相干：同名的键不会互相覆盖", () => {
  // 课程按编号存、代码按位置存，前缀也不同，所以不存在"标了课程顺手把代码盖掉"的可能。
  assert.notEqual(progressKey("mark"), understandingKey("/internals/core/terminal/commands/mark"));
  assert.doesNotMatch(progressKey("mark"), /understanding/);
  assert.doesNotMatch(understandingKey("/internals/x"), /progress/);
});

test("删除模块和重复记录不抬高理解度，原数据仍保留", () => {
  const records = [understood('/internals/a', 'understood'), understood('/internals/deleted', 'understood'), understood('/internals/a', 'understood')];
  assert.equal(understandingPercent(records, ['/internals/a', '/internals/b']), 50);
  assert.equal(records.length, 3);
});
