/**
 * @module        help 命令——列出现在有哪些命令可用
 * @problem       终端不像界面，它不会把能做的事摆在你面前。第一次打开的人面对一个光标，
 *                除非有人告诉他有哪些命令，否则他只能猜。help 就是那个告诉他的人。
 * @design        help 不维护自己的命令清单，而是从上下文里拿到引擎注册的所有命令再列出来。
 *                这样新增一条命令时，help 自动跟着变；如果它自己抄一份清单，那份清单迟早会漏、会旧，
 *                而且是那种“不报错、只是少了一行”的旧法，最难发现。
 * @courses       MIT Missing Semester（man、--help，以及命令行工具怎么自我介绍）；
 *                UC Berkeley CS61A（用数据驱动行为，而不是把情况一条条写死）；
 *                软件工程类课程（单一事实来源）
 * @exercises     https://missing.csail.mit.edu/2020/course-shell/  —— 在真终端里用 man 和 --help 找答案
 * @prereq        知道数组可以被遍历成一组显示项。
 * @unclear       真终端里可以 help 某条命令看详细用法（man ls），这里还没做；
 *                ROADMAP 3.1—3.3 只要求总览，逐命令帮助应在有明确验收目标时再加。
 *                另外首页那个面向陌生访客的终端要“极度友善”（示例可点、提示更多），
 *                那属于界面层的默认设置，不是这条命令的事——同一个内核，两种友善度。
 *
 * @letter
 * help 是这个终端的第一条命令，简单到几乎没内容：把所有命令列出来，一条一行。
 * 不过它有个小地方，我觉得比它本身更值得聊：它列的是“引擎告诉它的命令”，而不是它自己记着的一份清单。
 *
 * 这有啥区别？假设 help 里写死了一份：
 *
 *     ["help —— 显示帮助", "ls —— 列出内容", "cd —— 切换位置"]
 *
 * 今天是对的。等哪天加了 cat，忘了回来改这行，help 就开始说瞎话了。
 * 而且它说瞎话的方式特别阴：不报错，不变红，就是少了一行。
 * 偏偏少的那一行，是刚来的人最需要知道的。
 *
 * “两个地方记同一件事，迟早对不上”，这毛病太常见了，常见到有个专门的说法叫单一事实来源（single source of truth）。
 * 意思很朴素：一件事只在一个地方记，别的地方要用就去问它。
 *
 * 所以现在命令清单只存在引擎的注册表里，help 每次跑的时候现问现列。
 * 代价是得有人把清单递给它，这就是 context.commands 的来历。
 * 你往后会在这个项目里一次又一次碰到这种取舍：多绕一步，换来一个没法说瞎话的结构。
 * 地址栏是位置的唯一真相，注释是课程链接的唯一来源，都是一个道理。
 */
import type { CommandDefinition, CommandResult } from "../command.ts";
import { list, text } from "../output.ts";

/** 用法只写一处，报错时和 help 列表里显示的是同一句。 */
const USAGE = "help";

export const helpCommand: CommandDefinition = {
  name: "help",
  pipeline: true,
  summary: "列出当前可用的命令",
  usage: USAGE,
  run(invocation, context): CommandResult {
    // 现在的 help 不接受参数。将来支持 help <命令> 查看详细用法时，这里再展开。
    if (invocation.args.length > 0) {
      return {
        status: "error",
        blocks: [text("help: too many arguments", "error"), text(`usage: ${USAGE}`, "muted")],
        actions: [],
      };
    }

    return {
      status: "ok",
      blocks: [
        text("可用命令："),
        list(
          context.commands.map((command) => ({
            label: command.name,
            description: command.summary,
          })),
        ),
      ],
      actions: [],
    };
  },
};
