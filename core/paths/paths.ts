/**
 * @module        旧版学习路径的格式——“一串课程编号排成一行”那一代的路径，现在只负责把旧数据读出来
 * @problem       阶段 9 的学习路径是一个有顺序的课程列表，存在 localStorage 里。阶段 14.5 改成了导图（方块加箭头），存进 IndexedDB。
 *                可读者浏览器里、以前导出的备份文件里，还躺着旧格式的路径。这些数据不能丢，
 *                所以得有人认得旧格式、能校验它、能把它读出来交给搬家的代码。
 * @design        保留旧格式的类型、校验和存储键名，全部是纯函数，不碰浏览器。
 *                谁在用它：components/workspace/browser-workspace.ts 第一次打开时，把 localStorage 里的旧路径读出来，
 *                交给 core/workspace/learning-paths 的 migrateLegacyPath 转成导图（一串方块用箭头依次连起来），先写新、再删旧；
 *                core/notes/backup.ts 导入第 4 版及更早的备份时，也用它校验里面的路径。
 *                校验很严：编号只许字母数字短横线，名字 1～100 字，课程不许重复，时间必须能解析。
 * @courses       UC Berkeley CS61A（数据抽象：先定清楚一条记录长什么样）；UC Berkeley CS61B（列表与集合）；
 *                UC Berkeley CS186 / CMU 15-445（数据迁移、模式演进、导入时的校验）
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2 —— CS61B Gitlet：自己定一种要长期存下来的数据格式，并且得一直能读回来
 *                https://15445.courses.cs.cmu.edu/fall2023/project1/ —— CMU 15-445 项目一：数据在存储里怎么组织
 * @prereq        知道数组有顺序、集合能判重；知道 localStorage 是浏览器里按“键 → 字符串”存东西的地方。
 * @unclear       moveCourse（把列表里一门课往前或往后挪一格）是旧版界面“上移 / 下移”按钮用的，
 *                导图版上线后已经没有界面在调用它，只剩测试在用。留着它是为了测试能继续描述旧格式的行为，删掉也可以。
 *                旧格式已经不会再产生新数据了；等确认大多数读者都搬过家，这个文件可以只留下校验部分。
 *
 * @letter
 * 这个文件是一代“退役”的数据格式。它不再管新东西了，只剩下一件事：把旧东西完整地接过来。
 *
 * 当年的学习路径就是一串课程编号，比如 [cs50x, cs61a, cs61b]，顺序就是你打算学的顺序。
 * 后来路径改成了导图，可以分叉、可以汇合，一串编号就装不下了。
 * 格式换了，可你以前排好的路线还在浏览器里。第一次打开新版时，搬家的代码会用这里的 readPath 把它读出来，
 * 转成一排用箭头依次连起来的方块，写进新的数据库，写成功了才删掉旧的。
 * “先写新、再删旧”这个顺序不能反。反过来的话，要是中途页面被关了，旧的删了新的还没写，你的路线就凭空没了。
 *
 * 为什么校验要这么死板？因为旧数据是最不可信的。它可能是某个很老的版本写的，可能被你手动改过，也可能来自一个不知道被谁动过的备份文件。
 * 这里的做法是，读不懂就报错，不猜。搬家那边收到报错，会把那条旧记录原样留在原地，不删也不改。
 * 数据可以暂时搬不过来，但不能因为读不懂就被当成空的，然后被覆盖掉。
 *
 * 当初设计这个格式时有个决定，放到导图版也照样成立：路径里只存课程编号，不复制课程内容。
 * 显示的时候再拿编号去课程树里查标题。所以一门课可以同时出现在好几条路线里；
 * 从一条路线里删掉它，不会删掉这门课，也不会清掉你给它标的学习状态。
 * 路线是你自己的安排，课程是大家共用的知识，两边互不干涉。
 */
import { validCourseId } from '../progress/progress.ts';

/** 旧路径在 localStorage 里的键名前缀，后面跟路径编号。搬家时靠它认出哪些是旧路径。 */
export const PATH_PREFIX = 'special-cs-textbook:path:';

export type LearningPath = { id: string; name: string; courses: string[]; updatedAt: string };

/** 校验一条旧路径。任何一处不对都直接报错，不修补、不猜。 */
export function validatePath(value: unknown): LearningPath {
  if (!value || typeof value !== 'object') throw new Error('学习路径格式错误。');
  const v = value as Record<string, unknown>;
  // 编号会拼进存储键名，只许字母数字和短横线，防止 ../ 这类东西混进来。
  if (typeof v.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(v.id)) throw new Error('路径编号无效。');
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 100) throw new Error('路径名称须为 1～100 个字符。');
  // 同一门课在一条路径里只能出现一次；一千门的上限是防止坏数据把页面撑爆。
  if (!Array.isArray(v.courses) || v.courses.length > 1000 || !v.courses.every(validCourseId) || new Set(v.courses).size !== v.courses.length) {
    throw new Error('路径课程无效或重复。');
  }
  if (typeof v.updatedAt !== 'string' || !Number.isFinite(Date.parse(v.updatedAt))) throw new Error('路径时间无效。');
  return { id: v.id, name: v.name.trim(), courses: [...v.courses] as string[], updatedAt: v.updatedAt };
}

export function pathKey(id: string): string {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('路径编号无效。');
  return PATH_PREFIX + id;
}

/** 从存储里读一条旧路径。没有就是 null；有但读不懂就报错，两种情况不能混。 */
export function readPath(raw: string | null, id: string): LearningPath | null {
  if (raw === null) return null;
  const value = validatePath(JSON.parse(raw));
  // 存在 A 键下的记录却自称是 B，说明数据被动过，不认。
  if (value.id !== id) throw new Error('路径编号与存储位置不一致。');
  return value;
}

/** 旧版界面“上移 / 下移”用的：返回一条新路径，不改原来那条。现在只有测试在调用。 */
export function moveCourse(path: LearningPath, index: number, direction: -1 | 1): LearningPath {
  const courses = [...path.courses];
  const target = index + direction;
  if (index >= 0 && index < courses.length && target >= 0 && target < courses.length) {
    [courses[index], courses[target]] = [courses[target]!, courses[index]!];
  }
  return { ...path, courses };
}
