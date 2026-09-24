/**
 * @module        访问者的私人心得编辑器
 * @problem       读者需要在当前页留下自己的理解，刷新仍能继续写，同时不把文字发给作者或其他读者。
 * @design        只在浏览器挂载后读 localStorage，点保存才写；按页面标识重建编辑器，避免翻页时把上一页草稿写到下一页。
 *                阶段 14 起分成“看”和“写”两种样子：有心得时先显示文字，点“编辑”才出现输入框；
 *                删除不再弹浏览器的确认框，而是在原地把按钮换成“确定删除 / 取消”。Ctrl+Enter 保存。
 * @courses       CS50x Web 开发；CS61A 状态与副作用；CS186 并发写入；Stanford CS147（防止误操作的确认设计）
 * @exercises     https://cs50.harvard.edu/x/psets/9/finance/ —— 表单与数据保存
 * @prereq        React 状态属于当前页面；localStorage 属于当前浏览器和网站。
 * @unclear       浏览器被清理或设备损坏仍会丢数据；多标签页冲突只做检测，不自动合并两段文字。
 *                编辑到一半直接点侧边栏换页，草稿会丢——现在只靠“有未保存的修改”那行字提醒。
 * @letter
 * 先说为什么平时不摆一个输入框。一张页面底下永远开着一个空白输入框，读的时候它在那儿等你写，
 * 写完以后它还在那儿，你的文字和“可以编辑”的状态混在一起，看起来像草稿而不像笔记。
 * 所以现在它默认只把你写过的东西显示出来，要改时再展开——读和写是两件事，界面上也分开。
 *
 * 删除为什么不用浏览器自带的确认框？那个框会冻住整个页面，而且长得和这个网站毫无关系，
 * 很多人看都不看就按“确定”。在原地把按钮变成“确定删除”，你的视线不用离开这张卡片，
 * 也就更可能真的读一眼再按。
 *
 * 你在输入框里写字时，改变的只是草稿。只有点保存，文字才进入浏览器的持久存储。
 * 我把这个边界写得很明确：保存失败时保留输入，也不会说“已保存”。
 * 网页构建时没有你的浏览器，因此不能在组件第一次计算时读取 localStorage，必须等页面挂载。
 * 页面位置由外层传入，换页就换一位编辑器；这样即使新旧页面很快切换，草稿也不会串门。
 * 两个标签页同时写同一页时，后保存的一方会先检查旧值是否变化。如果变化，宁可让你复制草稿再刷新，
 * 也不悄悄抹掉另一边。这里没有云同步，你的心得只在自己的浏览器，公开评论是另一件事。
 */
'use client';
import {NotesBackup} from './notes-backup';
import {useEffect, useRef, useState} from 'react';
import {MAX_NOTE_LENGTH, noteKey, readNote} from '@/core/notes/notes';

export function VisitorNotes({pageId}: {pageId: string}) {
  const [draft, setDraft] = useState('');
  const [original, setOriginal] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [savedText, setSavedText] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [message, setMessage] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  function load() {
    try {
      const raw = localStorage.getItem(noteKey(pageId));
      const note = readNote(raw, pageId);
      setOriginal(raw); setDraft(note?.text ?? ''); setSavedText(note?.text ?? '');
      setReady(true); setMessage('');
    } catch { setMessage('无法读取本机心得。原数据未改动，请检查浏览器存储设置。'); }
  }
  useEffect(load, [pageId]);
  // 进入编辑时把光标放到文字末尾，接着写最顺手。
  useEffect(() => {
    if (!editing) return;
    const node = textarea.current;
    if (node) { node.focus(); node.setSelectionRange(node.value.length, node.value.length); }
  }, [editing]);

  function persist(remove: boolean) {
    try {
      const key = noteKey(pageId);
      if (localStorage.getItem(key) !== original) {
        setMessage('另一标签页已修改这页心得。请复制当前草稿，再刷新查看，未覆盖任何数据。'); return;
      }
      // 把文字全删光再保存，等于删除：不留一条空心得。
      const empty = remove || draft.trim() === '';
      const raw = empty ? null : JSON.stringify({page:pageId,text:draft,updatedAt:new Date().toISOString()});
      if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw);
      setOriginal(raw); setSavedText(empty ? '' : draft); setDraft(empty ? '' : draft);
      setEditing(false); setConfirmingDelete(false);
      setMessage(empty ? '这页私人心得已删除。' : '已保存到当前浏览器。');
    } catch { setMessage('保存失败，草稿仍在。浏览器可能禁止存储或空间不足。'); }
  }
  function startEditing() { setMessage(''); setConfirmingDelete(false); setEditing(true); }
  function cancel() { setDraft(savedText); setEditing(false); setMessage(''); }

  const dirty = draft !== savedText;
  return <section aria-label="我的私人心得" className="cs-card space-y-2.5">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className="cs-eyebrow text-fd-primary">我的心得</h3>
      <span className="text-xs text-fd-muted-foreground">只存在这台浏览器，不会公开</span>
    </div>

    {!ready ? (
      <p className="text-sm text-fd-muted-foreground">{message || '正在读取……'}</p>
    ) : editing ? (
      <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); persist(false); }}>
        <label className="sr-only" htmlFor="private-note">这一页的心得</label>
        <textarea id="private-note" ref={textarea} value={draft} maxLength={MAX_NOTE_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (dirty) persist(false); }
          }}
          rows={5} placeholder="学这一页时卡在哪、想明白了什么……"
          className="cs-input block w-full resize-y leading-relaxed" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={!dirty} className="cs-btn cs-btn-primary">保存</button>
          <button type="button" onClick={cancel} className="cs-btn">取消</button>
          <span className="text-xs text-fd-muted-foreground">
            {dirty ? '有未保存的修改' : ''}
            <span className="hidden md:inline">{dirty ? ' · ' : ''}Ctrl+Enter 保存</span>
          </span>
        </div>
      </form>
    ) : savedText ? (
      <>
        <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">{savedText}</p>
        <div className="flex flex-wrap items-center gap-2">
          {confirmingDelete ? (
            <>
              <span className="text-sm">删除这页已保存的心得？</span>
              <button type="button" onClick={() => persist(true)} className="cs-btn cs-btn-danger" autoFocus>确定删除</button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="cs-btn">取消</button>
            </>
          ) : (
            <>
              <button type="button" onClick={startEditing} className="cs-btn">编辑</button>
              <button type="button" onClick={() => { setMessage(''); setConfirmingDelete(true); }} className="cs-btn">删除</button>
            </>
          )}
        </div>
      </>
    ) : (
      <div>
        <button type="button" onClick={startEditing} className="cs-btn">写一条心得</button>
      </div>
    )}

    <p role="status" className={message && ready ? 'text-xs text-fd-muted-foreground' : 'sr-only'}>{ready ? message : ''}</p>
    {ready ? <NotesBackup dirty={editing && dirty} onImported={load} /> : null}
  </section>;
}
