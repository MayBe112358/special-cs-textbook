/**
 * @module        心得备份与恢复
 * @problem       浏览器数据会被清理，读者需要一份自己拿得走、读得懂、能恢复的备份，导入失败时不能损坏旧心得。
 * @design        版本化 JSON 只包含私人心得；先校验全部记录再写入，默认保留冲突的本机记录，失败时回滚已写条目。
 * @courses       CS186 事务与数据完整性；CS61A 数据抽象；MIT Missing Semester 数据整理
 * @exercises     https://cs186berkeley.net/ —— 官方项目中的恢复和事务主题
 * @prereq        备份是保存数据的另一份副本；导入不应等于删除本机全部数据。
 * @unclear       localStorage 不提供跨标签页事务，校验与写入之间极短的并发窗口仍存在；长期应使用支持事务的存储。
 * @letter
 * 我把导入分成两段：先看懂整个文件，再开始写。否则写到一半才发现最后一条坏了，读者就会得到半本笔记。
 * 同一页在本机和文件里都有心得时，默认保留本机版本，你可以明确选择覆盖。没有冲突的页面总会合并进来。
 * 浏览器写入也可能失败，所以我先记住每个将修改的旧值。如果中途空间不足，就把已经写过的恢复回去。
 * 这不是数据库级的事务，另一标签页仍可能同时写；注释里把这个边界留下，是为了不把近似保证当成绝对保证。
 * 导出只读取本项目自己的键，也不带作者心得、账号或别的网站数据；可读 JSON 让你用记事本就能核对文字还在。
 */
import {NOTE_PREFIX, noteKey, readNote, validateNote, type Note} from './notes.ts';
export type NoteStorage = Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
export type Backup = {format:'special-cs-textbook-notes'; version:1; notes:Note[]};
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
export function exportNotes(storage: NoteStorage): string {
  const data:Backup={format:'special-cs-textbook-notes',version:1,notes:collectNotes(storage)};
  return JSON.stringify(data,null,2)+'\n';
}
export function parseBackup(raw:string):Backup {
  if(raw.length>10_000_000) throw new Error('备份超过 10 MB，未导入。');
  const value=JSON.parse(raw.replace(/^\uFEFF/,''));
  if(!value || value.format!=='special-cs-textbook-notes' || value.version!==1 || !Array.isArray(value.notes)) throw new Error('不是支持的心得备份格式或版本。');
  if(value.notes.length>10_000) throw new Error('备份条目过多。');
  const notes:Note[]=value.notes.map(validateNote);
  if(new Set(notes.map(note=>note.page)).size!==notes.length) throw new Error('备份含重复的页面，未导入。');
  return {format:'special-cs-textbook-notes',version:1,notes};
}
export function importNotes(storage:NoteStorage, backup:Backup, overwrite:boolean):number {
  // 不信任调用者传入的对象，也不在校验完成前进行任何写入。
  const checked=parseBackup(JSON.stringify(backup));
  collectNotes(storage);
  const changes=checked.notes.map(note=>({key:noteKey(note.page),old:storage.getItem(noteKey(note.page)),value:JSON.stringify(note)}))
    .filter(change=>overwrite || change.old===null);
  const written:typeof changes=[];
  try {
    for(const change of changes) {
      if(storage.getItem(change.key)!==change.old) throw new Error('本机心得已变化，请重新预览。');
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
