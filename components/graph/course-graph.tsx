/**
 * @module        可拖动缩放的课程先修图
 * @problem       静态图片无法展开复杂关系，也不能让读者直接进入课程；手机又不适合展示整张大图。
 * @design        SVG 只负责公开关系，节点偏移与视角留在会话；按钮缩放、背景拖动画布、节点拖动，手机显示关系列表。
 * @courses       CS61B 图；MIT 18.06 坐标变换；CS50x Web 交互
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 交互页面
 * @prereq        画布坐标和屏幕坐标不同，缩放后拖动必须先把指针位置换回画布坐标。
 * @unclear       没有编号的文字先修不会连线；图仅呈现已整理的关系，不是完整课程依赖的保证。
 * @letter
 * 我让 SVG 保存一套逻辑坐标，浏览器负责把它缩放到屏幕。指针移动时先做反向坐标变换，
 * 因此放大两倍后拖十个像素，不会让节点错误地跳二十个像素。你拖的是布局，不是知识内容。
 * 拖动结束不能马上跳进课程，所以我记录这一次手势是否真正移动过，移动过的点击就不当作打开链接。
 * 图下面保留同一批关系的文字链接，手机、键盘读者和不想看图的人都能访问相同内容。
 */
'use client';
import {useMemo,useRef,useState,type PointerEvent} from 'react';
import Link from 'next/link';
import {buildCourseGraph,layoutGraph,type GraphPosition} from '@/core/knowledge/graph';
import type {CourseEntry} from '@/core/knowledge/knowledge-index';
export function CourseGraph({courses}:{courses:CourseEntry[]}){
 const graph=useMemo(()=>buildCourseGraph(courses),[courses]);const [focus,setFocus]=useState('');const [isolated,setIsolated]=useState(false);
 const [zoom,setZoom]=useState(1);const [pan,setPan]=useState({x:0,y:0});const [offsets,setOffsets]=useState<Record<string,GraphPosition>>({});
 const svg=useRef<SVGSVGElement>(null);const drag=useRef<{id:string|null;start:GraphPosition;origin:GraphPosition;screen:GraphPosition}|null>(null);const moved=useRef(false);
 const edges=graph.edges.filter(e=>!focus||e.from===focus||e.to===focus);const connected=new Set(edges.flatMap(e=>[e.from,e.to]));if(focus)connected.add(focus);
 const nodes=graph.nodes.filter(n=>connected.has(n.id)||(!focus&&isolated));const layout=layoutGraph(nodes.map(n=>n.id),edges);
 const position=(id:string)=>offsets[id]??layout.positions[id]!;
 function reset(){setZoom(1);setPan({x:0,y:0});setOffsets({});}
 function point(event:PointerEvent):GraphPosition{const matrix=svg.current?.getScreenCTM();if(!matrix)return {x:0,y:0};const value=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return {x:value.x,y:value.y};}
 function begin(event:PointerEvent,id:string|null){if(event.button!==0)return;event.stopPropagation();moved.current=false;drag.current={id,start:point(event),origin:id?position(id):pan,screen:{x:event.clientX,y:event.clientY}};}
 function move(event:PointerEvent){const current=drag.current;if(!current)return;const delta={x:(event.clientX-current.screen.x)*1000/zoom/(svg.current?.getBoundingClientRect().width??1000),y:(event.clientY-current.screen.y)*600/zoom/(svg.current?.getBoundingClientRect().height??600)};
  if(Math.hypot(event.clientX-current.screen.x,event.clientY-current.screen.y)>4){moved.current=true;svg.current?.setPointerCapture(event.pointerId);}
  if(current.id){const value={x:current.origin.x+delta.x,y:current.origin.y+delta.y};setOffsets(old=>({...old,[current.id!]:value}));}else setPan({x:current.origin.x-delta.x,y:current.origin.y-delta.y});
 }
 const titleById=new Map(graph.nodes.map(n=>[n.id,n]));
 return <div className="space-y-4">
  <p>箭头从先修课程指向后续课程。只显示内容里已经明确记录的关系；没有连线不等于没有先修。</p>
  <label className="block">查看课程 <select className="max-w-full rounded border p-2" value={focus} onChange={e=>{setFocus(e.target.value);reset();}}><option value="">全部已记录关系</option>{graph.nodes.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
  {!focus?<label className="block"><input type="checkbox" checked={isolated} onChange={e=>{setIsolated(e.target.checked);reset();}}/> 同时显示没有连线的课程</label>:null}
  <p role="status">当前 {nodes.length} 门课程、{edges.length} 条先修关系。{graph.unrecorded.length} 门课尚未整理先修字段。</p>
  {layout.cyclic.length?<p>有循环或被循环阻塞的关系，请核对课程内容：{layout.cyclic.join('、')}</p>:null}
  <div className="hidden md:block">
   <div className="my-3 flex flex-wrap gap-3"><button className="rounded border px-3 py-1" onClick={()=>setZoom(z=>Math.min(3,z*1.25))}>放大</button><button className="rounded border px-3 py-1" onClick={()=>setZoom(z=>Math.max(.08,z/1.25))}>缩小</button><button className="rounded border px-3 py-1" onClick={()=>{setPan({x:0,y:0});setZoom(Math.min(1000/layout.width,600/layout.height));}}>查看全图</button><button className="rounded border px-3 py-1" onClick={reset}>重置布局</button><span>缩放 {Math.round(zoom*100)}%</span></div>
   <p className="mb-2 text-sm">拖动节点调整位置，拖动空白移动画布。点击课程编号打开课程。选择一门课可聚焦相邻关系。</p>
   <svg ref={svg} aria-label="课程先修关系图" className="w-full touch-none rounded border bg-fd-background" style={{aspectRatio:'5/3'}} viewBox={`${pan.x} ${pan.y} ${1000/zoom} ${600/zoom}`} onPointerDown={e=>begin(e,null)} onPointerMove={move} onPointerUp={e=>{drag.current=null;if(svg.current?.hasPointerCapture(e.pointerId))svg.current.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=null;}} onClickCapture={e=>{if(moved.current){e.preventDefault();e.stopPropagation();moved.current=false;}}}>
    <defs><marker id="course-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>
    {edges.map(edge=>{const a=position(edge.from),b=position(edge.to);return <path key={edge.from+':'+edge.to} data-edge={`${edge.from}:${edge.to}`} d={`M ${a.x+230} ${a.y+25} C ${a.x+270} ${a.y+25}, ${b.x-40} ${b.y+25}, ${b.x} ${b.y+25}`} fill="none" stroke="currentColor" opacity=".45" markerEnd="url(#course-arrow)"/>;})}
    {nodes.map(node=>{const p=position(node.id);return <g key={node.id} data-course={node.id} transform={`translate(${p.x},${p.y})`} onPointerDown={e=>begin(e,node.id)}><title>{node.title}</title><Link href={node.url} aria-label={`打开 ${node.title}`}><rect width="230" height="50" rx="5" fill="var(--color-fd-background)" stroke="currentColor"/><text x="12" y="22" fill="currentColor" fontSize="14">{node.id}</text><text x="12" y="40" fill="currentColor" fontSize="11">{node.title.length>28?node.title.slice(0,27)+'…':node.title}</text></Link></g>;})}
   </svg>
  </div>
  <p className="md:hidden">手机上使用下方关系列表；大屏幕可拖动、缩放图形。</p>
  <details open={Boolean(focus)}><summary>先修关系列表（{edges.length} 条）</summary><ul className="max-h-96 space-y-2 overflow-auto py-3">{edges.map(edge=><li key={edge.from+':'+edge.to}><Link className="underline" href={titleById.get(edge.from)!.url}>{titleById.get(edge.from)!.title}</Link> → <Link className="underline" href={titleById.get(edge.to)!.url}>{titleById.get(edge.to)!.title}</Link></li>)}</ul>{edges.length===0?<p>没有已记录的课程编号关系，请阅读课程页的先修要求。</p>:null}</details>
 </div>;
}
