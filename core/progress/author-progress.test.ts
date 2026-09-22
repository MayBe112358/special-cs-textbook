/**
 * @module        作者进度内容文件的测试
 * @problem       这份文件是作者手打的，没有界面替他挡住错字。一个写错的状态词如果被安静地忽略，
 *                页面上看到的就是一片空白——和"还没标过"长得一模一样，他永远查不出哪里错了。
 * @design        把"读这份文件时的承诺"写成可以反复执行的问题：形式不对要抛错、
 *                指向不存在的课程要抛错、没标过要如实返回空白、状态词要和访问者那套保持一致。
 * @courses       UC Berkeley CS61A（抽象与测试）；Stanford CS143（把手写文本读成结构化数据）；
 *                UC Berkeley CS186（数据完整性）
 * @exercises     https://cs61a.org/proj/scheme/ —— 官方 project 里的解析与报错
 * @prereq        知道测试是在替将来那个改坏它的人提前问一遍"如果这里出错会怎样"。
 * @unclear       "页面上两栏分得清不清楚"这种事测不出来，只能靠人眼验收。这里只守数据边界。
 *
 * @letter
 * 这些测试里最值得看的是最后一条：作者和访问者共用同一套状态词。
 *
 * 它测的不是某个函数，而是两份数据之间的一个约定。作者说"学完"和你说"学完"必须是同一件事，
 * 否则页面上那两栏并排放着就没法对照——一栏写着"学完"，另一栏写着"完成"，
 * 读者会以为这是两种不同的程度。
 *
 * 这种约定最容易在半年后被打破：有人给访问者那套加了第四个状态，改得干干净净，测试全过，
 * 却没想到作者这份文件还只认三个。所以这里把"两边认识同样的词"也写成一条测试。
 * 测试不只用来抓错误，它也用来钉住那些写在代码里、却谁也不会主动去检查的约定。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PROGRESS_STATES, UNDERSTANDING_STATES } from "./progress.ts";
import {
  authorCourseState,
  authorModuleState,
  checkAuthorTargets,
  parseAuthorProgress,
} from "./author-progress.ts";

const known = {
  courseIds: ["cs61a", "cs50x"],
  modulePaths: ["/internals/core/terminal/command-engine", "/internals/core/progress/progress"],
};

test("合格的内容文件读成两条进度线", () => {
  const progress = parseAuthorProgress({
    courses: { cs61a: "done", cs50x: "learning" },
    modules: { "/internals/core/terminal/command-engine": "understood" },
  });
  assert.deepEqual(progress.courses, { cs61a: "done", cs50x: "learning" });
  assert.deepEqual(progress.modules, { "/internals/core/terminal/command-engine": "understood" });
});

test("空文件是合法的：作者还没公开进度，不是出错", () => {
  const progress = parseAuthorProgress({ courses: {}, modules: {} });
  assert.deepEqual(progress.courses, {});
  assert.deepEqual(progress.modules, {});
});

test("状态词写错当场抛错，错误里说得出是哪一条", () => {
  assert.throws(
    () => parseAuthorProgress({ courses: { cs61a: "finished" }, modules: {} }),
    (error: Error) => error.message.includes("cs61a") && error.message.includes("finished"),
  );
  assert.throws(
    () => parseAuthorProgress({ courses: {}, modules: { "/internals/core/progress/progress": "读懂了" } }),
    (error: Error) => error.message.includes("/internals/core/progress/progress"),
  );
});

test("课程编号和模块位置的形式不对就拦下，路径符号一律不收", () => {
  const bad = [
    { courses: { "../cs61a": "done" }, modules: {} },
    { courses: { "CS61A": "done" }, modules: {} },
    { courses: {}, modules: { "core/progress/progress": "read" } },
    { courses: {}, modules: { "/internals/../secret": "read" } },
  ];
  for (const value of bad) assert.throws(() => parseAuthorProgress(value));
});

test("最外层缺一项或多一项都算错，不猜作者想写什么", () => {
  assert.throws(() => parseAuthorProgress({ courses: {} }), /modules/);
  assert.throws(() => parseAuthorProgress({ modules: {} }), /courses/);
  assert.throws(() => parseAuthorProgress({ courses: {}, modules: {}, notes: {} }), /notes/);
  assert.throws(() => parseAuthorProgress([]), /最外层/);
  assert.throws(() => parseAuthorProgress(null), /最外层/);
  assert.throws(() => parseAuthorProgress({ courses: [], modules: {} }), /courses/);
});

test("没标过就是没标过，返回空白而不是一个默认状态", () => {
  const progress = parseAuthorProgress({ courses: { cs61a: "todo" }, modules: {} });
  assert.equal(authorCourseState(progress, "cs61a"), "todo");
  assert.equal(authorCourseState(progress, "cs50x"), null);
  assert.equal(authorModuleState(progress, "/internals/core/progress/progress"), null);
  // 对象自带的属性名不能被当成"作者标过"。
  assert.equal(authorCourseState(progress, "toString"), null);
});

test("标了树上没有的课程或源码，构建时就拦下来", () => {
  assert.throws(
    () => checkAuthorTargets(parseAuthorProgress({ courses: { cs16a: "done" }, modules: {} }), known),
    /cs16a/,
  );
  assert.throws(
    () => checkAuthorTargets(parseAuthorProgress({ courses: {}, modules: { "/internals/core/nothing": "read" } }), known),
    /internals\/core\/nothing/,
  );
  assert.doesNotThrow(() =>
    checkAuthorTargets(
      parseAuthorProgress({
        courses: { cs61a: "done" },
        modules: { "/internals/core/progress/progress": "read" },
      }),
      known,
    ),
  );
});

test("作者和访问者共用同一套状态词：一栏写学完，另一栏就不能叫完成", () => {
  for (const state of PROGRESS_STATES) {
    assert.doesNotThrow(() => parseAuthorProgress({ courses: { cs61a: state }, modules: {} }));
  }
  for (const state of UNDERSTANDING_STATES) {
    assert.doesNotThrow(() =>
      parseAuthorProgress({ courses: {}, modules: { "/internals/core/progress/progress": state } }),
    );
  }
});
