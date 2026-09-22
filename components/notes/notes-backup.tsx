/**
 * @module        心得备份的页面操作
 * @problem       读者需要从页面下载备份、选择文件并看清导入会影响哪些心得。
 * @design        使用浏览器文件和下载接口；选择文件只预览，确认后才写，默认不覆盖已有记录；本页有草稿时先要求保存。
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
import {collectNotes,collectProgress,collectUnderstanding,exportBackup,importBackup,parseBackup,type Backup} from '@/core/notes/backup';
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
      const existingNotes=new Set(collectNotes(localStorage).map(note=>note.page));
      const existingCourses=new Set(collectProgress(localStorage).map(record=>record.course));
      const existingModules=new Set(collectUnderstanding(localStorage).map(record=>record.module));
      setConflicts(backup.notes.filter(note=>existingNotes.has(note.page)).length
        +backup.progress.filter(record=>existingCourses.has(record.course)).length
        +backup.understanding.filter(record=>existingModules.has(record.module)).length);
      setPending(backup);setMessage('文件已读取，尚未写入。');
    } catch(error) {setMessage(`无法导入：${error instanceof Error?error.message:'文件读取失败'} 原数据未改动。`);}
  }
  return <div className="mt-5 border-t border-fd-border pt-4">
    <h3 className="font-semibold">备份私人心得与进度</h3>
    <p className="my-2 text-sm">导出和导入都在本机完成，一份文件同时带走私人心得、每门课的学习状态和每段代码的理解度。默认保留已有数据，导入只补上缺少的部分。旧版本的备份仍然能导入，缺的那部分当成空。</p>
    {dirty?<p className="text-sm">请先保存本页草稿，再备份或导入。</p>:null}
    <button type="button" onClick={download} disabled={dirty} className="my-2 rounded border px-3 py-1 disabled:opacity-50">导出心得与进度</button>
    <label className="block">选择备份文件
      <input type="file" accept=".json,application/json" disabled={dirty} className="my-2 block max-w-full"
        onChange={(event)=>{void preview(event.target.files?.[0]);event.target.value='';}} />
    </label>
    {pending?<div className="my-2 rounded border p-3">
      <p>备份含 {pending.notes.length} 页心得、{pending.progress.length} 门课的状态、{pending.understanding.length} 段代码的理解度，其中 {conflicts} 条与本机已有数据重合。</p>
      {conflicts>0?<label className="my-2 block"><input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/> 用备份覆盖重合的本机数据</label>:null}
      <button type="button" disabled={dirty} className="mr-3 rounded border px-3 py-1 disabled:opacity-50" onClick={()=>{
        try {const count=importBackup(localStorage,pending,overwrite);setPending(null);setMessage(`已导入 ${count} 条记录。`);notifyProgressChanged();onImported();}
        catch(error){setMessage(`恢复失败：${error instanceof Error?error.message:'存储不可用'}。请保留备份文件。`);}
      }}>确认导入</button>
      <button type="button" onClick={()=>setPending(null)}>取消</button>
    </div>:null}
    <p role="status" className="my-2 text-sm">{message}</p>
  </div>;
}
