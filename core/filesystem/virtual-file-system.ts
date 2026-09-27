/**
 * @module        虚拟文件系统——把知识索引变成一棵“能用路径访问”的树
 * @problem       知识索引是三张平表：目录、课程、源码模块，每条记录自带一个 path 字符串。
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
 * 先说个好玩的事：这个“文件系统”里一个真文件都没有。
 *
 * 它管的是课程、分类，还有这个项目自己的源码模块。叫它文件系统，是因为它借了文件系统那一套玩法：目录、路径、cd、ls。
 * 为什么要借？因为你在这儿练熟的这些操作，到了真终端里一模一样能用。这本教材想让你带走的东西里，这个大概是最实用的。
 *
 * 树上的“文件”有两种：一门课，或者一个带注释块的源码文件。
 * 它们能干的事完全一样，ls 列得出来，cat 读得到，open 打得开。所以这一层根本不问你是哪种，真要区分的时候看节点上的 source 字段就行。
 * 课程是目录，源码是正文，它们挂在同一棵树上。这本教材的设定，在数据里就长这个样子。
 *
 * 这个文件最核心的活叫路径解析。你站在 /systems，敲 cd operating-systems，你没写全那一长串，总得有人把“我在哪”和“我想去哪”拼成一个完整的位置。
 * 规则就四条，真终端也是这四条：
 * 以 / 开头的是绝对路径，从根开始算，不管你现在在哪；
 * 不以 / 开头的是相对路径，从你现在的位置往下接；
 * 一个点 . 是“就这儿”；
 * 两个点 .. 是“上一层”。根目录再往上还是根目录，你在自己电脑上 cd / 然后 cd .. 试试，还在 / 待着。
 *
 * 还有个 ~，真终端里是“你的家目录”。这棵树里没有“用户”这回事，所以我让 ~ 指向树根。cd ~ 还是“回到我熟悉的起点”，跟你的直觉对得上。
 *
 * 上面这些都不难。真正值得你花三分钟的，是下面这个坑。
 *
 * 处理 .. 有两种写法。一种是纯算字符串：把路径切成一段段，碰到 .. 就把前一段扔掉，算完了再看结果存不存在。五行就写完，看着也挺对。
 * 另一种是一步一步走：从起点出发，每一段都真的走进去一层，走不进去就当场停下。
 *
 * 沿路每一层都存在的话，两种写法结果一样。差别只在“中间有一层不存在”的时候冒出来。你试试：
 *
 *     cd /不存在的分类/..
 *
 * 按字符串算，/不存在的分类 和 .. 一抵消，得到 /，存在，没毛病。
 * 可在真终端里敲同样的东西，你会被告知没有这个目录。这个终端也一样，回的是：
 *
 *     cd: no such file or directory: /不存在的分类/..
 *
 * 真 Unix 为啥这么较真？因为在真的文件系统里，.. 不是一个写法上的符号，它是每个目录里真实存在的一条记录，指向上一层。
 * 内核解析路径是一层一层走的（Unix 里干这活的函数叫 namei，教学用的 xv6 里就在 kernel/fs.c，6.S081 讲文件系统时会带你读），
 * 它得先真的走进“不存在的分类”，才能读到那里面的 ..，而它根本进不去，所以就报错了。
 * 中间那层要是个文件而不是目录，报的是另一句：
 *
 *     cd: not a directory: /programming-intro/cs61a/..
 *
 * 因为文件里没有 .. 这条记录，文件根本就没有“里面”。
 *
 * 这种差别很容易被当成小事，反正最后落的位置是对的嘛。可这本教材的整个立足点就是：你在这儿养成的手感，将来要原封不动搬到真终端去。
 * 一个替你把错误抹平的练习场，教出来的是一个到了真环境就失灵的习惯，失灵的时候你还不知道为啥。
 * 所以报错要和真的一样，报错的时机也要和真的一样。
 *
 * 现在的分工是这样：resolvePath 还是纯算字符串，因为算网址、显示提示符这些场合确实只需要算个字面；
 * lookup 则一步一步走，每一步都验。下面那个 walk 函数，二十来行，就是这条规矩的全部实现。
 *
 * 最后一件事，比上面所有细节都重要：这个模块不记你在哪。
 *
 * 按直觉，文件系统应该有个 currentDirectory 变量，cd 的时候改它，ls 的时候读它，几乎所有教程都这么写。
 * 可这个网站有两套走法：敲 cd，或者用鼠标点侧边栏。模块要是自己存一份当前目录，鼠标一点，这份就跟地址栏对不上了，除非再写一堆代码让两边互相通知。
 * 而互相通知这种事，一旦有两个来源，就会出现绕圈（A 通知 B，B 又通知 A）和抢话（到底谁说了算），这类 bug 特别难查。
 *
 * 所以这个项目走了另一条路：你在哪，只看浏览器地址栏。终端想知道，就去读地址栏；鼠标点了链接，地址栏自己就变了，终端下回读到的自然是新的。
 * 两边用不着互相通知，因为本来就在看同一块表。
 * 这个模块也就被写成了“没有记性”的：每次问它问题，你都得把“我在哪”一起告诉它。看着啰嗦一点，换来的是一整类 bug 压根不会发生。
 * 这个取舍你往后会反复碰到，说白了就一句话：与其同步两份数据，不如只留一份。
 */
import type {
  CategoryEntry,
  CourseEntry,
  KnowledgeIndex,
  ModuleEntry,
} from "../knowledge/knowledge-index.ts";

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

/**
 * 一份“文件”背后的原始记录：要么是一门课，要么是一个源码模块。
 *
 * 它们在树里的地位完全一样——都能被 ls 列出来、被 cat、被 open——所以文件系统本身不区分它们，
 * 只在需要更多字段（课程的先修、模块的那封信）时，由上层看一眼 kind 再取。
 * 这种“先按共同点组织，需要时再问是哪一种”的写法，是数据抽象里最常用的一招。
 */
export type FileSource =
  | { kind: "course"; course: CourseEntry }
  | { kind: "module"; module: ModuleEntry };

/** 一门课或一个源码模块，对应文件系统里的文件。 */
export type FileNode = {
  kind: "file";
  /** 文件名，例如 cs61a、command-engine。 */
  name: string;
  /** 完整位置，例如 /programming-intro/cs61a。 */
  path: string;
  title: string;
  description: string;
  /** 这份内容的网页地址。 */
  url: string;
  /** 所在目录的位置。 */
  parentPath: string;
  /** 索引里那条原始记录。 */
  source: FileSource;
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
      source: { kind: "course", course },
    });
  }

  // 源码模块和课程一样是文件。它的“简介”就是注释块里 @module 那一行——
  // 也就是这个文件自己对自己的一句话交代，cat 出来的正是它。
  for (const module of index.modules) {
    nodes.set(module.path, {
      kind: "file",
      name: module.id,
      path: module.path,
      title: module.title,
      description: module.comment.module,
      url: module.url,
      parentPath: module.categoryPath,
      source: { kind: "module", module },
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
