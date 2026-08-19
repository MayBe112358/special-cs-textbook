/**
 * @module        虚拟文件系统的测试——用一棵假的小树，把路径解析的每条规则都钉死
 * @problem       路径解析看起来简单，实际上边界情况密密麻麻：根目录再往上是哪、多写一个斜杠算不算、
 *                ~ 后面还跟着东西怎么办、路径中间那一层不存在或者是个文件又怎么办。
 *                这些情况在界面上很难挨个点出来，出错时的表现又往往只是“某一项没显示”或者
 *                “本该报错却没报”，不容易联想到是路径算错了。所以它需要被机器反复检查，而不是靠人记得试。
 * @design        测试用一份手写的假索引，不用真实课程内容。理由是测试要回答的问题是
 *                “规则实现对不对”，不是“今天网站上有哪几门课”；用真数据会让测试在别人新增课程时莫名其妙地红掉。
 *                断言分成两组：resolvePath 那组只验字符串演算，lookup 那组验“一层一层走”的严格语义——
 *                这两件事结论会不一样，分开测才说得清。
 *                测试用 Node 自带的 node:test 跑，一个新依赖都不装（npm test 即可）。
 * @courses       UC Berkeley CS61B（写测试与调试）；MIT 6.S081 与 UCB CS162（路径名解析的边界情况、ENOENT 与 ENOTDIR）；
 *                MIT Missing Semester（调试与自动化测试那一讲）
 * @exercises     https://sp21.datastructur.es/materials/lab/lab3/lab3       —— 用测试定位错误
 *                https://pdos.csail.mit.edu/6.S081/2021/labs/fs.html        —— 文件系统 lab，路径解析写在 namei 里
 *                https://missing.csail.mit.edu/2020/debugging-profiling/    —— 调试与自动化
 * @prereq        知道“断言”就是写下一句“我认为结果应该是这个”，不对就报警。
 * @unclear       还没有测“索引本身不一致”的情况（比如 childPaths 指向不存在的项），
 *                因为那属于生成器出错，等 ROADMAP 5.1 扩展索引时一起补。
 *
 * @letter
 * 这是这个项目的第一批自动化测试，我想借它讲清楚测试到底是什么，因为它常被讲得太玄。
 *
 * 一个测试就是三句话：先造一个已知的局面，再调用一次要检查的函数，最后写下“结果应该等于什么”。
 * 如果结果不等，测试就报警。就这么简单，没有别的。下面每个 test(...) 里都是这三句话。
 *
 * 那它值在哪？值在它能替你记住那些你迟早会忘的边界情况。比如“在根目录敲 cd .. 会怎样”——
 * 你今天知道答案是“还在根目录”，因为你刚读过那段代码。三个月后你为了别的功能改了路径解析，
 * 很可能就把这条弄坏了，而界面上只会表现为“点某个东西没反应”，你根本不会想到是它。
 * 有了这些测试，你只要敲一次 npm test，机器会当场告诉你坏在哪一行。
 *
 * 下面那组叫“一层一层走”的测试是后来补的，补的原因值得写下来：这个文件系统的第一版
 * 只做字符串演算，于是 /不存在的分类/.. 被它算成了 /，还高高兴兴地说“存在”。
 * 而真终端会报 No such file or directory。当时的测试没有一条覆盖到这种路径，
 * 所以它全绿——测试全绿从来不等于代码是对的，它只等于“我想到要问的问题都问过了”。
 * 没想到要问的问题，测试帮不了你。所以每次发现一个 bug，正确的反应不是只把它修掉，
 * 而是先补一条会因为这个 bug 而变红的测试，再去修。这样这个错误就再也不会悄悄回来。
 *
 * 还有一点：这里用的是一棵假的树，两个分类、一个子分类、三门假课。这是故意的。
 * 如果测试直接读真实的课程索引，那么将来你新加一门课，这些测试就会莫名其妙地失败，
 * 于是你要么去改测试，要么开始无视它们——两条路都会让测试变成负担。
 * 测试该盯的是规则，不是今天的内容。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnowledgeIndex } from "../knowledge/knowledge-index.ts";
import { createVirtualFileSystem } from "./virtual-file-system.ts";

/** 一棵假的小树，专门用来测规则：/tools 里一门课，/systems 下面还有一层 /systems/os。 */
const fixture: KnowledgeIndex = {
  version: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  sourceDir: "test/fixture",
  categories: [
    {
      id: "",
      title: "假的课程目录",
      description: "只用于测试。",
      path: "/",
      url: "/docs",
      parentPath: null,
      childPaths: ["/tools", "/systems"],
    },
    {
      id: "tools",
      title: "假的工具分类",
      description: "",
      path: "/tools",
      url: null,
      parentPath: "/",
      childPaths: ["/tools/shell"],
    },
    {
      id: "systems",
      title: "假的系统分类",
      description: "",
      path: "/systems",
      url: null,
      parentPath: "/",
      childPaths: ["/systems/os"],
    },
    {
      id: "os",
      title: "假的操作系统分类",
      description: "",
      path: "/systems/os",
      url: null,
      parentPath: "/systems",
      childPaths: ["/systems/os/xv6", "/systems/os/pintos"],
    },
  ],
  courses: [
    {
      id: "shell",
      title: "假的命令行课",
      description: "测试用。",
      path: "/tools/shell",
      url: "/docs/tools/shell",
      categoryPath: "/tools",
      prereq: { courses: [], knowledge: [] },
      file: "test/fixture/tools/shell.mdx",
    },
    {
      id: "xv6",
      title: "假的 xv6 课",
      description: "测试用。",
      path: "/systems/os/xv6",
      url: "/docs/systems/os/xv6",
      categoryPath: "/systems/os",
      prereq: { courses: ["shell"], knowledge: ["C 语言"] },
      file: "test/fixture/systems/os/xv6.mdx",
    },
    {
      id: "pintos",
      title: "假的 Pintos 课",
      description: "测试用。",
      path: "/systems/os/pintos",
      url: "/docs/systems/os/pintos",
      categoryPath: "/systems/os",
      prereq: null,
      file: "test/fixture/systems/os/pintos.mdx",
    },
  ],
};

const vfs = createVirtualFileSystem(fixture);

// ── 第一组：resolvePath，只做字符串演算，不检查存不存在 ──────────────────────

test("字符串演算：相对路径接在当前位置后面", () => {
  assert.equal(vfs.resolvePath("/", "systems"), "/systems");
  assert.equal(vfs.resolvePath("/systems", "os"), "/systems/os");
  assert.equal(vfs.resolvePath("/systems/os", "xv6"), "/systems/os/xv6");
});

test("字符串演算：以 / 开头的绝对路径不看当前位置", () => {
  assert.equal(vfs.resolvePath("/systems/os", "/tools"), "/tools");
  assert.equal(vfs.resolvePath("/tools", "/"), "/");
});

test("字符串演算：.. 回上一层，. 原地不动", () => {
  assert.equal(vfs.resolvePath("/systems/os", ".."), "/systems");
  assert.equal(vfs.resolvePath("/systems/os", "../.."), "/");
  assert.equal(vfs.resolvePath("/systems/os", "../../tools"), "/tools");
  assert.equal(vfs.resolvePath("/systems", "."), "/systems");
  assert.equal(vfs.resolvePath("/systems", "./os"), "/systems/os");
});

test("字符串演算：根目录再往上还是根目录（和真 Unix 一致）", () => {
  assert.equal(vfs.resolvePath("/", ".."), "/");
  assert.equal(vfs.resolvePath("/", "../../.."), "/");
});

test("字符串演算：~ 展开成课程树的根", () => {
  assert.equal(vfs.resolvePath("/systems/os", "~"), "/");
  assert.equal(vfs.resolvePath("/systems/os", "~/tools"), "/tools");
  assert.equal(vfs.resolvePath("/", "~/systems/os"), "/systems/os");
});

test("字符串演算：多余的斜杠和空输入不会算错", () => {
  assert.equal(vfs.resolvePath("/systems/", "os/"), "/systems/os");
  assert.equal(vfs.resolvePath("//systems//os//", ""), "/systems/os");
  assert.equal(vfs.resolvePath("/systems", "  os  "), "/systems/os");
});

test("字符串演算不负责判断存在：它会把 /不存在/.. 折成 /", () => {
  // 这不是 bug，这就是字符串演算的定义。判断存不存在是 lookup 的事——见下一组。
  assert.equal(vfs.resolvePath("/", "/不存在/.."), "/");
});

// ── 第二组：lookup，一层一层走，每一步都验 ──────────────────────────────

test("找得到的目录和课程都能拿到节点", () => {
  const directory = vfs.lookup("/", "systems/os");
  assert.equal(directory.found, true);
  assert.equal(directory.found && directory.node.kind, "directory");
  assert.equal(directory.found && directory.node.title, "假的操作系统分类");

  const file = vfs.lookup("/systems/os", "xv6");
  assert.equal(file.found, true);
  assert.equal(file.found && file.node.kind, "file");
  assert.equal(file.found && file.node.url, "/docs/systems/os/xv6");
});

test("沿途每一层都存在时，.. 和 . 正常工作", () => {
  const up = vfs.lookup("/systems/os", "..");
  assert.equal(up.found && up.path, "/systems");

  const upTwice = vfs.lookup("/systems/os", "../..");
  assert.equal(upTwice.found && upTwice.path, "/");

  const sideways = vfs.lookup("/systems/os", "../../tools/shell");
  assert.equal(sideways.found && sideways.path, "/tools/shell");

  const root = vfs.lookup("/", "..");
  assert.equal(root.found && root.path, "/");
});

test("不能穿过一个不存在的目录（真 bash 也不让）", () => {
  // 真终端：cd: /不存在/..: No such file or directory
  const result = vfs.lookup("/", "/不存在/..");
  assert.equal(result.found, false);
  assert.equal(result.found === false && result.reason, "no such file or directory");
  assert.equal(result.found === false && result.path, "/不存在");
});

test("不能穿过一个不存在的中间层，哪怕最终位置存在", () => {
  const result = vfs.lookup("/", "/systems/nope/../os");
  assert.equal(result.found, false);
  assert.equal(result.found === false && result.path, "/systems/nope");
  assert.equal(result.found === false && result.reason, "no such file or directory");
});

test("文件后面不能再跟一层：报 not a directory", () => {
  // 真终端：cd: /tools/shell/..: Not a directory —— 文件没有“里面”，也就没有 ..
  const parent = vfs.lookup("/", "/tools/shell/..");
  assert.equal(parent.found, false);
  assert.equal(parent.found === false && parent.reason, "not a directory");
  assert.equal(parent.found === false && parent.path, "/tools/shell");

  const dot = vfs.lookup("/tools", "shell/.");
  assert.equal(dot.found === false && dot.reason, "not a directory");

  const deeper = vfs.lookup("/tools", "shell/anything");
  assert.equal(deeper.found === false && deeper.reason, "not a directory");
});

test("以 / 结尾的路径必须是目录", () => {
  // 真终端：cat /etc/passwd/ 报 Not a directory；目录后面加斜杠则完全正常。
  const file = vfs.lookup("/", "/tools/shell/");
  assert.equal(file.found === false && file.reason, "not a directory");

  const directory = vfs.lookup("/", "/tools/");
  assert.equal(directory.found && directory.path, "/tools");
});

test("当前位置本身不存在时，相对路径也走不动", () => {
  const result = vfs.lookup("/不存在", "xv6");
  assert.equal(result.found, false);
  assert.equal(result.found === false && result.path, "/不存在");
});

test("找不到时明确地说找不到，并且把用户原样输入的东西带回来", () => {
  const result = vfs.lookup("/systems", "nope");
  assert.equal(result.found, false);
  assert.equal(result.found === false && result.input, "nope");
  assert.equal(result.found === false && result.path, "/systems/nope");
  assert.equal(result.found === false && result.reason, "no such file or directory");
});

// ── 第三组：列目录 ──────────────────────────────────────────────────

test("列目录时顺序照内容里写的来", () => {
  const os = vfs.nodeAt("/systems/os");
  assert.ok(os !== null && os.kind === "directory");
  assert.deepEqual(
    vfs.childrenOf(os).map((child) => child.name),
    ["xv6", "pintos"],
  );
});

test("根节点就是那棵树的最顶上", () => {
  assert.equal(vfs.root.path, "/");
  assert.deepEqual(
    vfs.childrenOf(vfs.root).map((child) => child.path),
    ["/tools", "/systems"],
  );
});
