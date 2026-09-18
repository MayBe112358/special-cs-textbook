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
import { COMMANDS, parseCommandLine, runCommand } from "./command-engine.ts";
import { pathnameToWorkingDirectory } from "./location.ts";

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
const session = { currentPath: "/", previousPath: null, fileSystem, knowledge: fixture };

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
    runCommand("cd ..", { ...session, currentPath: "/systems" }).actions[0]?.href,
    "/docs",
  );
  assert.equal(
    runCommand("cd ~", { ...session, currentPath: "/systems" }).actions[0]?.href,
    "/docs",
  );
  const previous = runCommand("cd -", {
    ...session,
    currentPath: "/systems",
    previousPath: "/programming-intro",
  });
  assert.equal(previous.actions[0]?.href, "/docs/programming-intro");
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
