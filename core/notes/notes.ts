/**
 * @module        私人心得的数据格式
 * @problem       页面要记住读者的文字，但浏览器里可能留着损坏或旧格式的数据，不能把它们当成空白后覆盖。
 * @design        每页一条心得，用知识路径作标识；解析和校验是纯函数，存储由界面负责。作者心得不进入这套数据。
 * @courses       CS61A 数据抽象；CS186 数据完整性；CS50x Web 开发
 * @exercises     https://cs50.harvard.edu/x/psets/9/finance/ —— 持久数据和输入校验
 * @prereq        JSON 是把对象写成文字的格式；读到文字后还需要检查内容。
 * @unclear       路径改变时需要显式迁移；当前格式只表示心得，不预先塞入以后阶段的学习进度。
 * @letter
 * 我希望你写下的文字比一次页面刷新活得久，所以保存时要离开 React 的内存，进入浏览器存储。
 * 但持久化并不意味着永远安全：别的版本或手工修改都可能留下不合规的数据。
 * 这里把“没有保存过”和“保存过但读不懂”分开。前者可以显示空白，后者必须报错，绝不能默默清空。
 * 每页单独保存还有一个实际好处：两个标签页分别写不同课程，不会用整本笔记互相覆盖。
 * 所有文字都按纯文本显示，心得里写了 HTML 标签，也只是你的文字，不会变成网页程序。
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
