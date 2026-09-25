/**
 * @module        第 5 版备份——把心得条目（文档、导入的文件、导图）和导图版学习路径也装进同一个文件
 * @problem       阶段 14.5 起，心得不再是“一页一段文字”，学习路径也不再是一列课程。
 *                备份如果还只认旧格式，你新写的文档和画的导图就不在备份里——而你以为它们在。
 * @design        第 5 版文件 = 学习状态 + 理解度 + 心得条目 + 导图版路径。
 *                读文件时先统一换成“标准形状”（NormalizedBackup）：第 1～4 版交给旧模块 core/notes/backup.ts 按原规则校验，
 *                再把旧心得、旧路径搬成新格式（items.ts、learning-paths.ts 里的迁移函数）；第 5 版直接校验。
 *                导入分两半：学习状态和理解度仍由旧模块写进 localStorage（它有写一半失败就回滚的保护）；
 *                心得条目和路径由浏览器那一层写进 IndexedDB。这里只负责算出“要写哪些、跳过哪些”（planImport），
 *                不碰任何存储，所以能在测试里完整验证。
 * @courses       UC Berkeley CS186 / CMU 15-445（数据迁移、导入时的冲突处理）；UC Berkeley CS61A（数据抽象）
 * @exercises     https://cs186berkeley.net/ —— 恢复与事务相关的项目
 * @prereq        知道备份文件是一份和软件版本无关、能长期保存的数据副本。
 * @unclear       IndexedDB 那一半的写入还没有“写一半失败就全部退回”的保护：IndexedDB 自己有事务，
 *                浏览器那一层把整批写入放在同一个事务里，失败时浏览器会整批撤销；但它和 localStorage 那一半之间不是同一个事务。
 *
 * @letter
 * 这是这本教材里第五次改备份格式了。每一次的规矩都一样：新的格式要能读所有旧的格式。
 *
 * 这一次多了一件事：旧格式里的东西，在新软件里已经“长成了别的样子”——旧心得变成了文档，旧路径变成了导图。
 * 所以读旧备份不只是“缺的当成空”，还要当场把它换成新样子。换的规则和打开网站时自动搬家用的是同一组函数，
 * 这样无论你是刷新网页、还是导入一份半年前的备份，旧心得最后都会变成同一个模样、同一个编号，不会重复出现两份。
 */

import { parseBackup } from '../notes/backup.ts';
import { validateProgress, validateUnderstanding, type CourseProgress, type ModuleUnderstanding } from '../progress/progress.ts';
import { migrateLegacyNote, validateItem, type NoteItem } from './items.ts';
import { migrateLegacyPath, validatePathCanvas, type PathCanvas } from './learning-paths.ts';

export const WORKSPACE_BACKUP_VERSION = 5;

export type NormalizedBackup = {
  progress: CourseProgress[];
  understanding: ModuleUnderstanding[];
  items: NoteItem[];
  paths: PathCanvas[];
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
  return { progress, understanding, items, paths };
}

export type ImportPlan = {
  items: NoteItem[];
  paths: PathCanvas[];
  /** 和本机已有数据撞上、这次按设置跳过（或覆盖）的条数。给读者预览用。 */
  conflicts: number;
};

/**
 * 算出心得条目和路径这一半要写哪些。默认不覆盖本机已有的同编号条目；overwrite 为真才覆盖。
 * 纯函数：只看两份清单，不碰存储。
 */
export function planImport(backup: NormalizedBackup, existing: { itemIds: ReadonlySet<string>; pathIds: ReadonlySet<string> }, overwrite: boolean): ImportPlan {
  const itemClash = backup.items.filter((i) => existing.itemIds.has(i.id)).length;
  const pathClash = backup.paths.filter((p) => existing.pathIds.has(p.id)).length;
  return {
    items: backup.items.filter((i) => overwrite || !existing.itemIds.has(i.id)),
    paths: backup.paths.filter((p) => overwrite || !existing.pathIds.has(p.id)),
    conflicts: itemClash + pathClash,
  };
}
