/**
 * @module        学习路径的数据规则
 * @problem       课程树描述知识，而读者需要保存自己的选择和先后顺序；两者不能互相覆盖。
 * @design        每条路径独立编号，只引用课程编号。排序改变路径数组，不改变课程；校验拒绝重复和损坏记录。
 * @courses       CS61A 数据抽象；CS61B 列表与集合；CS186 数据完整性
 * @exercises     https://sp21.datastructur.es/materials/proj/proj1/proj1 —— 用列表保存顺序
 * @prereq        数组保存顺序，集合用于判断重复；引用编号不等于复制课程内容。
 * @unclear       多标签同时修改同一条路径时后写者获胜；目前不提供云同步。
 * @letter
 * 我把路线放在读者的数据里，而没有给每门课加一个“第几课”。你可能先学数学，我可能先写程序，
 * 两个人的顺序都不该改变这门课本身。路径只保存课程的编号，显示时再去课程树查标题。
 * 一门课因此可以同时出现在多条路线里；从路线移除它，也不会删除课程或清掉学习状态。
 * 即使课程后来下架，你的选择也应该留下来，所以旧编号仍可恢复，界面会解释它暂时找不到。
 */
import { validCourseId } from '../progress/progress.ts';
export const PATH_PREFIX = 'special-cs-textbook:path:';
export type LearningPath = { id: string; name: string; courses: string[]; updatedAt: string };
export function validatePath(value: unknown): LearningPath {
  if (!value || typeof value !== 'object') throw new Error('学习路径格式错误。');
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(v.id)) throw new Error('路径编号无效。');
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 100) throw new Error('路径名称须为 1～100 个字符。');
  if (!Array.isArray(v.courses) || v.courses.length > 1000 || !v.courses.every(validCourseId) || new Set(v.courses).size !== v.courses.length) throw new Error('路径课程无效或重复。');
  if (typeof v.updatedAt !== 'string' || !Number.isFinite(Date.parse(v.updatedAt))) throw new Error('路径时间无效。');
  return {id:v.id, name:v.name.trim(), courses:[...v.courses] as string[], updatedAt:v.updatedAt};
}
export function pathKey(id: string): string {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('路径编号无效。');
  return PATH_PREFIX + id;
}
export function readPath(raw: string | null, id: string): LearningPath | null {
  if (raw === null) return null;
  const value = validatePath(JSON.parse(raw));
  if (value.id !== id) throw new Error('路径编号与存储位置不一致。');
  return value;
}
export function moveCourse(path: LearningPath, index: number, direction: -1 | 1): LearningPath {
  const courses = [...path.courses]; const target = index + direction;
  if (index >= 0 && index < courses.length && target >= 0 && target < courses.length) {
    [courses[index], courses[target]] = [courses[target]!, courses[index]!];
  }
  return {...path, courses};
}
