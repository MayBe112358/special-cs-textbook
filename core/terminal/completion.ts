/**
 * @module        Tab 的命令名与路径补全
 * @problem       长路径容易敲错，但多个候选时不能擅自决定读者想去哪。
 * @design        根据光标前的最后一个词查命令表或当前目录；唯一候选才替换，多个候选只列出。
 * @courses       CS61B 前缀查找；Missing Semester shell
 * @exercises     https://missing.csail.mit.edu/2020/shell-tools/ —— 补全与历史
 * @prereq        补全不是纠错，只根据你已输入的前缀缩小候选。
 * @unclear       课程路径没有空格；引号尚未闭合时不补全，避免破坏原输入。
 * @letter
 * 我把补全写成纯函数，它只返回候选和替换后的输入，不直接操作输入框。
 * 这样鼠标光标之后的文字可以原样保留；遇到多个候选时，用户仍然拥有决定权。
 */
import type {SessionContext} from './command.ts';
export function completeLine(line:string,cursor:number,context:SessionContext,commands:readonly string[]){
 const prefix=line.slice(0,cursor);const match=prefix.match(/(?:^|[\s|])([^\s|]*)$/);if(!match)return {value:line,cursor,candidates:[] as string[]};
 const word=match[1]!;const start=cursor-word.length;const before=prefix.slice(0,start);
 if(/['"\\]/.test(word))return {value:line,cursor,candidates:[] as string[]};
 let candidates:string[]=[];
 if(!before.trim()||before.trimEnd().endsWith('|'))candidates=commands.filter(c=>c.startsWith(word));
 else{
  const slash=word.lastIndexOf('/');const base=slash<0?'':word.slice(0,slash+1);const partial=word.slice(slash+1);
  const found=context.fileSystem.lookup(context.currentPath,base||'.');
  if(found.found&&found.node.kind==='directory')candidates=context.fileSystem.childrenOf(found.node).filter(n=>n.name.startsWith(partial)).map(n=>base+n.name+(n.kind==='directory'?'/':''));
 }
 if(candidates.length!==1)return {value:line,cursor,candidates};
 const replacement=candidates[0]!+(candidates[0]!.endsWith('/')?'':' ');
 return {value:line.slice(0,start)+replacement+line.slice(cursor),cursor:start+replacement.length,candidates};
}
