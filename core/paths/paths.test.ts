/**
 * @module        旧版学习路径的测试——排序不连累别的路线、坏数据一律拒绝、旧备份里的路径能完整回来
 * @problem       旧版路径现在只用于读旧数据，但读的时候一样不能出错：一条坏记录混进来，搬家后的导图就是坏的；
 *                一次导入把已有路线删了，读者排好的计划就没了。
 * @design        用内存里的假存储，不碰真实浏览器。验证三件事：moveCourse 不修改原路线、校验拒绝各种坏数据、
 *                备份导出再导入后路线完整，且导入没有路径的老版本备份时不会删掉已有路线。
 * @courses       UC Berkeley CS61A（不可变数据、测试）；UC Berkeley CS186 / CMU 15-445（数据恢复与校验）
 * @exercises     https://sp21.datastructur.es/materials/lab/lab3/lab3 —— CS61B Lab 3：怎么写测试来抓错
 * @prereq        读过 core/paths/paths 那一章。
 * @unclear       导图版路径（core/workspace/learning-paths）的测试在 core/workspace/workspace.test.ts 里，不在这里。
 * @letter
 * 这三个测试守的是旧版学习路径（一串课程编号那一代）。现在界面上已经是导图版了，但旧数据还得读得出来，这些测试就是替旧格式站岗的。
 *
 * 我最怕的不是哪个按钮按不动，而是你排好的路线被别的操作悄悄改掉。
 * 所以第一个测试故意让同一门课出现在两条路线里，只动其中一条，另一条必须原封不动。
 * moveCourse 返回的是一条新路线，原来那条一个字都不改。这种“不改原来的，返回一个新的”的写法，CS61A 讲不可变数据时会反复强调，它让这类“改 A 把 B 也改了”的事故没机会发生。
 *
 * 第二个测试拿一堆坏数据去喂校验函数：编号里带 ../、名字是空的、同一门课出现两次、时间写成“昨天”。
 * 每一个都必须被拒绝。旧数据是最不可信的，校验宽松一点，坏数据就混进新格式里去了。
 *
 * 第三个测试把两条路线导出、再导进一个空的存储，看它们是不是完整回来了；
 * 再拿一份第 3 版的老备份（那时候还没有路径）导进去，确认它不会把已有的路线当成“备份里没有，那就删掉”。
 * 备份里没有，只说明备份那天还没有这个东西，不代表你想删掉它。
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
