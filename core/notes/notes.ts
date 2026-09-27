/**
 * @module        第一代心得的格式——“每页一段文字”，现在只负责把旧心得读出来
 * @problem       阶段 6 的心得是每个页面一段文字，存在 localStorage。阶段 14.5 改成了心得空间（文档、导入文件、导图，存 IndexedDB）。
 *                读者浏览器和旧备份里还有旧心得，得有人认得、能校验，才能把它们搬进新格式。
 * @design        保留旧格式的类型、键名前缀（带 v1）、校验函数，全部是纯函数，存储由调用方负责。
 *                谁在用：components/workspace/browser-workspace.ts 搬家时用 readNote 读旧心得，
 *                再交给 core/workspace/items.ts 的 migrateLegacyNote 变成一份“我的心得.md”；
 *                core/notes/backup.ts 读第 1～4 版备份时用 validateNote 校验；新格式借用 validPage 检查心得所属位置。
 *                “没有保存过”返回 null，“保存过但读不懂”直接报错，两者绝不混为一谈。
 * @courses       UC Berkeley CS61A（数据抽象）；UC Berkeley CS186 / CMU 15-445（数据完整性、模式迁移）；
 *                Harvard CS50x Week 8–9（浏览器存储、输入校验）；UC Berkeley CS161（XSS：用户输入不能被当成代码执行）
 * @exercises     https://cs50.harvard.edu/x/psets/9/finance/ —— CS50x Finance：持久化数据和输入校验
 *                https://cs161.org/ —— CS161：Web 安全那几讲里的 XSS
 * @prereq        JSON 是把对象写成文字的格式；读到文字之后还得检查内容对不对。
 * @unclear       旧格式已经不会产生新数据。等确认大多数读者都搬过家，这里可以只保留校验部分。
 *                validPage 被新格式借用，是这个文件还不能整个删掉的原因之一。
 *
 * @letter
 * 这是心得最早那一代的格式：每个页面底下一段文字，存在 localStorage 里，键名是 special-cs-textbook:note:v1: 加上页面位置。
 * 现在心得已经升级成了能建文档、能导入文件、能画导图的“心得空间”，存进了 IndexedDB。这个文件就退居二线了，只剩两个活：
 * 一是第一次打开新版时，搬家的代码用 readNote 把旧心得一条条读出来，交给 core/workspace/items 变成一份叫“我的心得.md”的文档；
 * 二是它的 validPage 还在被新格式借用，用来检查“这份心得属于哪个位置”写得对不对。
 *
 * 虽然退了，它当初定下的几条规矩，新格式一条都没丢。
 *
 * 第一条：“没保存过”和“保存过但读不懂”是两回事。
 * 没保存过，那就显示空白，挺正常。保存过但读不懂，可能是别的版本写的，也可能被人手动改过，这时候必须报错，绝不能当成空白，然后默默把它覆盖掉。
 * 那条读不懂的记录，说不定正是你最想找回来的。搬家的代码也照这个来：读不懂的旧心得原地留着，不删。
 *
 * 第二条：你写的就是文字，不会变成程序。
 * 心得里写了个 <script>，要么原样显示成一串字，要么在按 Markdown 渲染时被直接丢掉，反正不会被浏览器当成代码去跑。
 * 要是不注意这一点，别人给你一份“备份文件”，你导进来一打开，里面的代码就在你的浏览器里跑起来了。这类漏洞有个名字叫 XSS，安全课（CS161）里会专门讲。
 *
 * 第三条：键名里带着 v1，给格式留了个版本号。
 * 后来格式果然变了，搬家的代码就是靠这个前缀认出哪些是老数据的。存东西的时候顺手标个版本，成本几乎是零，将来能省大事。
 */
export const NOTE_PREFIX = 'special-cs-textbook:note:v1:';
export type Note = { page: string; text: string; updatedAt: string };
export const MAX_NOTE_LENGTH = 100_000;
export function validPage(page: unknown): page is string {
  return typeof page === 'string' && /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(page);
}
export function validateNote(value: unknown): Note {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('心得格式不正确。');
  const note = value as Record<string, unknown>;
  if (!validPage(note.page) || typeof note.text !== 'string' || note.text.length > MAX_NOTE_LENGTH ||
      typeof note.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(note.updatedAt) || !Number.isFinite(Date.parse(note.updatedAt))) {
    throw new Error('心得的页面、文字或保存时间不正确。');
  }
  return {page: note.page, text: note.text, updatedAt: note.updatedAt};
}
export function readNote(raw: string | null, page: string): Note | null {
  if (raw === null) return null;
  const note = validateNote(JSON.parse(raw));
  if (note.page !== page) throw new Error('心得的页面标识与存储位置不一致。');
  return note;
}
export function noteKey(page: string): string {
  if (!validPage(page)) throw new Error('页面标识不正确。');
  return NOTE_PREFIX + page;
}
