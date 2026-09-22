/**
 * @module        grep——保留匹配的行或结构化条目
 * @problem       一次查找可能返回很多结果，读者需要逐步筛选，而且筛选后链接仍应可点。
 * @design        文本按行筛选，列表保留原对象；树先展开成条目。支持 -F 字面匹配和基础/扩展正则常用语法。
 * @courses       CS61A 高阶函数；CS143 正则表达式；Missing Semester 数据整理
 * @exercises     https://missing.csail.mit.edu/2020/data-wrangling/ —— grep 与管道
 * @prereq        过滤只决定留下谁，不改变留下的对象；正则表达式描述一组可能的字符串。
 * @unclear       不实现 GNU grep 的全部语法和选项，不支持 POSIX 字符类及反向引用；不支持的模式明确报错。
 * @letter
 * 我没有先把链接画成文字再让 grep 拆回来。对于列表，它查看标签和说明，匹配就把同一个对象留下。
 * 因此三个命令串起来时，最初的打开动作还能一路保留到屏幕上。普通文本才按换行拆开。
 * -F 让符号也按字面理解。默认基础正则和 -E 扩展正则的括号含义不同，不能直接假装 JavaScript 就是 GNU grep。
 * 对没有实现的复杂模式，我宁愿明确拒绝，也不悄悄给一个看似正确的结果。
 */
import type {CommandDefinition,CommandResult} from '../command.ts';
import {list,text,type OutputBlock,type ListItem,type TreeItem} from '../output.ts';
export function filterBlocks(blocks:readonly OutputBlock[],accept:(value:string)=>boolean):OutputBlock[]{
 const out:OutputBlock[]=[];
 for(const block of blocks){
  if(block.type==='text'){for(const line of block.text.split('\n'))if(accept(line))out.push({...block,text:line});}
  else if(block.type==='list')out.push(list(block.items.filter(item=>accept(item.label+(item.description?' '+item.description:'')))));
  else{const rows:ListItem[]=[];const walk=(item:TreeItem)=>{if(accept(item.label))rows.push({label:item.label,command:item.command});item.children?.forEach(walk);};walk(block.root);out.push(list(rows));}
 }
 return out;
}
export const grepCommand:CommandDefinition={name:'grep',summary:'筛选管道结果或文件简介',usage:'grep [-i] [-v] [-F|-E] [--] pattern [file ...]',pipeline:true,run:({args},c):CommandResult=>{
 let insensitive=false,invert=false,fixed=false,extended=false;let i=0;
 for(;i<args.length;i++){const arg=args[i]!;if(arg==='--'){i++;break;}if(!arg.startsWith('-')||arg==='-')break;
  for(const flag of arg.slice(1)){if(flag==='i')insensitive=true;else if(flag==='v')invert=true;else if(flag==='F')fixed=true;else if(flag==='E')extended=true;else return {status:'error',blocks:[text(`grep: invalid option -- ${flag}`,'error')],actions:[]};}}
 const pattern=args[i++];if(pattern===undefined)return {status:'error',blocks:[text('grep: missing pattern','error')],actions:[]};
 let match:(s:string)=>boolean;
 try{
  if(fixed){const needle=insensitive?pattern.toLowerCase():pattern;match=s=>(insensitive?s.toLowerCase():s).includes(needle);}
  else{
   if(pattern.length>200||/\\[1-9]|\[\[:|\(\?/.test(pattern))throw new Error('unsupported regular expression; use -F for literal text');
   let source='';let bracket=false;
   for(let j=0;j<pattern.length;j++){const char=pattern[j]!;
    if(char==='\\'){const next=pattern[++j];if(next===undefined)throw new Error('trailing backslash');source+=!extended&&'()+?|{}'.includes(next)?next:'\\'+next;continue;}
    if(char==='[')bracket=true;if(char===']')bracket=false;
    source+=!extended&&!bracket&&'()+?|{}'.includes(char)?'\\'+char:char;
   }
   // 限制嵌套重复，避免读者输入让浏览器长时间卡住。
   if(/\([^)]*[+*][^)]*\)[+*{]|\.\*.*\.\*/.test(source))throw new Error('pattern too complex');
   const re=new RegExp(source,insensitive?'i':'');match=s=>re.test(s);
  }
 }catch(error){return {status:'error',blocks:[text(`grep: ${error instanceof Error?error.message:'invalid pattern'}`,'error')],actions:[]};}
 let blocks:readonly OutputBlock[]=c.stdin??[];
 if(i<args.length){const files:OutputBlock[]=[];for(const input of args.slice(i)){if(input==='-'){files.push(...c.stdin??[]);continue;}const f=c.fileSystem.lookup(c.currentPath,input);if(!f.found||f.node.kind==='directory')return {status:'error',blocks:[text(`grep: ${input}: ${f.found?'Is a directory':f.reason}`,'error')],actions:[]};files.push(text(f.node.description));}blocks=files;}
 return {status:'ok',blocks:filterBlocks(blocks,s=>invert?!match(s):match(s)),actions:[]};
}};
