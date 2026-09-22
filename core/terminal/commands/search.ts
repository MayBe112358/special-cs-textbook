/**
 * @module        search——从终端搜索课程和教材正文
 * @problem       知道概念但不知道路径时，需要跨目录查找。
 * @design        复用页面搜索函数，结果仍是可点击的结构化列表，也可交给 grep 继续筛选。
 * @courses       CS186 查询；CS61A 函数组合；Missing Semester 管道
 * @exercises     https://missing.csail.mit.edu/2020/data-wrangling/ —— 组合查询
 * @prereq        搜索是只读操作，不会改变当前位置。
 * @unclear       最多返回 30 条，过于宽泛时请加关键词缩小范围。
 * @letter
 * 这里没有第二套搜索规则。终端只是把你敲的参数交给共用函数，再把结果转成终端认识的列表。
 * 路径和打开动作一直跟着结果走，所以 search 解释器 | grep CS61A 之后的条目仍能点开。
 */
import type {CommandDefinition} from '../command.ts';
import {searchKnowledge} from '../../knowledge/search.ts';
import {list,text} from '../output.ts';
export const searchCommand:CommandDefinition={name:'search',summary:'搜索课程与代码讲解（中英文，最多30条）',usage:'search <keywords...>',pipeline:true,run:({args},c)=>{
 if(!args.length)return {status:'error',blocks:[text('usage: search <keywords...>','error')],actions:[]};
 return {status:'ok',blocks:[list(searchKnowledge(c.knowledge,args.join(' ')).map(hit=>({label:hit.path,description:hit.title+' — '+hit.excerpt,command:`open ${hit.path}`})))],actions:[]};
}};
