/**
 * @module        心得、学习状态与理解度的备份与恢复
 * @problem       浏览器数据会被清理，读者需要一份自己拿得走、读得懂、能恢复的备份，导入失败时不能损坏旧数据。
 *                从 ROADMAP 步骤 8.1、8.2 起，读者在本机攒下的不只是心得，还有每门课的学习状态
 *                和每段代码的理解度。如果导出只带走心得，清一次缓存就会把另外两样丢光，
 *                而读者以为自己已经备份过了——这比没有备份更糟。
 * @design        版本化 JSON 只包含读者自己的数据；先校验全部记录再写入，默认保留冲突的本机记录，失败时回滚已写条目。
 *                版本 2 比版本 1 多一个 progress 数组，版本 3 再多一个 understanding 数组；
 *                旧版本的备份照常接受，缺的那部分当成空。
 * @courses       UC Berkeley CS186 与 CMU 15-445（事务与数据完整性：要么都成，要么都不算）；
 *                UC Berkeley CS61A（数据抽象）；MIT Missing Semester（数据整理与备份习惯）
 * @exercises     https://cs186berkeley.net/ —— 官方项目中的恢复和事务主题
 *                https://15445.courses.cs.cmu.edu/ —— 日志与故障恢复
 * @prereq        备份是保存数据的另一份副本；导入不应等于删除本机全部数据。
 * @unclear       localStorage 不提供跨标签页事务，校验与写入之间极短的并发窗口仍存在；长期应使用支持事务的存储。
 *
 * @letter
 * 我把导入分成两段：先看懂整个文件，再开始写。否则写到一半才发现最后一条坏了，读者就会得到半本笔记。
 * 同一页在本机和文件里都有心得时，默认保留本机版本，你可以明确选择覆盖。没有冲突的页面总会合并进来。
 * 浏览器写入也可能失败，所以我先记住每个将修改的旧值。如果中途空间不足，就把已经写过的恢复回去。
 * 这不是数据库级的事务，另一标签页仍可能同时写；注释里把这个边界留下，是为了不把近似保证当成绝对保证。
 * 导出只读取本项目自己的键，也不带作者心得、账号或别的网站数据；可读 JSON 让你用记事本就能核对文字还在。
 *
 * 这份文件的格式已经改过两次：1 只有心得，2 加了学习状态，3 又加了理解度。
 * 加版本号不难，难的是决定旧版本怎么办。最省事的做法是"只认最新版本"，
 * 那样代码干净，代价是你半年前导出的那个文件从此打不开——而备份文件的全部意义，
 * 恰恰在于它比当时的软件活得更久。所以这里明确接受全部三个版本：读到旧的，
 * 就把当时还不存在的那部分当成空。一份备份工具如果会让旧备份失效，它就不能叫备份工具。
 *
 * 还有一处值得说：心得按页面地址存，学习状态按课程编号存，理解度按模块位置存，三种标识都不一样，
 * 但它们在这里共用同一套"先全部校验、再逐条写入、出错就回滚"的流程。
 * 这不是为了省代码行数，而是因为它们对读者的承诺是同一句话——
 * 要么这次导入整个成立，要么你的本机数据一点没动。承诺相同，流程就该只写一遍。
 */
import { NOTE_PREFIX, noteKey, readNote, validateNote, type Note } from './notes.ts';
import { PROGRESS_PREFIX, progressKey, readProgress, validateProgress, type CourseProgress,
  UNDERSTANDING_PREFIX, understandingKey, readUnderstanding, validateUnderstanding, type ModuleUnderstanding } from '../progress/progress.ts';

export type NoteStorage = Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
export type Backup = {format:'special-cs-textbook-notes'; version:3; notes:Note[]; progress:CourseProgress[]; understanding:ModuleUnderstanding[]};

/** 备份文件里当前使用的格式版本。旧版本仍然接受，见 parseBackup。 */
export const BACKUP_VERSION = 3;

export function collectNotes(storage: NoteStorage): Note[] {
  const notes: Note[] = [];
  for (let i=0;i<storage.length;i++) {
    const key=storage.key(i);
    if (key?.startsWith(NOTE_PREFIX)) {
      const note=readNote(storage.getItem(key), key.slice(NOTE_PREFIX.length));
      if (note) notes.push(note);
    }
  }
  return notes.sort((a,b)=>a.page.localeCompare(b.page));
}

export function collectProgress(storage: NoteStorage): CourseProgress[] {
  const records: CourseProgress[] = [];
  for (let i=0;i<storage.length;i++) {
    const key=storage.key(i);
    if (key?.startsWith(PROGRESS_PREFIX)) {
      const record=readProgress(storage.getItem(key), key.slice(PROGRESS_PREFIX.length));
      if (record) records.push(record);
    }
  }
  return records.sort((a,b)=>a.course.localeCompare(b.course));
}

export function collectUnderstanding(storage: NoteStorage): ModuleUnderstanding[] {
  const records: ModuleUnderstanding[] = [];
  for (let i=0;i<storage.length;i++) {
    const key=storage.key(i);
    if (key?.startsWith(UNDERSTANDING_PREFIX)) {
      const record=readUnderstanding(storage.getItem(key), key.slice(UNDERSTANDING_PREFIX.length));
      if (record) records.push(record);
    }
  }
  return records.sort((a,b)=>a.module.localeCompare(b.module));
}

export function exportBackup(storage: NoteStorage): string {
  const data:Backup={format:'special-cs-textbook-notes',version:BACKUP_VERSION,
    notes:collectNotes(storage),progress:collectProgress(storage),understanding:collectUnderstanding(storage)};
  return JSON.stringify(data,null,2)+'\n';
}

export function parseBackup(raw:string):Backup {
  if(raw.length>10_000_000) throw new Error('备份超过 10 MB，未导入。');
  const value=JSON.parse(raw.replace(/^﻿/,''));
  if(!value || value.format!=='special-cs-textbook-notes' || !Array.isArray(value.notes)) throw new Error('不是支持的心得备份格式或版本。');
  // 旧版本照样接受：版本 1 那时只有心得，版本 2 多了学习状态但还没有理解度。
  // 缺的那部分当成空列表往下走，这样读者半年前导出的文件今天仍然打得开。
  if(value.version!==1 && value.version!==2 && value.version!==3) throw new Error('不是支持的心得备份格式或版本。');
  const rawProgress=value.version===1?[]:value.progress;
  const rawUnderstanding=value.version===3?value.understanding:[];
  if(!Array.isArray(rawProgress)) throw new Error('备份里的学习状态不是一份列表。');
  if(!Array.isArray(rawUnderstanding)) throw new Error('备份里的理解度不是一份列表。');
  if(value.notes.length>10_000 || rawProgress.length>10_000 || rawUnderstanding.length>10_000) throw new Error('备份条目过多。');
  const notes:Note[]=value.notes.map(validateNote);
  if(new Set(notes.map(note=>note.page)).size!==notes.length) throw new Error('备份含重复的页面，未导入。');
  const progress:CourseProgress[]=rawProgress.map(validateProgress);
  if(new Set(progress.map(record=>record.course)).size!==progress.length) throw new Error('备份含重复的课程状态，未导入。');
  const understanding:ModuleUnderstanding[]=rawUnderstanding.map(validateUnderstanding);
  if(new Set(understanding.map(record=>record.module)).size!==understanding.length) throw new Error('备份含重复的模块理解度，未导入。');
  return {format:'special-cs-textbook-notes',version:BACKUP_VERSION,notes,progress,understanding};
}

export function importBackup(storage:NoteStorage, backup:Backup, overwrite:boolean):number {
  // 不信任调用者传入的对象，也不在校验完成前进行任何写入。
  const checked=parseBackup(JSON.stringify(backup));
  // 下面三行没人接返回值，但它们不是废话，是守卫：本机现有数据要能整个读懂，这次导入才允许开始。
  // 万一本机留着一条坏记录，宁可整次导入失败，也不能在"看不懂旧数据"的前提下覆盖它——
  // 读不懂不等于没有，那可能正是读者最想找回来的那条。
  collectNotes(storage);
  collectProgress(storage);
  collectUnderstanding(storage);
  const wanted=[
    ...checked.notes.map(note=>({key:noteKey(note.page),value:JSON.stringify(note)})),
    ...checked.progress.map(record=>({key:progressKey(record.course),value:JSON.stringify(record)})),
    ...checked.understanding.map(record=>({key:understandingKey(record.module),value:JSON.stringify(record)})),
  ];
  const changes=wanted.map(change=>({...change,old:storage.getItem(change.key)}))
    .filter(change=>overwrite || change.old===null);
  const written:typeof changes=[];
  try {
    for(const change of changes) {
      if(storage.getItem(change.key)!==change.old) throw new Error('本机数据已变化，请重新预览。');
      storage.setItem(change.key,change.value); written.push(change);
    }
  } catch(error) {
    for(const change of written.reverse()) {
      if(change.old===null) storage.removeItem(change.key); else storage.setItem(change.key,change.old);
    }
    throw error;
  }
  return changes.length;
}
