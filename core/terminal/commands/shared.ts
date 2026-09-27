/**
 * @module        终端命令共用的小工具——统一网址换算、用法错误和路径错误的说法
 * @problem       ls、cd、cat、open 都会把知识树路径变成网页地址，也都会遇到参数过多或路径不存在。
 *                如果每条命令各拼一遍，同一种错误很快会出现四种说法，分类网址也可能少一段或多一段。
 * @design        这里只收没有业务状态的纯函数。错误函数接收命令名和查找结果，返回结构化结果；
 *                knowledgePathToUrl 只做知识路径到 /docs 地址的机械映射。它不引用 Next，也不执行跳转。
 * @courses       MIT Missing Semester（Unix 命令的错误输出）；MIT 6.031 / UC Berkeley CS169（消除重复：DRY，以及什么时候不该合并）；
 *                UC Berkeley CS61A（抽象：把同一个决定只做一次）
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/ —— 在真终端里看看各种命令报错长什么样
 * @prereq        知道函数可以把重复规则集中到一个地方。
 * @unclear       usageError 不管什么情况都说 too many arguments，选项写错、数值不合法也这么说，不准确，还没拆开。
 *                真 Unix 工具把错误写到 stderr、用退出码表示失败；这里只有结构化的输出块和一个 status。
 *                现在管道已经有了，但管道里只传正常输出，报错直接中断整条管道，没有 stderr 这一路。
 *
 * @letter
 * 这个文件是一堆命令都会用到的小零件。本身没啥好讲的，我想聊的是：什么东西该放这儿，什么不该。
 *
 * 你翻翻 ls、cd、cat、open 这几个命令，会发现它们都有一段长得差不多的代码：拿路径去查，查不到就报错。
 * 最省事的写法是写好一个，复制三份，把 cd 改成 cat 就完事了。一开始确实快。
 * 麻烦在后面：哪天想改报错的格式，就得记着去改四个地方。漏掉一个，你的终端就会像四个人各写各的，同样是“找不到”，说法还不一样。
 * 所以这类“一模一样、而且改的时候也该一起改”的东西，就收到这里来，只在一个地方决定怎么说。
 *
 * 但别走到另一个极端，觉得“能共用的都往这儿塞”。
 * ls 怎么列目录、cat 为什么不读目录，这些是每个命令自己的事，还是留在各自的文件里。
 * 判断标准就一个：将来要改的时候，它们是不是一定得一起改？是，就放一起；不是，就分开。
 * 长得像不代表是一回事，硬凑到一起，以后改一个的时候反而会误伤另一个。
 *
 * 不过话说回来，共用也有共用的坑，这个文件里就有一个现成的例子。
 * usageError 只会说一句 too many arguments。
 * 可 pwd -x 不是参数太多，是选项不认识；tree -L 0 也不是参数太多，是层数不对。
 * 它们全被塞进了同一句话里，说得就不准了。这就是“收得太狠”的代价，@unclear 里记着，还没改。
 *
 * resolveTarget 这个函数可以多看一眼。mark 和 status 要同时管课程和代码两条线，
 * 你敲 mark cs61a done 的时候，它得自己判断 cs61a 是一门课还是一段代码。
 * 规则很简单：参数里带斜杠（或者是 . .. ~），就当路径去树上找；不带，就当名字去索引里找，只认一模一样的名字，不猜。
 * 名字撞车了怎么办？源码里就有五个文件都叫 layout。这时候它把候选连同完整位置都列出来，让你再说一遍，绝不替你挑一个。
 */
import type { CommandContext, CommandResult } from "../command.ts";
import type { LookupResult } from "../../filesystem/virtual-file-system.ts";
import type { CourseEntry, ModuleEntry } from "../../knowledge/knowledge-index.ts";
import { list, text } from "../output.ts";

/** 根路径单独处理，避免生成 /docs/ 之外的重复斜杠。 */
export function knowledgePathToUrl(path: string): string {
  return path === "/" ? "/docs" : `/docs${path}`;
}

export function usageError(command: string, usage: string): CommandResult {
  return {
    status: "error",
    blocks: [text(`${command}: too many arguments`, "error"), text(`usage: ${usage}`, "muted")],
    actions: [],
  };
}

export function lookupError(command: string, input: string, result: LookupResult): CommandResult {
  if (result.found) throw new Error("lookupError 只能接收查找失败的结果");
  return {
    status: "error",
    blocks: [text(`${command}: ${result.reason}: ${input}`, "error")],
    actions: [],
  };
}

/** 参数写成这样就是位置，否则就是名字。规则只有一条：带路径符号的当路径。 */
export function looksLikePath(input: string): boolean {
  return input.includes("/") || input === "." || input === ".." || input === "~";
}

/**
 * 把一个参数解析成"一门课"或"一段代码"，由参数指到哪里决定。
 *
 * mark 和 status 都要管两条进度线：课程那条和代码那条。读者不该为此记两条命令，
 * 更不该被要求先说清"我现在问的是哪条线"——他指到哪，答案就在哪。
 * 这和 refs 一条命令管两个方向是同一个想法：方向由参数本身决定，而不是由一个选项决定。
 *
 * 名字撞车的处理保持一致：课程编号全站唯一，模块名却会重（源码里有五个都叫 layout），
 * 所以撞上了就把候选连位置一起列出来，让人再说一遍，绝不替他猜一个。
 */
export type TargetLookup =
  | { ok: true; kind: "course"; course: CourseEntry }
  | { ok: true; kind: "module"; module: ModuleEntry }
  | { ok: false; result: CommandResult };

export function resolveTarget(command: string, input: string, context: CommandContext): TargetLookup {
  if (looksLikePath(input)) {
    const found = context.fileSystem.lookup(context.currentPath, input);
    if (!found.found) return { ok: false, result: lookupError(command, input, found) };
    if (found.node.kind !== "file") {
      return {
        ok: false,
        result: { status: "error", blocks: [text(`${command}: ${input}: Is a directory`, "error")], actions: [] },
      };
    }
    return found.node.source.kind === "course"
      ? { ok: true, kind: "course", course: found.node.source.course }
      : { ok: true, kind: "module", module: found.node.source.module };
  }

  const named = entriesNamed(input, context);
  const total = named.courses.length + named.modules.length;

  if (total === 0) {
    return {
      ok: false,
      result: {
        status: "error",
        blocks: [text(`${command}: no such course or module: ${input}`, "error")],
        actions: [],
      },
    };
  }
  if (total > 1) return { ok: false, result: ambiguousNameError(command, input, named) };
  const course = named.courses[0];
  return course !== undefined
    ? { ok: true, kind: "course", course }
    : { ok: true, kind: "module", module: named.modules[0] as ModuleEntry };
}

/** 按名字（课程编号或模块名）在全树里找，只认完全相同的名字，不做模糊匹配。 */
export function entriesNamed(
  input: string,
  context: CommandContext,
): { courses: CourseEntry[]; modules: ModuleEntry[] } {
  return {
    courses: context.knowledge.courses.filter((course) => course.id === input),
    modules: context.knowledge.modules.filter((module) => module.id === input),
  };
}

/** 名字撞车时的统一说法：列出每个候选的完整位置，点一下就等于把位置写全再敲一遍。 */
export function ambiguousNameError(
  command: string,
  input: string,
  named: { courses: CourseEntry[]; modules: ModuleEntry[] },
): CommandResult {
  return {
    status: "error",
    blocks: [
      text(`${command}: ${input}: 有多个同名的东西，请写出完整位置`, "error"),
      list([...named.courses, ...named.modules].map((entry) => ({
        label: entry.path,
        description: entry.title,
        command: `${command} ${entry.path}`,
      }))),
    ],
    actions: [],
  };
}
