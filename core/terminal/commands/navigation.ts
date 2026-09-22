/**
 * @module        pwd、tree、history 与 clear
 * @problem       读者需要知道当前位置、查看层级、回看敲过的命令，并整理屏幕。
 * @design        只从上下文读取地址和历史，目录树递归产生结构化节点，clear 只申请清屏，不删除历史。
 * @courses       CS61B 树的遍历；Missing Semester shell；CS61A 副作用边界
 * @exercises     https://missing.csail.mit.edu/2020/shell-tools/ —— 目录与命令历史
 * @prereq        一棵树由当前节点及其子树组成；清屏和清空数据是两件事。
 * @unclear       tree 支持路径与 -L 层数，history 支持末尾条数；未实现的 Unix 选项明确拒绝。
 * @letter
 * 我没有让 pwd 记一份目录，它读到的还是从网址推出来的那个位置。历史则是会话数据，刷新就消失。
 * tree 递归处理孩子，把“孩子还是树”这件事保留下来，所以界面能够折叠每个分支。
 * clear 最容易被写错成删除历史。这里它只递出清屏申请，你按向上键仍然找得到之前输入的命令。
 */
import type {CommandDefinition,CommandResult} from '../command.ts';
import type {VfsNode} from '../../filesystem/virtual-file-system.ts';
import {text,type TreeItem} from '../output.ts';
import {lookupError,usageError} from './shared.ts';
export const pwdCommand:CommandDefinition={name:'pwd',summary:'显示当前目录',usage:'pwd [-L|-P]',pipeline:true,run:({args},c)=>args.some(a=>a!=='-L'&&a!=='-P')?usageError('pwd','pwd [-L|-P]'):{status:'ok',blocks:[text(c.currentPath)],actions:[]}};
export const historyCommand:CommandDefinition={name:'history',summary:'查看会话命令历史',usage:'history [n]',pipeline:true,run:({args},c)=>{
 if(args.length>1||(args[0]!==undefined&&!/^\d+$/.test(args[0])))return usageError('history','history [n]');
 const history=c.history??[];const start=args[0]===undefined?0:Math.max(0,history.length-Number(args[0]));
 return {status:'ok',blocks:history.slice(start).map((line,i)=>text(`${start+i+1}  ${line}`)),actions:[]};
}};
export const clearCommand:CommandDefinition={name:'clear',summary:'清屏，保留命令历史',usage:'clear',run:({args})=>args.length?usageError('clear','clear'):{status:'ok',blocks:[],actions:[{type:'clear-screen'}]}};
export const treeCommand:CommandDefinition={name:'tree',summary:'可折叠的目录树',usage:'tree [-L level] [path]',pipeline:true,run:({args},c):CommandResult=>{
 let depth=Infinity;let path='.';let hasPath=false;
 for(let i=0;i<args.length;i++){const a=args[i]!;if(a==='-L'){const n=args[++i];if(!n||!/^\d+$/.test(n)||Number(n)<1)return usageError('tree','tree [-L level] [path]');depth=Number(n);}else if(a.startsWith('-')||hasPath)return usageError('tree','tree [-L level] [path]');else{path=a;hasPath=true;}}
 const result=c.fileSystem.lookup(c.currentPath,path);if(!result.found)return lookupError('tree',path,result);
 function visit(node:VfsNode,level:number):TreeItem {return {label:node.name||'/',command:`open ${node.path}`,...(node.kind==='directory'?{children:level<depth?c.fileSystem.childrenOf(node).map(child=>visit(child,level+1)):[]}:{} )};}
 return {status:'ok',blocks:[{type:'tree',root:visit(result.node,0)}],actions:[]};
}};
