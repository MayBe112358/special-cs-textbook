/**
 * @module        心得、学习状态与理解度恢复的数据保护测试
 * @problem       导入看起来能成功还不够，坏文件、冲突和写到一半失败都可能伤害原数据。
 *                备份格式每加一样东西就升一位版本，于是又多了一条要守的承诺：
 *                读者半年前导出的旧版本文件，今天还打不打得开。
 * @design        用内存模拟存储，主动制造写入失败，验证先校验、保留冲突和回滚的承诺；
 *                另外单独验证版本 1、2 的旧备份仍然能导入，以及三种数据共用同一套回滚保证。
 * @courses       UC Berkeley CS186（事务恢复）；UC Berkeley CS61A（抽象与测试）
 * @exercises     https://cs186berkeley.net/ —— 官方数据库项目
 * @prereq        测试替身能模拟浏览器存储故障，而不需要真的填满硬盘。
 * @unclear       浏览器交互另做真实页面检查，这里只验证数据边界。
 *
 * @letter
 * 如果只拿一个正常文件导入一次，最危险的情况一个都没碰到。这里故意把输入变坏，把存储写坏。
 * 我希望你看到：测试不是证明代码行被运行过，而是把对读者的承诺变成可以反复执行的问题。
 * 尤其是那几个失败案例，如果前两条写进去了、第三条抛错，原数据还能回来吗？这是恢复工具必须回答的问题。
 *
 * 那条"旧版本备份仍然能导入"值得多说一句。它测的不是代码，是一个承诺的有效期。
 * 你导出备份的那一刻，和你需要它的那一刻，中间可能隔着很久，久到软件已经改过好几轮。
 * 备份文件的价值恰恰在于它比软件活得更久——所以每次改格式，都要有一条测试盯着旧格式还读不读得进来。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {exportBackup,parseBackup,importBackup,collectProgress,collectUnderstanding,type NoteStorage,type Backup} from './backup.ts';
import {noteKey,readNote} from './notes.ts';
import {progressKey,readProgress,understandingKey,readUnderstanding,type CourseProgress,type ModuleUnderstanding} from '../progress/progress.ts';
function storage(failAt=Infinity):NoteStorage {
  const values=new Map<string,string>();let writes=0;
  return {get length(){return values.size},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,
    setItem(k,v){if(++writes===failAt)throw new Error('quota');values.set(k,v)},removeItem:k=>{values.delete(k)}};
}
const note=(page:string,text='心得')=>({page,text,updatedAt:'2026-09-18T00:00:00.000Z'});
const mark=(course:string,state:CourseProgress['state']='learning'):CourseProgress=>({course,state,updatedAt:'2026-09-18T00:00:00.000Z'});
const grok=(module:string,state:ModuleUnderstanding['state']='understood'):ModuleUnderstanding=>({module,state,updatedAt:'2026-09-18T00:00:00.000Z'});
const backup=(notes:ReturnType<typeof note>[]=[],progress:CourseProgress[]=[],understanding:ModuleUnderstanding[]=[]):Backup=>
  ({format:'special-cs-textbook-notes',version:3,notes,progress,understanding});
const MOD='/internals/core/progress/progress';

test('备份只包含本项目数据，中文可读，清空后三样一起回来',()=>{
 const s=storage();s.setItem('other-app','private');
 s.setItem(noteKey('/cs61a'),JSON.stringify(note('/cs61a','中文心得')));
 s.setItem(progressKey('cs61a'),JSON.stringify(mark('cs61a','done')));
 s.setItem(understandingKey(MOD),JSON.stringify(grok(MOD)));
 const raw=exportBackup(s);
 assert.match(raw,/中文心得/);assert.match(raw,/"done"/);assert.match(raw,/"understood"/);
 assert.doesNotMatch(raw,/other-app|private/);
 const restored=storage();assert.equal(importBackup(restored,parseBackup(raw),false),3);
 assert.equal(readNote(restored.getItem(noteKey('/cs61a')),'/cs61a')?.text,'中文心得');
 assert.equal(readProgress(restored.getItem(progressKey('cs61a')),'cs61a')?.state,'done');
 assert.equal(readUnderstanding(restored.getItem(understandingKey(MOD)),MOD)?.state,'understood');
});

test('版本 1 和版本 2 的旧备份都仍然能导入，缺的那部分当成空',()=>{
 const v1=JSON.stringify({format:'special-cs-textbook-notes',version:1,notes:[note('/cs61a','旧备份')]});
 const p1=parseBackup(v1);assert.deepEqual(p1.progress,[]);assert.deepEqual(p1.understanding,[]);
 const s=storage();assert.equal(importBackup(s,p1,false),1);
 assert.equal(readNote(s.getItem(noteKey('/cs61a')),'/cs61a')?.text,'旧备份');
 assert.deepEqual(collectProgress(s),[]);assert.deepEqual(collectUnderstanding(s),[]);
 const v2=JSON.stringify({format:'special-cs-textbook-notes',version:2,notes:[],progress:[mark('cs70','todo')]});
 const p2=parseBackup(v2);assert.equal(p2.progress.length,1);assert.deepEqual(p2.understanding,[]);
 const t=storage();assert.equal(importBackup(t,p2,false),1);
 assert.deepEqual(collectUnderstanding(t),[]);
});

test('坏版本、重复条目、无效路径和坏记录整体拒绝',()=>{
 const bad=[{...backup(),version:4},
  backup([note('/x'),note('/x')]),backup([note('/../x')]),backup([{...note('/x'),text:42} as never]),
  backup([],[mark('cs61a'),mark('cs61a')]),backup([],[{...mark('cs61a'),state:'放弃'} as never]),{...backup(),progress:'不是列表'},
  backup([],[],[grok(MOD),grok(MOD)]),backup([],[],[{...grok(MOD),state:'看过'} as never]),
  backup([],[],[grok('internals/x')]),{...backup(),understanding:'不是列表'}];
 for(const data of bad)assert.throws(()=>parseBackup(JSON.stringify(data)));
 const s=storage();assert.throws(()=>importBackup(s,backup([note('/good')],[{course:'bad'} as never]),true));assert.equal(s.length,0);
});

test('默认保留冲突，明确选择覆盖才改旧数据；三种数据规则一致',()=>{
 const s=storage();
 s.setItem(noteKey('/x'),JSON.stringify(note('/x','旧')));
 s.setItem(progressKey('cs61a'),JSON.stringify(mark('cs61a','todo')));
 s.setItem(understandingKey(MOD),JSON.stringify(grok(MOD,'unread')));
 assert.equal(importBackup(s,backup([note('/x','新'),note('/y')],[mark('cs61a','done'),mark('cs70','todo')],[grok(MOD),grok('/internals/x')]),false),3);
 assert.equal(readNote(s.getItem(noteKey('/x')),'/x')?.text,'旧');
 assert.equal(readProgress(s.getItem(progressKey('cs61a')),'cs61a')?.state,'todo');
 assert.equal(readUnderstanding(s.getItem(understandingKey(MOD)),MOD)?.state,'unread');
 importBackup(s,backup([note('/x','新')],[mark('cs61a','done')],[grok(MOD)]),true);
 assert.equal(readNote(s.getItem(noteKey('/x')),'/x')?.text,'新');
 assert.equal(readProgress(s.getItem(progressKey('cs61a')),'cs61a')?.state,'done');
 assert.equal(readUnderstanding(s.getItem(understandingKey(MOD)),MOD)?.state,'understood');
});

test('第二条写入失败时回滚第一条，其他数据不动',()=>{
 const s=storage(3);s.setItem(noteKey('/x'),JSON.stringify(note('/x','原文')));
 assert.throws(()=>importBackup(s,backup([note('/x','替换'),note('/y')]),true),/quota/);
 assert.equal(readNote(s.getItem(noteKey('/x')),'/x')?.text,'原文');assert.equal(s.getItem(noteKey('/y')),null);
});

test('三种数据共用同一套回滚：写到第三条失败时，前两条都要退回去',()=>{
 const s=storage(3);
 assert.throws(()=>importBackup(s,backup([note('/x','心得')],[mark('cs61a')],[grok('/internals/x')]),true),/quota/);
 assert.equal(s.getItem(noteKey('/x')),null);
 assert.equal(s.getItem(progressKey('cs61a')),null);
 assert.equal(s.getItem(understandingKey('/internals/x')),null);
});

test('损坏的本机数据不能被当成空数据覆盖',()=>{
 const s=storage();s.setItem(noteKey('/x'),'{broken');
 assert.throws(()=>importBackup(s,backup([note('/x')]),true));assert.equal(s.getItem(noteKey('/x')),'{broken');
 const t=storage();t.setItem(progressKey('cs61a'),'{broken');assert.throws(()=>collectProgress(t));
 const u=storage();u.setItem(understandingKey('/internals/x'),'{broken');
 assert.throws(()=>importBackup(u,backup([],[],[grok('/internals/x')]),true));
 assert.equal(u.getItem(understandingKey('/internals/x')),'{broken');
});
