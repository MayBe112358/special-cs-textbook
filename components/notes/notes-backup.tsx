/**
 * @module        心得备份的页面操作
 * @problem       读者需要从页面下载备份、选择文件并看清导入会影响哪些心得。
 * @design        使用浏览器文件和下载接口；选择文件只预览，确认后才写，默认不覆盖已有记录；本页有草稿时先要求保存。
 *                整块默认折叠在“备份与恢复”下面：它很重要，但不是每读一页都要用。
 * @courses       CS50x Web 开发；CS186 数据恢复
 * @exercises     https://cs50.harvard.edu/x/psets/9/finance/ —— 用户输入、校验与反馈
 * @prereq        文件选择不等于上传，所选 JSON 只在当前浏览器读取。
 * @unclear       下载是否被浏览器最终保存不在网页控制内，请读者检查下载目录。
 * @letter
 * 我没有在你选中文件那一刻就恢复数据。先展示数量、再让你确认，是为了把误选文件的代价降下来。
 * 导出只包含已经保存的心得，草稿还在输入框里，因此有草稿时先提醒保存，避免“备份成功”却少了刚写的一段。
 * 文件从头到尾留在本机：File.text 读取，Blob 生成下载，代码没有把私人文字发送到服务器的步骤。
 * 和存储相关的错误会在原地显示。错误不是让网页崩溃的理由，更不能作为清空所有心得重新开始的借口。
 */
'use client';
import {useState} from 'react';
import {notifyProgressChanged} from '@/components/progress/progress-store';
import {collectPaths,collectNotes,collectProgress,collectUnderstanding,exportBackup,importBackup,parseBackup,type Backup} from '@/core/notes/backup';
export function NotesBackup({dirty,onImported}:{dirty:boolean;onImported:()=>void}) {
  const [pending,setPending]=useState<Backup|null>(null);
  const [conflicts,setConflicts]=useState(0);
  const [overwrite,setOverwrite]=useState(false);
  const [message,setMessage]=useState('');
  function download() {
    try {
      const blob=new Blob([exportBackup(localStorage)],{type:'application/json;charset=utf-8'});
      const url=URL.createObjectURL(blob); const a=document.createElement('a');
      a.href=url;a.download=`cs-textbook-notes-${new Date().toISOString().slice(0,10)}.json`;
      a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('已生成备份，请检查浏览器下载目录。');
    } catch {setMessage('导出失败。本机数据未改动，请检查存储权限与已保存数据。');}
  }
  async function preview(file:File|undefined) {
    setPending(null);setOverwrite(false);
    if(!file) return;
    try {
      if(file.size>10_000_000) throw new Error('备份超过 10 MB，未导入。');
      const backup=parseBackup(await file.text());
      const existingPaths=new Set(collectPaths(localStorage).map(path=>path.id));
      const existingNotes=new Set(collectNotes(localStorage).map(note=>note.page));
      const existingCourses=new Set(collectProgress(localStorage).map(record=>record.course));
      const existingModules=new Set(collectUnderstanding(localStorage).map(record=>record.module));
      setConflicts(backup.paths.filter(path=>existingPaths.has(path.id)).length+backup.notes.filter(note=>existingNotes.has(note.page)).length
        +backup.progress.filter(record=>existingCourses.has(record.course)).length
        +backup.understanding.filter(record=>existingModules.has(record.module)).length);
      setPending(backup);setMessage('文件已读取，尚未写入。');
    } catch(error) {setMessage(`无法导入：${error instanceof Error?error.message:'文件读取失败'} 原数据未改动。`);}
  }
  // 备份不是每次都要用的东西，默认收起来，免得每一页底下都压着一大段说明。
  return <details className="group border-t border-fd-border pt-2.5 text-sm">
    <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-fd-muted-foreground hover:text-fd-foreground [&::-webkit-details-marker]:hidden">
      <span aria-hidden="true" className="inline-block transition-transform duration-150 group-open:rotate-90">›</span>备份与恢复
    </summary>
    <div className="mt-2 space-y-2.5">
      <p className="text-fd-muted-foreground">一份文件同时带走私人心得、每门课的学习状态、每段代码的理解度和学习路径，导出和导入都在本机完成。默认保留已有数据，导入只补上缺少的部分；旧版本的备份也能导入。</p>
      {dirty?<p className="text-cs-warn">请先保存本页草稿，再备份或导入。</p>:null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={download} disabled={dirty} className="cs-btn">导出备份</button>
        {/* 原生的文件选择框在各个浏览器里长得都不一样，这里把它藏起来，让一个普通按钮代它出面。 */}
        <label className={`cs-btn ${dirty?'pointer-events-none opacity-50':''}`}>选择备份文件…
          <input type="file" accept=".json,application/json" disabled={dirty} className="sr-only"
            onChange={(event)=>{void preview(event.target.files?.[0]);event.target.value='';}} />
        </label>
      </div>
      {pending?<div className="space-y-2 rounded-[4px] border border-fd-border bg-fd-background p-3">
        <p>备份含 {pending.notes.length} 页心得、{pending.progress.length} 门课的状态、{pending.understanding.length} 段代码的理解度、{pending.paths.length} 条路径，其中 {conflicts} 条与本机已有数据重合。</p>
        {conflicts>0?<label className="flex items-center gap-2"><input type="checkbox" className="accent-cs-button" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/> 用备份覆盖重合的本机数据</label>:null}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={dirty} className="cs-btn cs-btn-primary" onClick={()=>{
            try {const count=importBackup(localStorage,pending,overwrite);setPending(null);setMessage(`已导入 ${count} 条记录。`);notifyProgressChanged();window.dispatchEvent(new Event("special-cs-textbook:paths-changed"));onImported();}
            catch(error){setMessage(`恢复失败：${error instanceof Error?error.message:'存储不可用'}。请保留备份文件。`);}
          }}>确认导入</button>
          <button type="button" className="cs-btn" onClick={()=>setPending(null)}>取消</button>
        </div>
      </div>:null}
      <p role="status" className="text-fd-muted-foreground empty:hidden">{message}</p>
    </div>
  </details>;
}
