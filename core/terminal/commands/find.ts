/**
 * @module        find——按位置和条件查课程
 * @problem       逐个展开目录无法同时回答“这个分类下有哪些我正在学、且以某课为先修的课程”。
 * @design        深度优先遍历虚拟树，标准路径、名称、类型条件取交集；状态和先修是明确标注的本站扩展。
 * @courses       CS61B 树遍历；CS186 查询；Missing Semester find
 * @exercises     https://missing.csail.mit.edu/2020/shell-tools/ —— 官方文件查找练习
 * @prereq        -name 匹配文件名，-path 匹配从起点出发显示的完整名字，-type f/d 区分文件与目录。
 * @unclear       只支持 help 列出的 AND 条件，不模拟完整 GNU find；-status、-prereq 是本站扩展，不可照搬到系统终端。
 * @letter
 * 我先让 find 走过目录中的每个节点，再用条件决定是否留下它。没有条件时目录本身也会被列出。
 * 输出不只是一个路径字符串：每项仍然带着标题与打开动作。后面的 grep 可以筛掉条目，却不必猜如何恢复链接。
 * 课程状态来自你自己的快照，分类与先修来自公开课程树。一次查询可以同时看两者，但不会把两份数据混存。
 */
import type {CommandDefinition,CommandResult} from '../command.ts';
import type {VfsNode} from '../../filesystem/virtual-file-system.ts';
import {list,text,type ListItem} from '../output.ts';
import {lookupError} from './shared.ts';
function glob(pattern:string):RegExp {
 let source='';for(const char of pattern){source+=char==='*'?'.*':char==='?'?'.':'.+^${}()|[]'.includes(char)||char.charCodeAt(0)===92?String.fromCharCode(92)+char:char;}
 return new RegExp('^'+source+'$');
}
export const findCommand:CommandDefinition={name:'find',summary:'递归查找；-status/-prereq 是本站扩展',usage:'find [path] [-name pattern] [-path pattern] [-type f|d] [-status todo|learning|done|unmarked] [-prereq course]',pipeline:true,run:({args},c):CommandResult=>{
 const options=new Map<string,string>();let start='.';let i=0;if(args[0]&&!args[0].startsWith('-')){start=args[0];i++;}
 for(;i<args.length;i++){const key=args[i]!;const value=args[++i];if(!['-name','-path','-type','-status','-prereq'].includes(key)||value===undefined)return {status:'error',blocks:[text(`find: invalid predicate: ${key}`,'error')],actions:[]};options.set(key,value);}
 if(options.has('-type')&&!['f','d'].includes(options.get('-type')!))return {status:'error',blocks:[text('find: invalid argument to -type','error')],actions:[]};
 if(options.has('-status')&&!['todo','learning','done','unmarked'].includes(options.get('-status')!))return {status:'error',blocks:[text('find: invalid argument to -status','error')],actions:[]};
 const found=c.fileSystem.lookup(c.currentPath,start);if(!found.found)return lookupError('find',start,found);
 const names=options.has('-name')?glob(options.get('-name')!):null;const paths=options.has('-path')?glob(options.get('-path')!):null;
 const rows:ListItem[]=[];
 function visit(node:VfsNode,display:string){
  const course=node.kind==='file'&&node.source.kind==='course'?node.source.course:null;
  const state=course?c.progress.find(p=>p.course===course.id)?.state??'unmarked':null;
  if((!names||names.test(node.name))&&(!paths||paths.test(display))&&(!options.has('-type')||options.get('-type')===(node.kind==='directory'?'d':'f'))&&(!options.has('-status')||state===options.get('-status'))&&(!options.has('-prereq')||course?.prereq?.courses.includes(options.get('-prereq')!)))rows.push({label:display,description:node.title,command:`open ${node.path}`});
  if(node.kind==='directory')for(const child of c.fileSystem.childrenOf(node))visit(child,display.replace(/\/$/,'')+'/'+child.name);
 }
 visit(found.node,start==='~'?'/':start.replace(/\/$/,'')||'/');
 return {status:'ok',blocks:[list(rows)],actions:[]};
}};
