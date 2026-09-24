/**
 * @module        可拖动缩放的课程先修图
 * @problem       静态图片无法展开复杂关系，也不能让读者直接进入课程；手机又不适合展示整张大图。
 * @design        SVG 只负责公开关系，节点偏移与视角留在会话；按钮缩放、背景拖动画布、节点拖动，手机显示关系列表。
 *                阶段 14 起还能按住 Ctrl 滚动滚轮（或在触控板上双指捏合）缩放，缩放以指针所在的点为中心；
 *                不按 Ctrl 的滚轮照常滚动页面，不被画布吞掉。选中一门课时，它在图里会被高亮。
 * @courses       CS61B 图；MIT 18.06 坐标变换；CS50x Web 交互
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 交互页面
 * @prereq        画布坐标和屏幕坐标不同，缩放后拖动必须先把指针位置换回画布坐标。
 * @unclear       没有编号的文字先修不会连线；图仅呈现已整理的关系，不是完整课程依赖的保证。
 * @letter
 * 我让 SVG 保存一套逻辑坐标，浏览器负责把它缩放到屏幕。指针移动时先做反向坐标变换，
 * 因此放大两倍后拖十个像素，不会让节点错误地跳二十个像素。你拖的是布局，不是知识内容。
 * 拖动结束不能马上跳进课程，所以我记录这一次手势是否真正移动过，移动过的点击就不当作打开链接。
 * 图下面保留同一批关系的文字链接，手机、键盘读者和不想看图的人都能访问相同内容。
 *
 * 滚轮缩放里有一个小小的数学问题值得你停下来想一想：怎样放大，指针下面那一点才不会跑掉？
 * 设那一点在画布上的坐标是 p，视窗左上角是 pan，缩放倍数从 z 变成 z'。
 * 放大前 p 离左上角 (p - pan)，屏幕上看是 (p - pan)·z；要让它在屏幕上的位置不变，
 * 新的左上角就得满足 (p - pan')·z' = (p - pan)·z，也就是 pan' = p - (p - pan)·z/z'。
 * 这就是 MIT 18.06 里那种“先平移到原点、缩放、再平移回去”的变换，写成一行代码而已。
 */
'use client';
import {useEffect,useMemo,useRef,useState,type PointerEvent} from 'react';
import Link from 'next/link';
import {buildCourseGraph,layoutGraph,type GraphPosition} from '@/core/knowledge/graph';
import type {CourseEntry} from '@/core/knowledge/knowledge-index';

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 3;

export function CourseGraph({courses}:{courses:CourseEntry[]}){
 const graph=useMemo(()=>buildCourseGraph(courses),[courses]);const [focus,setFocus]=useState('');const [isolated,setIsolated]=useState(false);
 const [zoom,setZoom]=useState(1);const [pan,setPan]=useState({x:0,y:0});const [offsets,setOffsets]=useState<Record<string,GraphPosition>>({});
 const [dragging,setDragging]=useState(false);
 const svg=useRef<SVGSVGElement>(null);const drag=useRef<{id:string|null;start:GraphPosition;origin:GraphPosition;screen:GraphPosition}|null>(null);const moved=useRef(false);
 const edges=graph.edges.filter(e=>!focus||e.from===focus||e.to===focus);const connected=new Set(edges.flatMap(e=>[e.from,e.to]));if(focus)connected.add(focus);
 const nodes=graph.nodes.filter(n=>connected.has(n.id)||(!focus&&isolated));const layout=layoutGraph(nodes.map(n=>n.id),edges);
 const position=(id:string)=>offsets[id]??layout.positions[id]!;
 function reset(){setZoom(1);setPan({x:0,y:0});setOffsets({});}
 function point(event:{clientX:number;clientY:number}):GraphPosition{const matrix=svg.current?.getScreenCTM();if(!matrix)return {x:0,y:0};const value=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return {x:value.x,y:value.y};}
 function begin(event:PointerEvent,id:string|null){if(event.button!==0)return;event.stopPropagation();moved.current=false;drag.current={id,start:point(event),origin:id?position(id):pan,screen:{x:event.clientX,y:event.clientY}};}
 function move(event:PointerEvent){const current=drag.current;if(!current)return;const delta={x:(event.clientX-current.screen.x)*1000/zoom/(svg.current?.getBoundingClientRect().width??1000),y:(event.clientY-current.screen.y)*600/zoom/(svg.current?.getBoundingClientRect().height??600)};
  if(!moved.current&&Math.hypot(event.clientX-current.screen.x,event.clientY-current.screen.y)>4){moved.current=true;setDragging(true);svg.current?.setPointerCapture(event.pointerId);}
  if(current.id){const value={x:current.origin.x+delta.x,y:current.origin.y+delta.y};setOffsets(old=>({...old,[current.id!]:value}));}else setPan({x:current.origin.x-delta.x,y:current.origin.y-delta.y});
 }
 function end(pointerId?:number){drag.current=null;setDragging(false);if(pointerId!==undefined&&svg.current?.hasPointerCapture(pointerId))svg.current.releasePointerCapture(pointerId);}

 // 滚轮缩放要能 preventDefault（不然页面会跟着滚），React 的 onWheel 做不到，所以手动挂一个非被动监听。
 const view=useRef({zoom,pan});view.current={zoom,pan};
 useEffect(()=>{
  const node=svg.current;if(!node)return;
  function onWheel(event:WheelEvent){
   if(!event.ctrlKey&&!event.metaKey)return; // 不按 Ctrl 就是普通滚动页面
   event.preventDefault();
   const {zoom:z,pan:p}=view.current;
   const next=Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,z*Math.exp(-event.deltaY*0.002)));
   const at=point(event);
   setZoom(next);setPan({x:at.x-(at.x-p.x)*z/next,y:at.y-(at.y-p.y)*z/next});
  }
  node.addEventListener('wheel',onWheel,{passive:false});
  return ()=>node.removeEventListener('wheel',onWheel);
 },[]);

 const titleById=new Map(graph.nodes.map(n=>[n.id,n]));
 return <div className="space-y-4">
  <p className="text-sm leading-relaxed text-fd-muted-foreground">箭头从先修课程指向后续课程。只显示内容里已经明确记录的关系；没有连线不等于没有先修。</p>
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
   <label className="flex items-center gap-2">查看课程
    <select className="cs-input max-w-[16rem]" value={focus} onChange={e=>{setFocus(e.target.value);reset();}}><option value="">全部已记录关系</option>{graph.nodes.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select>
   </label>
   {!focus?<label className="flex items-center gap-2"><input type="checkbox" className="accent-cs-button" checked={isolated} onChange={e=>{setIsolated(e.target.checked);reset();}}/> 同时显示没有连线的课程</label>:null}
   <p role="status" className="text-fd-muted-foreground">{nodes.length} 门课程 · {edges.length} 条先修关系 · {graph.unrecorded.length} 门课尚未整理先修字段</p>
  </div>
  {layout.cyclic.length?<p className="text-sm text-cs-warn">有循环或被循环阻塞的关系，请核对课程内容：{layout.cyclic.join('、')}</p>:null}
  <div className="hidden space-y-2 md:block">
   <div className="flex flex-wrap items-center gap-2">
    <div className="cs-seg">
     <button type="button" aria-label="缩小" title="缩小" onClick={()=>setZoom(z=>Math.max(MIN_ZOOM,z/1.25))}>−</button>
     <button type="button" className="min-w-16 font-mono text-xs tabular-nums" title="恢复 100%" onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button>
     <button type="button" aria-label="放大" title="放大" onClick={()=>setZoom(z=>Math.min(MAX_ZOOM,z*1.25))}>+</button>
    </div>
    <button type="button" className="cs-btn" onClick={()=>{setPan({x:0,y:0});setZoom(Math.min(1000/layout.width,600/layout.height));}}>查看全图</button>
    <button type="button" className="cs-btn" onClick={reset}>重置布局</button>
    <span className="ml-auto text-xs text-fd-muted-foreground">拖节点调整位置 · 拖空白移动画布 · Ctrl + 滚轮缩放 · 点课程编号打开</span>
   </div>
   <svg ref={svg} aria-label="课程先修关系图"
    className={`w-full touch-none select-none rounded-md border border-fd-border bg-fd-card text-fd-muted-foreground ${dragging?'cursor-grabbing':'cursor-grab'}`}
    style={{aspectRatio:'5/3'}} viewBox={`${pan.x} ${pan.y} ${1000/zoom} ${600/zoom}`}
    onPointerDown={e=>begin(e,null)} onPointerMove={move} onPointerUp={e=>end(e.pointerId)} onPointerCancel={()=>end()}
    onClickCapture={e=>{if(moved.current){e.preventDefault();e.stopPropagation();moved.current=false;}}}>
    <defs>
     <marker id="course-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker>
     <pattern id="graph-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="currentColor" opacity=".18"/></pattern>
    </defs>
    <rect x={pan.x} y={pan.y} width={1000/zoom} height={600/zoom} fill="url(#graph-dots)"/>
    {edges.map(edge=>{const a=position(edge.from),b=position(edge.to);const hot=focus!==''&&(edge.from===focus||edge.to===focus);
     return <path key={edge.from+':'+edge.to} data-edge={`${edge.from}:${edge.to}`} d={`M ${a.x+230} ${a.y+25} C ${a.x+270} ${a.y+25}, ${b.x-40} ${b.y+25}, ${b.x} ${b.y+25}`} fill="none" stroke="currentColor" className={hot?'text-fd-primary':''} opacity={hot?.9:.5} markerEnd="url(#course-arrow)"/>;})}
    {nodes.map(node=>{const p=position(node.id);const current=node.id===focus;
     return <g key={node.id} data-course={node.id} transform={`translate(${p.x},${p.y})`} onPointerDown={e=>begin(e,node.id)} className="group">
      <title>{node.title}</title>
      <Link href={node.url} aria-label={`打开 ${node.title}`} className="outline-none">
       <rect width="230" height="50" rx="4" fill={current?'var(--color-cs-active)':'var(--color-fd-background)'} stroke={current?'var(--color-cs-button)':'var(--color-fd-border)'} strokeWidth={current?1.5:1} className="transition-[stroke] group-hover:stroke-[var(--color-cs-button)] group-focus-visible:stroke-[var(--color-cs-button)]"/>
       <text x="12" y="22" fill="var(--color-fd-primary)" fontSize="14" fontFamily="var(--font-mono)">{node.id}</text>
       <text x="12" y="40" fill="var(--color-fd-muted-foreground)" fontSize="11">{node.title.length>28?node.title.slice(0,27)+'…':node.title}</text>
      </Link>
     </g>;})}
   </svg>
  </div>
  <p className="text-sm text-fd-muted-foreground md:hidden">手机屏幕放不下整张图，下面是同样的关系列表；大屏幕上可以拖动、缩放图形。</p>
  <details open={Boolean(focus)||undefined} className="group rounded-md border border-fd-border">
   <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm hover:bg-cs-hover [&::-webkit-details-marker]:hidden">
    <span aria-hidden="true" className="inline-block transition-transform duration-150 group-open:rotate-90">›</span>先修关系列表（{edges.length} 条）
   </summary>
   <ul className="max-h-96 divide-y divide-fd-border overflow-auto border-t border-fd-border text-sm">{edges.map(edge=><li key={edge.from+':'+edge.to} className="flex flex-wrap items-center gap-x-2 px-3 py-1.5">
    <Link className="text-fd-primary hover:underline" href={titleById.get(edge.from)!.url}>{titleById.get(edge.from)!.title}</Link>
    <span aria-label="是……的先修" className="text-fd-muted-foreground">→</span>
    <Link className="text-fd-primary hover:underline" href={titleById.get(edge.to)!.url}>{titleById.get(edge.to)!.title}</Link>
   </li>)}</ul>
   {edges.length===0?<p className="px-3 py-2 text-sm text-fd-muted-foreground">没有已记录的课程编号关系，请阅读课程页的先修要求。</p>:null}
  </details>
 </div>;
}
