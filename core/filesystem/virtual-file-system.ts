/**
 * @module        虚拟文件系统——把知识索引变成一棵“能用路径访问”的树
 * @problem       知识索引是两张平表：一张分类、一张课程，每条记录自带一个 path 字符串。
 *                但终端里的人不会说“请给我 path 等于 /systems/operating-systems 的那条记录”，
 *                他会站在 /systems 里敲 cd operating-systems，或者敲 cd ..、cd ~、cd ../mathematics。
 *                也就是说：需要有人把“我在哪 + 我想去哪”这两个信息，算成一个确定的位置，
 *                再回答那个位置到底存不存在、里面有什么。这件事就是这个文件干的。
 * @design        做成一个不保存任何状态的模块：createVirtualFileSystem 收下索引，返回一组查询函数，
 *                每次调用都要把“当前在哪”当参数传进来，模块自己绝不记住当前目录。
 *                这是本项目的一条硬规矩——当前位置的唯一真相是浏览器地址栏，谁都不许再存一份副本。
 *                这里有两个层次分得很清楚，别混：
 *                （1）resolvePath 只做字符串演算——把 . 和 .. 折叠掉，算出“这串字面上指哪”，不查任何东西；
 *                （2）lookup 才是真正的查找——它从起点一层一层往下走，每走一步都确认那一层真的存在、
 *                     并且真的是个目录。之所以不能图省事让 lookup 直接拿 resolvePath 的结果去查表，
 *                     是因为字符串折叠会把错误一起抹平：/不存在/.. 折完变成 /，于是“存在”，
 *                     而真终端会明明白白告诉你 cd: /不存在/..: No such file or directory。
 *                查不到的时候返回一个 { found: false } 的结果对象，而不是抛异常、也不是返回 null：
 *                调用方（终端命令）需要把“没找到”变成一句和真 Unix 一模一样的报错，
 *                结果对象里带着它需要的全部材料——哪一层出的问题、是“没这个东西”还是“它不是目录”。
 * @courses       UC Berkeley CS61B（树、映射表、按路径查找）；MIT 6.S081 与 UCB CS162（文件系统：路径名解析、
 *                . 与 .. 是目录里真实存在的条目、ENOENT 与 ENOTDIR）；Harvard CS50x Week 5（数据结构）；
 *                MIT Missing Semester（shell 里的路径、~、相对路径）；MIT 6.042J（树是一种特殊的图）
 * @exercises     https://pdos.csail.mit.edu/6.S081/2021/labs/fs.html      —— 亲手实现一层文件系统，会写到 namei
 *                https://sp21.datastructur.es/materials/proj/proj2/proj2  —— 用树和映射表组织数据
 *                https://missing.csail.mit.edu/2020/course-shell/         —— 先把路径在真终端里用熟
 *                https://cs50.harvard.edu/x/psets/5/                      —— 指针、结构、查找表
 * @prereq        知道文件夹里可以放文件夹；在真终端里见过 cd 和 ..；知道字符串可以按字符切开。
 * @unclear       真 shell 还分“逻辑模式”和“物理模式”（cd 与 cd -P），区别只在有符号链接时才看得见。
 *                这棵树里没有符号链接，所以两种模式在这里的结果一样，本模块不提供这个开关。
 *                另外目前只支持 ~ 展开成课程树的根，不支持 ~someone 这种“别人的家目录”写法
 *                （那在这里没有意义，会被当成一个普通名字，于是找不到）。
 *                通配符（ls *.md 里的 *）也还没有，那要等 ROADMAP 阶段 10 讲 find / grep 时再决定放在哪一层做。
 *
 * @letter
 * 这个文件里没有一个真的文件。我们管它叫“文件系统”，是因为它借用了文件系统那套操作方式——
 * 目录、路径、cd、ls——但它管理的东西是课程和分类。为什么要借这套？因为你在这里练熟的操作，
 * 到了真的终端里一模一样能用。这本教材希望你带走的东西里，这是最实用的一件。
 *
 * 先说清楚它到底解决什么问题。索引里的每门课都带着一个位置，比如 /systems/operating-systems/mit-6-s081。
 * 如果你已经站在 /systems，想去操作系统那一格，你会敲 cd operating-systems——注意你没有写全那一长串。
 * 于是有人得把“我现在在 /systems”和“我想去 operating-systems”拼成完整的位置。这个动作叫路径解析。
 * 规则一共就四条，真终端也是这四条：
 *
 *   1. 以 / 开头的是绝对路径：从根开始算，不管你现在在哪。
 *   2. 不以 / 开头的是相对路径：从你现在的位置往下接。
 *   3. 一个点 . 表示“就是这里”。
 *   4. 两个点 .. 表示“上一层”。根目录再往上还是根目录——这不是偷懒，真的 Unix 也是这样：
 *      / 的 .. 就是 /，你没法从根目录再往上走。
 *
 * 另外还有一个 ~，它在真终端里表示“你的家目录”。这棵知识树没有“用户”这个概念，所以我们让 ~ 指向树根，
 * 也就是课程目录的最顶上。这样 cd ~ 的含义仍然是“回到我熟悉的那个起点”，和你在真终端里的直觉一致。
 *
 * ——上面这些都不难。真正值得你花三分钟的是下面这件事，因为我第一版就在这里写错了。
 *
 * 处理 .. 有两种做法。第一种是纯字符串演算：把路径切成一段一段，遇到 .. 就把前面那段扔掉，
 * 算完再看结果存不存在。它写起来只要五行，看上去也很对。第二种是一步一步走：
 * 从起点出发，每遇到一段就真的进去一层，进不去就当场停下。
 *
 * 只要沿途每一层都存在，这两种做法的结果完全一样。差别只出现在“沿途有一层不存在”的时候：
 *
 *     /不存在的分类/..
 *
 * 字符串演算会把 /不存在的分类 和 .. 一起抵消掉，得到 /，然后高高兴兴地说：这个路径存在。
 * 但你在真终端里敲同样的东西，得到的是：
 *
 *     cd: /不存在的分类/..: No such file or directory
 *
 * 真 Unix 为什么严格？因为在真的文件系统里，.. 不是一个书写符号，它是每个目录里真实存在的一条记录，
 * 指向上一层。内核解析路径时是一层一层走的（这段代码在 Unix 里有个名字叫 namei），
 * 它必须先真的进入“不存在的分类”，才能读到那里面的 ..——而它根本进不去，所以就报错了。
 * 同理，如果路径中间那一层是个文件而不是目录，报的是另一句：
 *
 *     cd: /programming-intro/cs61a/..: Not a directory
 *
 * 因为文件里面没有 .. 这条记录，文件根本没有“里面”。
 *
 * 我一开始只写了字符串演算那一版，于是这个终端会悄悄接受一堆真终端不接受的路径。
 * 这类差别很容易被当成小事——反正最后落到的位置是对的嘛。但这本教材的整个立足点是：
 * 你在这里养成的手感，将来要能原样搬到真终端去。一个会替你把错误抹平的练习场，
 * 教出来的就是一个到了真环境就失效的习惯，而且失效的时候你还不知道为什么。
 * 报错必须和真的一样，报错的时机也必须和真的一样。
 *
 * 所以现在的分工是：resolvePath 保留纯字符串演算，因为算网址、显示提示符这些场合确实只需要算字面；
 * 而 lookup 一步一步走，每一步都验。你在下面会看到 walk 这个函数，那三十行就是这条规矩的全部实现。
 *
 * 最后一件事，比上面所有细节都重要：这个模块不记住你在哪。
 *
 * 直觉上，“文件系统”应该有个变量叫 currentDirectory，cd 的时候改它，ls 的时候读它。几乎所有教程都这么写。
 * 但这个网站有两套操作方式：你可以敲 cd 走，也可以用鼠标点侧边栏走。如果模块自己存一份“当前目录”，
 * 那么鼠标点过之后，这份副本就和浏览器地址栏对不上了——除非我们再写一段代码，让两边互相通知。
 * 而“互相通知”这件事，一旦有两个来源，就会出现循环（A 通知 B，B 又通知 A）和竞争（谁最后说了算），
 * 这类 bug 极难查。
 *
 * 所以这个项目选了另一条路：当前位置只有一个真相——浏览器地址栏。
 * 终端要知道你在哪，就去读地址栏；鼠标点了链接，地址栏自己就变了，终端下次读到的自然是新的。
 * 两边不需要互相通知，因为它们本来就在看同一块表。这个模块因此被写成“无状态”的：
 * 你每次问它问题，都要把“我在哪”一起告诉它。这看起来啰嗦了一点点，换来的是整个系统里
 * 少了一类根本不会发生的 bug。你以后会反复遇到这个取舍，它有个通俗的说法：
 * 与其同步两份数据，不如让它们只有一份。
 */
import type { CategoryEntry, CourseEntry, KnowledgeIndex } from "../knowledge/knowledge-index.ts";

/** 知识树的根。 */
export const ROOT_PATH = "/";
/** ~ 展开成什么。这棵树没有“用户”，所以家就是树根。 */
export const HOME_PATH = "/";

/** 一个分类，对应文件系统里的目录。 */
export type DirectoryNode = {
  kind: "directory";
  /** 这一层自己的名字（不含上级路径）；根目录是空字符串。 */
  name: string;
  /** 完整位置，例如 /systems/operating-systems。 */
  path: string;
  /** 中文标题。 */
  title: string;
  /** 分类简介；没有专门写过的分类是空字符串。 */
  description: string;
  /** 这个分类自己那张网页；没有就是 null。 */
  url: string | null;
  /** 上一层的位置；根目录是 null。 */
  parentPath: string | null;
  /** 里面直接放着的东西，顺序照内容里写的来。 */
  childPaths: string[];
  /** 索引里那条原始记录，需要更多字段时从这里取。 */
  category: CategoryEntry;
};

/** 一门课，对应文件系统里的文件。 */
export type FileNode = {
  kind: "file";
  /** 课程编号，例如 cs61a。 */
  name: string;
  /** 完整位置，例如 /programming-intro/cs61a。 */
  path: string;
  title: string;
  description: string;
  /** 这门课的网页地址。 */
  url: string;
  /** 所属分类的位置。 */
  parentPath: string;
  /** 索引里那条原始记录。 */
  course: CourseEntry;
};

export type VfsNode = DirectoryNode | FileNode;

/**
 * 查找失败的原因，照抄 Unix 的两句话。命令层会把它拼成
 * `cd: no such file or directory: xxx` 这样的报错。
 */
export type LookupFailureReason =
  /** 路径里某一层根本不存在。 */
  | "no such file or directory"
  /** 路径里某一层是个文件，后面却还想再往下走（文件没有“里面”）。 */
  | "not a directory";

/** 查找结果：要么找到了，要么明确地没找到——两种情况都是正常返回值。 */
export type LookupResult =
  | { found: true; path: string; node: VfsNode }
  | {
      found: false;
      /** 出问题的是哪一层，例如 /systems/os。报错时给人看这个最有用。 */
      path: string;
      /** 用户原样敲进来的东西。 */
      input: string;
      reason: LookupFailureReason;
    };

export type VirtualFileSystem = {
  /** 树根。 */
  root: DirectoryNode;
  /**
   * 纯字符串演算：把“当前在哪 + 想去哪”折叠成一个完整位置。
   * 它不检查任何一层是否存在，算出来的位置完全可能是空的——
   * 要知道存不存在，用 lookup。
   */
  resolvePath(currentPath: string, input: string): string;
  /** 直接按完整位置取一个节点；没有就返回 null。 */
  nodeAt(path: string): VfsNode | null;
  /** 一层一层走过去，每一步都验；失败时带回“哪一层、为什么”。 */
  lookup(currentPath: string, input: string): LookupResult;
  /** 列出一个目录里直接放着的东西。 */
  childrenOf(directory: DirectoryNode): VfsNode[];
};

/** 把路径切成一段一段，顺手扔掉空段（这样 //a/ 和 /a 切出来一样）。 */
function splitSegments(path: string): string[] {
  return path.split("/").filter((segment) => segment !== "");
}

/** 处理开头的 ~：单独一个 ~ 就是家，~/后面还有东西就把 ~ 换成家。 */
function expandHome(input: string): string {
  if (input === "~") return HOME_PATH;
  if (input.startsWith("~/")) {
    const rest = input.slice(1); // 留下 "/后面的部分"
    return HOME_PATH === ROOT_PATH ? rest : `${HOME_PATH}${rest}`;
  }
  return input;
}

/** walk 的结果：走到了某个节点，或者卡在某一层。 */
type WalkOutcome =
  | { ok: true; node: VfsNode }
  | { ok: false; path: string; reason: LookupFailureReason };

/**
 * 用一份知识索引造出一棵可以按路径访问的树。
 *
 * 造树的办法很朴素：把索引里的每一条记录，按它的 path 放进一张查找表（Map）。
 * 之后“这个位置有东西吗”就变成“表里有没有这个键”，一次查表就有答案。
 * 注意这张表只用来回答“某个完整位置上有什么”，它替代不了一层层走——
 * 原因见文件顶部那封信里关于 /不存在/.. 的那一段。
 */
export function createVirtualFileSystem(index: KnowledgeIndex): VirtualFileSystem {
  const nodes = new Map<string, VfsNode>();

  for (const category of index.categories) {
    nodes.set(category.path, {
      kind: "directory",
      name: category.path === ROOT_PATH ? "" : category.id,
      path: category.path,
      title: category.title,
      description: category.description,
      url: category.url,
      parentPath: category.parentPath,
      childPaths: category.childPaths,
      category,
    });
  }

  for (const course of index.courses) {
    nodes.set(course.path, {
      kind: "file",
      name: course.id,
      path: course.path,
      title: course.title,
      description: course.description,
      url: course.url,
      parentPath: course.categoryPath,
      course,
    });
  }

  const rootCandidate = nodes.get(ROOT_PATH);
  if (rootCandidate === undefined || rootCandidate.kind !== "directory") {
    // 这属于“程序坏了”那一类：索引本身不完整，继续往下跑只会让错误跑得更远。
    throw new Error("知识索引里没有根分类，无法建立虚拟文件系统");
  }
  // 上面确认过之后再单独取个名字，下面几个函数才都能确定它是目录节点。
  const root: DirectoryNode = rootCandidate;

  function resolvePath(currentPath: string, input: string): string {
    const expanded = expandHome(input.trim());
    // 绝对路径从根开始算，相对路径接在当前位置后面。
    const start = expanded.startsWith("/") ? [] : splitSegments(currentPath);
    const result: string[] = [];
    for (const segment of [...start, ...splitSegments(expanded)]) {
      if (segment === ".") continue; // “就是这里”，什么都不用做
      if (segment === "..") {
        result.pop(); // 已经在根上时 pop 什么也不做，于是 /.. 还是 /
        continue;
      }
      result.push(segment);
    }
    return result.length === 0 ? ROOT_PATH : `/${result.join("/")}`;
  }

  /**
   * 从一个节点出发，按顺序把每一段路走一遍。这是这个文件的核心。
   *
   * 每走一步只做三件事：先确认脚下这层是目录（不是目录就没有“里面”，报 not a directory），
   * 再看这一段是 . 、.. 还是一个名字，最后确认要去的地方真的存在（不存在就报 no such file or directory）。
   * 因为每一步都验，所以像 /不存在/.. 这种路径会在第一步就停下，而不是被折叠成 / 蒙混过关。
   */
  function walk(from: VfsNode, segments: string[]): WalkOutcome {
    let node = from;
    for (const segment of segments) {
      if (node.kind !== "directory") {
        // 走到一半发现脚下是个文件，后面还想再往下——真 Unix 在这里报 Not a directory。
        return { ok: false, path: node.path, reason: "not a directory" };
      }
      if (segment === ".") continue;
      if (segment === "..") {
        // 根目录的上一层还是根目录。
        const parent = node.parentPath === null ? node : nodes.get(node.parentPath);
        if (parent === undefined || parent.kind !== "directory") {
          throw new Error(`知识索引不一致：${node.path} 的上一层 ${node.parentPath} 不存在`);
        }
        node = parent;
        continue;
      }
      const childPath = node.path === ROOT_PATH ? `/${segment}` : `${node.path}/${segment}`;
      const child = nodes.get(childPath);
      if (child === undefined) {
        return { ok: false, path: childPath, reason: "no such file or directory" };
      }
      node = child;
    }
    return { ok: true, node };
  }

  function nodeAt(path: string): VfsNode | null {
    return nodes.get(path) ?? null;
  }

  function lookup(currentPath: string, input: string): LookupResult {
    const trimmed = input.trim();
    const expanded = expandHome(trimmed);

    // 相对路径要先把“当前在哪”本身走一遍——它同样可能是个不存在的位置。
    let start: VfsNode = root;
    if (!expanded.startsWith("/")) {
      const from = walk(root, splitSegments(currentPath));
      if (!from.ok) return { found: false, path: from.path, input: trimmed, reason: from.reason };
      start = from.node;
    }

    const outcome = walk(start, splitSegments(expanded));
    if (!outcome.ok) {
      return { found: false, path: outcome.path, input: trimmed, reason: outcome.reason };
    }

    // 以 / 结尾的路径，按 POSIX 的规定必须指向目录：cat /etc/passwd/ 在真 Unix 里也是 Not a directory。
    if (expanded.endsWith("/") && outcome.node.kind !== "directory") {
      return {
        found: false,
        path: outcome.node.path,
        input: trimmed,
        reason: "not a directory",
      };
    }

    return { found: true, path: outcome.node.path, node: outcome.node };
  }

  function childrenOf(directory: DirectoryNode): VfsNode[] {
    return directory.childPaths.map((childPath) => {
      const child = nodes.get(childPath);
      if (child === undefined) {
        // 索引自己前后矛盾，属于“程序坏了”。
        throw new Error(`知识索引不一致：${directory.path} 里写着 ${childPath}，但索引中没有这一项`);
      }
      return child;
    });
  }

  return { root, resolvePath, nodeAt, lookup, childrenOf };
}
