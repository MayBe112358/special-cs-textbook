/**
 * @module        第 5 版备份——把心得条目（文档、导入的文件、导图）和导图版学习路径也装进同一个文件
 * @problem       阶段 14.5 起，心得不再是“一页一段文字”，学习路径也不再是一列课程。
 *                备份如果还只认旧格式，你新写的文档和画的导图就不在备份里——而你以为它们在。
 * @design        第 5 版文件 = 学习状态 + 理解度 + 心得条目 + 导图版路径，外加可选的 AI 对话记录（chats，导出时勾选才有）。
 *                读文件时先统一换成“标准形状”（NormalizedBackup）：第 1～4 版交给旧模块 core/notes/backup.ts 按原规则校验，
 *                再把旧心得、旧路径搬成新格式（items.ts、learning-paths.ts 里的迁移函数）；第 5 版直接校验。
 *                导入分两半：学习状态和理解度仍由旧模块写进 localStorage（它有写一半失败就回滚的保护）；
 *                心得条目和路径由浏览器那一层写进 IndexedDB。这里只负责算出“要写哪些、跳过哪些”（planImport），
 *                不碰任何存储，所以能在测试里完整验证。
 * @courses       UC Berkeley CS186 / CMU 15-445（数据迁移、导入时的冲突处理）；UC Berkeley CS61A（数据抽象）
 * @exercises     https://cs186berkeley.net/ —— CS186 恢复与事务相关的项目
 *                https://15445.courses.cs.cmu.edu/ —— CMU 15-445 的日志与故障恢复
 * @prereq        知道备份文件是一份和软件版本无关、能长期保存的数据副本。
 * @unclear       两半各自是完整的：localStorage 那一半有手写的回滚；IndexedDB 那一半，浏览器那一层把整批写入放在同一个事务里，失败时浏览器会整批撤销。
 *                但两半之间不是同一个事务：可能出现学习状态已经导进去、心得那一半却失败了的情况。
 *
 * @letter
 * 这已经是这本教材第五次改备份格式了。每次改，规矩都一样：新格式必须能读所有旧格式。
 *
 * 这一次比以前多了个麻烦。以前改格式，旧备份里缺什么，当成空的就完了。
 * 这回不一样，旧格式里的东西在新软件里已经“长成了别的样子”：旧心得变成了文档，旧路径变成了导图。
 * 所以读旧备份的时候，不光要补空，还得当场把旧东西换成新样子。
 *
 * 怎么换，用的是和“打开网站时自动搬家”同一组函数（items.ts 里的 migrateLegacyNote，learning-paths.ts 里的 migrateLegacyPath）。
 * 这一点很关键。不管你是刷新了网页让它自动搬，还是导入了一份半年前的备份，同一条旧心得最后都会变成同一个样子、同一个编号。
 * 编号一样，导入的时候就知道“这条本机已经有了”，不会冒出两份一模一样的心得。
 * 要是两边各写一套转换规则，哪怕只差一点点，编号对不上，你的心得就会莫名其妙地多出一份。
 *
 * 导入的活分成两半，因为数据本来就存在两个地方：
 * 学习状态和理解度在 localStorage，交给旧模块 core/notes/backup.ts 去写，它有“写一半失败就退回”的保护；
 * 心得条目、路径、AI 对话在 IndexedDB，由浏览器那一层写，这里只负责算出“要写哪些、跳过哪些”（planImport）。
 * planImport 只看两份清单，不碰任何存储，所以测试里能把它从头到尾验一遍。
 *
 * AI 对话记录默认不进备份，你得在导出时自己勾上。对话里可能有你不想发给别人的东西，而备份文件是很容易被随手发出去的。
 * API Key 是任何时候都不会进备份的。
 */

import { parseBackup } from '../notes/backup.ts';
import { validateProgress, validateUnderstanding, type CourseProgress, type ModuleUnderstanding } from '../progress/progress.ts';
import { migrateLegacyNote, validateItem, type NoteItem } from './items.ts';
import { migrateLegacyPath, validatePathCanvas, type PathCanvas } from './learning-paths.ts';
import { validateConversation, type Conversation } from '../assistant/conversations.ts';

export const WORKSPACE_BACKUP_VERSION = 5;

export type NormalizedBackup = {
  progress: CourseProgress[];
  understanding: ModuleUnderstanding[];
  items: NoteItem[];
  paths: PathCanvas[];
  /**
   * AI 对话记录，可选：导出时读者勾了“包含 AI 对话记录”才有（默认不勾——对话里可能有不想发给别人的内容）。
   * 只是多一个可选字段，版本号不变；旧版网站读到这种备份，会忽略这个字段，照样能导入其余部分。
   */
  chats?: Conversation[];
};

const MAX_ENTRIES = 20_000;

/** 生成第 5 版备份文件的文字。缩进排版，用记事本打开也能看懂。 */
export function buildBackup(data: NormalizedBackup): string {
  return JSON.stringify({ format: 'special-cs-textbook-notes', version: WORKSPACE_BACKUP_VERSION, ...data }, null, 2) + '\n';
}

/** 读任何一个版本的备份，统一换成第 5 版的形状。读不懂就抛错，一条都不写。 */
export function parseAnyBackup(raw: string): NormalizedBackup {
  if (raw.length > 50_000_000) throw new Error('备份超过 50 MB，未导入。');
  const value = JSON.parse(raw.replace(/^﻿/, ''));
  if (!value || value.format !== 'special-cs-textbook-notes') throw new Error('不是支持的心得备份格式。');
  if (value.version !== WORKSPACE_BACKUP_VERSION) {
    // 第 1～4 版：先按当年的规则校验，再把旧心得、旧路径换成新样子。
    const old = parseBackup(raw);
    return {
      progress: old.progress,
      understanding: old.understanding,
      items: old.notes.map(migrateLegacyNote),
      paths: old.paths.map(migrateLegacyPath),
    };
  }
  for (const key of ['progress', 'understanding', 'items', 'paths']) {
    if (!Array.isArray(value[key])) throw new Error(`备份里的 ${key} 不是一份列表。`);
    if (value[key].length > MAX_ENTRIES) throw new Error('备份条目过多。');
  }
  const progress: CourseProgress[] = value.progress.map(validateProgress);
  const understanding: ModuleUnderstanding[] = value.understanding.map(validateUnderstanding);
  const items: NoteItem[] = value.items.map(validateItem);
  const paths: PathCanvas[] = value.paths.map(validatePathCanvas);
  const unique = (ids: string[], what: string) => { if (new Set(ids).size !== ids.length) throw new Error(`备份含重复的${what}，未导入。`); };
  unique(progress.map((r) => r.course), '课程状态');
  unique(understanding.map((r) => r.module), '模块理解度');
  unique(items.map((i) => i.id), '心得条目');
  unique(paths.map((p) => p.id), '学习路径');
  if (value.chats === undefined) return { progress, understanding, items, paths };
  if (!Array.isArray(value.chats) || value.chats.length > MAX_ENTRIES) throw new Error('备份里的 AI 对话记录不是一份列表。');
  const chats: Conversation[] = value.chats.map(validateConversation);
  unique(chats.map((c) => c.id), 'AI 对话');
  return { progress, understanding, items, paths, chats };
}

export type ImportPlan = {
  items: NoteItem[];
  paths: PathCanvas[];
  chats: Conversation[];
  /** 和本机已有数据撞上、这次按设置跳过（或覆盖）的条数。给读者预览用。 */
  conflicts: number;
};

/**
 * 算出心得条目和路径这一半要写哪些。默认不覆盖本机已有的同编号条目；overwrite 为真才覆盖。
 * 纯函数：只看两份清单，不碰存储。
 */
export function planImport(backup: NormalizedBackup, existing: { itemIds: ReadonlySet<string>; pathIds: ReadonlySet<string>; chatIds?: ReadonlySet<string> }, overwrite: boolean): ImportPlan {
  const chatIds = existing.chatIds ?? new Set<string>();
  const chats = backup.chats ?? [];
  const itemClash = backup.items.filter((i) => existing.itemIds.has(i.id)).length;
  const pathClash = backup.paths.filter((p) => existing.pathIds.has(p.id)).length;
  const chatClash = chats.filter((c) => chatIds.has(c.id)).length;
  return {
    items: backup.items.filter((i) => overwrite || !existing.itemIds.has(i.id)),
    paths: backup.paths.filter((p) => overwrite || !existing.pathIds.has(p.id)),
    chats: chats.filter((c) => overwrite || !chatIds.has(c.id)),
    conflicts: itemClash + pathClash + chatClash,
  };
}
