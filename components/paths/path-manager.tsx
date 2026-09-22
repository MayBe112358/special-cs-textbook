/**
 * @module        读者的学习路径编辑器
 * @problem       读者需要在分类树上选择课程、排列顺序并保存多条路线，而不是被网站指定一条。
 * @design        页面只在挂载后读本机数据；每次操作先验证和写入，再刷新界面。示例只有按下复制才进入本机。
 * @courses       CS50x Web；CS61A 状态；CS61B 树与列表
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 交互式页面
 * @prereq        浏览器本地存储不会跨设备同步，下载备份才能带走数据。
 * @unclear       上下按钮提供键盘可用的排序，目前不做拖放排序；多标签同时编辑不自动合并。
 * @letter
 * 我让课程选择保持分类树的样子，让已经选好的课程显示为有序列表。树回答“有什么”，列表回答“我怎么走”。
 * 这两种结构放在同一页，是为了让你看见目录和个人路线之间的区别。取消勾选只改当前路线。
 * 写入失败时，我不会先把按钮画成成功，因为那会让你误以为已经保存。坏数据也不会当作空列表覆盖。
 * 示例同样不自动保存。只有你决定复制，它才成为你的路线，之后改动与作者示例互不影响。
 */
'use client';
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {moveCourse, pathKey, validatePath, type LearningPath} from '@/core/paths/paths';
import {collectPaths} from '@/core/notes/backup';
import {NotesBackup} from '@/components/notes/notes-backup';
import type {CourseEntry, CategoryEntry} from '@/core/knowledge/knowledge-index';
import example from '@/content/path-example.json';
const CHANGED = 'special-cs-textbook:paths-changed';
export function PathManager({courses, categories}: {courses:CourseEntry[]; categories:CategoryEntry[]}) {
  const [paths,setPaths]=useState<LearningPath[]>([]); const [selected,setSelected]=useState('');
  const [name,setName]=useState(''); const [message,setMessage]=useState('正在读取本机路径……');
  const [ready,setReady]=useState(false);
  function load() {
    try {const value=collectPaths(localStorage);setPaths(value);setReady(true);setMessage('');setSelected(old=>value.some(p=>p.id===old)?old:value[0]?.id??'');}
    catch {setReady(false);setMessage('本机路径无法读取，原数据已保留。请检查存储权限和备份。');}
  }
  useEffect(()=>{load();window.addEventListener('storage',load);window.addEventListener(CHANGED,load);return()=>{window.removeEventListener('storage',load);window.removeEventListener(CHANGED,load);};},[]);
  const active=paths.find(p=>p.id===selected);
  function save(path:LearningPath) {
    try {const checked=validatePath({...path,updatedAt:new Date().toISOString()});localStorage.setItem(pathKey(path.id),JSON.stringify(checked));load();setSelected(path.id);window.dispatchEvent(new Event(CHANGED));}
    catch(error){setMessage(error instanceof Error?error.message:'保存失败，原数据未改动。');}
  }
  function create(fromExample=false) {
    if(!fromExample&&!name.trim()){setMessage('请填写路径名称。');return;}
    save({id:crypto.randomUUID(),name:fromExample?example.name:name.trim(),courses:fromExample?[...example.courses]:[],updatedAt:new Date().toISOString()});setName('');
  }
  function toggle(id:string) {if(active)save({...active,courses:active.courses.includes(id)?active.courses.filter(c=>c!==id):[...active.courses,id]});}
  function branch(path:string):React.ReactNode {
    const category=categories.find(c=>c.path===path);if(!category)return null;
    return <details key={path} className="my-2" open={path==='/'}><summary>{category.title}</summary><div className="ml-4">
      {category.childPaths.map(child=>{const course=courses.find(c=>c.path===child);return course?<label key={child} className="my-2 block"><input type="checkbox" disabled={!ready||!active} checked={active?.courses.includes(course.id)??false} onChange={()=>toggle(course.id)}/> {course.title}</label>:branch(child);})}
    </div></details>;
  }
  return <div className="space-y-6">
    <p>路径只保存在当前浏览器。课程可以加入多条路径，顺序由你决定。</p>
    <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();create();}}>
      <label>新路径名称 <input className="rounded border p-2" value={name} maxLength={100} onChange={e=>setName(e.target.value)} /></label>
      <button disabled={!ready} className="rounded border px-3" type="submit">新建路径</button>
    </form>
    <details><summary>作者路线示例（可选）</summary><p>{example.description}</p><button disabled={!ready} className="my-2 rounded border p-2" onClick={()=>create(true)}>复制示例为我的路径</button></details>
    <label className="block">当前路径 <select className="rounded border p-2" value={selected} disabled={!ready} onChange={e=>setSelected(e.target.value)}><option value="">请选择</option>{paths.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    {active?<section aria-label="当前路径内容">
      <h2 className="text-xl font-semibold">{active.name}</h2>
      <button className="my-2 rounded border p-2" onClick={()=>{if(!window.confirm('删除这条路径？课程、心得和学习状态不受影响。'))return;try{localStorage.removeItem(pathKey(active.id));load();window.dispatchEvent(new Event(CHANGED));}catch{setMessage('删除失败，原数据未改动。');}}}>删除当前路径</button>
      {active.courses.length===0?<p>还没有课程，请在下方分类树勾选。</p>:<ol className="list-decimal pl-6">{active.courses.map((id,i)=>{const course=courses.find(c=>c.id===id);return <li key={id} className="my-3"><span>{course?<Link className="underline" href={course.url}>{course.title}</Link>:`${id}（已不在课程目录）`}</span><span className="ml-3 inline-flex gap-2"><button disabled={i===0} aria-label={`上移 ${id}`} onClick={()=>save(moveCourse(active,i,-1))}>↑</button><button disabled={i===active.courses.length-1} aria-label={`下移 ${id}`} onClick={()=>save(moveCourse(active,i,1))}>↓</button><button aria-label={`移除 ${id}`} onClick={()=>toggle(id)}>移除</button></span></li>;})}</ol>}
    </section>:null}
    <section aria-label="选择课程"><h2 className="text-xl font-semibold">从课程树选择</h2>{branch('/')}</section>
    <p role="status">{message}</p>
    <NotesBackup dirty={false} onImported={load}/>
  </div>;
}
