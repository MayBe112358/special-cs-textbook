/**
 * @module        心得恢复的数据保护测试
 * @problem       导入看起来能成功还不够，坏文件、冲突和写到一半失败都可能伤害原笔记。
 * @design        用内存模拟存储，主动制造第二次写入失败，验证先校验、保留冲突和回滚的承诺。
 * @courses       CS186 事务恢复；CS61A 抽象与测试
 * @exercises     https://cs186berkeley.net/ —— 官方数据库项目
 * @prereq        测试替身能模拟浏览器存储故障，而不需要真的填满硬盘。
 * @unclear       浏览器交互另做真实页面检查，这里只验证数据边界。
 * @letter
 * 如果只拿一个正常文件导入一次，最危险的情况一个都没碰到。这里故意把输入变坏，把存储写坏。
 * 我希望你看到：测试不是证明代码行被运行过，而是把对读者的承诺变成可以反复执行的问题。
 * 尤其是最后那个失败案例，如果第一条写进去了、第二条抛错，原数据还能回来吗？这是恢复工具必须回答的问题。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {exportNotes,parseBackup,importNotes,type NoteStorage,type Backup} from './backup.ts';
import {noteKey,readNote} from './notes.ts';
function storage(failAt=Infinity):NoteStorage {
  const values=new Map<string,string>();let writes=0;
  return {get length(){return values.size},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,
    setItem(k,v){if(++writes===failAt)throw new Error('quota');values.set(k,v)},removeItem:k=>{values.delete(k)}};
}
const note=(page:string,text='心得')=>({page,text,updatedAt:'2026-09-18T00:00:00.000Z'});
const backup=(...notes:ReturnType<typeof note>[]):Backup=>({format:'special-cs-textbook-notes',version:1,notes});
test('备份只包含本项目心得，中文可读，清空后可恢复',()=>{
 const s=storage();s.setItem('other-app','private');s.setItem(noteKey('/cs61a'),JSON.stringify(note('/cs61a','中文心得')));
 const raw=exportNotes(s);assert.match(raw,/中文心得/);assert.doesNotMatch(raw,/other-app|private/);
 const restored=storage();assert.equal(importNotes(restored,parseBackup(raw),false),1);assert.equal(readNote(restored.getItem(noteKey('/cs61a')),'/cs61a')?.text,'中文心得');
});
test('坏版本、重复页、无效路径和坏记录整体拒绝',()=>{
 for(const data of [{...backup(),version:2},backup(note('/x'),note('/x')),backup(note('/../x')),backup({...note('/x'),text:42} as never)])assert.throws(()=>parseBackup(JSON.stringify(data)));
 const s=storage();assert.throws(()=>importNotes(s,backup(note('/good'),{page:'/bad'} as never),true));assert.equal(s.length,0);
});
test('默认保留冲突，明确选择覆盖才改旧心得',()=>{
 const s=storage();s.setItem(noteKey('/x'),JSON.stringify(note('/x','旧')));
 assert.equal(importNotes(s,backup(note('/x','新'),note('/y')),false),1);assert.equal(readNote(s.getItem(noteKey('/x')),'/x')?.text,'旧');
 importNotes(s,backup(note('/x','新')),true);assert.equal(readNote(s.getItem(noteKey('/x')),'/x')?.text,'新');
});
test('第二条写入失败时回滚第一条，其他数据不动',()=>{
 const s=storage(3);s.setItem(noteKey('/x'),JSON.stringify(note('/x','原文')));
 assert.throws(()=>importNotes(s,backup(note('/x','替换'),note('/y')),true),/quota/);
 assert.equal(readNote(s.getItem(noteKey('/x')),'/x')?.text,'原文');assert.equal(s.getItem(noteKey('/y')),null);
});
test('损坏的本机心得不能被当成空数据覆盖',()=>{
 const s=storage();s.setItem(noteKey('/x'),'{broken');assert.throws(()=>importNotes(s,backup(note('/x')),true));assert.equal(s.getItem(noteKey('/x')),'{broken');
});
