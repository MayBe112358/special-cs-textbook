/**
 * @module        注释块解析器——把源码顶部那封信读成程序能用的结构
 * @problem       这本教材的正文写在源码注释里：每个核心文件顶部有一段 @module / @courses / @letter 的块。
 *                人读它没问题，可程序要拿它做三件事——生成讲解页、把模块和课程连起来、让终端能 cat 它——
 *                就必须先把那段文字变成有字段、有段落的数据。另一条路是再手抄一份到别处，那是绝对不行的：
 *                抄本和原文迟早对不上，而且没人知道是哪天开始对不上的。
 * @design        写成一个纯函数模块：进去一段文件文本，出来一个结构；不读磁盘、不认识框架、不关心谁调用它。
 *                解析分三层，每层只做一件事：先找到那段块注释，再把每行前面的星号剥掉，最后按 @字段名 切开。
 *                字段名写死成一份白名单，遇到没见过的字段直接报错而不是忽略——理由和 frontmatter 那边一样：
 *                悄悄跳过一个拼错的字段，结果是讲解页上少一块内容，而你三个星期后才会发现。
 *                真正有讲究的只有段落：源码里的换行是为了让每行不超过一百来字，不是作者想在那儿断句，
 *                所以要把它们接回去；但空行分段、缩进的例子块必须原样留着。考虑过直接把整段原文塞给界面、
 *                用等宽预排版显示，那样最省事，可正文一进窄栏就会变成参差不齐的一列，教材的可读性是硬要求。
 * @courses       UC Berkeley CS61A（第 4 章：把文本读成有结构的数据）；Stanford CS143 与 UCB CS164
 *                （词法分析：把字符流切成有意义的记号，以及错误信息该怎么说）；
 *                MIT Missing Semester（文本处理与正则表达式）；软件工程类课程（单一事实来源）
 * @exercises     https://cs61a.org/                                   —— 解释器项目：从字符到结构
 *                https://web.stanford.edu/class/cs143/                —— 编译器 PA1：词法分析
 *                https://missing.csail.mit.edu/2020/data-wrangling/   —— 文本切分与正则表达式
 * @prereq        知道字符串可以按行切开；知道正则表达式是一种“描述长什么样”的写法（这里只用到最简单的几种）。
 * @unclear       这个解析器认识的是本项目自己约定的那套字段，不是任何一种通用文档注释标准
 *                （Java 的 Javadoc、JavaScript 的 JSDoc 都长得像，但字段名和语义都不一样）。
 *                它也不理解 Markdown：@letter 里写的 **加粗** 会原样显示成星号。
 *                段落规则里的“缩进四格算例子块”是从现有注释归纳出来的，不是事先定好的规范；
 *                将来如果有人在信里写更复杂的排版，这条规则要么被写进 AGENTS.md 变成明文约定，要么就得放宽。
 *
 * @letter
 * 你正在读的这段话，就是这个文件要解析的东西。这件事听起来有点绕，所以我从头说。
 *
 * 这个项目有一条不太常见的设定：课程页面是目录，源代码和它顶上的注释才是正文。你现在读的这封信
 * 就是正文的一段。既然是正文，它就不该只躺在编辑器里等人打开源文件——它应该能变成网站上的一页，
 * 能被终端 cat 出来，能和课程互相链接。要做到这些，得先有人把这段文字读懂。这个文件就是那个人。
 *
 * 它做的事分三层，每一层都简单得可以单独讲清楚。
 *
 * 第一层，找到这段注释。程序拿到的是整个文件的文本，它得先认出“从 /** 到 * /（去掉空格）这一段是块注释”，
 * 而且是带 @module 的那一段——因为文件里别处也可能有块注释。
 *
 * 第二层，把每行开头的星号剥掉。你在编辑器里看到每行前面那个 * 是给人看的对齐符号，不是内容。
 *
 * 第三层，按字段切开。凡是以 @ 加一个词开头的行，就是一个新字段的开始，到下一个 @ 为止都算它的值。
 * 这一层和真正的编译器做的事是同一类：把一段没有结构的字符，切成一个个有意义的部分。
 * 编译原理课把它叫词法分析，CS61A 的解释器项目让你亲手写一遍。区别只是它们处理的是程序，这里处理的是散文。
 *
 * 三层里唯一让我改了两遍的是段落。第一版我把每行原样保留，结果讲解页上的正文变成了一列硬邦邦的短行——
 * 因为源码里的换行是为了让每行不超过一百来字，不是我想在那儿断句。窗口一窄，读起来就断得莫名其妙。
 * 第二版我把所有行都接成一整段，结果信里那些缩进的例子（比如报错样例）也被卷进段落，全毁了。
 *
 * 现在的规则是从已经写好的注释里归纳出来的三条：空行分段；段首缩进四格以上的算例子块，原样保留；
 * 其余的接回一整段。接的时候还有个小讲究：中文之间直接接上，英文单词之间要留一个空格，
 * 不然 "npm run" 会被接成 "npmrun"。这种细节不写进代码，读者就会在页面上看到一堆挤在一起的怪词。
 *
 * 最后说一句这个文件为什么这么较真地在遇到不认识的字段时直接报错。
 * 假设有人把 @exercises 敲成了 @exercise，宽容的做法是当没看见——于是那一页的“官方作业”一栏空了，
 * 而作者以为自己写了。报错很吵，但它吵在正确的时间：就在你刚敲错的那一刻，而不是三个月后某个读者
 * 发现少了一块内容的时候。这条取舍在这个项目里出现过不止一次，你在 scripts/build-knowledge-index.ts
 * 那封信里会看到同一句话的另一种说法。
 */

/**
 * 注释块里允许出现的字段，顺序就是它们在文件顶部出现的顺序。
 * 这份名单是 AGENTS.md 第 1.1 节那套约定的机器版本：那边写给人看，这里写给程序看。
 */
export const DOC_COMMENT_FIELDS = [
  "module", // 这个文件是什么、干什么用的
  "problem", // 它解决什么问题
  "design", // 为什么这样设计
  "courses", // 对应哪些课程的哪些知识
  "exercises", // 哪些课程官方作业能练到这块
  "prereq", // 读懂这里需要先学什么
  "unclear", // 哪里还没讲透
  "letter", // 写给未来读者的正文
] as const;

export type DocCommentField = (typeof DOC_COMMENT_FIELDS)[number];

/**
 * 一段正文。文字段落已经把源码里的软换行接了回去；例子块保留原来的每一行。
 * 界面看 kind 决定画成一段话还是一块等宽文本——命令与数据只说“这是什么”，不说“长什么样”。
 */
export type Paragraph =
  | { kind: "text"; text: string }
  | { kind: "block"; lines: string[] };

/** @exercises 里的一条：一个官方作业链接，外加一句“它练的是本模块的哪部分”。 */
export type DocCommentExercise = {
  /** 作业链接；写的不是网址时是 null。 */
  url: string | null;
  /** 链接后面那句说明；没写就是空字符串。 */
  note: string;
};

/** 一个注释块被解析出来的全部内容。 */
export type DocComment = {
  /** @module 那一行，例如“命令引擎——收下你敲的那一行字，交回一组结果”。 */
  module: string;
  problem: Paragraph[];
  design: Paragraph[];
  /** @courses 的原话。它是散文，不是编号列表——要连线到具体课程见 [[cross-reference]]。 */
  courses: Paragraph[];
  exercises: DocCommentExercise[];
  prereq: Paragraph[];
  unclear: Paragraph[];
  /** 写给未来读者的正文。这是整块注释里最重要的一段。 */
  letter: Paragraph[];
};

/** 解析出错时统一带上出错位置，让人一眼知道该去改哪个文件。 */
export class DocCommentError extends Error {
  constructor(where: string, message: string) {
    super(`${where}: ${message}`);
    this.name = "DocCommentError";
  }
}

/** 段首缩进达到这么多格，就当成一段原样保留的例子。 */
const BLOCK_INDENT = 4;

/** 这些开头表示“新起一条”，即使上一行还没写完也要另开一段。 */
const LIST_MARKER = /^(?:[（(]\s*\d+\s*[)）]|[-*•·]\s|\d+[.、]\s)/;

/** 一行前面有几个空格。 */
function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** 一组行里最浅的缩进；全是空行时返回 0。 */
function commonIndent(lines: string[]): number {
  let smallest: number | null = null;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const indent = indentOf(line);
    if (smallest === null || indent < smallest) smallest = indent;
  }
  return smallest ?? 0;
}

/** 把一组行整体往左推，去掉它们共同的缩进（对齐用的空格不是内容）。 */
function dedent(lines: string[]): string[] {
  const amount = commonIndent(lines);
  return lines.map((line) => (line.trim() === "" ? "" : line.slice(amount)));
}

/** 判断一个字符是不是 ASCII 字母或数字。接行时要靠它决定加不加空格。 */
function isAsciiWordChar(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9]/.test(character);
}

/** 中文的全角标点。它们自带间距，接行时前后不该再补空格。 */
const FULLWIDTH_PUNCTUATION = /[，。；：、！？（）《》「」【】“”‘’…—·]/;

/**
 * 把两行接成一行。
 *
 * 中文之间直接接上；只要有一边是英文单词或数字，就补一个空格，否则
 * “敲 npm run dev 或 npm run build” 折行之后会变成 “npm run devnpm run build” 这种怪东西。
 * 但如果挨着的那个字符是中文标点，就不补——标点本身已经占了视觉上的间隔。
 */
function joinWrappedLines(left: string, right: string): string {
  if (left === "") return right;
  if (right === "") return left;
  const last = left.at(-1);
  const first = right.at(0);
  const needsSpace =
    (isAsciiWordChar(last) || isAsciiWordChar(first)) &&
    !FULLWIDTH_PUNCTUATION.test(last ?? "") &&
    !FULLWIDTH_PUNCTUATION.test(first ?? "");
  return needsSpace ? `${left} ${right}` : `${left}${right}`;
}

/**
 * 把一组行整理成段落。这是这个文件里唯一需要判断的地方，规则只有三条：
 *
 *   1. 空行分段。
 *   2. 段首缩进四格以上的，是作者刻意摆的例子，整段原样保留到下一个空行为止。
 *   3. 其余的接成一整段；碰到 “（1）”“- ”“1. ” 这类开头就另起一段，因为那明显是新的一条。
 *
 * 注意第 2 条只看段首那一行。段落中间的缩进是折行时为了对齐加的，不能当成新段落，
 * 否则一条写了两行的编号项会被拆成一段话加一个例子块。
 */
export function toParagraphs(lines: string[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    if (indentOf(line) >= BLOCK_INDENT) {
      const blockLines: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trim() !== "") {
        blockLines.push(lines[index] ?? "");
        index += 1;
      }
      paragraphs.push({ kind: "block", lines: dedent(blockLines) });
      continue;
    }

    let text = line.trim();
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? "";
      if (next.trim() === "") break;
      if (LIST_MARKER.test(next.trim())) break;
      text = joinWrappedLines(text, next.trim());
      index += 1;
    }
    paragraphs.push({ kind: "text", text });
  }

  return paragraphs;
}

/**
 * 在一段文件文本里找出那段带 @module 的块注释，返回它两端标记之间的内容。
 * 找不到就返回 null——一个文件没有注释块不是错误，它只是还没成为教材的一章。
 */
export function findDocCommentBlock(fileText: string): string | null {
  let from = 0;
  for (;;) {
    const start = fileText.indexOf("/**", from);
    if (start < 0) return null;
    const end = fileText.indexOf("*/", start + "/**".length);
    if (end < 0) return null;
    const block = fileText.slice(start + "/**".length, end);
    // 只认第一个真的写了 @module 的块；文件里别处的块注释一律跳过。
    if (/^\s*\*?\s*@module\b/m.test(block)) return block;
    from = end + "*/".length;
  }
}

/**
 * 把每行开头那个对齐用的星号剥掉。它是给人看的，不是内容。
 *
 * 顺手也把两端的 /** 和 * /（真写的时候中间没有空格）去掉：
 * findDocCommentBlock 交出来的已经是里面那一段，但直接把整段注释递进来也应该能解析，
 * 否则调用方就得记住“先掐头去尾再给我”这种没道理的规矩。
 */
function stripCommentStars(block: string): string[] {
  return block
    .replace(/^\s*\/\*\*/, "")
    .replace(/\*\/\s*$/, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*[ \t]?/, "").trimEnd());
}

/**
 * 按 @字段名 把内容切成一段一段。
 *
 * 规则：一行以 @ 加一个词开头就是新字段的开始，这一行剩下的部分是该字段的第一行，
 * 直到下一个 @ 为止的所有行都属于它。不认识的字段名当场报错，不猜也不跳过。
 */
function splitFields(lines: string[], where: string): Map<DocCommentField, string[]> {
  const known = new Set<string>(DOC_COMMENT_FIELDS);
  const fields = new Map<DocCommentField, string[]>();
  let current: DocCommentField | null = null;

  for (const line of lines) {
    const marker = /^@(\w+)[ \t]*(.*)$/.exec(line);
    if (marker === null) {
      if (current !== null) fields.get(current)?.push(line);
      continue; // @module 之前的空行不属于任何字段，丢掉
    }

    const name = marker[1] ?? "";
    if (!known.has(name)) {
      throw new DocCommentError(
        where,
        `不认识的字段 @${name}；可用字段：${DOC_COMMENT_FIELDS.map((field) => `@${field}`).join("、")}`,
      );
    }
    const field = name as DocCommentField;
    if (fields.has(field)) {
      throw new DocCommentError(where, `字段 @${field} 写了两次`);
    }
    fields.set(field, [marker[2] ?? ""]);
    current = field;
  }

  return fields;
}

/**
 * 取出一个字段的行，并且把折行时为了对齐加的缩进去掉。
 *
 * 第一行紧跟在 @字段名 后面，本来就没有缩进；后面几行为了在编辑器里对齐，
 * 全被推到了同一列。那些空格是排版，不是内容，所以要按它们共同的缩进整体往左推。
 */
function fieldLines(fields: Map<DocCommentField, string[]>, field: DocCommentField, where: string): string[] {
  const lines = fields.get(field);
  if (lines === undefined) {
    throw new DocCommentError(where, `缺少必填字段 @${field}`);
  }
  const [first = "", ...rest] = lines;
  return [first.trim(), ...dedent(rest)];
}

/** 一个字段有没有写出实际内容。全是空行就当没写。 */
function requireContent(paragraphs: Paragraph[], field: DocCommentField, where: string): Paragraph[] {
  if (paragraphs.length === 0) {
    throw new DocCommentError(where, `字段 @${field} 是空的；写不出来就老实写 unknown，别留白`);
  }
  return paragraphs;
}

/**
 * 解析 @exercises。
 *
 * 一行一条，也允许一行里用 ; 隔开写两条（现有注释里两种写法都有）。
 * 每一条的形状是“链接 —— 这个作业练的是本模块的哪部分”，后半句可以不写。
 */
function parseExercises(lines: string[], where: string): DocCommentExercise[] {
  const exercises: DocCommentExercise[] = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    for (const piece of line.split(/\s+;\s+/)) {
      const entry = piece.trim();
      if (entry === "") continue;
      if (!entry.startsWith("http")) {
        // 不是链接就整条当说明。习题一律用课程官方的，这里不替作者编一个链接出来。
        exercises.push({ url: null, note: entry });
        continue;
      }
      const parts = /^(\S+)(?:\s+——\s*(.*))?$/.exec(entry);
      if (parts === null) throw new DocCommentError(where, `看不懂这条作业：${entry}`);
      exercises.push({ url: parts[1] ?? "", note: (parts[2] ?? "").trim() });
    }
  }
  return exercises;
}

/** 把一组段落接回一句话，@module 那种本来就该是一行的字段用它。 */
function paragraphsToLine(paragraphs: Paragraph[]): string {
  return paragraphs
    .map((paragraph) => (paragraph.kind === "text" ? paragraph.text : paragraph.lines.join(" ")))
    .reduce(joinWrappedLines, "");
}

/** 把一段已经找出来的块注释解析成结构。where 只用于报错时指路。 */
export function parseDocComment(block: string, where: string): DocComment {
  const fields = splitFields(stripCommentStars(block), where);

  const module = paragraphsToLine(toParagraphs(fieldLines(fields, "module", where)));
  if (module === "") throw new DocCommentError(where, "字段 @module 是空的");

  return {
    module,
    problem: requireContent(toParagraphs(fieldLines(fields, "problem", where)), "problem", where),
    design: requireContent(toParagraphs(fieldLines(fields, "design", where)), "design", where),
    courses: requireContent(toParagraphs(fieldLines(fields, "courses", where)), "courses", where),
    exercises: parseExercises(fieldLines(fields, "exercises", where), where),
    prereq: requireContent(toParagraphs(fieldLines(fields, "prereq", where)), "prereq", where),
    unclear: requireContent(toParagraphs(fieldLines(fields, "unclear", where)), "unclear", where),
    letter: requireContent(toParagraphs(fieldLines(fields, "letter", where)), "letter", where),
  };
}

/**
 * 读一整个文件的文本：有注释块就解析它，没有就返回 null。
 *
 * “没有”和“写坏了”是两件事，所以这里的返回值只表示前者，后者一律抛错。
 * 这和知识索引里 prereq 用 null 区分“还没整理”和“确认没有”是同一种讲究。
 */
export function readDocComment(fileText: string, where: string): DocComment | null {
  const block = findDocCommentBlock(fileText);
  if (block === null) return null;
  return parseDocComment(block, where);
}
