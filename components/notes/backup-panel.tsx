/**
 * @module        备份与恢复（第 5 版）——心得、导入的文件、导图、学习路径、学习状态、理解度，一个文件带走
 * @problem       这些东西全都只在你的浏览器里。清一次缓存、换一台电脑，它们就不在了；
 *                备份是你唯一能把它们带走的办法，所以它必须带全，而且导入时绝不能弄坏你现有的东西。
 * @design        导出：学习状态和理解度从 localStorage 读，心得条目和路径从 IndexedDB 读，拼成一份第 5 版 JSON 下载；
 *                勾了“包含 AI 对话记录”才把对话一起带上（默认不带）。导入时备份里有对话就一并恢复，同样默认不覆盖本机已有的。
 *                导入：先读懂整份文件（任何版本都换成第 5 版的样子，见 core/workspace/backup.ts），
 *                把“有多少条、和本机撞了多少条”摆给你看，你点确认才写。默认不覆盖本机已有的同编号记录。
 *                学习状态那一半交给旧模块写（它有失败回滚），心得和路径那一半放在同一个 IndexedDB 事务里写。
 * @courses       UC Berkeley CS186 / CMU 15-445（事务、恢复）；MIT Missing Semester（备份习惯）
 * @exercises     https://cs186berkeley.net/ —— CS186 事务与恢复相关的项目
 * @prereq        知道“导入”和“覆盖”是两件事：默认只补上缺的，不动已有的。
 * @unclear       两半分别是两个事务：学习状态写成功、心得写失败时，学习状态不会跟着撤回（它们互不影响，所以问题不大）。
 * @letter
 * 备份面板上我最看重的一句话是“文件已读取，尚未写入”。
 *
 * 选中文件和真正写进去之间，隔着一次确认。这是为了让“选错文件”这件事没有代价。
 * 你可能手一滑选了份半年前的旧备份。没关系，它先把“一共多少条、跟你本机撞了多少条”摆给你看，你一看条数不对，点取消，什么都没发生。
 *
 * 导入默认是“只补缺的，不动已有的”。本机已经有同一份心得，就留着本机的；你想用备份里的版本覆盖，得自己勾上。
 * 导入和覆盖是两件事，混在一起的话，一次导入就可能把你这半年写的东西全换回半年前的样子。
 *
 * 导出的那一份是个 JSON 文件，排版过的，用记事本打开也读得懂。
 * 你不用相信这个网站，打开文件看一眼，你的心得是不是都在里面，一目了然。
 * AI 对话记录默认不带，要带得自己勾上，因为对话里可能有你不想发给别人的东西；API Key 是无论如何都不会进备份的。
 *
 * 背后的活是两个地方分着干的：学习状态和理解度写进 localStorage，心得和路径写进 IndexedDB（细节在 core/workspace/backup.ts）。
 * 两边各自都是“要么全成、要么全不算”，但两边之间不是一体的：可能学习状态导进去了，心得那一半却失败了。
 * 好在这两样本来就互不影响，最坏的情况是你再导一次。
 */
'use client';
import { useState } from 'react';
import { collectProgress, collectUnderstanding, importBackup, BACKUP_VERSION } from '@/core/notes/backup';
import { buildBackup, parseAnyBackup, planImport, type NormalizedBackup } from '@/core/workspace/backup';
import { notifyProgressChanged } from '@/components/progress/progress-store';
import { getWorkspace } from '@/components/workspace/browser-workspace';
import { listChats, writeChats } from '@/components/assistant/chat-store';

export function BackupPanel() {
  const [pending, setPending] = useState<{ data: NormalizedBackup; conflicts: number } | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // 默认不带 AI 对话：对话里可能有不想发给别人的内容，备份文件又常常被拷来拷去。
  const [withChats, setWithChats] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const ws = await getWorkspace();
      const text = buildBackup({
        progress: collectProgress(localStorage),
        understanding: collectUnderstanding(localStorage),
        items: await ws.listItems(),
        paths: await ws.listPaths(),
        ...(withChats ? { chats: await listChats() } : {}),
      });
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `cs-textbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('已生成备份，请到浏览器的下载目录里找它。');
    } catch (error) {
      setMessage(`导出失败：${error instanceof Error ? error.message : '读不到本机数据'}。本机数据没有被改动。`);
    } finally {
      setBusy(false);
    }
  }

  async function preview(file: File | undefined) {
    setPending(null); setOverwrite(false);
    if (!file) return;
    try {
      const data = parseAnyBackup(await file.text());
      const ws = await getWorkspace();
      const itemIds = new Set((await ws.listItems()).map((i) => i.id));
      const pathIds = new Set((await ws.listPaths()).map((p) => p.id));
      const chatIds = new Set((await listChats().catch(() => [])).map((c) => c.id));
      const courses = new Set(collectProgress(localStorage).map((r) => r.course));
      const modules = new Set(collectUnderstanding(localStorage).map((r) => r.module));
      const conflicts = planImport(data, { itemIds, pathIds, chatIds }, false).conflicts
        + data.progress.filter((r) => courses.has(r.course)).length
        + data.understanding.filter((r) => modules.has(r.module)).length;
      setPending({ data, conflicts });
      setMessage('文件已读取，尚未写入。');
    } catch (error) {
      setMessage(`无法导入：${error instanceof Error ? error.message : '文件读取失败'}。本机数据没有被改动。`);
    }
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      const { data } = pending;
      // 学习状态和理解度：交给旧模块写，它会先校验、失败时回滚。
      const statusCount = importBackup(localStorage, { format: 'special-cs-textbook-notes', version: BACKUP_VERSION, notes: [], progress: data.progress, understanding: data.understanding, paths: [] }, overwrite);
      // 心得条目和路径：同一个 IndexedDB 事务。
      const ws = await getWorkspace();
      const plan = planImport(data, {
        itemIds: new Set((await ws.listItems()).map((i) => i.id)),
        pathIds: new Set((await ws.listPaths()).map((p) => p.id)),
        chatIds: new Set((await listChats().catch(() => [])).map((c) => c.id)),
      }, overwrite);
      await ws.putMany(plan.items, plan.paths);
      await writeChats(plan.chats);
      notifyProgressChanged();
      setPending(null);
      setMessage(`已导入 ${statusCount + plan.items.length + plan.paths.length + plan.chats.length} 条记录。`);
    } catch (error) {
      setMessage(`恢复失败：${error instanceof Error ? error.message : '存储不可用'}。请保留备份文件。`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="备份与恢复" className="cs-card space-y-3">
      <div>
        <h2 className="text-base font-semibold">备份与恢复</h2>
        <p className="mt-1 text-sm text-fd-muted-foreground">
          心得、导入的文件、导图、学习路径、学习状态和理解度都只存在这台浏览器里。导出的备份是一个能用记事本打开的 JSON 文件
          （AI 对话记录默认不带，要带请勾选；API Key 永远不会进备份）；
          导入时默认只补上缺的，不覆盖已有的。以前版本导出的备份也能导入。
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="cs-btn" disabled={busy} onClick={() => void download()}>导出备份</button>
        <label className="flex items-center gap-1.5 text-sm text-fd-muted-foreground">
          <input type="checkbox" className="accent-cs-button" checked={withChats} onChange={(e) => setWithChats(e.target.checked)} />
          包含 AI 对话记录
        </label>
        <label className={`cs-btn ${busy ? 'pointer-events-none opacity-50' : ''}`}>选择备份文件…
          <input type="file" accept=".json,application/json" className="sr-only" disabled={busy}
            onChange={(event) => { void preview(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
      </div>
      {pending ? (
        <div className="space-y-2 rounded-[4px] border border-fd-border bg-fd-background p-3 text-sm">
          <p>
            备份里有 {pending.data.items.length} 份心得（文档、文件和导图）、{pending.data.paths.length} 条学习路径、
            {pending.data.progress.length} 门课的状态、{pending.data.understanding.length} 段代码的理解度
            {pending.data.chats?.length ? `、${pending.data.chats.length} 段 AI 对话` : ''}，
            其中 {pending.conflicts} 条和本机已有的记录重合。
          </p>
          {pending.conflicts > 0 ? (
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-cs-button" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> 用备份覆盖重合的本机记录</label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="cs-btn cs-btn-primary" disabled={busy} onClick={() => void confirm()}>确认导入</button>
            <button type="button" className="cs-btn" onClick={() => { setPending(null); setMessage(''); }}>取消</button>
          </div>
        </div>
      ) : null}
      <p role="status" className="text-sm text-fd-muted-foreground empty:hidden">{message}</p>
    </section>
  );
}
