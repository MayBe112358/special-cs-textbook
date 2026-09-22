/**
 * @module        课程关系与图布局的测试
 * @problem       错画一条先修会误导读者，循环关系还可能让布局无限运行。
 * @design        使用分叉、汇合、循环与孤立节点，验证方向、稳定位置和明确报告。
 * @courses       CS61B 图测试；MIT 6.042J 偏序
 * @exercises     https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-spring-2015/ —— 图与关系习题
 * @prereq        先修在左，后续在右；一个课程可以有多个先修。
 * @unclear       鼠标坐标和触屏行为由浏览器验收覆盖。
 * @letter
 * 我故意放进一圈无法排出先后的课程。测试不要求程序替内容作者猜谁对，而是要求它停下来、保留节点并报告。
 * 没有先修记录的课程也要保留，不能因为没有连线就从知识地图里消失。
 */
import test from 'node:test';import assert from 'node:assert/strict';
import {layoutGraph,buildCourseGraph} from './graph.ts';import type {CourseEntry} from './knowledge-index.ts';
const course=(id:string,prereq:string[]|null):CourseEntry=>({id,title:id,description:'',path:'/'+id,url:'/docs/'+id,categoryPath:'/',file:id+'.mdx',prereq:prereq===null?null:{courses:prereq,knowledge:[]}});
test('关系从内容自动生成，未知先修不冒充无先修',()=>{const g=buildCourseGraph([course('a',[]),course('b',['a','a']),course('c',null)]);assert.deepEqual(g.edges,[{from:'a',to:'b'}]);assert.deepEqual(g.unrecorded,['c']);assert.equal(g.nodes.length,3);});
test('分叉和汇合按先修分层，每个位置不同',()=>{const layout=layoutGraph(['a','b','c','d'],[{from:'a',to:'b'},{from:'a',to:'c'},{from:'b',to:'d'},{from:'c',to:'d'}]);assert.ok(layout.positions.a!.x<layout.positions.b!.x);assert.ok(layout.positions.b!.x<layout.positions.d!.x);assert.notEqual(layout.positions.b!.y,layout.positions.c!.y);assert.deepEqual(layout.cyclic,[]);});
test('循环被报告且不会递归卡死，空图合法',()=>{assert.equal(layoutGraph(['a','b'],[{from:'a',to:'b'},{from:'b',to:'a'}]).cyclic.length,2);assert.deepEqual(layoutGraph([],[]).positions,{});});
