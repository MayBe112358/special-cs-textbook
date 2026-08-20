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
import type { CommandResult } from "../command.ts";
import type { LookupResult } from "../../filesystem/virtual-file-system.ts";
import { text } from "../output.ts";

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
