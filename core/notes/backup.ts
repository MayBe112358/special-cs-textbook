/**
 * @module        第 1～4 版备份——读旧备份文件，以及把学习状态和理解度安全地写回 localStorage
 * @problem       浏览器数据会被清理，读者需要一份拿得走、读得懂、能恢复的备份。备份格式改过好几版，
 *                现在导出的是第 5 版（core/workspace/backup.ts），但读者手里还有第 1～4 版的文件，它们必须照样能导入。
 *                学习状态和理解度仍存在 localStorage，写回去的时候不能写一半坏一半。
 * @design        parseBackup 认第 1～4 版：1 只有心得，2 加学习状态，3 加理解度，4 加学习路径；旧版缺的部分当成空。
 *                校验全部通过才开始写；写之前记下每个键的旧值，写的时候发现本机已变化或写入失败，就把写过的倒着恢复。
 *                默认不覆盖本机已有的记录，读者明确选了才覆盖。
 *                现在谁在用：core/workspace/backup.ts 读旧版备份时调 parseBackup；
 *                components/notes/backup-panel.tsx 导出时用 collectProgress / collectUnderstanding，导入时用 importBackup 写学习状态和理解度那一半。
 *                exportBackup（导出第 4 版）已经没有界面在调用，只剩测试。
 * @courses       UC Berkeley CS186 / CMU 15-445（事务与恢复：要么都成、要么都不算；数据迁移）；
 *                UC Berkeley CS61A（数据抽象）；MIT Missing Semester（数据整理与备份习惯）
 * @exercises     https://cs186berkeley.net/ —— CS186 官方项目里的事务与恢复
 *                https://15445.courses.cs.cmu.edu/ —— CMU 15-445 的日志与故障恢复
 * @prereq        备份是数据的另一份副本；导入不等于把本机数据全删了重来。
 * @unclear       localStorage 没有跨标签页的事务。写之前会再核对一次旧值，能挡掉大部分并发写入，但在核对和写入之间的极短窗口里仍可能被别的标签页插一脚。
 *                长期看，学习状态和理解度也该搬进 IndexedDB，用它自带的事务；目前还留在 localStorage，是因为终端需要同步读取它们。
 *
 * @letter
 * 这个文件是第 1～4 版备份的老家。现在导出的已经是第 5 版了（在 core/workspace/backup.ts），可它还没退休，手上还有两份活：
 * 一是读旧备份，你半年前导出的第 1～4 版文件，先由它按当年的规矩校验一遍，再交给新代码搬成新样子；
 * 二是学习状态和理解度这两样还存在 localStorage 里，导入它们的活仍然归它，因为它有一套“写一半失败就退回去”的保护。
 *
 * 先说旧备份为什么非读不可。这份格式改过好几次：第 1 版只有心得，第 2 版加了学习状态，第 3 版加了理解度，第 4 版加了学习路径。
 * 加个版本号不难，难的是旧版本怎么办。最省事的是“只认最新版”，代码干净，代价是你半年前导出的文件从此打不开了。
 * 而备份这东西存在的全部意义，就是它要比当时的软件活得更久。
 * 所以这里每个旧版本都认，读到旧的，就把当时还不存在的那部分当成空的。一个会让旧备份失效的工具，就不配叫备份工具。
 *
 * 再说导入的那套保护，这是这个文件最值得看的地方。
 *
 * 导入分两段：先把整个文件从头到尾看懂，再开始写。
 * 要是边读边写，写到一半才发现最后一条是坏的，你就得到了半本笔记，而且都不知道哪些进来了、哪些没进来。
 *
 * 真开始写的时候，每改一个键之前，先把它原来的值记下来。
 * 中途要是出了岔子（比如浏览器存储满了），就把已经写过的一条条倒着恢复回去。
 * 这就是数据库课里讲的“事务”的土法版本：要么整次导入都成，要么你的本机数据一点没动。
 *
 * 我得老实说，这只是个近似。localStorage 没有真正的事务，要是你同时开着两个标签页，另一个标签页恰好在这几毫秒里也写了东西，这套保护是拦不住的。
 * 我在写的循环里加了一道检查：写之前再看一眼，要是这个键的值跟刚才记下来的不一样了，就停下、全部退回，让你重新来一次。能挡掉大部分情况，但挡不了全部。
 * 把近似的保证说成绝对的保证，比没有保证还危险，所以这里把边界写清楚。
 *
 * 还有一处小细节：importBackup 里有几行调用了 collectNotes 这些函数，却没人接它们的返回值。那不是写多了。
 * 它们在检查你本机现有的数据能不能全部读懂。万一本机有一条坏记录，宁可整次导入失败，也不能在“看不懂旧数据”的情况下去覆盖它。
 * 读不懂不等于没有，那可能正是你最想找回来的那条。
 */
import { NOTE_PREFIX, noteKey, readNote, validateNote, type Note } from './notes.ts';
import { PROGRESS_PREFIX, progressKey, readProgress, validateProgress, type CourseProgress,
  UNDERSTANDING_PREFIX, understandingKey, readUnderstanding, validateUnderstanding, type ModuleUnderstanding } from '../progress/progress.ts';

import {PATH_PREFIX, pathKey, readPath, validatePath, type LearningPath} from '../paths/paths.ts';

export type NoteStorage = Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
export type Backup = {format:'special-cs-textbook-notes'; version:4; notes:Note[]; progress:CourseProgress[]; understanding:ModuleUnderstanding[]; paths:LearningPath[]};

/** 备份文件里当前使用的格式版本。旧版本仍然接受，见 parseBackup。 */
export const BACKUP_VERSION = 4;

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

export function collectPaths(storage: NoteStorage): LearningPath[] {
  const paths:LearningPath[]=[];
  for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(PATH_PREFIX)){const path=readPath(storage.getItem(key),key.slice(PATH_PREFIX.length));if(path)paths.push(path);}}
  return paths.sort((a,b)=>a.id.localeCompare(b.id));
}

export function exportBackup(storage: NoteStorage): string {
  const data:Backup={format:'special-cs-textbook-notes',version:BACKUP_VERSION,
    notes:collectNotes(storage),progress:collectProgress(storage),understanding:collectUnderstanding(storage),paths:collectPaths(storage)};
  return JSON.stringify(data,null,2)+'\n';
}

export function parseBackup(raw:string):Backup {
  if(raw.length>10_000_000) throw new Error('备份超过 10 MB，未导入。');
  const value=JSON.parse(raw.replace(/^﻿/,''));
  if(!value || value.format!=='special-cs-textbook-notes' || !Array.isArray(value.notes)) throw new Error('不是支持的心得备份格式或版本。');
  // 旧版本照样接受：版本 1 那时只有心得，版本 2 多了学习状态但还没有理解度。
  // 缺的那部分当成空列表往下走，这样读者半年前导出的文件今天仍然打得开。
  if(value.version!==1 && value.version!==2 && value.version!==3 && value.version!==4) throw new Error('不是支持的心得备份格式或版本。');
  const rawProgress=value.version===1?[]:value.progress;
  const rawUnderstanding=value.version>=3?value.understanding:[];
  if(!Array.isArray(rawProgress)) throw new Error('备份里的学习状态不是一份列表。');
  if(!Array.isArray(rawUnderstanding)) throw new Error('备份里的理解度不是一份列表。');
  if(value.notes.length>10_000 || rawProgress.length>10_000 || rawUnderstanding.length>10_000) throw new Error('备份条目过多。');
  const notes:Note[]=value.notes.map(validateNote);
  if(new Set(notes.map(note=>note.page)).size!==notes.length) throw new Error('备份含重复的页面，未导入。');
  const progress:CourseProgress[]=rawProgress.map(validateProgress);
  if(new Set(progress.map(record=>record.course)).size!==progress.length) throw new Error('备份含重复的课程状态，未导入。');
  const understanding:ModuleUnderstanding[]=rawUnderstanding.map(validateUnderstanding);
  if(new Set(understanding.map(record=>record.module)).size!==understanding.length) throw new Error('备份含重复的模块理解度，未导入。');
  const rawPaths=value.version===4?value.paths:[];
  if(!Array.isArray(rawPaths)||rawPaths.length>1000) throw new Error('学习路径列表无效。');
  const paths=rawPaths.map(validatePath);
  if(new Set(paths.map(path=>path.id)).size!==paths.length) throw new Error('备份含重复路径。');
  return {format:'special-cs-textbook-notes',version:BACKUP_VERSION,notes,progress,understanding,paths};
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
  collectPaths(storage);
  const wanted=[
    ...checked.paths.map(path=>({key:pathKey(path.id),value:JSON.stringify(path)})),
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
