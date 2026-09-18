/**
 * @module        知识索引的数据形状——一份描述“网站上有哪些分类、哪些课程、哪些源码模块”的清单长什么样
 * @problem       课程信息现在分散在几十个内容文件里：标题在 MDX 的开头，分类名在 meta.json，
 *                谁在谁下面靠文件夹表示。终端要回答“当前位置下有什么”“这门课的先修是什么”，
 *                如果每次都去翻文件，答案会因为翻法不同而不一致，也没法在浏览器里使用。
 *                源码模块是同一个问题的第二半：这本教材的正文写在源文件顶部的注释里，
 *                浏览器同样看不见你的磁盘，所以它们也要在构建时被汇总进同一份清单。
 *                所以需要先约定一份统一清单的样子，构建时把散落的信息汇总进去。
 * @design        清单做成三张“平表”（categories、courses、modules）而不是一棵嵌套的树：
 *                每条记录自带自己的路径，父子关系用路径字符串表达。
 *                理由是平表容易生成、容易比对、容易人眼检查，而树只是它的一种视图——
 *                真正的树在 core/filesystem 里由这份清单现算出来（见 [[virtual-file-system]] 的说法）。
 *                考虑过的另一种做法是直接生成嵌套 JSON，但那样“新增一门课”要改的地方会变多，
 *                而且同一份数据在文件里只有一种排列顺序，将来想按别的方式组织就得重新生成。
 *                课程和模块分成两张表而不是合并成一张“文件表”：它们在树里的地位相同（都是文件），
 *                但字段完全不同——课程有先修、模块有那封信，硬塞进一张表会得到一堆半空的格子。
 * @courses       UC Berkeley CS61B（数据的表示与树）；CMU 15-445 与 UCB CS186（索引、模式、规范化）；
 *                MIT 6.042J（关系与偏序，先修关系就是一种偏序）；Harvard CS50x Week 5（数据结构入门）
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2
 *                https://15445.courses.cs.cmu.edu/fall2023/project1/
 *                https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-spring-2015/pages/assignments/
 * @prereq        知道“类型”是在描述一份数据允许有哪些字段；知道 JSON 是一种存数据的文本格式。
 * @unclear       modules 里的 courseIds 是构建时从 @courses 那段散文里“认”出来的（见 [[cross-reference]]），
 *                认的办法是找课程编号在不在那段话里出现过。写了课名却没写编号的课连不上线，
 *                这是这条规则已知的边界，不是偶发的 bug。
 *                另外 version 字段现在只是一个数字，还没有真正的版本迁移逻辑：
 *                读的一方不会检查它，也不会因为版本不认识而拒绝加载。
 *
 * @letter
 * 这个文件里一行会真正“执行”的代码都没有，它全是类型声明——也就是“约定”。
 *
 * 你可以把它想成一张空白表格的表头。表头写着“课程编号、标题、所在分类、先修”，
 * 谁来填表都得按这些格子填。TypeScript 的类型就是这种表头：写代码的时候，
 * 编辑器会照着它提醒你少填了哪一格、填错了哪一格；等程序真正跑起来，这些声明会被完全抹掉，
 * 一点重量都不占。所以这里定的不是功能，是纪律。
 *
 * 为什么要专门腾出一个文件来定这份纪律？因为这份清单有两个“对接口”：
 * 一边是 scripts/build-knowledge-index.ts，它读内容文件、往清单里写；
 * 另一边是虚拟文件系统和终端，它们读清单、往外用。
 * 如果没有中间这张表头，两边就会各自记一套字段名，某天一边改了名字，另一边悄悄地读到 undefined，
 * 而这种错通常不会当场报错，只会让页面上少一行东西——最难查的就是这种。
 *
 * 有两个字段值得你多看一眼。
 *
 * 一个是 path 和 url 为什么要分开存。path 是这棵知识树里的位置，像 /systems/operating-systems，
 * 终端的 cd 和 ls 用它；url 是浏览器地址栏里的东西，像 /docs/systems/operating-systems，
 * 点击跳转用它。它们现在长得很像，只差一个前缀，但它们回答的是两个不同的问题：
 * “这份知识在体系里的位置”和“这张网页放在网站的哪里”。合成一个字段当然更省事，
 * 可一旦将来网站换了地址结构（比如去掉 /docs），知识树的位置本不该跟着变，
 * 到时候就会发现两件事早就缠在一起了。分开写只多一个字段，却省掉一次翻修。
 *
 * 另一个是 prereq 为什么允许是 null。null 表示“这门课的先修我们还没整理”，
 * 而 {courses: [], knowledge: []} 表示“整理过了，确认没有先修”。
 * 这两件事在数据里必须分得开：前者是待办，后者是结论。把“不知道”和“没有”混成同一个空值，
 * 是数据设计里最常见也最贵的一种偷懒——将来你想问“还有哪些课没整理先修”，就再也问不出来了。
 * 这也呼应这本教材的一条规矩：不确定就老实写不确定，别硬凑。
 *
 * 最后提醒一句免得你误会：先修（prereq）不是学习路径。
 * 先修是课程官方说的“想上这门课，你得先会什么”，它是课程自带的属性；
 * 学习路径是你自己决定的“我打算按什么顺序学”，那是你的东西，存在你自己的浏览器里，
 * 永远不会写进这份清单。这份清单只描述知识本身，不替任何人排课。
 *
 * ——上面那些是这份清单最早的样子。从 ROADMAP 阶段 5 起它多了一张表，我补一段说说为什么。
 *
 * 这本教材的设定是：课程是目录，项目源码和它顶上的注释才是正文。可在阶段 5 之前，
 * 清单里只有目录，没有正文——网站知道有 CS61A 这门课，却完全不知道自己的源码里写着什么。
 * 于是那些注释只有打开源文件的人读得到，而这恰恰是这本教材里最该被读到的部分。
 * modules 这张表就是把正文也登记进来：每个带注释块的源文件一条记录，
 * 标题、那封信、对应课程、官方作业，全部来自文件顶部那段注释，没有第二份手抄稿。
 *
 * courseIds 那个字段值得单独说一句。它是构建时从 @courses 那段话里认出来的课程编号，
 * 而不是作者在别处另外维护的一份对应表。这个区别是整条“课程 ↔ 代码双向跳转”能立住的原因：
 * 你改注释里的一句话，网站上两个方向的链接同时跟着变；要是那份对应表另存一处，
 * 它和注释迟早会各说各话，而且你不会知道哪一份是对的。
 *
 * 至于 categories 现在同时装着“课程分类”和“源码目录”这两种东西——它们的来源不同，
 * 一个来自 content/docs 的文件夹，一个照着仓库真实的源码目录生成。但对下游只有一句话的差别：
 * 目录就是目录。与其为了名字上的纯洁再造一张几乎一样的表，不如让虚拟文件系统只认识一种目录。
 */

import type { DocComment } from "./doc-comment.ts";

/**
 * 清单格式的版本号。将来字段变了就把它加一，读的一方可以据此判断“我认不认识这份文件”。
 * 现在还没有任何迁移逻辑，它的作用是让将来那个改格式的人先看到这里。
 *
 * 2：多了 modules 这张表，categories 从“课程分类”扩大成“树里的所有目录”。
 */
export const KNOWLEDGE_INDEX_VERSION = 2;

/**
 * 源码讲解那一支挂在树的哪个位置。
 *
 * 课程分类来自 content/docs 里的文件夹，这一支不一样：它是照着仓库里的源码目录现生成的，
 * 内容目录里没有对应的文件夹。名字用英文，和其他目录一致（中文标题在下面那个常量里）。
 */
export const INTERNALS_PATH = "/internals";
/** 源码讲解那一支在侧边栏和目录页上显示的标题。 */
export const INTERNALS_TITLE = "项目源码讲解";
/** 源码讲解那一支的一句话简介。 */
export const INTERNALS_DESCRIPTION =
  "这本教材的正文：项目自己的每一个核心文件，以及写在它顶上的那封信。";

/** 一个位置是不是在源码讲解那一支里。判断规则只写这一处，免得四个地方各拼一遍前缀。 */
export function isInternalsPath(path: string): boolean {
  return path === INTERNALS_PATH || path.startsWith(`${INTERNALS_PATH}/`);
}

/** 一门课的先修要求。分成两类，因为它们能做的事不一样。 */
export type CoursePrerequisites = {
  /**
   * 先修中“本站已经收录了对应课程”的部分，存的是课程 id（比如 "cs61a"）。
   * 因为能对上具体课程，将来可以直接生成一个点得过去的链接。
   */
  courses: string[];
  /**
   * 先修中“本站没有对应课程页”的部分，存的是一句人话（比如 "C 语言"、"基础代数"）。
   * 硬要把它塞成某门课的 id 就是编造，所以老实存成文字。
   */
  knowledge: string[];
};

/** 一门课在清单里的样子。 */
export type CourseEntry = {
  /** 课程编号，取自文件名（cs61a.mdx → "cs61a"）。全站不允许重复，构建时会检查。 */
  id: string;
  /** 课程标题，取自内容文件开头的 title。 */
  title: string;
  /** 一句话简介，取自内容文件开头的 description。 */
  description: string;
  /** 在知识树里的位置，例如 "/programming-intro/cs61a"。终端用它。 */
  path: string;
  /** 对应网页的地址，例如 "/docs/programming-intro/cs61a"。点击跳转用它。 */
  url: string;
  /** 所属分类的 path，例如 "/programming-intro"。 */
  categoryPath: string;
  /** 先修要求；null 表示“还没整理”，空数组表示“整理过，确认没有”。 */
  prereq: CoursePrerequisites | null;
  /** 内容文件相对仓库根目录的位置，方便从清单回头找到源文件。 */
  file: string;
};

/** 一个分类（也就是内容目录里的一个文件夹）在清单里的样子。 */
export type CategoryEntry = {
  /** 分类编号，取自文件夹名（"operating-systems"）。根分类是空字符串。 */
  id: string;
  /** 分类中文标题，取自该文件夹里的 meta.json。 */
  title: string;
  /** 分类简介；只有该文件夹自带 index 页面时才有，否则是空字符串。 */
  description: string;
  /** 在知识树里的位置，例如 "/systems/operating-systems"；根分类是 "/"。 */
  path: string;
  /** 分类自己那张页面的地址；没有 index 页面的分类是 null。 */
  url: string | null;
  /** 上级分类的 path；根分类是 null。 */
  parentPath: string | null;
  /**
   * 这个分类下面直接放着的东西（子分类和课程混在一起），顺序照 meta.json 里 pages 的写法。
   * 存的是 path，要知道某一项到底是分类还是课程，去 categories / courses 两张表里查它。
   * 之所以只留一份合并后的顺序，是因为一个分类里“子分类和课程谁排在谁前面”是内容作者的决定，
   * 拆成两份就把这个决定弄丢了。
   */
  childPaths: string[];
};

/**
 * 一个源码模块在清单里的样子——也就是一个带注释块的源文件。
 *
 * 它在这棵树里的地位和课程一样是“文件”：能被 ls 列出来、能 cat、能 open。
 * 区别只在于课程来自 content/docs 里的 MDX，而模块来自仓库里真实的源码文件。
 */
export type ModuleEntry = {
  /**
   * 模块编号，取自源文件名（command-engine.ts → "command-engine"）。
   * 注意它和课程 id 不一样，**不保证全站唯一**：真实源码里本来就有两个 layout.tsx。
   * 唯一的是 path——就像真文件系统里同名文件可以住在不同目录。
   */
  id: string;
  /** 标题，取自 @module 里破折号前面那半句，例如“命令引擎”。 */
  title: string;
  /** 在知识树里的位置，例如 "/internals/core/terminal/command-engine"。 */
  path: string;
  /** 对应讲解页的地址。 */
  url: string;
  /** 所在目录的 path，例如 "/internals/core/terminal"。 */
  categoryPath: string;
  /** 源文件相对仓库根目录的位置，例如 "core/terminal/command-engine.ts"。 */
  file: string;
  /**
   * @courses 那段话里点到名的本站课程 id。
   * 它是构建时从散文里认出来的，不是作者另外手写的一份清单——所以改注释，链接就跟着变。
   * 认不出来的（比如本站没收录的 Stanford CS143）不会出现在这里，但原话仍然完整保留在 comment 里。
   */
  courseIds: string[];
  /** 注释块解析出来的全部内容，见 [[doc-comment]]。 */
  comment: DocComment;
};

/** 整份清单。构建时生成一次，之后只读。 */
export type KnowledgeIndex = {
  /** 见 KNOWLEDGE_INDEX_VERSION。 */
  version: number;
  /** 生成时刻，ISO 格式。作用只有一个：让你一眼看出这份文件是不是刚重新生成的。 */
  generatedAt: string;
  /** 扫描的内容目录，相对仓库根目录。 */
  sourceDir: string;
  /**
   * 树里的所有目录，含根目录；顺序是从上到下、从左到右走一遍的顺序。
   * 它既包含来自 content/docs 的课程分类，也包含源码讲解那一支下面的目录——
   * 因为对虚拟文件系统来说，目录就是目录，它不区分这个目录是从哪来的。
   */
  categories: CategoryEntry[];
  /** 所有课程；顺序同上。 */
  courses: CourseEntry[];
  /** 所有带注释块的源码模块；顺序同上。 */
  modules: ModuleEntry[];
};
