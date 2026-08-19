/**
 * @module        命令引擎的测试——把“敲什么、回什么”一条条钉死
 * @problem       这段逻辑是整个终端的地基，而它的输出将来会被界面、被别的命令、被管道消费。
 *                靠人打开浏览器一条条敲来验证，既慢又不可能覆盖空行、多余空格、大小写这些边角，
 *                更糟的是没人会在每次改动后重来一遍。
 * @design        直接调用 runCommand，不启动浏览器、不渲染任何界面——这正是把引擎与框架分开换来的好处，
 *                也顺便证明了那条边界确实存在：如果哪天有人在引擎里 import 了 React，这个测试会当场跑不起来。
 *                断言检查的是结构（status、块的类型、文字内容），不是拼出来的字符串。
 * @courses       UC Berkeley CS61A（解释器项目自带的测试）；UC Berkeley CS61B（测试驱动与回归）；
 *                MIT Missing Semester（自动化与调试）
 * @exercises     https://cs61a.org/                                        —— 解释器项目：跑它的测试套件
 *                https://sp21.datastructur.es/materials/lab/lab3/lab3      —— 用测试定位错误
 *                https://missing.csail.mit.edu/2020/debugging-profiling/   —— 调试与自动化
 * @prereq        知道断言是“我认为结果应该是这样，不是就报警”。
 * @unclear       等命令能返回“我想跳转页面”这类动作时，这里要补一类新的断言：
 *                检查它是不是只是“说想跳”，而不是真的跳了。
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
import { COMMANDS, parseCommandLine, runCommand } from "./command-engine.ts";

/** 测试里统一用的“外部世界”：只要告诉引擎你在哪就够了。 */
const session = { currentPath: "/" };

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
