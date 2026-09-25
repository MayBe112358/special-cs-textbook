/**
 * @module        逐行对比两段文字——“改前 / 改后”给人看，确认了才写入
 * @problem       将来 AI 帮你改心得时，不能直接把文字换掉：你得先看到它改了哪几行，同意了才算数。
 *                任何“别人替你改东西”的地方都一样——导入备份覆盖旧心得时也值得先看一眼差别。
 * @design        经典的最长公共子序列（LCS）逐行对比：两段文字里最长的一串“没动过的行”先找出来，
 *                剩下的就是删掉的和新加的。结果是一串 same / remove / add，界面照着画成红绿两色。
 *                算法要 O(行数 × 行数) 的内存，两边都很长时退化成“整段删除、整段新增”，宁可粗糙也不卡死页面。
 * @courses       UC Berkeley CS61B / CS170、MIT 6.006（动态规划：最长公共子序列）；
 *                MIT Missing Semester（diff 与版本控制）
 * @exercises     https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/ —— 动态规划那几讲的习题
 * @prereq        知道动态规划是“把大问题拆成重叠的小问题，小问题的答案记下来”。
 * @unclear       真正的 git diff 用的是 Myers 算法，更省内存，也更贴近人眼里的“改了哪儿”。这里先用最好懂的 LCS。
 *
 * @letter
 * 你在 CS170 或 6.006 里做过“最长公共子序列”这道题，大概觉得它是一道纯粹的考试题。
 * 这里是它的一个真实用处：你每天用的 git diff、代码评审里的红绿对比，背后都是同一个问题——
 * 两份文字里，哪些行是“同一行没动”，哪些是删了，哪些是新加的。
 *
 * 这个文件在整个项目里的位置也值得一说：它是“AI 改你的东西之前必须先经过你”的那道门。
 * 门本身不聪明，它只是把差别摆出来。但有了它，“让 AI 帮忙”就不会变成“让 AI 替你决定”。
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
