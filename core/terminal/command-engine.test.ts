/**
 * @module        命令引擎的测试——把“敲什么、回什么”一条条钉死
 * @problem       这段逻辑是整个终端的地基，而它的输出将来会被界面、被别的命令、被管道消费。
 *                靠人打开浏览器一条条敲来验证，既慢又不可能覆盖空行、多余空格、大小写这些边角，
 *                更糟的是没人会在每次改动后重来一遍。
 * @design        直接调用 runCommand，不启动浏览器、不渲染任何界面——这正是把引擎与框架分开换来的好处，
 *                连 refs 这种要翻遍整份索引的命令也一样，因为索引本身只是一个普通对象。
 *                也顺便证明了那条边界确实存在：如果哪天有人在引擎里 import 了 React，这个测试会当场跑不起来。
 *                断言检查的是结构（status、块的类型、文字内容），不是拼出来的字符串。
 * @courses       UC Berkeley CS61A（解释器项目自带的测试）；UC Berkeley CS61B（测试驱动与回归）；
 *                MIT Missing Semester（自动化与调试）
 * @exercises     https://cs61a.org/                                        —— 解释器项目：跑它的测试套件
 *                https://sp21.datastructur.es/materials/lab/lab3/lab3      —— 用测试定位错误
 *                https://missing.csail.mit.edu/2020/debugging-profiling/   —— 调试与自动化
 * @prereq        知道断言是“我认为结果应该是这样，不是就报警”。
 * @unclear       这里用的是手写的假索引，不是真实仓库扫出来的那一份。好处是行为被钉得很死，
 *                坏处是它不会因为真实内容出问题而变红——比如某个源文件的注释块写坏了，
 *                这些测试照样全绿，得等构建时才炸。两种检查各管一段，别指望这里替构建把关。
 *
 * @letter
 * 这个文件是那条边界的证据。
 *
 * 引擎那份注释里说“这个模块不认识 React、不认识浏览器”，但说了不算——嘴上写的规矩总会被慢慢磨掉。
 * 而这些测试是在 Node 里直接跑的，那里没有 window、没有 document、没有 React。
 * 只要有人往引擎里 import 了浏览器的东西，npm test 立刻就会红。
 * 所以这份测试同时在做两件事：检查行为对不对，以及看守那条边界。后者往往比前者更值钱。
 *
 * 还有一点值得说：这里的断言检查的是结构，不是文字长相。比如它检查“第一块是不是 list 类型、
 * 里面有没有一项叫 help”，而不是检查“输出的整段文字是不是等于某某字符串”。
 * 后者写起来更快，但只要以后给 help 多加一行说明，它就会莫名其妙地红掉——
 * 而那次改动其实什么也没坏。测试如果总在你没做错事的时候报警，你就会开始无视它，
 * 那它就彻底废了。所以断言要盯着“真正要求的东西”，别盯着无关的细节。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DocComment } from "../knowledge/doc-comment.ts";
import type { KnowledgeIndex } from "../knowledge/knowledge-index.ts";
import { createVirtualFileSystem } from "../filesystem/virtual-file-system.ts";
import {completeLine} from './completion.ts';
import { COMMANDS, parseCommandLine, runCommand } from "./command-engine.ts";
import { pathnameToWorkingDirectory } from "./location.ts";
import type { CourseProgress, ModuleUnderstanding } from "../progress/progress.ts";
import type { CommandResult } from "./command.ts";

/**
 * 造一份最小的注释块。
 *
 * 这些测试关心的是命令怎么处理模块，不是注释怎么被解析——那件事由 [[doc-comment]] 自己的测试负责。
 * 所以这里除了 @module 那一行，其余字段都填一句占位的话，够构成一个合法的模块就行。
 */
function comment(moduleLine: string): DocComment {
  const placeholder = [{ kind: "text" as const, text: "占位" }];
  return {
    module: moduleLine,
    problem: placeholder,
    design: placeholder,
    courses: placeholder,
    exercises: [],
    prereq: placeholder,
    unclear: placeholder,
    letter: placeholder,
  };
}

/** 用一棵很小但有两层分类、一门课程和三个源码模块的树，把 3.1—3.3 和 5.2—5.4 的行为钉死。 */
const fixture: KnowledgeIndex = {
  version: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  sourceDir: "test/fixture",
  categories: [
    {
      id: "",
      title: "测试目录",
      description: "",
      path: "/",
      url: "/docs",
      parentPath: null,
      childPaths: ["/programming-intro", "/systems", "/internals"],
    },
    {
      id: "programming-intro",
      title: "编程入门",
      description: "",
      path: "/programming-intro",
      url: null,
      parentPath: "/",
      childPaths: ["/programming-intro/cs61a"],
    },
    {
      id: "systems",
      title: "系统",
      description: "",
      path: "/systems",
      url: null,
      parentPath: "/",
      childPaths: [],
    },
    {
      id: "internals",
      title: "项目源码讲解",
      description: "这本教材的正文。",
      path: "/internals",
      url: "/docs/internals",
      parentPath: "/",
      childPaths: ["/internals/app", "/internals/core"],
    },
    {
      id: "app",
      title: "app",
      description: "",
      path: "/internals/app",
      url: "/docs/internals/app",
      parentPath: "/internals",
      childPaths: ["/internals/app/layout"],
    },
    {
      id: "core",
      title: "core",
      description: "",
      path: "/internals/core",
      url: "/docs/internals/core",
      parentPath: "/internals",
      childPaths: ["/internals/core/command-engine", "/internals/core/layout"],
    },
  ],
  courses: [
    {
      id: "cs61a",
      title: "UC Berkeley CS61A",
      description: "以函数、抽象和解释器为主线的程序设计导论。",
      path: "/programming-intro/cs61a",
      url: "/docs/programming-intro/cs61a",
      categoryPath: "/programming-intro",
      prereq: { courses: [], knowledge: [] },
      file: "test/fixture/programming-intro/cs61a.mdx",
    },
  ],
  modules: [
    {
      id: "command-engine",
      title: "命令引擎",
      path: "/internals/core/command-engine",
      url: "/docs/internals/core/command-engine",
      categoryPath: "/internals/core",
      file: "core/terminal/command-engine.ts",
      courseIds: ["cs61a"],
      comment: comment("命令引擎——收下你敲的那一行字，交回一组结果"),
    },
    // 两个同名的 layout：真实源码里也是这样，用来钉住“名字撞车时不许瞎猜”。
    {
      id: "layout",
      title: "文档区域的三栏布局",
      path: "/internals/core/layout",
      url: "/docs/internals/core/layout",
      categoryPath: "/internals/core",
      file: "app/docs/layout.tsx",
      courseIds: [],
      comment: comment("文档区域的三栏布局"),
    },
    {
      id: "layout",
      title: "整个网站最外层的页面骨架",
      path: "/internals/app/layout",
      url: "/docs/internals/app/layout",
      categoryPath: "/internals/app",
      file: "app/layout.tsx",
      courseIds: [],
      comment: comment("整个网站最外层的页面骨架"),
    },
  ],
};

const fileSystem = createVirtualFileSystem(fixture);
/** 测试里统一用的“外部世界”：当前位置来自网址，OLDPWD 是会话历史。 */
const session = { currentPath: "/", previousPath: null, fileSystem, knowledge: fixture, progress: [], understanding: [] };
/** 读者本机的学习状态是外面递进来的，测试里直接换一份就行，不需要浏览器。 */
const withProgress = (...records: CourseProgress[]) => ({ ...session, progress: records });
const withUnderstanding = (...records: ModuleUnderstanding[]) => ({ ...session, understanding: records });
const grok = (module: string, state: ModuleUnderstanding["state"]): ModuleUnderstanding =>
  ({ module, state, updatedAt: "2026-09-18T00:00:00.000Z" });
const mark = (course: string, state: CourseProgress["state"]): CourseProgress =>
  ({ course, state, updatedAt: "2026-09-18T00:00:00.000Z" });
/**
 * 从结果里取出导航地址。
 *
 * 动作现在不止一种（还有改学习状态的），所以取 href 之前必须先确认这一条确实是导航——
 * 类型检查会逼着我们写这一步，而这正是把动作做成"带标签的几种可能"想要的效果：
 * 多一种动作时，所有没考虑到它的地方都会当场报错，而不是在运行时悄悄拿到 undefined。
 */
const navigatedTo = (result: CommandResult): string | undefined => {
  const action = result.actions[0];
  return action?.type === "navigate" ? action.href : undefined;
};

test("拆词：第一个词是命令名，剩下的是参数", () => {
  assert.deepEqual(parseCommandLine("help"), { name: "help", args: [] });
  assert.deepEqual(parseCommandLine("cd systems/os"), { name: "cd", args: ["systems/os"] });
  assert.deepEqual(parseCommandLine("  ls   -a   docs  "), { name: "ls", args: ["-a", "docs"] });
});

test("拆词：空行不是错误，只是什么都没说", () => {
  assert.equal(parseCommandLine(""), null);
  assert.equal(parseCommandLine("     "), null);
});

test("敲空行：不显示任何东西，也不算出错", () => {
  const result = runCommand("   ", session);
  assert.equal(result.status, "ok");
  assert.deepEqual(result.blocks, []);
});

test("help：列出注册表里的每一条命令", () => {
  const result = runCommand("help", session);
  assert.equal(result.status, "ok");

  const listBlock = result.blocks.find((block) => block.type === "list");
  assert.ok(listBlock !== undefined, "help 应该产出一个列表块");
  assert.deepEqual(
    listBlock.items.map((item) => item.label),
    COMMANDS.map((command) => command.name),
  );
});

test("help 不接受参数时会照实说，并给出用法", () => {
  const result = runCommand("help me", session);
  assert.equal(result.status, "error");
  assert.equal(result.blocks[0]?.type, "text");
  assert.match(result.blocks[0]?.type === "text" ? result.blocks[0].text : "", /too many arguments/);
});

test("不认识的命令：照抄 Unix 的说法，一个字都不多", () => {
  const result = runCommand("asdfgh", session);
  assert.equal(result.status, "error");
  assert.equal(result.blocks.length, 1);
  assert.deepEqual(result.blocks[0], {
    type: "text",
    text: "command not found: asdfgh",
    tone: "error",
  });
});

test("不做“你是不是想输入 xxx”的猜测", () => {
  // hepl 显然是 help 打错了，但终端不许替人纠正——这是项目的硬规矩。
  const result = runCommand("hepl", session);
  const allText = result.blocks
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n");
  assert.equal(allText, "command not found: hepl");
});

test("命令名大小写敏感，和真 Unix 一致", () => {
  const result = runCommand("HELP", session);
  assert.equal(result.status, "error");
  assert.match(
    result.blocks[0]?.type === "text" ? result.blocks[0].text : "",
    /command not found: HELP/,
  );
});

test("输出是结构化数据，不是拼好的字符串", () => {
  const result = runCommand("help", session);
  // 每一块都必须自带类型，界面才能决定怎么画它。
  for (const block of result.blocks) {
    assert.ok(block.type === "text" || block.type === "list", `没见过的块类型：${block.type}`);
  }
});

test("ls：列出当前位置的直接子项，而且每一项都能等价执行 open", () => {
  const result = runCommand("ls", session);
  assert.equal(result.status, "ok");
  const block = result.blocks[0];
  assert.ok(block?.type === "list");
  assert.deepEqual(block.items.map((item) => item.label), ["programming-intro", "systems", "internals"]);
  assert.deepEqual(block.items.map((item) => item.command), [
    "open /programming-intro",
    "open /systems",
    "open /internals",
  ]);
});

test("cd：进入目录只申请导航，不在引擎里执行跳转", () => {
  const result = runCommand("cd systems", session);
  assert.equal(result.status, "ok");
  assert.deepEqual(result.actions, [
    { type: "navigate", href: "/docs/systems", reason: "change-directory" },
  ]);
});

test("cd：..、~ 与 - 都使用文件系统规则", () => {
  assert.equal(
    navigatedTo(runCommand("cd ..", { ...session, currentPath: "/systems" })),
    "/docs",
  );
  assert.equal(
    navigatedTo(runCommand("cd ~", { ...session, currentPath: "/systems" })),
    "/docs",
  );
  const previous = runCommand("cd -", {
    ...session,
    currentPath: "/systems",
    previousPath: "/programming-intro",
  });
  assert.equal(navigatedTo(previous), "/docs/programming-intro");
  assert.equal(previous.blocks[0]?.type === "text" ? previous.blocks[0].text : "", "/programming-intro");
});

test("cd：不存在的路径严格照规定报错，不附带猜测", () => {
  const result = runCommand("cd nowhere", session);
  assert.deepEqual(result.blocks[0], {
    type: "text",
    text: "cd: no such file or directory: nowhere",
    tone: "error",
  });
  assert.equal(result.actions.length, 0);
});

test("cat：课程显示简介，分类明确报 Is a directory", () => {
  const course = runCommand("cat cs61a", { ...session, currentPath: "/programming-intro" });
  assert.deepEqual(course.blocks[0], {
    type: "text",
    text: "以函数、抽象和解释器为主线的程序设计导论。",
    tone: "normal",
  });
  const directory = runCommand("cat systems", session);
  assert.equal(directory.status, "error");
  assert.equal(directory.blocks[0]?.type === "text" ? directory.blocks[0].text : "", "cat: systems: Is a directory");
});

test("open：课程只返回正文页导航动作", () => {
  const result = runCommand("open cs61a", { ...session, currentPath: "/programming-intro" });
  assert.deepEqual(result.actions, [
    { type: "navigate", href: "/docs/programming-intro/cs61a", reason: "open" },
  ]);
});

test("open：课程名和模块名在任何位置都能直接打开", () => {
  for (const currentPath of ["/", "/systems", "/internals/app"]) {
    assert.deepEqual(runCommand("open cs61a", { ...session, currentPath }).actions, [
      { type: "navigate", href: "/docs/programming-intro/cs61a", reason: "open" },
    ]);
  }
  assert.deepEqual(runCommand("open command-engine", session).actions, [
    { type: "navigate", href: "/docs/internals/core/command-engine", reason: "open" },
  ]);
});

test("open：当前层有同名的东西时优先打开眼前那个", () => {
  const result = runCommand("open layout", { ...session, currentPath: "/internals/app" });
  assert.deepEqual(result.actions, [
    { type: "navigate", href: "/docs/internals/app/layout", reason: "open" },
  ]);
});

test("open：名字不完全相同就照 Unix 报错，不猜；写成路径的不去别处找", () => {
  const partial = runCommand("open cs61", session);
  assert.equal(partial.status, "error");
  assert.deepEqual(partial.blocks, [{ type: "text", text: "open: no such file or directory: cs61", tone: "error" }]);
  assert.deepEqual(partial.actions, []);

  const wrongPlace = runCommand("open systems/cs61a", session);
  assert.equal(wrongPlace.status, "error");
  assert.deepEqual(wrongPlace.actions, []);
});

test("open：多个同名时列出候选，不替读者挑一个", () => {
  const result = runCommand("open layout", session);
  assert.equal(result.status, "error");
  assert.deepEqual(result.actions, []);
  const block = result.blocks[1];
  assert.equal(block?.type, "list");
  assert.deepEqual(
    block?.type === "list" ? block.items.map((item) => item.command) : [],
    ["open /internals/core/layout", "open /internals/app/layout"],
  );
});

test("cd：课程名不在当前层时照旧报错，不按名字到别处找", () => {
  const result = runCommand("cd cs61a", session);
  assert.equal(result.status, "error");
  assert.deepEqual(result.actions, []);
});

test("网址是当前位置的唯一真相：分类是目录，课程页落在其父目录", () => {
  assert.equal(pathnameToWorkingDirectory("/docs/systems/", fileSystem), "/systems");
  assert.equal(
    pathnameToWorkingDirectory("/special-cs-textbook/docs/programming-intro/cs61a/", fileSystem),
    "/programming-intro",
  );
});

test("源码模块和课程一样是文件：ls 列得出、cat 读得到", () => {
  const listed = runCommand("ls /internals/core", session);
  const block = listed.blocks[0];
  assert.ok(block?.type === "list");
  assert.deepEqual(block.items.map((item) => item.label), ["command-engine", "layout"]);

  // cat 一个模块，读到的是它注释块里 @module 那一行。
  const read = runCommand("cat command-engine", { ...session, currentPath: "/internals/core" });
  assert.deepEqual(read.blocks[0], {
    type: "text",
    text: "命令引擎——收下你敲的那一行字，交回一组结果",
    tone: "normal",
  });
});

test("refs 课程名：列出学完它之后可以读的模块，每一项都能点", () => {
  const result = runCommand("refs cs61a", session);
  assert.equal(result.status, "ok");
  const block = result.blocks.find((candidate) => candidate.type === "list");
  assert.ok(block !== undefined, "refs 应该产出一个列表块");
  assert.deepEqual(block.items.map((item) => item.label), ["/internals/core/command-engine"]);
  assert.deepEqual(block.items.map((item) => item.command), ["open /internals/core/command-engine"]);
});

test("refs 模块名：列出读懂它需要先学的课，每一项都能点", () => {
  const result = runCommand("refs command-engine", session);
  assert.equal(result.status, "ok");
  const block = result.blocks.find((candidate) => candidate.type === "list");
  assert.ok(block !== undefined);
  assert.deepEqual(block.items.map((item) => item.label), ["/programming-intro/cs61a"]);
  assert.deepEqual(block.items.map((item) => item.command), ["open /programming-intro/cs61a"]);
});

test("refs 不管你站在哪：名字是在整棵树里找的，不是当前目录", () => {
  const fromElsewhere = runCommand("refs cs61a", { ...session, currentPath: "/systems" });
  assert.equal(fromElsewhere.status, "ok");
  assert.ok(fromElsewhere.blocks.some((block) => block.type === "list"));
});

test("refs 也接受完整位置，走的是文件系统那套规则", () => {
  const result = runCommand("refs /internals/core/command-engine", { ...session, currentPath: "/systems" });
  assert.equal(result.status, "ok");
  const block = result.blocks.find((candidate) => candidate.type === "list");
  assert.ok(block !== undefined);
  assert.deepEqual(block.items.map((item) => item.label), ["/programming-intro/cs61a"]);
});

test("refs 遇到同名的东西不猜，把候选连位置一起列出来", () => {
  const result = runCommand("refs layout", session);
  assert.equal(result.status, "error");
  const block = result.blocks.find((candidate) => candidate.type === "list");
  assert.ok(block !== undefined);
  assert.deepEqual(block.items.map((item) => item.label), [
    "/internals/core/layout",
    "/internals/app/layout",
  ]);
  // 点一下等于用完整位置再问一次，而不是替人选一个。
  assert.deepEqual(block.items.map((item) => item.command), [
    "refs /internals/core/layout",
    "refs /internals/app/layout",
  ]);
});

test("refs 找不到时照实说，不附带猜测", () => {
  const result = runCommand("refs cs61z", session);
  assert.deepEqual(result.blocks, [
    { type: "text", text: "refs: no such course or module: cs61z", tone: "error" },
  ]);
});

test("refs 一个目录是不成立的问题，明确说它是目录", () => {
  const result = runCommand("refs /internals/core", session);
  assert.equal(result.status, "error");
  assert.equal(
    result.blocks[0]?.type === "text" ? result.blocks[0].text : "",
    "refs: /internals/core: Is a directory",
  );
});

test("refs 只回答问题，不申请跳转", () => {
  assert.deepEqual(runCommand("refs cs61a", session).actions, []);
});

test("mark：改状态只申请，不自己动手写存储", () => {
  const result = runCommand("mark cs61a learning", session);
  assert.equal(result.status, "ok");
  assert.deepEqual(result.actions, [{ type: "set-progress", course: "cs61a", state: "learning" }]);
  // 引擎拿到的是一份只读快照，跑完之后它还是空的——真正的写入在界面层。
  assert.deepEqual(session.progress, []);
});

test("mark：三个状态都收，别的词照实报错，不猜你想输什么", () => {
  for (const state of ["todo", "learning", "done"]) {
    assert.equal(runCommand(`mark cs61a ${state}`, session).status, "ok");
  }
  const bad = runCommand("mark cs61a 放弃", session);
  assert.equal(bad.status, "error");
  assert.match(bad.blocks[0]?.type === "text" ? bad.blocks[0].text : "", /invalid state: 放弃/);
  assert.deepEqual(bad.actions, []);
});

test("mark：少写状态时提示用法，不当成查询", () => {
  const result = runCommand("mark cs61a", session);
  assert.equal(result.status, "error");
  assert.match(result.blocks[0]?.type === "text" ? result.blocks[0].text : "", /missing state/);
});

test("mark：指到源码就走理解度那条线，两套状态词各管各的", () => {
  for (const line of ["mark command-engine understood", "mark /internals/core/command-engine understood"]) {
    const result = runCommand(line, session);
    assert.equal(result.status, "ok");
    assert.deepEqual(result.actions, [
      { type: "set-understanding", module: "/internals/core/command-engine", state: "understood" },
    ]);
  }
  // 把课程的词用在源码上要报错，反过来也一样——它们是两条线，词不通用。
  const wrongForModule = runCommand("mark command-engine done", session);
  assert.equal(wrongForModule.status, "error");
  assert.match(wrongForModule.blocks.map((b) => (b.type === "text" ? b.text : "")).join(" "), /是一段源码/);
  const wrongForCourse = runCommand("mark cs61a understood", session);
  assert.equal(wrongForCourse.status, "error");
  assert.match(wrongForCourse.blocks.map((b) => (b.type === "text" ? b.text : "")).join(" "), /是一门课程/);
});

test("mark：模块名撞车时不猜，把候选连位置一起列出来", () => {
  // 真实源码里有两个 layout，fixture 照抄了这一点。
  const result = runCommand("mark layout read", session);
  assert.equal(result.status, "error");
  const items = result.blocks.flatMap((b) => (b.type === "list" ? b.items.map((i) => i.label) : []));
  assert.deepEqual(items.sort(), ["/internals/app/layout", "/internals/core/layout"]);
  assert.deepEqual(result.actions, []);
});

test("mark clear：源码那条线也一样，标过才申请清除", () => {
  const path = "/internals/core/command-engine";
  const marked = runCommand(`mark ${path} clear`, withUnderstanding(grok(path, "read")));
  assert.deepEqual(marked.actions, [{ type: "set-understanding", module: path, state: null }]);
  assert.deepEqual(runCommand(`mark ${path} clear`, session).actions, []);
});

test("mark：找不到的课程照实说", () => {
  const result = runCommand("mark nosuchcourse todo", session);
  assert.equal(result.status, "error");
  assert.match(result.blocks[0]?.type === "text" ? result.blocks[0].text : "", /no such course or module: nosuchcourse/);
});

test("mark clear：标过才申请清除，没标过就直说，不发多余的动作", () => {
  const marked = runCommand("mark cs61a clear", withProgress(mark("cs61a", "done")));
  assert.deepEqual(marked.actions, [{ type: "set-progress", course: "cs61a", state: null }]);
  const never = runCommand("mark cs61a clear", session);
  assert.equal(never.status, "ok");
  assert.deepEqual(never.actions, []);
});

test("status：什么都没标时给能照着做的提示，两条线各给一条", () => {
  const result = runCommand("status", session);
  assert.equal(result.status, "ok");
  const said = result.blocks.map((b) => (b.type === "text" ? b.text : "")).join(" ");
  assert.match(said, /还没有标记任何东西/);
  assert.match(said, /mark cs61a todo/);
  assert.match(said, /read/);
});

test("status：不带参数时先给统计，再按状态分组列出，每一项可点", () => {
  const result = runCommand("status", withProgress(mark("cs61a", "learning")));
  assert.equal(result.status, "ok");
  const first = result.blocks[0];
  assert.match(first?.type === "text" ? first.text : "", /课程.*想学 0 · 在学 1 · 学完 0/);
  const items = result.blocks.flatMap((b) => (b.type === "list" ? b.items : []));
  assert.deepEqual(items, [{
    label: "/programming-intro/cs61a",
    description: "UC Berkeley CS61A",
    command: "open /programming-intro/cs61a",
  }]);
});

test("status：课程被删掉后照实显示，不悄悄丢掉读者的记录", () => {
  const result = runCommand("status", withProgress(mark("gone", "todo")));
  const items = result.blocks.flatMap((b) => (b.type === "list" ? b.items : []));
  assert.deepEqual(items, [{ label: "gone", description: "这门课已不在课程树里" }]);
});

test("status：带参数时只回答那一门", () => {
  const marked = runCommand("status cs61a", withProgress(mark("cs61a", "done")));
  assert.match(marked.blocks[0]?.type === "text" ? marked.blocks[0].text : "", /UC Berkeley CS61A：学完/);
  const never = runCommand("status cs61a", session);
  assert.match(never.blocks[0]?.type === "text" ? never.blocks[0].text : "", /还没有标记/);
});

test("status 只读：不管怎么问，都不申请任何动作", () => {
  for (const line of ["status", "status cs61a", "status nosuchcourse"]) {
    assert.deepEqual(runCommand(line, withProgress(mark("cs61a", "todo"))).actions, []);
  }
});

test("help 认识新命令：注册表是唯一的命令清单", () => {
  const names = COMMANDS.map((command) => command.name);
  assert.ok(names.includes("mark"));
  assert.ok(names.includes("status"));
  const listed = runCommand("help", session).blocks.flatMap((b) => (b.type === "list" ? b.items.map((i) => i.label) : []));
  for (const name of names) assert.ok(listed.some((label) => label.startsWith(name)), `help 少列了 ${name}`);
});

test("status：两条线一起报告，代码那条带整体理解度", () => {
  const path = "/internals/core/command-engine";
  const result = runCommand("status", withUnderstanding(grok(path, "understood")));
  const said = result.blocks.map((b) => (b.type === "text" ? b.text : "")).join(" | ");
  assert.match(said, /课程　想学 0 · 在学 0 · 学完 0/);
  // fixture 里有三个模块，读懂一个 = 33%。分母是全部模块，不是标过的数量。
  assert.match(said, /代码　未读 0 · 读过 0 · 读懂了 1　整体理解度 1\/3（33%）/);
  const items = result.blocks.flatMap((b) => (b.type === "list" ? b.items : []));
  assert.deepEqual(items, [{ label: path, description: "命令引擎", command: `open ${path}` }]);
});

test("status：带参数指到源码时回答理解度，不是学习状态", () => {
  const path = "/internals/core/command-engine";
  const marked = runCommand(`status ${path}`, withUnderstanding(grok(path, "read")));
  assert.match(marked.blocks[0]?.type === "text" ? marked.blocks[0].text : "", /命令引擎：读过/);
  const never = runCommand(`status ${path}`, session);
  assert.match(never.blocks[0]?.type === "text" ? never.blocks[0].text : "", /还没有标记/);
});

test("status：源码被删掉后照实显示，不悄悄丢掉读者的记录", () => {
  const result = runCommand("status", withUnderstanding(grok("/internals/gone", "read")));
  const items = result.blocks.flatMap((b) => (b.type === "list" ? b.items : []));
  assert.deepEqual(items, [{ label: "/internals/gone", description: "这段代码已不在项目里" }]);
});

test("两条线互不干扰：标课程不会改动代码那条，反之亦然", () => {
  const courseOnly = runCommand("mark cs61a done", session);
  assert.equal(courseOnly.actions[0]?.type, "set-progress");
  const moduleOnly = runCommand("mark /internals/core/command-engine understood", session);
  assert.equal(moduleOnly.actions[0]?.type, "set-understanding");
});

// 阶段 10：多段组合必须保留对象，而不是靠解析界面文本恢复链接。
test('引号和转义保留参数，坏管道不会产生写入动作',()=>{
 assert.deepEqual(parseCommandLine("grep 'a b|c'"),{name:'grep',args:['a b|c']});
 for(const line of ["ls |", "| ls", "ls || grep x", "mark cs61a done | grep x", "mark cs61a 'done"]){const r=runCommand(line,session);assert.equal(r.status,'error',line);assert.deepEqual(r.actions,[]);}
});
test('三个命令传递结构化链接，空匹配继续传空列表',()=>{
 const r=runCommand("find / -type f -name 'cs*' | grep -i CS61A | grep -v missing",session);
 assert.equal(r.status,'ok');const rows=r.blocks.flatMap(b=>b.type==='list'?b.items:[]);
 assert.equal(rows.length,1);assert.equal(rows[0]?.command,'open /programming-intro/cs61a');
 const empty=runCommand('find / -name nonexistent | grep x',session);assert.deepEqual(empty.blocks,[{type:'list',items:[]}]);
});
test('find 区分文件目录、相对路径、个人状态与课程先修',()=>{
 const rows=(line:string,ctx=session)=>runCommand(line,ctx).blocks.flatMap(b=>b.type==='list'?b.items:[]);
 assert.equal(rows('find / -type d').length,fixture.categories.length);
 assert.equal(rows("find programming-intro -path 'programming-intro/cs*'")[0]?.label,'programming-intro/cs61a');
 assert.equal(rows('find / -status learning',withProgress(mark('cs61a','learning')) as typeof session).length,1);
 assert.equal(rows('find / -prereq cs61b').length,0);
 assert.equal(runCommand('find / -invalid x',session).status,'error');
});
test('grep 的字面、基础与扩展正则和无效选项',()=>{
 assert.equal(runCommand('grep -z x',session).status,'error');
 assert.equal(runCommand("grep '['",session).status,'error');
 const rows=(line:string)=>runCommand(line,session).blocks.flatMap(b=>b.type==='list'?b.items:[]);
 assert.equal(rows("find / -type f | grep -E 'cs61a|command-engine'").length,2);
 assert.equal(rows("find / -type f | grep -F 'cs61a|command-engine'").length,0);
 assert.equal(rows("find / -type f | grep 'cs61a|command-engine'").length,0);
 assert.equal(rows("find / -path '*core/command-engine'").length,1);
});
test('pwd、tree 深度、history 限制与 clear 的边界',()=>{
 assert.deepEqual(runCommand('pwd',session).blocks,[{type:'text',text:'/',tone:'normal'}]);
 const tree=runCommand('tree -L 1 /',session).blocks[0];assert.equal(tree?.type,'tree');if(tree?.type==='tree')assert.equal(tree.root.children?.length,3);
 assert.equal(runCommand('tree -L 0',session).status,'error');
 assert.deepEqual(runCommand('history 1',{...session,history:['ls','history 1']}).blocks,[{type:'text',text:'2  history 1',tone:'normal'}]);
 assert.deepEqual(runCommand('clear',session).actions,[{type:'clear-screen'}]);
});

test('Tab 唯一补全，多候选不擅自选取，保留光标后的内容',()=>{
 const commands=COMMANDS.map(c=>c.name);
 assert.equal(completeLine('pw',2,session,commands).value,'pwd ');
 assert.equal(completeLine('cd pro',6,session,commands).value,'cd programming-intro/');
 const ambiguous=completeLine('c',1,session,commands);assert.equal(ambiguous.value,'c');assert.ok(ambiguous.candidates.length>1);
 assert.equal(completeLine('pw| grep x',2,session,commands).value,'pwd | grep x');
});

test('find 名称里的正则符号按字面匹配',()=>{
 const rows=runCommand("find / -name 'cs61.'",session).blocks.flatMap(b=>b.type==='list'?b.items:[]);assert.equal(rows.length,0);
});

test('中英文搜索覆盖课程与源码全文，且可接管道',()=>{
 const rows=(line:string)=>runCommand(line,session).blocks.flatMap(b=>b.type==='list'?b.items:[]);
 assert.equal(rows('search CS61A')[0]?.label,'/programming-intro/cs61a');
 assert.ok(rows('search 命令引擎').some(row=>row.label==='/internals/core/command-engine'));
 assert.equal(rows('search 完全不存在的词').length,0);
 assert.ok(rows('search layout | grep 文档').every(row=>row.command?.startsWith('open ')));
});
