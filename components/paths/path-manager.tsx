/**
 * @module        读者的学习路径编辑器
 * @problem       读者需要在分类树上选择课程、排列顺序并保存多条路线，而不是被网站指定一条。
 * @design        页面只在挂载后读本机数据；每次操作先验证和写入，再刷新界面。示例只有按下复制才进入本机。
 *                阶段 14 起：路径用一排标签切换（代替下拉框），删除在原地确认（代替浏览器弹窗），
 *                课程树每个分类后面写着“已选几门”，折起来也知道里面勾过什么。
 * @courses       CS50x Web；CS61A 状态；CS61B 树与列表；Stanford CS147（可见性、防误操作）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 交互式页面
 * @prereq        浏览器本地存储不会跨设备同步，下载备份才能带走数据。
 * @unclear       上下按钮提供键盘可用的排序，目前不做拖放排序；多标签同时编辑不自动合并。
 * @letter
 * 我让课程选择保持分类树的样子，让已经选好的课程显示为有序列表。树回答“有什么”，列表回答“我怎么走”。
 * 这两种结构放在同一页，是为了让你看见目录和个人路线之间的区别。取消勾选只改当前路线。
 * 写入失败时，我不会先把按钮画成成功，因为那会让你误以为已经保存。坏数据也不会当作空列表覆盖。
 * 示例同样不自动保存。只有你决定复制，它才成为你的路线，之后改动与作者示例互不影响。
 *
 * 为什么把下拉框换成一排标签？下拉框一次只露出一个名字，你得点开它才知道自己有几条路线；
 * 标签把所有路线都摆在眼前，后面还跟着各自有几门课。切换也只要点一下，不用先展开再选。
 * 路线多到一行放不下时，标签会自动换行——这比一个越来越长的下拉菜单好找。
 */
'use client';
import {useEffect, useState, type ReactNode} from 'react';
import Link from 'next/link';
import {moveCourse, pathKey, validatePath, type LearningPath} from '@/core/paths/paths';
import {collectPaths} from '@/core/notes/backup';
import {NotesBackup} from '@/components/notes/notes-backup';
import type {CourseEntry, CategoryEntry} from '@/core/knowledge/knowledge-index';
import example from '@/content/path-example.json';
const CHANGED = 'special-cs-textbook:paths-changed';

function ArrowIcon({up}:{up:boolean}){
  return <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={up?'M4 10l4-4 4 4':'M4 6l4 4 4-4'} strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function CloseIcon(){
  return <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" strokeLinecap="round"/></svg>;
}
const ICON_BUTTON = 'grid size-7 place-items-center rounded-[3px] text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-foreground disabled:pointer-events-none disabled:opacity-30';

export function PathManager({courses, categories}: {courses:CourseEntry[]; categories:CategoryEntry[]}) {
  const [paths,setPaths]=useState<LearningPath[]>([]); const [selected,setSelected]=useState('');
  const [name,setName]=useState(''); const [message,setMessage]=useState('');
  const [ready,setReady]=useState(false);
  const [confirmingDelete,setConfirmingDelete]=useState(false);
  function load() {
    try {const value=collectPaths(localStorage);setPaths(value);setReady(true);setSelected(old=>value.some(p=>p.id===old)?old:value[0]?.id??'');}
    catch {setReady(false);setMessage('本机路径无法读取，原数据已保留。请检查存储权限和备份。');}
  }
  useEffect(()=>{load();window.addEventListener('storage',load);window.addEventListener(CHANGED,load);return()=>{window.removeEventListener('storage',load);window.removeEventListener(CHANGED,load);};},[]);
  // 换了一条路径，上一条的“确定删除？”就不该还挂着。
  useEffect(()=>setConfirmingDelete(false),[selected]);
  const active=paths.find(p=>p.id===selected);
  function save(path:LearningPath) {
    try {const checked=validatePath({...path,updatedAt:new Date().toISOString()});localStorage.setItem(pathKey(path.id),JSON.stringify(checked));load();setSelected(path.id);window.dispatchEvent(new Event(CHANGED));}
    catch(error){setMessage(error instanceof Error?error.message:'保存失败，原数据未改动。');}
  }
  function create(fromExample=false) {
    if(!fromExample&&!name.trim()){setMessage('先给新路径起个名字。');return;}
    save({id:crypto.randomUUID(),name:fromExample?example.name:name.trim(),courses:fromExample?[...example.courses]:[],updatedAt:new Date().toISOString()});setName('');
    setMessage(fromExample?'已复制示例。现在它是你的路径了，之后怎么改都和作者的示例无关。':'');
  }
  function remove() {
    if(!active)return;
    try{localStorage.removeItem(pathKey(active.id));load();window.dispatchEvent(new Event(CHANGED));setMessage(`已删除「${active.name}」。课程、心得和学习状态不受影响。`);}
    catch{setMessage('删除失败，原数据未改动。');}
  }
  function toggle(id:string) {if(active)save({...active,courses:active.courses.includes(id)?active.courses.filter(c=>c!==id):[...active.courses,id]});}
  /** 一个分类下面（包括更深的子分类）有几门课在当前路径里。 */
  function countIn(path:string):number{
    const category=categories.find(c=>c.path===path);if(!category||!active)return 0;
    return category.childPaths.reduce((sum,child)=>{const course=courses.find(c=>c.path===child);return sum+(course?(active.courses.includes(course.id)?1:0):countIn(child));},0);
  }
  function branch(path:string):ReactNode {
    const category=categories.find(c=>c.path===path);if(!category)return null;
    const items=category.childPaths.map(child=>{
      const course=courses.find(c=>c.path===child);
      if(!course)return branch(child);
      return <label key={child} className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2 py-1 hover:bg-cs-hover has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
        <input type="checkbox" className="size-3.5 shrink-0 accent-cs-button" disabled={!ready||!active} checked={active?.courses.includes(course.id)??false} onChange={()=>toggle(course.id)}/>
        <span className="min-w-0 flex-1 truncate">{course.title}</span>
        <span className="hidden font-mono text-xs text-fd-muted-foreground sm:inline">{course.id}</span>
      </label>;
    });
    if(path==='/')return <div className="space-y-0.5">{items}</div>;
    const count=countIn(path);
    return <details key={path} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-[3px] px-2 py-1 hover:bg-cs-hover [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block w-3 text-fd-muted-foreground transition-transform duration-150 group-open:rotate-90">›</span>
        <span className="flex-1">{category.title}</span>
        {count>0?<span className="cs-chip border-transparent bg-cs-active text-fd-foreground">已选 {count}</span>:null}
      </summary>
      <div className="ml-3 border-l border-fd-border pl-2">{items}</div>
    </details>;
  }
  return <div className="space-y-8">
    <section aria-label="我的路径" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {paths.map(p=><button key={p.id} type="button" aria-pressed={p.id===selected} onClick={()=>setSelected(p.id)}
          className={`cs-btn ${p.id===selected?'cs-btn-primary':''}`}>{p.name}<span className="tabular-nums opacity-70">{p.courses.length}</span></button>)}
        {ready&&paths.length===0?<span className="text-sm text-fd-muted-foreground">还没有路径。新建一条，或者复制页面下方作者的示例。</span>:null}
      </div>
      <form className="flex flex-wrap items-center gap-2" onSubmit={e=>{e.preventDefault();create();}}>
        <label className="sr-only" htmlFor="new-path-name">新路径名称</label>
        <input id="new-path-name" className="cs-input w-64 max-w-full" placeholder="新路径的名字，比如「先打系统基础」" value={name} maxLength={100} onChange={e=>setName(e.target.value)} />
        <button disabled={!ready} className="cs-btn" type="submit">新建路径</button>
      </form>
    </section>

    {active?<section aria-label="当前路径内容" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-fd-border pb-2">
        <h2 className="text-xl font-semibold">{active.name}</h2>
        <span className="text-sm text-fd-muted-foreground">{active.courses.length} 门课</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {confirmingDelete?<>
            <span className="text-sm">删除这条路径？课程、心得和学习状态不受影响。</span>
            <button type="button" className="cs-btn cs-btn-danger" autoFocus onClick={remove}>确定删除</button>
            <button type="button" className="cs-btn" onClick={()=>setConfirmingDelete(false)}>取消</button>
          </>:<button type="button" className="cs-btn" onClick={()=>setConfirmingDelete(true)}>删除这条路径</button>}
        </span>
      </div>
      {active.courses.length===0?<p className="text-sm text-fd-muted-foreground">还没有课程。在下面的课程树里勾选，勾选的先后就是路线的初始顺序，之后可以用箭头调整。</p>:
      <ol className="divide-y divide-fd-border overflow-hidden rounded-md border border-fd-border">{active.courses.map((id,i)=>{
        const course=courses.find(c=>c.id===id);
        return <li key={id} className="flex items-center gap-3 bg-fd-background px-3 py-1.5 transition-colors hover:bg-cs-hover">
          <span className="w-5 text-right font-mono text-xs tabular-nums text-fd-muted-foreground">{i+1}</span>
          <span className="min-w-0 flex-1 truncate">{course?<Link className="text-fd-foreground hover:text-fd-primary hover:underline" href={course.url}>{course.title}</Link>:<span className="text-fd-muted-foreground">{id}（已不在课程目录）</span>}</span>
          <span className="flex shrink-0 gap-0.5">
            <button type="button" className={ICON_BUTTON} disabled={i===0} aria-label={`上移 ${id}`} title="上移" onClick={()=>save(moveCourse(active,i,-1))}><ArrowIcon up/></button>
            <button type="button" className={ICON_BUTTON} disabled={i===active.courses.length-1} aria-label={`下移 ${id}`} title="下移" onClick={()=>save(moveCourse(active,i,1))}><ArrowIcon up={false}/></button>
            <button type="button" className={`${ICON_BUTTON} hover:text-cs-error`} aria-label={`移除 ${id}`} title="从这条路径移除" onClick={()=>toggle(id)}><CloseIcon/></button>
          </span>
        </li>;
      })}</ol>}
    </section>:null}

    <p role="status" className={message?'text-sm text-fd-muted-foreground':'sr-only'}>{message}</p>

    <section aria-label="选择课程" className="space-y-2">
      <h2 className="text-lg font-semibold">从课程树选择</h2>
      {ready&&!active?<p className="text-sm text-fd-muted-foreground">先新建或选中一条路径，再勾选课程。</p>:null}
      <div className="cs-card px-2 py-2 text-sm">{branch('/')}</div>
    </section>

    <section aria-label="作者路线示例" className="cs-card space-y-2">
      <h2 className="cs-eyebrow text-cs-author">作者的路线示例（可选）</h2>
      <p className="text-sm leading-relaxed text-fd-muted-foreground">{example.description}</p>
      <button type="button" disabled={!ready} className="cs-btn" onClick={()=>create(true)}>复制为我的路径</button>
    </section>

    <NotesBackup dirty={false} onImported={load}/>
  </div>;
}
