/**
 * @module        知识索引的生成器——构建前扫一遍内容目录，把课程信息汇总成一份 JSON
 * @problem       内容写在人看着舒服的地方：标题写在 MDX 开头、分类名写在 meta.json、层级靠文件夹表示。
 *                但程序要回答“当前位置下有什么”“这门课先修是什么”，需要的是一份规整、可直接查询的数据。
 *                让网页在浏览器里现读几十个 MDX 文件既慢又做不到（浏览器根本看不见你的磁盘），
 *                所以这件事必须在构建时做完，把结果固定成一个文件。
 * @design        写成一个不依赖任何框架的独立 Node 脚本，只用内置的 fs 读文件，
 *                在 npm 的 predev / prebuild 阶段自动跑一次，产物写进 core/knowledge/generated/。
 *                考虑过的另外两种做法：
 *                （1）让页面组件在渲染时自己读文件——那样数据入口会散落到各个页面，而且只有 Next 用得上；
 *                （2）直接从 Fumadocs 已经生成的内容里取——省事，但知识索引会永远绑死在这个文档框架上，
 *                     而终端和虚拟文件系统本来是应该能脱离网页单独测试的。
 *                这里选独立脚本：代价是要自己解析文件开头那几行，收益是数据层从头到尾不认识任何框架。
 * @courses       UC Berkeley CS61A（第 4 章：把文本读成有结构的东西）；Stanford CS143 与 UCB CS164（词法分析、语法分析、错误信息）；
 *                UC Berkeley CS61B（树的遍历）；MIT 6.S081 与 UCB CS162（目录、文件与路径）；
 *                CMU 15-445 与 UCB CS186（模式校验、唯一键、外键引用）；MIT Missing Semester（构建脚本与自动化）
 * @exercises     https://cs61a.org/                        —— 解释器项目：把一串文本变成有结构的数据
 *                https://web.stanford.edu/class/cs143/     —— 编译器 PA1/PA2：词法与语法分析，顺带练“怎么把错误说清楚”
 *                https://sp21.datastructur.es/materials/proj/proj2/proj2 —— 文件树遍历与数据组织
 *                https://missing.csail.mit.edu/2020/course-shell/        —— 命令行与脚本自动化
 * @prereq        知道程序可以读写磁盘上的文件；知道 JSON 是什么；知道“构建”是把源文件加工成网站的过程。
 * @unclear       这里手写了一个极小的 frontmatter 解析器（见 readFrontmatter），只认识本项目用到的那几种写法。
 *                它不是完整的 YAML 解析器，遇到没见过的写法会直接报错而不是猜——这是故意的，但也意味着
 *                将来内容格式变复杂时，要么扩展它，要么改用现成的解析库（那需要先讨论新依赖）。
 *                另外，代码注释块（@module / @letter 这一套）还没有被扫进来，那是 ROADMAP 5.1 的事。
 *
 * @letter
 * 这是整个数据层的第一块砖，也是这个项目里第一段“不为了显示、只为了整理”的代码。我想跟你讲清楚
 * 三件事：它什么时候跑、它到底在做什么、以及它为什么宁可报错也不肯猜。
 *
 * 先说什么时候跑。你敲 npm run dev 或 npm run build 的时候，npm 会先自动执行同名的 predev / prebuild
 * 脚本——这是 npm 的规矩，不是我们发明的。所以这个文件会赶在网站启动之前跑完，把 JSON 放好，
 * 网站再开始构建。这就是为什么“新加一门课的文件、重新跑一次，它自动出现在清单里”：
 * 没有任何人需要手工登记，登记这件事本身被自动化掉了。这也是这份清单值得存在的全部理由——
 * 如果还要手工维护一份课程列表，那它迟早会和真实内容对不上，而且没人知道是哪天开始对不上的。
 *
 * 再说它在做什么。说白了就是走一遍文件夹：进一个目录，读 meta.json 知道这个分类的中文名、
 * 里面的东西按什么顺序摆；再看目录里有哪些子文件夹（子分类）和哪些 .mdx 文件（课程）；
 * 碰到子文件夹就走进去，重复上面这一整套。这种“自己调用自己”的走法叫递归。
 * 它在这里合适，是因为“目录里可能还有目录”这件事本身就是自我重复的——
 * 递归不是聪明写法，它只是把问题的形状照抄了一遍。CS61A 和 CS61B 会把这件事讲透。
 *
 * 唯一需要动点脑筋的是 readFrontmatter。每个 MDX 文件开头有一段夹在两行 --- 之间的信息，
 * 写成“键: 值”的样子，这段东西叫 frontmatter，用的是 YAML 格式。完整的 YAML 大得吓人
 * （嵌套、多行、锚点、各种类型都能表达），完整实现要几千行代码。而我们只用到其中极小的一块，
 * 所以这里手写了一个只认识那一小块的解析器：一行一个键值对，值要么是一句话，要么是 [a, b] 这样的列表。
 *
 * 这就引出第三件事：它为什么遇到看不懂的写法就直接停下来报错，而不是跳过、也不猜一个。
 * 因为这个脚本的产物是整个网站的事实来源。如果它对一行看不懂的内容耸耸肩跳过去，
 * 结果就是某门课神秘地从终端里消失了——而你多半三个星期后才会发现，那时早就想不起是哪次改动引起的。
 * 报错很吵，但它吵在正确的时间：就在你刚写下那行东西之后。这条“宁可当场炸掉也不要悄悄降级”的取舍，
 * 在真实工程里到处都是；你以后做编译器作业（CS143）会更强烈地感受到——
 * 一个编译器有相当一部分工作量，花在“怎么把错误说清楚”上面。
 *
 * 最后一句提醒：这个文件里没有 import react，也没有 import next，它只 import 了 node:fs 和 node:path。
 * 这不是巧合，是这个项目的一条硬规矩：数据层和命令引擎必须能脱离网页单独跑。
 * 你可以在任何一台装了 Node 的电脑上直接执行 node scripts/build-knowledge-index.ts，
 * 不需要浏览器，也不需要这个网站。
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CategoryEntry,
  CourseEntry,
  CoursePrerequisites,
  KnowledgeIndex,
} from "../core/knowledge/knowledge-index.ts";
import { KNOWLEDGE_INDEX_VERSION } from "../core/knowledge/knowledge-index.ts";

/** 仓库根目录。脚本自己在 scripts/ 里，所以往上一层就是根。 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** 内容目录：所有分类与课程的唯一来源。 */
const CONTENT_DIR = "content/docs";
/** 文档页面在网站上的地址前缀，和 lib/source.ts 里的 baseUrl 保持一致。 */
const DOCS_BASE_URL = "/docs";
/** 产物位置。这个目录是生成出来的，不进版本库（见 .gitignore）。 */
const OUTPUT_FILE = "core/knowledge/generated/knowledge-index.json";
/** 目录自己那张页面用这个文件名，它不算一门课。 */
const DIRECTORY_PAGE_NAME = "index";

/**
 * frontmatter 里允许出现的字段。写了别的字段会直接报错——
 * 因为最常见的事故是把 prereqCourses 敲成 prereqCourse，然后数据静悄悄地少了一块。
 */
const ALLOWED_FRONTMATTER_KEYS = new Set([
  "title", // 页面标题
  "description", // 一句话简介
  "icon", // Fumadocs 用来显示图标；本脚本不使用，但允许写
  "full", // Fumadocs 的整页排版开关；同上
  "prereqCourses", // 先修中本站已经收录的课程 id
  "prereqKnowledge", // 先修中本站没有对应课程页的知识
]);

/** 解析出来的 frontmatter：值要么是一句话，要么是一串词。 */
type Frontmatter = Map<string, string | string[]>;

/** 报错时统一带上出错位置，让人一眼知道该去改哪个文件的哪一行。 */
class ContentError extends Error {
  constructor(where: string, message: string) {
    super(`${where}: ${message}`);
    this.name = "ContentError";
  }
}

/**
 * 把 MDX 文件开头那段 frontmatter 读成键值对。
 *
 * 认识的写法只有这几种：
 *   title: UC Berkeley CS61A
 *   description: "句子里有逗号就加引号，否则会被当成列表分隔符"
 *   prereqCourses: [cs61a]
 *   prereqKnowledge: []
 * 其余写法（多行文本、缩进嵌套、以 - 开头的块状列表）一律报错，不猜。
 */
function readFrontmatter(fileText: string, where: string): Frontmatter {
  // 有些编辑器会在文件最前面塞一个看不见的字符（BOM），先去掉，否则第一行永远匹配不上。
  const text = fileText.codePointAt(0) === 0xfeff ? fileText.slice(1) : fileText;
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    throw new ContentError(where, "文件必须以一行 --- 开头（frontmatter 的起始行）");
  }

  const result: Frontmatter = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const line = (lines[i] ?? "").trim();
    if (line === "---") return result; // 正常结束
    if (line === "") continue;
    if (line.startsWith("#")) continue; // YAML 的注释行
    if (line.startsWith("-")) {
      throw new ContentError(
        `${where} 第 ${i + 1} 行`,
        "这里暂不支持以 - 开头的块状列表，请改写成一行的 [a, b]",
      );
    }

    const separator = line.indexOf(":");
    if (separator <= 0) {
      throw new ContentError(`${where} 第 ${i + 1} 行`, `看不懂这一行：${line}`);
    }
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (!ALLOWED_FRONTMATTER_KEYS.has(key)) {
      throw new ContentError(
        `${where} 第 ${i + 1} 行`,
        `不认识的字段 ${key}；可用字段：${[...ALLOWED_FRONTMATTER_KEYS].join("、")}`,
      );
    }
    if (result.has(key)) {
      throw new ContentError(`${where} 第 ${i + 1} 行`, `字段 ${key} 写了两次`);
    }
    result.set(key, parseValue(rawValue, `${where} 第 ${i + 1} 行`, key));
  }

  throw new ContentError(where, "frontmatter 没有结束行 ---");
}

/** 把一个值解析成一句话或一串词。 */
function parseValue(rawValue: string, where: string, key: string): string | string[] {
  if (rawValue === "") {
    throw new ContentError(where, `字段 ${key} 是空的；不需要它就把整行删掉`);
  }
  if (rawValue.startsWith("[")) {
    if (!rawValue.endsWith("]")) {
      throw new ContentError(where, `字段 ${key} 的列表没有用 ] 收尾`);
    }
    const inside = rawValue.slice(1, -1).trim();
    if (inside === "") return [];
    return inside.split(",").map((item, position) => {
      const value = stripQuotes(item.trim());
      if (value === "") {
        throw new ContentError(where, `字段 ${key} 的第 ${position + 1} 项是空的`);
      }
      return value;
    });
  }
  return stripQuotes(rawValue);
}

/** 去掉成对的引号；没有引号就原样返回。 */
function stripQuotes(value: string): string {
  const doubleQuoted = value.startsWith('"') && value.endsWith('"');
  const singleQuoted = value.startsWith("'") && value.endsWith("'");
  return (doubleQuoted || singleQuoted) && value.length >= 2 ? value.slice(1, -1) : value;
}

/** 从 frontmatter 里取一个必填的句子。 */
function requireText(frontmatter: Frontmatter, key: string, where: string): string {
  const value = frontmatter.get(key);
  if (typeof value !== "string" || value.trim() === "") {
    throw new ContentError(where, `缺少必填字段 ${key}`);
  }
  return value.trim();
}

/** 从 frontmatter 里取一个可选的列表；没写返回 undefined，写成一句话则报错。 */
function optionalList(frontmatter: Frontmatter, key: string, where: string): string[] | undefined {
  if (!frontmatter.has(key)) return undefined;
  const value = frontmatter.get(key);
  if (!Array.isArray(value)) {
    throw new ContentError(where, `字段 ${key} 必须写成列表，例如 ${key}: [cs61a]`);
  }
  return value;
}

/** 一个目录的 meta.json：分类中文名，以及里面条目的显示顺序。 */
type DirectoryMeta = { title: string; pages: string[] | null };

function readDirectoryMeta(absDir: string, where: string): DirectoryMeta {
  const metaPath = join(absDir, "meta.json");
  let text: string;
  try {
    text = readFileSync(metaPath, "utf8");
  } catch {
    throw new ContentError(where, "缺少 meta.json（每个分类目录都要有，用来写分类的中文标题）");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ContentError(`${where}/meta.json`, `不是合法的 JSON：${(error as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ContentError(`${where}/meta.json`, "内容必须是一个对象 { ... }");
  }

  const record = parsed as Record<string, unknown>;
  const title = record["title"];
  if (typeof title !== "string" || title.trim() === "") {
    throw new ContentError(`${where}/meta.json`, "缺少 title（分类的中文标题）");
  }

  const pages = record["pages"];
  if (pages === undefined) return { title: title.trim(), pages: null };
  if (!Array.isArray(pages) || pages.some((page) => typeof page !== "string")) {
    throw new ContentError(`${where}/meta.json`, "pages 必须是一组字符串");
  }
  return { title: title.trim(), pages: pages as string[] };
}

/**
 * 决定一个目录里的条目按什么顺序摆：meta.json 的 pages 说了算，
 * 没写进 pages 的按名字排在后面（这样漏写不会让条目消失，只是排到末尾）。
 *
 * 提醒一句：这个顺序只是“显示顺序”，不是学习顺序。这本教材不替任何人排课。
 */
function orderChildren(names: string[], meta: DirectoryMeta, where: string): string[] {
  if (meta.pages === null) return [...names].sort();

  const available = new Set(names);
  const ordered: string[] = [];
  for (const page of meta.pages) {
    if (page === DIRECTORY_PAGE_NAME) continue; // 目录自己的页面，不算子条目
    if (page === "...") {
      throw new ContentError(
        `${where}/meta.json`,
        "索引脚本暂不支持 pages 里的 ... 写法，请把条目名写全",
      );
    }
    if (!available.has(page)) {
      throw new ContentError(
        `${where}/meta.json`,
        `pages 里写了 ${page}，但这个目录下没有叫这个名字的文件或文件夹`,
      );
    }
    if (!ordered.includes(page)) ordered.push(page);
  }
  for (const name of [...names].sort()) {
    if (!ordered.includes(name)) ordered.push(name);
  }
  return ordered;
}

/** 由知识树里的位置算出网页地址。 */
function urlFromPath(path: string): string {
  return path === "/" ? DOCS_BASE_URL : `${DOCS_BASE_URL}${path}`;
}

/** 扫描过程中不断累积的结果。 */
type ScanResult = { categories: CategoryEntry[]; courses: CourseEntry[] };

/**
 * 走进一个目录，把它自己、它的子分类、它下面的课程都登记下来。
 * 这就是前面说的递归：碰到子目录，就用同一段逻辑再走一次。
 */
function scanDirectory(
  absDir: string,
  treePath: string,
  parentPath: string | null,
  result: ScanResult,
): void {
  const where = relative(REPO_ROOT, absDir).replaceAll("\\", "/");
  const meta = readDirectoryMeta(absDir, where);
  const entries = readdirSync(absDir, { withFileTypes: true });

  const childDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const mdxFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
    .map((entry) => entry.name.slice(0, -".mdx".length));

  // 目录自己的那张页面（index.mdx）不是课程，它是这个分类的门面。
  const hasDirectoryPage = mdxFiles.includes(DIRECTORY_PAGE_NAME);
  const courseNames = mdxFiles.filter((name) => name !== DIRECTORY_PAGE_NAME);

  let description = "";
  if (hasDirectoryPage) {
    const pageFile = `${where}/${DIRECTORY_PAGE_NAME}.mdx`;
    const text = readFileSync(join(absDir, `${DIRECTORY_PAGE_NAME}.mdx`), "utf8");
    description = requireText(readFrontmatter(text, pageFile), "description", pageFile);
  }

  const category: CategoryEntry = {
    id: treePath === "/" ? "" : treePath.slice(treePath.lastIndexOf("/") + 1),
    title: meta.title,
    description,
    path: treePath,
    url: hasDirectoryPage ? urlFromPath(treePath) : null,
    parentPath,
    childPaths: [],
  };
  result.categories.push(category);

  for (const name of orderChildren([...childDirectories, ...courseNames], meta, where)) {
    const childPath = treePath === "/" ? `/${name}` : `${treePath}/${name}`;
    category.childPaths.push(childPath);
    if (childDirectories.includes(name)) {
      scanDirectory(join(absDir, name), childPath, treePath, result);
    } else {
      result.courses.push(readCourse(join(absDir, `${name}.mdx`), name, childPath, treePath));
    }
  }
}

/** 把一个课程 MDX 文件读成一条课程记录。 */
function readCourse(absFile: string, id: string, path: string, categoryPath: string): CourseEntry {
  const file = relative(REPO_ROOT, absFile).replaceAll("\\", "/");
  const frontmatter = readFrontmatter(readFileSync(absFile, "utf8"), file);
  const prereqCourses = optionalList(frontmatter, "prereqCourses", file);
  const prereqKnowledge = optionalList(frontmatter, "prereqKnowledge", file);

  // 两个字段都没写 = 先修还没整理过；写了其中任意一个 = 整理过了，另一个当空的算。
  const prereq: CoursePrerequisites | null =
    prereqCourses === undefined && prereqKnowledge === undefined
      ? null
      : { courses: prereqCourses ?? [], knowledge: prereqKnowledge ?? [] };

  return {
    id,
    title: requireText(frontmatter, "title", file),
    description: requireText(frontmatter, "description", file),
    path,
    url: urlFromPath(path),
    categoryPath,
    prereq,
    file,
  };
}

/**
 * 生成之后再自查一遍。这一步对应数据库课上的“完整性约束”：
 * 编号不能重复，指向别人的引用必须真的存在。
 */
function checkIndex(index: KnowledgeIndex): void {
  const seen = new Map<string, string>();
  for (const course of index.courses) {
    const previous = seen.get(course.id);
    if (previous !== undefined) {
      throw new ContentError(
        course.file,
        `课程编号 ${course.id} 与 ${previous} 重复；编号取自文件名，全站必须唯一`,
      );
    }
    seen.set(course.id, course.file);
  }

  for (const course of index.courses) {
    for (const required of course.prereq?.courses ?? []) {
      if (required === course.id) {
        throw new ContentError(course.file, `prereqCourses 里写了它自己（${required}）`);
      }
      if (!seen.has(required)) {
        throw new ContentError(
          course.file,
          `prereqCourses 里写了 ${required}，但本站没有这门课；` +
            "如果它本来就不在课程树里，请改写进 prereqKnowledge",
        );
      }
    }
  }
}

function buildKnowledgeIndex(): KnowledgeIndex {
  const result: ScanResult = { categories: [], courses: [] };
  scanDirectory(join(REPO_ROOT, CONTENT_DIR), "/", null, result);
  const index: KnowledgeIndex = {
    version: KNOWLEDGE_INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    sourceDir: CONTENT_DIR,
    categories: result.categories,
    courses: result.courses,
  };
  checkIndex(index);
  return index;
}

function main(): void {
  const index = buildKnowledgeIndex();
  const outputPath = join(REPO_ROOT, OUTPUT_FILE);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(
    `知识索引已生成：${OUTPUT_FILE}（分类 ${index.categories.length} 个，课程 ${index.courses.length} 门）`,
  );
}

main();
