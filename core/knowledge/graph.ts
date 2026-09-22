/**
 * @module        从先修关系生成课程图与分层位置
 * @problem       目录只显示课程属于哪个领域，不能显示学某课之前需要哪些课；关系不能再手抄一遍。
 * @design        直接把 prereq.courses 变成有向边，边从先修指向后续；用入度队列分层，循环关系单独报告。
 * @courses       CS61B 图遍历；MIT 6.042J 有向图与偏序；CS170 拓扑排序
 * @exercises     https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-spring-2015/ —— 图与偏序官方习题
 * @prereq        入度是一门课还有几个先修没有被处理；拓扑顺序让先修先出现。
 * @unclear       缺少先修记录不表示没有先修；这里只画已有明确编号的关系，文字要求仍须阅读课程页。
 * @letter
 * 我不把图当作另一份课程规划。连线从课程内容算出来，改掉先修字段，下一次构建的图就会跟着变。
 * 分层时先找没有待处理先修的节点，把它放好，再通知后续课程减少一个等待项。这就是拓扑排序。
 * 如果最后还有节点没处理完，可能存在循环或被循环挡住。我保留这些节点并给出提示，不靠无限递归硬画。
 * 画面上的位置只是便于阅读，不是规定你必须照着走的学习路径；拖动节点也不会改变课程关系。
 */
import type {CourseEntry} from './knowledge-index.ts';
export type GraphEdge={from:string;to:string};
export type GraphPosition={x:number;y:number};
export function layoutGraph(ids:readonly string[],edges:readonly GraphEdge[]){
 const incoming=new Map(ids.map(id=>[id,0]));const outgoing=new Map(ids.map(id=>[id,[] as string[]]));
 for(const edge of edges){if(!incoming.has(edge.from)||!incoming.has(edge.to))continue;incoming.set(edge.to,incoming.get(edge.to)!+1);outgoing.get(edge.from)!.push(edge.to);}
 const queue=ids.filter(id=>incoming.get(id)===0).sort();const layers=new Map(ids.map(id=>[id,0]));const processed=new Set<string>();
 for(let i=0;i<queue.length;i++){const id=queue[i]!;processed.add(id);for(const to of outgoing.get(id)!){layers.set(to,Math.max(layers.get(to)!,layers.get(id)!+1));incoming.set(to,incoming.get(to)!-1);if(incoming.get(to)===0)queue.push(to);}}
 const cyclic=ids.filter(id=>!processed.has(id));const counts=new Map<number,number>();const positions:Record<string,GraphPosition>={};
 for(const id of [...ids].sort()){const layer=processed.has(id)?layers.get(id)!:0;const row=counts.get(layer)??0;counts.set(layer,row+1);positions[id]={x:40+layer*310,y:40+row*85};}
 const values=Object.values(positions);
 return {positions,cyclic,width:Math.max(1000,...values.map(p=>p.x+280)),height:Math.max(600,...values.map(p=>p.y+90))};
}
export function buildCourseGraph(courses:readonly CourseEntry[]){
 const ids=new Set(courses.map(c=>c.id));const edges:GraphEdge[]=[];const missing:string[]=[];
 for(const course of courses)for(const from of new Set(course.prereq?.courses??[])){if(ids.has(from))edges.push({from,to:course.id});else missing.push(`${from} → ${course.id}`);}
 return {nodes:courses.map(c=>({id:c.id,title:c.title,url:c.url})),edges,missing,unrecorded:courses.filter(c=>c.prereq===null).map(c=>c.id)};
}
