/**
 * @module        没保存的草稿暂存区——切到别的标签再切回来，写了一半的字还在
 * @problem       标签页一切换，原来那一页的编辑器就被卸载了，它手里没保存的文字跟着消失。
 *                VS Code 里切标签从不丢字，这里也不该丢。
 * @design        一张放在内存里的表：条目编号 → 草稿文字。编辑器每次改动都写进来，打开时先看这里有没有草稿。
 *                只放内存、不进浏览器存储：草稿本来就是“还没决定要不要留”的东西，刷新网页前标签栏会提醒你保存。
 * @courses       UC Berkeley CS61A（状态放在哪一层）；Stanford CS147（防止数据丢失的设计）
 * @exercises     https://cs61a.org/
 * @prereq        知道一个模块里的变量在整个页面存活期间只有一份，所有组件共用。
 * @unclear       刷新或关掉网页，草稿就没了；浏览器会先弹“确定离开吗”，但不会替你保存。
 *
 * @letter
 * 这是全站唯一一处“故意只存在内存里”的读者数据。它和命令历史是同一类：会话状态，刷新即丢。
 * 为什么不存进浏览器？因为一旦存了，它就变成了“第三份版本”：已保存的、正在编辑的、上次没关掉的草稿——
 * 三份文字摆在你面前，你得想哪份才是真的。VS Code 的做法也是一样：没保存就是没保存，关的时候问你一句。
 */
const drafts = new Map<string, string>();

export function readDraft(id: string): string | undefined {
  return drafts.get(id);
}

export function writeDraft(id: string, text: string): void {
  drafts.set(id, text);
}

export function discardDraft(id: string): void {
  drafts.delete(id);
}
