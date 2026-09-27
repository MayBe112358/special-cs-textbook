/**
 * @module        逐行对比两段文字——“改前 / 改后”给人看，确认了才写入
 * @problem       将来 AI 帮你改心得时，不能直接把文字换掉：你得先看到它改了哪几行，同意了才算数。
 *                任何“别人替你改东西”的地方都一样——导入备份覆盖旧心得时也值得先看一眼差别。
 * @design        经典的最长公共子序列（LCS）逐行对比：两段文字里最长的一串“没动过的行”先找出来，
 *                剩下的就是删掉的和新加的。结果是一串 same / remove / add，界面照着画成红绿两色。
 *                算法要 O(行数 × 行数) 的内存，两边都很长时退化成“整段删除、整段新增”，宁可粗糙也不卡死页面。
 * @courses       UC Berkeley CS61B / CS170、MIT 6.006（动态规划：最长公共子序列）；
 *                MIT Missing Semester（diff 与版本控制）
 * @exercises     https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/ —— 6.006 动态规划那几讲的习题
 *                https://missing.csail.mit.edu/2020/version-control/ —— 在真 git 里看 diff 长什么样
 * @prereq        知道动态规划是“把大问题拆成重叠的小问题，小问题的答案记下来”。
 * @unclear       真正的 git diff 用的是 Myers 算法，更省内存，也更贴近人眼里的“改了哪儿”。这里先用最好懂的 LCS。
 *
 * @letter
 * 你在 CS170 或者 6.006 里多半做过“最长公共子序列”这道题，做的时候大概觉得它就是道考试题。
 * 这儿是它一个实打实的用处：你天天用的 git diff、代码评审里那些红红绿绿，背后都是同一个问题：
 * 两份文字里，哪些行是原封没动的，哪些删了，哪些是新加的。
 *
 * 举个例子。你的心得原来是四行：“# CS61A / 递归 / 高阶函数 / 解释器”，AI 想改成“# CS61A / 递归 / 环境模型 / 解释器 / Scheme 项目”。
 * diffLines 先找出两边最长的那串“没动过的行”：# CS61A、递归、解释器。剩下的就是改动了：
 *
 *       # CS61A
 *       递归
 *     - 高阶函数
 *     + 环境模型
 *       解释器
 *     + Scheme 项目
 *
 * 摘要是“+2 −1 行”。你一眼就能看出它改了哪儿，然后决定同不同意。
 *
 * 算法本身就是课上那张表：lcs[i][j] 记的是“a 从第 i 行、b 从第 j 行往后，最多有几行能对上”。从右下角往左上角填，填完再从左上角顺着表走一遍，就读出了结果。
 * 这张表的大小是两边行数相乘，两边都上千行的时候就太大了。这时候我干脆不比了，直接显示“全删了、全新加”。
 * 粗糙是粗糙，但总比把页面卡死强。
 *
 * 这个文件在整个项目里的位置比它的算法更值得说：AI 想改你的东西，必须先从这道门过。
 * 门本身一点都不聪明，它只是把差别摆在你面前。可有了它，“让 AI 帮忙”就不会变成“让 AI 替你拿主意”。
 */

export type DiffLine = { type: 'same' | 'remove' | 'add'; text: string };

/** 超过这个乘积就不做逐行对比了（大约相当于两边各一千多行）。 */
const LIMIT = 2_000_000;

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');
  if (a.length * b.length > LIMIT) {
    return [...a.map((text) => ({ type: 'remove' as const, text })), ...b.map((text) => ({ type: 'add' as const, text }))];
  }
  // lcs[i][j]：a 从第 i 行、b 从第 j 行开始往后，最长公共子序列有多长。从后往前填表。
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  // 再从头走一遍表，照着“哪边更长就往哪边走”读出结果。
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i]! }); i++; j++; }
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) { out.push({ type: 'remove', text: a[i]! }); i++; }
    else { out.push({ type: 'add', text: b[j]! }); j++; }
  }
  while (i < a.length) out.push({ type: 'remove', text: a[i++]! });
  while (j < b.length) out.push({ type: 'add', text: b[j++]! });
  return out;
}

/** 一句话说清改了多少：“+3 −1 行”。 */
export function diffSummary(lines: readonly DiffLine[]): string {
  const added = lines.filter((l) => l.type === 'add').length;
  const removed = lines.filter((l) => l.type === 'remove').length;
  return added === 0 && removed === 0 ? '没有变化' : `+${added} −${removed} 行`;
}
