/**
 * @module        导图画布——心得导图和学习路径共用的那块“能放方块、能连箭头”的板子
 * @problem       导图要能：随手加一个方块、拖着换位置、从一个方块拉一条箭头到另一个、选中了按 Delete 删掉、
 *                双击改文字、画布本身能拖能缩放、手滑了能撤销。心得导图和学习路径都要这一整套，只是方块里画的东西不同。
 * @design        只管“交互”，不管“存”：它收下一张画布（core/workspace/canvas.ts 的纯数据），每次改动都调用那里的纯函数
 *                算出新画布，再通过 onChange 交回去；拖动过程中 commit=false，松手那一刻 commit=true，外面据此决定何时保存。
 *                方块里画什么由 renderNode 决定（心得导图画文字，学习路径画课程卡片）。
 *                画法：外层一个裁剪框，里面一层用 CSS transform 做平移和缩放；方块是普通的 HTML 元素（这样才能在里面打字），
 *                箭头画在同一层的一张 SVG 上，从一个方块的边缘指到另一个方块的边缘。
 *                撤销 / 重做：每次 commit 前把旧画布压进栈里——因为画布是不可变数据，这几乎不用额外代码。
 *                键盘：方块能用 Tab 选中，方向键挪动，Enter 改文字，Delete 删除，Esc 取消选中。
 * @courses       MIT 18.06 / 6.837（坐标变换：屏幕坐标 ↔ 画布坐标）；UC Berkeley CS61A（不可变数据带来的撤销）；
 *                Stanford CS147（直接操作、可逆性、反馈）；CS50x Week 8（指针事件）
 * @exercises     https://ocw.mit.edu/courses/6-837-computer-graphics-fall-2012/ —— 二维变换相关作业
 * @prereq        知道“缩放再平移”可以写成一个矩阵，屏幕上的点要先减去平移、再除以缩放，才得到画布上的位置。
 * @unclear       手机上只能拖动画布和点按钮缩放，还没有双指捏合缩放；方块也不能多选、不能框选。
 *
 * @letter
 * 画布里有两套坐标：屏幕上的像素位置，和画布上的“世界坐标”。你把画布拖远、放大之后，同一个方块在屏幕上的位置变了，
 * 在世界坐标里却没动。所有存进数据里的位置都是世界坐标；所有鼠标事件给的都是屏幕坐标。
 * 两者之间只隔着一个很简单的变换：世界 = (屏幕 − 平移) ÷ 缩放。这一行公式在这个文件里出现了好几次，
 * 它就是图形学课第一周讲的那种变换，只是在这里它决定的是“你松手时方块到底落在哪”。
 *
 * 还有一个选择值得说：方块用 HTML 而不是 SVG 画。SVG 画方框很方便，但要在里面打字、换行、选中文字就很麻烦；
 * HTML 天生就会这些。箭头则反过来，用 SVG 画线和箭头最省事。两者叠在同一层、用同一个变换，看起来就是一体的。
 */
'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { addNode, canvasBounds, connect, moveNode, newId, NODE_HEIGHT, NODE_WIDTH, removeEdges, removeNodes, setNodeText, type Canvas, type CanvasNode } from '@/core/workspace/canvas';

type View = { x: number; y: number; zoom: number };
type Point = { x: number; y: number };
type Selection = { kind: 'node' | 'edge'; id: string } | null;

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

export type CanvasBoardProps = {
  canvas: Canvas;
  /** commit=false：拖动中间的每一帧；commit=true：一次完整的操作结束，外面可以保存了。 */
  onChange: (next: Canvas, commit: boolean) => void;
  renderNode: (node: CanvasNode) => ReactNode;
  /** 能不能加自由文字方块（心得导图能，学习路径不能——它的方块都是课程）。 */
  textNodes: boolean;
  readOnly?: boolean;
  /** 双击一个方块时：文字方块默认进入编辑；课程方块由外面决定（比如打开课程页）。 */
  onOpenNode?: (node: CanvasNode) => void;
  /** 外面往画布上拖东西（比如从侧边栏拖一门课）时，告诉外面落点的世界坐标。 */
  onExternalDrop?: (event: DragEvent, at: Point) => void;
  toolbar?: ReactNode;
  emptyHint?: ReactNode;
};

/** 从一个方块的中心往另一个点射一条线，求它和方块边框的交点——箭头要从边上出发、停在边上。 */
function edgePoint(center: Point, size: { w: number; h: number }, toward: Point): Point {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const sx = dx === 0 ? Infinity : size.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : size.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: center.x + dx * s, y: center.y + dy * s };
}

export function CanvasBoard({ canvas, onChange, renderNode, textNodes, readOnly = false, onOpenNode, onExternalDrop, toolbar, emptyHint }: CanvasBoardProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 40, y: 40, zoom: 1 });
  const [selected, setSelected] = useState<Selection>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [linking, setLinking] = useState<{ from: string; to: Point } | null>(null);
  const gesture = useRef<{ kind: 'pan' | 'node'; id?: string; start: Point; origin: Point; moved: boolean; pointerId: number } | null>(null);
  const history = useRef<{ undo: Canvas[]; redo: Canvas[] }>({ undo: [], redo: [] });
  const latest = useRef(canvas);
  latest.current = canvas;
  const beforeGesture = useRef<Canvas | null>(null);

  /** 屏幕坐标 → 画布上的世界坐标。 */
  const toWorld = useCallback((clientX: number, clientY: number): Point => {
    const rect = frame.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - view.x) / view.zoom, y: (clientY - rect.top - view.y) / view.zoom };
  }, [view]);

  /** 一次完整操作：记进撤销栈，交出去保存。 */
  const commit = useCallback((next: Canvas, before: Canvas = latest.current) => {
    if (next === before) return;
    history.current.undo.push(before);
    if (history.current.undo.length > 100) history.current.undo.shift();
    history.current.redo = [];
    onChange(next, true);
  }, [onChange]);

  // 方块的实际大小（文字多的方块会长高），箭头要按真实边框画。
  const observer = useMemo(() => (typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
    setSizes((old) => {
      const next = { ...old };
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.nodeId!;
        next[id] = { w: (entry.target as HTMLElement).offsetWidth, h: (entry.target as HTMLElement).offsetHeight };
      }
      return next;
    });
  })), []);
  useEffect(() => () => observer?.disconnect(), [observer]);
  const measure = useCallback((el: HTMLDivElement | null) => { if (el) observer?.observe(el); }, [observer]);

  const sizeOf = (id: string) => sizes[id] ?? { w: NODE_WIDTH, h: NODE_HEIGHT };
  const centerOf = (n: CanvasNode) => ({ x: n.x + sizeOf(n.id).w / 2, y: n.y + sizeOf(n.id).h / 2 });

  function fit() {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    const b = canvasBounds(canvas);
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(rect.width / b.width, rect.height / b.height, 1.2)));
    setView({ zoom, x: (rect.width - b.width * zoom) / 2 - b.x * zoom, y: (rect.height - b.height * zoom) / 2 - b.y * zoom });
  }
  // 第一次打开时把所有方块摆进视野。
  const fitted = useRef(false);
  useEffect(() => { if (!fitted.current && frame.current) { fitted.current = true; if (canvas.nodes.length > 0) fit(); } });

  function zoomAt(factor: number, clientX?: number, clientY?: number) {
    const rect = frame.current!.getBoundingClientRect();
    const sx = clientX === undefined ? rect.width / 2 : clientX - rect.left;
    const sy = clientY === undefined ? rect.height / 2 : clientY - rect.top;
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      // 缩放前后，指针下面那一点保持在屏幕上同一个位置。
      return { zoom, x: sx - (sx - v.x) * (zoom / v.zoom), y: sy - (sy - v.y) * (zoom / v.zoom) };
    });
  }

  // 滚轮：平移画布；按住 Ctrl（或触控板双指捏合）时缩放。要能 preventDefault，所以手动挂非被动监听。
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  function startPan(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    frame.current?.focus({ preventScroll: true });
    setSelected(null);
    frame.current!.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'pan', start: { x: e.clientX, y: e.clientY }, origin: { x: view.x, y: view.y }, moved: false, pointerId: e.pointerId };
  }

  function startNode(e: ReactPointerEvent<HTMLDivElement>, node: CanvasNode) {
    if (e.button !== 0 || editing === node.id) return;
    e.stopPropagation();
    setSelected({ kind: 'node', id: node.id });
    // 让画布拿到键盘焦点，选中后马上就能按 Delete、方向键。
    frame.current?.focus({ preventScroll: true });
    if (readOnly) return;
    // 这里先不抢指针：真的开始拖了再抢。否则双击方块时，松手事件会落到画布上，被当成“双击空白处”。
    beforeGesture.current = canvas;
    gesture.current = { kind: 'node', id: node.id, start: { x: e.clientX, y: e.clientY }, origin: { x: node.x, y: node.y }, moved: false, pointerId: e.pointerId };
  }

  function startLink(e: ReactPointerEvent<HTMLButtonElement>, node: CanvasNode) {
    if (e.button !== 0 || readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    frame.current!.setPointerCapture(e.pointerId);
    setLinking({ from: node.id, to: toWorld(e.clientX, e.clientY) });
  }

  function onMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (linking) { setLinking({ ...linking, to: toWorld(e.clientX, e.clientY) }); return; }
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < 3) return;
    if (!g.moved && g.kind === 'node') frame.current?.setPointerCapture(g.pointerId);
    g.moved = true;
    if (g.kind === 'pan') setView((v) => ({ ...v, x: g.origin.x + dx, y: g.origin.y + dy }));
    else onChange(moveNode(canvas, g.id!, Math.round(g.origin.x + dx / view.zoom), Math.round(g.origin.y + dy / view.zoom)), false);
  }

  function onUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (frame.current?.hasPointerCapture(e.pointerId)) frame.current.releasePointerCapture(e.pointerId);
    if (linking) {
      // 松手的地方落在哪个方块上，就连到哪个方块。
      const at = toWorld(e.clientX, e.clientY);
      const target = canvas.nodes.find((n) => n.id !== linking.from && at.x >= n.x && at.x <= n.x + sizeOf(n.id).w && at.y >= n.y && at.y <= n.y + sizeOf(n.id).h);
      if (target) commit(connect(canvas, linking.from, target.id, newId()));
      setLinking(null);
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind === 'node' && g.moved && beforeGesture.current) commit(canvas, beforeGesture.current);
    beforeGesture.current = null;
  }

  function addTextNode(at: Point) {
    const id = newId();
    commit(addNode(canvas, { id, x: Math.round(at.x - NODE_WIDTH / 2), y: Math.round(at.y - NODE_HEIGHT / 2), text: '' }));
    setSelected({ kind: 'node', id });
    setEditing(id);
    setDraft('');
  }

  function finishEdit(save: boolean) {
    if (editing && save) {
      const node = canvas.nodes.find((n) => n.id === editing);
      if (node && (node.text ?? '') !== draft) commit(setNodeText(canvas, editing, draft));
    }
    setEditing(null);
    frame.current?.focus({ preventScroll: true });
  }

  function removeSelected() {
    if (!selected || readOnly) return;
    commit(selected.kind === 'node' ? removeNodes(canvas, [selected.id]) : removeEdges(canvas, [selected.id]));
    setSelected(null);
    // 被删的方块如果恰好拿着焦点，焦点会掉回整页，之后的 Ctrl+Z 就收不到了；删完把焦点收回画布。
    frame.current?.focus({ preventScroll: true });
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (editing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !readOnly) {
      e.preventDefault();
      const h = history.current;
      if (e.shiftKey) { const next = h.redo.pop(); if (next) { h.undo.push(canvas); onChange(next, true); } }
      else { const prev = h.undo.pop(); if (prev) { h.redo.push(canvas); onChange(prev, true); } }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); removeSelected(); return; }
    if (e.key === 'Escape') { setSelected(null); return; }
    if (selected?.kind === 'node' && !readOnly) {
      const node = canvas.nodes.find((n) => n.id === selected.id);
      if (!node) return;
      const step = e.shiftKey ? 50 : 10;
      const moves: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
      const move = moves[e.key];
      if (move) { e.preventDefault(); commit(moveNode(canvas, node.id, node.x + move.x, node.y + move.y)); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (node.course === undefined && textNodes) { setEditing(node.id); setDraft(node.text ?? ''); }
        else onOpenNode?.(node);
      }
    }
  }

  const byId = new Map(canvas.nodes.map((n) => [n.id, n]));
  const cursor = gesture.current?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-grab';

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={frame}
        tabIndex={0}
        role="application"
        aria-label="导图画布。双击空白处加方块，方向键移动选中的方块，Delete 删除，Ctrl+Z 撤销。"
        className={`relative min-h-[420px] flex-1 touch-none overflow-hidden bg-fd-card outline-none focus-visible:ring-1 focus-visible:ring-cs-button ${cursor}`}
        onPointerDown={startPan}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKeyDown}
        onDoubleClick={(e) => { if (e.target === e.currentTarget && textNodes && !readOnly) addTextNode(toWorld(e.clientX, e.clientY)); }}
        onDragOver={(e) => { if (onExternalDrop && !readOnly) e.preventDefault(); }}
        onDrop={(e) => { if (onExternalDrop && !readOnly) { e.preventDefault(); onExternalDrop(e.nativeEvent, toWorld(e.clientX, e.clientY)); } }}
        style={{ backgroundImage: 'radial-gradient(color-mix(in srgb, var(--color-fd-muted-foreground) 22%, transparent) 1px, transparent 1px)', backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      >
        <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
            <defs>
              <marker id="cs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--color-fd-muted-foreground)" /></marker>
              <marker id="cs-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--color-cs-button)" /></marker>
            </defs>
            {canvas.edges.map((edge) => {
              const a = byId.get(edge.from); const b = byId.get(edge.to);
              if (!a || !b) return null;
              const p = edgePoint(centerOf(a), sizeOf(a.id), centerOf(b));
              const q = edgePoint(centerOf(b), sizeOf(b.id), centerOf(a));
              const active = selected?.kind === 'edge' && selected.id === edge.id;
              return (
                <g key={edge.id}>
                  {/* 看得见的细线 + 看不见的粗线：细线好看，粗线好点中。 */}
                  <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={active ? 'var(--color-cs-button)' : 'var(--color-fd-muted-foreground)'} strokeWidth={active ? 2 : 1.3} markerEnd={`url(#${active ? 'cs-arrow-active' : 'cs-arrow'})`} />
                  <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="transparent" strokeWidth={12} className="pointer-events-auto cursor-pointer"
                    onPointerDown={(e) => { e.stopPropagation(); setSelected({ kind: 'edge', id: edge.id }); frame.current?.focus({ preventScroll: true }); }} />
                </g>
              );
            })}
            {linking ? (() => {
              const a = byId.get(linking.from);
              if (!a) return null;
              const p = edgePoint(centerOf(a), sizeOf(a.id), linking.to);
              return <line x1={p.x} y1={p.y} x2={linking.to.x} y2={linking.to.y} stroke="var(--color-cs-button)" strokeWidth={1.5} strokeDasharray="5 4" markerEnd="url(#cs-arrow-active)" />;
            })() : null}
          </svg>

          {canvas.nodes.map((node) => {
            const isSelected = selected?.kind === 'node' && selected.id === node.id;
            const isEditing = editing === node.id;
            return (
              <div
                key={node.id}
                ref={measure}
                data-node-id={node.id}
                className={`group pointer-events-auto absolute select-none rounded-[5px] border bg-fd-background shadow-sm transition-[box-shadow,border-color] ${isSelected ? 'border-cs-button ring-1 ring-cs-button' : 'border-fd-border hover:border-fd-muted-foreground/60'} ${readOnly ? 'cursor-default' : 'cursor-move'}`}
                style={{ left: node.x, top: node.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
                onPointerDown={(e) => startNode(e, node)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (node.course === undefined && textNodes && !readOnly) { setEditing(node.id); setDraft(node.text ?? ''); }
                  else onOpenNode?.(node);
                }}
              >
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={draft}
                    aria-label="方块里的文字"
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => finishEdit(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishEdit(true); }
                      else if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    rows={2}
                    placeholder="写点什么（Enter 完成，Shift+Enter 换行）"
                    className="block w-full resize-none rounded-[5px] bg-transparent px-3 py-2 text-sm leading-snug outline-none"
                  />
                ) : renderNode(node)}
                {!readOnly && !isEditing ? (
                  <button
                    type="button"
                    aria-label="从这里拖出一条箭头"
                    title="按住拖到另一个方块上，连一条箭头"
                    onPointerDown={(e) => startLink(e, node)}
                    className={`absolute -right-2 top-1/2 size-4 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-fd-background bg-cs-button transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {canvas.nodes.length === 0 && emptyHint ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-fd-muted-foreground">{emptyHint}</div>
        ) : null}
      </div>

      {/* 工具条浮在画布左上角；缩放控件在右下角，和地图软件的习惯一样。 */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          {textNodes && !readOnly ? (
            <button type="button" className="cs-btn shadow-sm" onClick={() => { const r = frame.current!.getBoundingClientRect(); addTextNode(toWorld(r.left + r.width / 2, r.top + r.height / 2)); }}>加一个方块</button>
          ) : null}
          {toolbar}
          {selected && !readOnly ? <button type="button" className="cs-btn cs-btn-danger shadow-sm" onClick={removeSelected}>删除所选</button> : null}
        </div>
      </div>
      <div className="absolute bottom-3 right-3 flex items-center gap-2">
        <div className="cs-seg shadow-sm">
          <button type="button" aria-label="缩小" onClick={() => zoomAt(1 / 1.2)}>−</button>
          <button type="button" className="min-w-14 font-mono text-xs tabular-nums" title="恢复 100%" onClick={() => setView((v) => ({ ...v, zoom: 1 }))}>{Math.round(view.zoom * 100)}%</button>
          <button type="button" aria-label="放大" onClick={() => zoomAt(1.2)}>+</button>
        </div>
        <button type="button" className="cs-btn shadow-sm" onClick={fit}>查看全部</button>
      </div>
      {!readOnly ? (
        <p className="pointer-events-none absolute bottom-3 left-3 hidden text-[11px] text-fd-muted-foreground lg:block">
          {textNodes ? '双击空白处加方块 · ' : ''}从方块右边的圆点拖出箭头 · 选中后 Delete 删除 · Ctrl+Z 撤销 · Ctrl+滚轮缩放
        </p>
      ) : null}
    </div>
  );
}
