/**
 * @module        学习路径与备份的边界测试
 * @problem       个人路线不能因排序、坏备份或另一条路线的变化而丢失。
 * @design        验证引用独立、排序不修改输入、旧版兼容与损坏拒绝。
 * @courses       CS61A 测试；CS186 数据恢复
 * @exercises     https://cs61a.org/ —— 官方测试练习
 * @prereq        测试在内存中模拟存储，不写读者的真实浏览器。
 * @unclear       真实按钮与下载动作由浏览器验收覆盖。
 * @letter
 * 我最担心的不是新增按钮不能按，而是你排好的路线被别的操作悄悄改掉。
 * 所以测试刻意让同一门课出现在两条路径里，再只修改其中一条；另一条必须原样留着。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePath,moveCourse,pathKey} from './paths.ts';
import {exportBackup,importBackup,parseBackup,collectPaths} from '../notes/backup.ts';
const path={id:'one',name:'我的路线',courses:['cs61a','cs61b'],updatedAt:'2026-09-22T00:00:00Z'};
function storage(){const map=new Map<string,string>();return {get length(){return map.size},key:(i:number)=>[...map.keys()][i]??null,getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value)},removeItem:(key:string)=>{map.delete(key)}};}
test('同课可在多条路径，移动只改变返回的新路径',()=>{
 const other={...path,id:'two'};const moved=moveCourse(path,1,-1);
 assert.deepEqual(moved.courses,['cs61b','cs61a']);assert.deepEqual(other.courses,['cs61a','cs61b']);
 assert.deepEqual(moveCourse(path,0,-1),path);
});
test('损坏、重复课程和错误编号均拒绝',()=>{
 for(const bad of [{...path,id:'../x'},{...path,name:''},{...path,courses:['cs61a','cs61a']},{...path,updatedAt:'昨天'}])assert.throws(()=>validatePath(bad));
});
test('两条路径原样备份恢复，旧备份仍可读且不删除路径',()=>{
 const a=storage();a.setItem(pathKey('one'),JSON.stringify(path));a.setItem(pathKey('two'),JSON.stringify({...path,id:'two'}));
 const b=storage();assert.equal(importBackup(b,parseBackup(exportBackup(a)),false),2);assert.equal(collectPaths(b).length,2);
 const old=parseBackup(JSON.stringify({format:'special-cs-textbook-notes',version:3,notes:[],progress:[],understanding:[]}));
 assert.deepEqual(old.paths,[]);importBackup(b,old,true);assert.equal(collectPaths(b).length,2);
 const bad=JSON.parse(exportBackup(a));bad.paths.push(bad.paths[0]);assert.throws(()=>parseBackup(JSON.stringify(bad)));
});
