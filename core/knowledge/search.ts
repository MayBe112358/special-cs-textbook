/**
 * @module        课程与源码讲解共用的静态搜索
 * @problem       读者可能记得课程编号，也可能只记得讲解里的中文概念，目录名不能回答全部问题。
 * @design        从已有索引提取标题、简介与整段源码注释，统一大小写和全角字符；关键词取交集，标题命中优先。
 * @courses       CS61B 字符串查找；CS186 索引与查询；CS61A 数据抽象
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2 —— 数据组织与查询
 * @prereq        搜索索引是公开内容的另一种排列，不包含浏览器里的私人心得。
 * @unclear       当前是子串匹配，不做中文语义理解或拼写纠错；规模达到数万条时再考虑倒排索引。
 * @letter
 * 我让页面和终端使用同一个函数，避免在搜索框里找得到的词，换到命令行就找不到。
 * 中文没有天然的空格，因此这里不强行按英文单词切开正文，而是检查关键词是否连续出现。
 * 你输入多个词时每个都必须出现；课程编号精确匹配排在前面，正文提到的内容排在后面。
 * 所有材料都是构建时公开的内容，输入的查询只在浏览器里计算，不需要搜索服务器。
 */
import type {KnowledgeIndex} from './knowledge-index.ts';
import type {Paragraph} from './doc-comment.ts';
export type SearchHit={kind:'course'|'module';title:string;path:string;url:string;excerpt:string;score:number};
const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase();
function paragraphs(values:Paragraph[]){return values.map(p=>p.kind==='text'?p.text:p.lines.join('\n')).join('\n');}
export function searchKnowledge(index:KnowledgeIndex,query:string,limit=30):SearchHit[]{
 const terms=normalize(query).trim().split(/\s+/).filter(Boolean);if(!terms.length)return [];
 const docs=index.courses.map(c=>({kind:'course' as const,title:c.title,path:c.path,url:c.url,body:[c.description,...c.prereq?.knowledge??[],...c.prereq?.courses??[]].join(' ')})).concat([]);
 const all:{kind:'course'|'module';title:string;path:string;url:string;body:string}[]=[...docs,...index.modules.map(m=>({kind:'module' as const,title:m.title,path:m.path,url:m.url,body:[m.comment.module,...[m.comment.problem,m.comment.design,m.comment.courses,m.comment.prereq,m.comment.unclear,m.comment.letter].map(paragraphs)].join('\n')}))];
 return all.flatMap(doc=>{
   const title=normalize(doc.title);const body=normalize(doc.body);const path=normalize(doc.path);const haystack=title+' '+path+' '+body;
   if(!terms.every(term=>haystack.includes(term)))return [];
   const score=terms.reduce((sum,term)=>sum+(path.split('/').at(-1)===term?100:0)+(title.includes(term)?20:0)+(path.includes(term)?10:0)+1,0);
   const found=body.indexOf(terms[0]!);const start=Math.max(0,found-25);
   return [{kind:doc.kind,title:doc.title,path:doc.path,url:doc.url,excerpt:(start?'…':'')+doc.body.slice(start,start+160),score}];
 }).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,limit);
}
