/**
 * @module        终端命令共用的小工具——统一网址换算、用法错误和路径错误的说法
 * @problem       ls、cd、cat、open 都会把知识树路径变成网页地址，也都会遇到参数过多或路径不存在。
 *                如果每条命令各拼一遍，同一种错误很快会出现四种说法，分类网址也可能少一段或多一段。
 * @design        这里只收没有业务状态的纯函数。错误函数接收命令名和查找结果，返回结构化结果；
 *                knowledgePathToUrl 只做知识路径到 /docs 地址的机械映射。它不引用 Next，也不执行跳转。
 * @courses       MIT Missing Semester（Unix 命令的错误输出）；软件工程类课程（消除重复、统一边界）
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/
 * @prereq        知道函数可以把重复规则集中到一个地方。
 * @unclear       真正的 Unix 工具会把错误写到 stderr，并用退出码区分失败；当前界面只有结构化块和 status，
 *                等管道与重定向进入 ROADMAP 时，还要重新检查这个抽象是否足够。
 *
 * @letter
 * 你会在四条命令里反复看到“找路径、失败就报错”。最容易的写法是复制三行，再把 cd 改成 cat。
 * 一开始确实更快，可下一次我们校准报错格式时，就必须记得改四处；漏一处，终端会像四个人写的一样。
 * 这个文件把那几个共同句式收在一起，让“同一种错误只在一处决定怎么说”。
 *
 * 但别把“共用”误解成什么都往这里塞。ls 怎么列目录、cat 为什么拒绝目录，仍留在各自命令里；
 * 只有真的一模一样、改动时也该一起变的规则才住进来。抽象不是把代码藏起来，而是把同一个决定只做一次。
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
 * 名字撞车的处理保持一致：课程编号全站唯一，模块名却会重（源码里真有两个 layout），
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

  const courses = context.knowledge.courses.filter((course) => course.id === input);
  const modules = context.knowledge.modules.filter((module) => module.id === input);
  const total = courses.length + modules.length;

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
  if (total > 1) {
    return {
      ok: false,
      result: {
        status: "error",
        blocks: [
          text(`${command}: ${input}: 有多个同名的东西，请写出完整位置`, "error"),
          list([...courses, ...modules].map((entry) => ({
            label: entry.path,
            description: entry.title,
            command: `${command} ${entry.path}`,
          }))),
        ],
        actions: [],
      },
    };
  }
  const course = courses[0];
  return course !== undefined
    ? { ok: true, kind: "course", course }
    : { ok: true, kind: "module", module: modules[0] as ModuleEntry };
}
