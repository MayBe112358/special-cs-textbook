/**
 * @module        访问者的私人心得编辑器
 * @problem       读者需要在当前页留下自己的理解，刷新仍能继续写，同时不把文字发给作者或其他读者。
 * @design        只在浏览器挂载后读 localStorage，点保存才写；按页面标识重建编辑器，避免翻页时把上一页草稿写到下一页。
 * @courses       CS50x Web 开发；CS61A 状态与副作用；CS186 并发写入
 * @exercises     https://cs50.harvard.edu/x/psets/9/finance/ —— 表单与数据保存
 * @prereq        React 状态属于当前页面；localStorage 属于当前浏览器和网站。
 * @unclear       浏览器被清理或设备损坏仍会丢数据；多标签页冲突只做检测，不自动合并两段文字。
 * @letter
 * 你在输入框里写字时，改变的只是草稿。只有点保存，文字才进入浏览器的持久存储。
 * 我把这个边界写得很明确：保存失败时保留输入，也不会说“已保存”。
 * 网页构建时没有你的浏览器，因此不能在组件第一次计算时读取 localStorage，必须等页面挂载。
 * 页面位置由外层传入，换页就换一位编辑器；这样即使新旧页面很快切换，草稿也不会串门。
 * 两个标签页同时写同一页时，后保存的一方会先检查旧值是否变化。如果变化，宁可让你复制草稿再刷新，
 * 也不悄悄抹掉另一边。这里没有云同步，你的心得只在自己的浏览器，公开评论是另一件事。
 */
'use client';
import {NotesBackup} from './notes-backup';
import {useEffect, useState} from 'react';
import {MAX_NOTE_LENGTH, noteKey, readNote} from '@/core/notes/notes';

export function VisitorNotes({pageId}: {pageId: string}) {
  const [draft, setDraft] = useState('');
  const [original, setOriginal] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [savedText, setSavedText] = useState('');
  const [message, setMessage] = useState('正在读取本机心得……');
  function load() {
    try {
      const raw = localStorage.getItem(noteKey(pageId));
      const note = readNote(raw, pageId);
      setOriginal(raw); setDraft(note?.text ?? ''); setSavedText(note?.text ?? '');
      setReady(true); setMessage(note ? '已读取本机保存的心得。' : '这一页还没有私人心得。');
    } catch { setMessage('无法读取本机心得。原数据未改动，请检查浏览器存储设置。'); }
  }
  useEffect(load, [pageId]);

  function persist(remove: boolean) {
    try {
      const key = noteKey(pageId);
      if (localStorage.getItem(key) !== original) {
        setMessage('另一标签页已修改这页心得。请复制当前草稿，再刷新查看，未覆盖任何数据。'); return;
      }
      const raw = remove ? null : JSON.stringify({page:pageId,text:draft,updatedAt:new Date().toISOString()});
      if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw);
      setOriginal(raw); setSavedText(remove ? '' : draft);
      if (remove) setDraft('');
      setMessage(remove ? '这页私人心得已删除。' : '已保存到当前浏览器。');
    } catch { setMessage('保存失败，草稿仍在。浏览器可能禁止存储或空间不足。'); }
  }
  return <section aria-label="我的私人心得" className="not-prose my-8 border-t border-fd-border pt-6">
    <h2 className="text-xl font-semibold">我的私人心得</h2>
    <p className="my-2 text-sm text-fd-muted-foreground">仅保存在当前浏览器，不会公开。切换页面前请保存。</p>
    <label className="block" htmlFor="private-note">这一页的心得</label>
    <textarea id="private-note" value={draft} disabled={!ready} maxLength={MAX_NOTE_LENGTH}
      onChange={(event) => setDraft(event.target.value)} rows={6}
      className="my-2 w-full rounded border border-fd-border bg-fd-background p-3" />
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={!ready || draft.trim() === ''} onClick={() => persist(false)} className="rounded border px-3 py-1 disabled:opacity-50">保存心得</button>
      <button type="button" disabled={!ready || original === null} onClick={() => {if (window.confirm('删除这页已保存的私人心得？')) persist(true);}} className="rounded border px-3 py-1 disabled:opacity-50">删除心得</button>
    </div>
    <p role="status" className="my-2 text-sm">{draft !== savedText && ready ? '有未保存的修改。' : ''} {message}</p>
    {ready ? <NotesBackup dirty={draft !== savedText} onImported={load} /> : null}
  </section>;
}
