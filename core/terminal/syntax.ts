/**
 * @module        命令行的引号、转义与管道
 * @problem       空格和竖线有时是分隔符，有时只是文字；只按空格切开会丢失读者的原意。
 * @design        用三个状态记录当前是否在引号里，先解析整条管道，再交给引擎执行；语法坏了不产生任何动作。
 * @courses       CS61A 解释器；CS143 词法分析；Missing Semester shell
 * @exercises     https://cs61a.org/ —— Scheme 解释器项目
 * @prereq        状态就是读到当前位置时必须记住的信息；单引号内全部是文字。
 * @unclear       不执行变量展开、重定向、命令替换和后台任务；这不是一个完整 shell。
 * @letter
 * 我让扫描器每次只读一个字符。遇到空格，先问“我现在在引号里面吗”，而不是马上切开。
 * 因此 grep 'a b' 收到一个参数，grep 'a|b' 也不会被拆成两条命令。
 * 先把整行看完再执行还有一个好处：尾部缺了引号时，前面的命令不会已经改掉你的数据。
 * 解析器只交回命令和参数，既不认识网页，也不知道哪条命令存在；这些问题留给下一层回答。
 */
import type {CommandInvocation} from './command.ts';
export function parsePipeline(line:string):CommandInvocation[] {
  const pipeline:CommandInvocation[]=[];let words:string[]=[];let word='';let started=false;let quote='';
  const flush=()=>{if(started){words.push(word);word='';started=false;}};
  const finish=()=>{flush();if(!words.length)throw new Error("syntax error near unexpected token '|'");pipeline.push({name:words[0]!,args:words.slice(1)});words=[];};
  for(let i=0;i<line.length;i++){
    const c=line[i]!;
    if(quote==="'"){if(c==="'")quote='';else word+=c;continue;}
    if(c==='\\'){
      const next=line[++i];if(next===undefined)throw new Error('syntax error: trailing escape');
      if(quote==='"'&&!['$','`','"','\\','\n'].includes(next))word+='\\';
      if(next!=='\n')word+=next;started=true;continue;
    }
    if(quote==='"'){if(c==='"')quote='';else word+=c;continue;}
    if(c==='"'||c==="'"){quote=c;started=true;continue;}
    if(c==='|'){finish();continue;}
    if(/[;&<>`]/.test(c))throw new Error(`syntax error: unsupported operator ${c}`);
    if(/\s/.test(c)){flush();continue;}
    word+=c;started=true;
  }
  if(quote)throw new Error('syntax error: unterminated quote');
  flush();if(words.length)finish();else if(pipeline.length)throw new Error("syntax error near unexpected token '|'");
  return pipeline;
}
