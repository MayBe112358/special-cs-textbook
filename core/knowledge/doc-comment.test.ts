/**
 * @module        注释块解析器的测试——把“注释里写什么、解析成什么”一条条钉死
 * @problem       这个解析器的产物会变成网站上的讲解页、终端里 cat 的内容、以及课程与代码之间的链接。
 *                它出错的样子很难被看见：不会白屏、不会报错，只是某一页少了一栏，或者某条链接没了。
 *                靠打开浏览器一页页翻是发现不了的，尤其是折行、缩进例子、写坏的字段这些边角。
 * @design        直接调用解析函数，用几段手写的注释块当样本，断言检查结构而不是整段文字。
 *                样本故意包含真实注释里出现过的四种形状：折行的字段、编号列表、缩进的例子块、
 *                以及一行写两条的 @exercises。写坏的输入单独一组，确认它是当场报错而不是悄悄降级。
 * @courses       UC Berkeley CS61B（测试驱动与回归）；UC Berkeley CS61A（解释器项目自带的测试）；
 *                Stanford CS143（词法分析器的测试）；MIT Missing Semester（自动化与调试）
 * @exercises     https://sp21.datastructur.es/materials/lab/lab3/lab3      —— CS61B Lab 3：用测试抓错
 *                https://cs61a.org/ —— CS61A 当前学期主页：解释器单元的项目在学期后半发布（2026 秋季起改用 Gleam 写，不再是 Scheme）
 *                https://www.composingprograms.com/pages/34-interpreters-for-languages-with-combination.html —— CS61A 官方教材 3.4 节：一个计算器语言的解释器，读入—求值的完整例子
 *                https://missing.csail.mit.edu/2020/debugging-profiling/   —— 调试与自动化
 * @prereq        知道断言是“我认为结果应该是这样，不是就报警”。
 * @unclear       这里只测解析本身。“真实仓库里的每个文件都能被解析”这件事由构建脚本负责——
 *                它一跑就会把所有文件过一遍，写坏了当场就构建不过去。两者的分工要是哪天模糊了，
 *                这里可能需要补一个“扫一遍真文件”的测试。
 *
 * @letter
 * 这个文件里的样本注释块，形状都是照着真实注释挑的，不是随手编的。
 *
 * 为啥要强调这个？因为写测试最容易犯的毛病，就是只测那些本来就写对了的情况。
 * 一段平平整整、每个字段都只有一行的注释，解析器几乎不可能读错，测它没啥用。
 * 真正容易出事的是：字段折了行、信里夹着缩进的例子、编号列表、有人把字段名敲错了一个字母。
 * 所以这里每一段样本，都对应一种真实注释里出现过的写法，或者一种我担心会出错的写法。
 *
 * 断言查的是结构，比如“第二段是不是例子块”“例子块里有几行”，而不是整段文字一字不差。
 * 这不是图省事。要是写成“解析结果必须等于这一整段字符串”，哪天在信里多加一句话，测试就红了，可那次改动其实啥都没弄坏。
 * 老在你没做错事的时候报警的测试，最后只会被无视。
 *
 * 写坏的输入单独放了一组。它们要检查的不是“解析出了什么”，而是“有没有当场报错”。
 * 解析器宁可吵一点，也不能悄悄把一个拼错的字段吞掉，这组测试就是替它守着这条的。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DocCommentError, findDocCommentBlock, parseDocComment, readDocComment } from "./doc-comment.ts";

/** 一段形状齐全的注释块，四种真实写法都在里面。 */
const sample = [
  "/**",
  " * @module        样本模块——用来测试解析器",
  " * @problem       第一行写不下就会折到第二行，",
  " *                而这两行本来是一句话。",
  " * @design        先说一句结论，然后列出考虑过的做法：",
  " *                （1）第一种做法，它有一句解释；",
  " *                （2）第二种做法，这一条写了两行，",
  " *                     第二行是为了对齐才缩进的。",
  " * @courses       UC Berkeley CS61A（解释器）；UC Berkeley CS61B（树）",
  " * @exercises     https://cs61a.org/          —— 解释器项目",
  " *                https://example.org/a ; https://example.org/b",
  " * @prereq        知道字符串可以按行切开。",
  " * @unclear       unknown",
  " *",
  " * @letter",
  " * 这是信的第一段，它在源码里折了行，",
  " * 但读起来应该是一整段。",
  " *",
  " *     这是一块缩进的例子",
  " *     它有两行",
  " *",
  " * 这是信的最后一段。",
  " */",
].join("\n");

test("找得到带 @module 的那一段块注释", () => {
  const block = findDocCommentBlock(`// 前面有别的东西\n${sample}\nconst x = 1;\n`);
  assert.ok(block !== null);
  assert.match(block, /@module/);
});

test("文件里没有注释块时返回 null，这不是错误", () => {
  assert.equal(findDocCommentBlock("const x = 1;\n"), null);
  assert.equal(readDocComment("const x = 1;\n", "样本文件"), null);
});

test("跳过不带 @module 的块注释，接着往下找", () => {
  const withDecoy = `/**\n * 这是一段普通说明，不是教材的一章。\n */\n${sample}`;
  const block = findDocCommentBlock(withDecoy);
  assert.ok(block !== null);
  assert.match(block, /样本模块/);
});

test("@module 取成一行", () => {
  const parsed = parseDocComment(sample, "样本文件");
  assert.equal(parsed.module, "样本模块——用来测试解析器");
});

test("折行的字段接回一句话", () => {
  const parsed = parseDocComment(sample, "样本文件");
  assert.deepEqual(parsed.problem, [
    { kind: "text", text: "第一行写不下就会折到第二行，而这两行本来是一句话。" },
  ]);
});

test("编号列表每条自成一段，条目内部的折行仍然接回去", () => {
  const parsed = parseDocComment(sample, "样本文件");
  assert.deepEqual(parsed.design, [
    { kind: "text", text: "先说一句结论，然后列出考虑过的做法：" },
    { kind: "text", text: "（1）第一种做法，它有一句解释；" },
    { kind: "text", text: "（2）第二种做法，这一条写了两行，第二行是为了对齐才缩进的。" },
  ]);
});

test("信里空行分段，缩进的例子原样保留", () => {
  const parsed = parseDocComment(sample, "样本文件");
  assert.deepEqual(parsed.letter, [
    { kind: "text", text: "这是信的第一段，它在源码里折了行，但读起来应该是一整段。" },
    { kind: "block", lines: ["这是一块缩进的例子", "它有两行"] },
    { kind: "text", text: "这是信的最后一段。" },
  ]);
});

test("@exercises 认识换行和一行写两条，链接和说明分开", () => {
  const parsed = parseDocComment(sample, "样本文件");
  assert.deepEqual(parsed.exercises, [
    { url: "https://cs61a.org/", note: "解释器项目" },
    { url: "https://example.org/a", note: "" },
    { url: "https://example.org/b", note: "" },
  ]);
});

test("接行时中文直接接上，英文之间补一个空格", () => {
  const block = [
    "/**",
    " * @module        接行样本",
    " * @problem       你敲的是 npm run",
    " *                dev 这条命令，中文这一句",
    " *                直接接上。",
    " * @design        unknown",
    " * @courses       unknown",
    " * @exercises     unknown",
    " * @prereq        unknown",
    " * @unclear       unknown",
    " *",
    " * @letter",
    " * 一句话。",
    " */",
  ].join("\n");
  const parsed = parseDocComment(block, "样本文件");
  assert.deepEqual(parsed.problem, [
    { kind: "text", text: "你敲的是 npm run dev 这条命令，中文这一句直接接上。" },
  ]);
});

test("不认识的字段当场报错，不忽略也不猜", () => {
  const typo = sample.replace("@exercises", "@exercise");
  assert.throws(() => parseDocComment(typo, "样本文件"), (error: unknown) => {
    assert.ok(error instanceof DocCommentError);
    assert.match(error.message, /不认识的字段 @exercise/);
    return true;
  });
});

test("缺字段当场报错，指名缺的是哪一个", () => {
  const missing = sample.replace(" * @prereq        知道字符串可以按行切开。\n", "");
  assert.throws(() => parseDocComment(missing, "样本文件"), (error: unknown) => {
    assert.ok(error instanceof DocCommentError);
    assert.match(error.message, /缺少必填字段 @prereq/);
    return true;
  });
});

test("同一个字段写两次当场报错", () => {
  const duplicated = sample.replace(" * @unclear       unknown", " * @unclear       unknown\n * @unclear       又写了一次");
  assert.throws(() => parseDocComment(duplicated, "样本文件"), /字段 @unclear 写了两次/);
});

test("报错带上文件位置，让人知道该去改哪里", () => {
  const typo = sample.replace("@courses", "@course");
  assert.throws(() => parseDocComment(typo, "core/terminal/command-engine.ts"), (error: unknown) => {
    assert.ok(error instanceof DocCommentError);
    assert.ok(error.message.startsWith("core/terminal/command-engine.ts: "), error.message);
    return true;
  });
});
