/**
 * @module        知识索引的生成器——构建前扫一遍内容目录和源码，把课程与模块信息汇总成一份 JSON
 * @problem       内容写在人看着舒服的地方：标题写在 MDX 开头、分类名写在 meta.json、层级靠文件夹表示，
 *                而这本教材的正文干脆写在源码文件顶部的注释块里。
 *                但程序要回答“当前位置下有什么”“这门课先修是什么”“读懂这段代码要先学哪门课”，
 *                需要的是一份规整、可直接查询的数据。
 *                让网页在浏览器里现读几十个 MDX 文件和源文件既慢又做不到（浏览器根本看不见你的磁盘），
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
 * @exercises     https://inst.eecs.berkeley.edu/~cs61a/sp25/proj/scheme/ —— Scheme 解释器（2025 春季存档）：把一串文本变成有结构的数据
 *                https://web.stanford.edu/class/cs143/     —— 编译器 PA1/PA2：词法与语法分析，顺带练“怎么把错误说清楚”
 *                https://sp21.datastructur.es/materials/proj/proj2/proj2 —— 文件树遍历与数据组织
 *                https://missing.csail.mit.edu/2020/course-shell/        —— 命令行与脚本自动化
 * @prereq        知道程序可以读写磁盘上的文件；知道 JSON 是什么；知道“构建”是把源文件加工成网站的过程。
 * @unclear       这里手写了一个极小的 frontmatter 解析器（见 readFrontmatter），只认识本项目用到的那几种写法。
 *                它不是完整的 YAML 解析器，遇到没见过的写法会直接报错而不是猜——这是故意的，但也意味着
 *                将来内容格式变复杂时，要么扩展它，要么改用现成的解析库（那需要先讨论新依赖）。
 *                另外，扫源码时“没有注释块的文件直接跳过”是宽容的，这个脚本不会因为某个文件没写注释就失败。
 *                “每个文件都要有注释块”这条规矩现在由 scripts/check-letters.ts 单独检查，CI 里会跑。
 *
 * @letter
 * 这个脚本不为了显示任何东西，只为了整理。整个数据层都是从它这儿开始的。我想跟你聊三件事：它什么时候跑，它在干啥，还有它为什么宁可报错也不肯猜。
 *
 * 先说什么时候跑。你敲 npm run dev 或者 npm run build 的时候，npm 会先自动跑同名的 predev、prebuild 脚本。这是 npm 自己的规矩，不是我们发明的。
 * 所以这个文件总是赶在网站启动之前跑完，把 JSON 放好，网站才开始构建。
 * 这就是为什么你新加一门课的文件，重新跑一下，它就自己出现在清单里了。没有人需要手动登记，“登记”这件事本身被自动化掉了。
 * 这也是这份清单存在的全部意义。要是还得有人手动维护一份课程列表，它早晚会跟真实内容对不上，而且没人知道是哪天开始对不上的。
 *
 * 再说它在干啥。说白了就是逛一遍文件夹：进一个目录，先读 meta.json，知道这个分类的中文名、里面的东西按什么顺序摆；
 * 再看目录里有哪些子文件夹（子分类）和哪些 .mdx 文件（课程）；碰到子文件夹就钻进去，把上面这套再来一遍。
 * 这种“自己调自己”的走法叫递归。它在这儿特别合适，因为“目录里还可能有目录”这件事本身就是自己套自己的。
 * 递归算不上什么聪明写法，它只是照着问题本来的形状抄了一遍。
 *
 * 唯一要动点脑子的是 readFrontmatter。每个 MDX 文件开头有一段夹在两行 --- 中间的信息，写成“键: 值”的样子，这叫 frontmatter，格式是 YAML。
 * 完整的 YAML 大得吓人，嵌套、多行、锚点、各种类型都有，完整实现得几千行。
 * 可我们只用到了其中很小的一块：一行一个键值对，值要么是一句话，要么是 [a, b] 这种列表。
 * 所以这里手写了一个只认识这一小块的解析器。
 *
 * 这就说到第三件事了：碰到看不懂的写法，它为什么直接停下来报错，而不是跳过，也不猜。
 * 因为这个脚本的产物是整个网站的事实来源。它要是对一行看不懂的东西耸耸肩跳过去，结果就是某门课神秘地从终端里消失了。
 * 你大概三个星期以后才会发现，那时候早就想不起是哪次改动惹的祸。
 * 报错是吵，可它吵在对的时候：就在你刚写下那行东西之后。
 * 以后你做编译器作业（CS143）会更有体会，一个编译器有相当一部分功夫，花在“怎么把错误说清楚”上。
 *
 * 后来这个脚本又多了一个活：扫仓库里的源码。
 * 因为这本教材的正文就写在源文件顶部的注释里。把每个带注释块的文件登记成一个“模块”，它们才能在网站上有自己的一页、能被终端 cat、能跟课程互相链接。
 * 扫源码和扫课程是同一个套路，但方向反过来了：课程那边有 meta.json 告诉你目录里该有什么，源码这边啥也没有。
 * 所以这边的规则是“默认全要，只把明确不该看的目录挡在外面”，比如 node_modules。
 *
 * 这个选择值得多想一秒。写一份“要扫哪些文件”的清单更省事，也更好控制。
 * 代价是你哪天新写一个文件，忘了往清单里加，它就永远进不了教材，而且没有任何报错。
 * 这跟前面说的“手动维护课程列表”是同一种病。所以宁可多扫一点，再把不该看的排除掉。
 *
 * 最后提一句：这个脚本除了 node 自带的 fs、path、url，只 import 了 core/knowledge 里的两个解析函数，没有 react，没有 next。
 * 这是项目的硬规矩，数据层得能脱离网页单独跑。随便一台装了 Node 的电脑上，node scripts/build-knowledge-index.ts 就能直接跑，不需要浏览器，也不需要这个网站。
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CategoryEntry,
  CourseEntry,
  CoursePrerequisites,
  KnowledgeIndex,
  ModuleEntry,
} from "../core/knowledge/knowledge-index.ts";
import {
  INTERNALS_DESCRIPTION,
  INTERNALS_PATH,
  INTERNALS_TITLE,
  KNOWLEDGE_INDEX_VERSION,
} from "../core/knowledge/knowledge-index.ts";
import type { DocComment } from "../core/knowledge/doc-comment.ts";
import { readDocComment } from "../core/knowledge/doc-comment.ts";
import { matchCourseIds } from "../core/knowledge/cross-reference.ts";

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
/** 树根在知识树里的写法。课程分类和源码讲解都挂在它下面。 */
const ROOT_TREE_PATH = "/";

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
 * 扫描源码时不进去的目录。以点开头的目录（.git、.next、.source……）另有一条规则统一跳过。
 *
 * content 在这里被跳过，是因为课程 MDX 里也有注释块，但那是“这一页该怎么写”的说明，
 * 不是源码模块——它们已经作为课程进了清单，再当模块登记一遍就成了两份。
 */
const SOURCE_SKIP_DIRECTORIES = new Set([
  "node_modules",
  "out",
  "output",
  "public",
  "content",
  "开发指导文档",
]);

/** 会被当成源码来看的文件后缀。顺序无所谓，只用来判断“要不要打开看看”。 */
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mjs", ".js", ".css"];

/** 源码讲解那一支在树里的位置前缀。 */
const INTERNALS_SEGMENT = INTERNALS_PATH.slice(1);

/**
 * 走一遍仓库，把所有可能带注释块的源文件列出来（相对仓库根目录，用正斜杠）。
 *
 * 注意这里没有一份“要扫哪些文件”的清单。清单是会过期的：新写一个文件却忘了登记，
 * 它就永远不会出现在教材里，而且不报错。所以这里的做法是反过来——默认全都要，
 * 只把明确不该看的目录挡在外面。
 */
function collectSourceFiles(absDir: string, into: string[]): void {
  const entries = readdirSync(absDir, { withFileTypes: true });
  // 自己排序，不依赖操作系统给的顺序：同一份仓库在两台电脑上必须生成一模一样的清单。
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

  for (const entry of entries) {
    const absolute = join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      if (SOURCE_SKIP_DIRECTORIES.has(entry.name)) continue;
      collectSourceFiles(absolute, into);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) continue;
    into.push(relative(REPO_ROOT, absolute).replaceAll("\\", "/"));
  }
}

/**
 * 把一段文件名或目录名变成能安全放进网址的一节。
 *
 * 绝大多数名字本来就合规，原样通过。真正需要它的是 Next.js 那种带方括号的目录名
 * （app/docs/[[...slug]]），那些符号进了网址会一路带来麻烦。规整之后位置变成 .../docs/slug/page，
 * 而讲解页上仍然原样显示真实文件路径——位置是给机器用的编号，路径才是事实。
 */
function toPathSegment(name: string, file: string): string {
  const segment = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (segment === "") {
    throw new ContentError(file, `文件名 ${name} 里没有一个字母或数字，无法作为位置的一节`);
  }
  return segment;
}

/** 去掉最后一个扩展名：command-engine.ts → command-engine，virtual-file-system.test.ts → virtual-file-system.test。 */
function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot <= 0 ? fileName : fileName.slice(0, dot);
}

/** 标题取破折号前那半句；没有破折号就取第一个逗号前那半句；都没有就整句。 */
function moduleTitle(moduleLine: string): string {
  for (const separator of ["——", "，"]) {
    const at = moduleLine.indexOf(separator);
    if (at > 0) return moduleLine.slice(0, at).trim();
  }
  return moduleLine;
}

/**
 * 扫描仓库里的源码，把每个带注释块的文件登记成一个模块。
 *
 * 位置是照着源码的真实层级算出来的，不是谁手写的：core/terminal/command-engine.ts
 * 变成 /internals/core/terminal/command-engine。这样这棵讲解树和仓库长得一模一样，
 * 你在网站上走到哪一层，就知道去仓库的哪个文件夹找它。
 */
function scanModules(courseIds: string[]): ModuleEntry[] {
  const files: string[] = [];
  collectSourceFiles(REPO_ROOT, files);

  const modules: ModuleEntry[] = [];
  for (const file of files) {
    const comment = readDocComment(readFileSync(join(REPO_ROOT, file), "utf8"), file);
    if (comment === null) continue; // 没有注释块的文件不是教材的一章，跳过它不是错误

    const parts = file.split("/");
    const fileName = parts.pop() ?? "";
    const segments = [
      ...parts.map((part) => toPathSegment(part, file)),
      toPathSegment(stripExtension(fileName), file),
    ];
    const path = `${INTERNALS_PATH}/${segments.join("/")}`;

    modules.push({
      id: segments.at(-1) ?? "",
      title: moduleTitle(comment.module),
      path,
      url: urlFromPath(path),
      categoryPath: path.slice(0, path.lastIndexOf("/")) || INTERNALS_PATH,
      file,
      courseIds: matchCourseIds(paragraphsToText(comment.courses), courseIds),
      comment,
    });
  }

  return modules;
}

/** 把一组段落接回一整段文字。认课程编号时只需要文字本身，不关心它原来分几段。 */
function paragraphsToText(paragraphs: DocComment["courses"]): string {
  return paragraphs
    .map((paragraph) => (paragraph.kind === "text" ? paragraph.text : paragraph.lines.join(" ")))
    .join("\n");
}

/**
 * 照着模块的位置，把它们头上那些目录生出来。
 *
 * 课程分类的目录是内容作者一个个建的文件夹，还配了 meta.json 写中文标题；
 * 源码这一支不一样——它的目录就是仓库里真实的文件夹，所以这里不做任何登记，
 * 而是从每个模块的位置倒推：/internals/core/terminal/command-engine 这一条，
 * 顺带就说明了 /internals/core 和 /internals/core/terminal 必须存在。
 *
 * 目录标题直接用文件夹名（core、terminal、commands）。给它们编一个中文名会好看一点，
 * 但那要么需要一份手写的对照表（每加一个文件夹就得回来登记，正是这个项目一直在躲的事），
 * 要么就得瞎猜。用真名还有个好处：你在网站上看到 core/terminal，去仓库里就能原样找到它。
 */
function buildInternalsDirectories(modules: ModuleEntry[]): CategoryEntry[] {
  const directories = new Map<string, CategoryEntry>();
  directories.set(INTERNALS_PATH, {
    id: INTERNALS_SEGMENT,
    title: INTERNALS_TITLE,
    description: INTERNALS_DESCRIPTION,
    path: INTERNALS_PATH,
    url: urlFromPath(INTERNALS_PATH),
    parentPath: ROOT_TREE_PATH,
    childPaths: [],
  });

  for (const module of modules) {
    // 去掉开头的 /internals 和结尾的模块自己，中间剩下的就是要确认的每一层目录。
    const segments = module.path.slice(INTERNALS_PATH.length + 1).split("/").slice(0, -1);
    let parentPath = INTERNALS_PATH;
    for (const segment of segments) {
      const path = `${parentPath}/${segment}`;
      if (!directories.has(path)) {
        directories.set(path, {
          id: segment,
          title: segment,
          description: "",
          path,
          url: urlFromPath(path),
          parentPath,
          childPaths: [],
        });
      }
      parentPath = path;
    }
  }

  // 每个目录里的东西按名字排，和真终端 ls 的默认顺序一致：目录和文件混在一起，不分开摆。
  for (const directory of directories.values()) {
    const children = [
      ...[...directories.values()]
        .filter((candidate) => candidate.parentPath === directory.path)
        .map((candidate) => candidate.path),
      ...modules.filter((module) => module.categoryPath === directory.path).map((module) => module.path),
    ];
    directory.childPaths = children.sort();
  }

  return [...directories.values()];
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

  // 树里的每个位置只能住一样东西。源码目录名被规整过（[[...slug]] → slug），
  // 万一两个不同的文件夹规整成同一个名字，必须当场说清楚是哪两个，而不是让后来的悄悄盖掉前面的。
  const occupied = new Map<string, string>();
  for (const entry of [...index.categories, ...index.courses, ...index.modules]) {
    // 出问题时人要能一眼认出是谁：文件有路径就报路径，目录只能报它的标题。
    const who = "file" in entry ? entry.file : entry.title;
    const previous = occupied.get(entry.path);
    if (previous !== undefined) {
      throw new ContentError(entry.path, `这个位置上有两样东西：${previous}，以及 ${who}`);
    }
    occupied.set(entry.path, who);
  }

  // 每样东西头上那一层必须真的存在，否则终端走到一半会发现脚下没有地板。
  for (const module of index.modules) {
    if (!occupied.has(module.categoryPath)) {
      throw new ContentError(module.file, `它所在的目录 ${module.categoryPath} 不在清单里`);
    }
  }
}

function buildKnowledgeIndex(): KnowledgeIndex {
  const result: ScanResult = { categories: [], courses: [] };
  scanDirectory(join(REPO_ROOT, CONTENT_DIR), ROOT_TREE_PATH, null, result);
  const modules = scanModules(result.courses.map((course) => course.id));

  // 源码讲解是这棵树的第二支，挂在根下面，和课程分类并列——
  // 这本教材的正文就在源码里，它不是某个课程分类的附属品。
  const root = result.categories.find((category) => category.path === ROOT_TREE_PATH);
  if (root === undefined) throw new Error("内容目录里没有根分类");
  root.childPaths.push(INTERNALS_PATH);

  const index: KnowledgeIndex = {
    version: KNOWLEDGE_INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    sourceDir: CONTENT_DIR,
    categories: [...result.categories, ...buildInternalsDirectories(modules)],
    courses: result.courses,
    modules,
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
    `知识索引已生成：${OUTPUT_FILE}（目录 ${index.categories.length} 个，课程 ${index.courses.length} 门，源码模块 ${index.modules.length} 个）`,
  );
}

main();
