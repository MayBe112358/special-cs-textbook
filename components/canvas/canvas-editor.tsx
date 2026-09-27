/**
 * @module        心得里的导图——在一门课的心得空间里画知识点和它们之间的关系
 * @problem       有些理解写成段落不如画出来清楚：“递归 → 环境模型 → 解释器”，一张小图就说完了。
 * @design        用通用画布（canvas-board.tsx），方块里放文字。导图的每一次完整操作（加方块、拖完、连线、改字、删除）
 *                都在停手 0.4 秒后自动保存——和文档不同，导图不是“草稿”，你拖一下方块不需要再按一次保存。
 *                保存走统一编辑接口，存在浏览器的 IndexedDB 里，和文档一起进备份。
 * @courses       Stanford CS147（直接操作）；UC Berkeley CS61A（数据抽象）
 * @exercises     https://cs147.stanford.edu/ —— Stanford CS147 里关于直接操作的设计练习
 * @prereq        知道“防抖”：连续的操作只在停下来之后处理一次。
 * @unclear       两个标签页同时改同一张导图，后保存的会覆盖先保存的，没有合并。
 * @letter
 * 你可能注意到了：文档得手动按 Ctrl+S 保存，导图却是改完自己就存了。这不是自相矛盾吗？
 *
 * 区别在于“中间状态有没有意义”。
 * 文字写到一半的一句话，是个半成品，你可能根本不想留下它。
 * 导图就不一样了，挪一下方块、连一根线，每一步本身都是完整的。你不会想“这根线先连着，等会儿再决定存不存”。
 * 所以一个用“草稿加保存”，一个用“随改随存加撤销”。
 * 挑哪种，标准不是哪种写起来省事，而是哪种更贴近你对这样东西的直觉。
 *
 * “随改随存”也不是真的每动一下就存一次。你拖方块的时候，鼠标每挪一点都会产生一次改动，一秒钟几十次，每次都去写数据库太浪费了。
 * 所以这里等你停手 0.4 秒再存。这种“连续的操作只在停下来以后处理一次”的做法叫防抖（debounce）。
 * 你离开这张导图的时候（关掉它的标签、切去别的心得），要是还有一次改动没来得及存，也会马上存掉。
 *
 * 画布本身的功夫都在 canvas-board.tsx 里，这个文件只是往方块里放了一段文字，再接上保存。
 * 同一块板子，学习路径那边往里放的是课程卡片。
 */
'use client';
import { useEffect, useRef, useState } from 'react';
import type { Canvas } from '@/core/workspace/canvas';
import type { NoteItem } from '@/core/workspace/items';
import { getWorkspace } from '@/components/workspace/browser-workspace';
import { CanvasBoard } from './canvas-board';
import { usePathname, useSearchParams } from 'next/navigation';
import { tabKey, useTabs } from '@/components/workbench/tabs';

export function CanvasEditor({ item }: { item: NoteItem }) {
  const [canvas, setCanvas] = useState<Canvas>(item.canvas ?? { nodes: [], edges: [] });
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Canvas | null>(null);
  const { pin } = useTabs();
  const tabUrl = tabKey(usePathname(), useSearchParams().toString());

  async function save(next: Canvas) {
    try {
      const ws = await getWorkspace();
      const current = await ws.readItem(item.id);
      if (!current) { setStatus('这张导图已经被删掉了，改动没有保存。'); return; }
      await ws.writeItem({ ...current, canvas: next, updatedAt: new Date().toISOString() });
      setStatus('已自动保存');
    } catch (e) {
      setStatus(`保存失败：${e instanceof Error ? e.message : '浏览器存储不可用'}`);
    }
  }

  // 离开这一页时，还没来得及保存的那一次改动立刻存掉。
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current) void save(pending.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function change(next: Canvas, commit: boolean) {
    setCanvas(next);
    if (!commit) return;
    pin(tabUrl); // 动手改过的导图，标签固定下来
    pending.current = next;
    setStatus('正在保存……');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { pending.current = null; void save(next); }, 400);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <CanvasBoard
        canvas={canvas}
        onChange={change}
        textNodes
        renderNode={(node) => (
          <div className="whitespace-pre-wrap break-words px-3 py-2 text-sm leading-snug">
            {node.text ? node.text : <span className="text-fd-muted-foreground">（双击写字）</span>}
          </div>
        )}
        emptyHint={<>双击空白处加一个方块，或者点左上角“加一个方块”。<br />从方块右边的圆点拖出箭头，连到另一个方块上。</>}
      />
      <p role="status" className="pointer-events-none absolute right-3 top-3 text-xs text-fd-muted-foreground">{status}</p>
    </div>
  );
}
