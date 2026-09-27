/**
 * @module        AI 能用的工具——它能读什么、能提议改什么，以及每个工具真正做的事
 * @problem       模型本身什么都碰不到：它只能说“我想调用 read_note，参数是……”。
 *                真正去读你的心得、真正生成一张改动单的，是这里的代码。工具给得太少，AI 帮不上忙；
 *                给得太多、太松，AI 就可能改到不该改的东西，或者拿着一个它编出来的编号乱写。
 * @design        两类工具，名字一眼能分：
 *                - 读的：get_context、search_textbook、read_textbook_entry、get_progress、list_notes、read_note、
 *                  list_learning_paths、read_learning_path。直接执行，返回 JSON。
 *                - 改的：create_note、edit_note、create_mind_map、edit_mind_map、set_course_status、create_learning_path。
 *                  它们不写任何东西，只生成一张改动单（changes.ts），交给 env.requestChange——
 *                  由界面按读者选的方式（每次确认 / 自动同意）处理，再把结果告诉 AI。
 *                没有删除工具。只读模式（toolsFor('readonly')）下连改动工具都不交给模型。
 *                每个工具的参数先按它自己的 JSON Schema 检查一遍（validateInput）：
 *                流式输出时模型的参数可能被截断，编号可能是编的——检查不过就把原因告诉 AI，让它改了重来。
 *                导图的方块位置不让 AI 算：它只给方块和连线，位置交给学习路径同一套分层排布（arrange）。
 *                这里只依赖统一编辑接口 Workspace 和知识索引，不引用 React、不碰浏览器，能在测试里用内存实现跑。
 * @courses       Stanford CS224N / UC Berkeley CS294（大语言模型的工具调用）；UC Berkeley CS161（最小权限、输入校验）；
 *                MIT 6.031（规格说明：每个工具的 description 就是它的规格）
 * @exercises     https://cs161.org/ —— 输入校验与最小权限相关的作业
 * @prereq        知道 JSON Schema 是一种“描述一个 JSON 长什么样”的写法；知道模型调用工具只是输出一段请求，由程序执行。
 * @unclear       读课程时只能读到简介和先修（知识索引里有的），读不到课程页的全文——全文在构建时没进索引。
 *                源码讲解能读到完整的注释块（包括那封信）。
 *
 * @letter
 * 给 AI 设计工具，跟给一个新来的同事开权限差不多：需要什么就给什么，每样都写清楚是干嘛用的。
 *
 * 你翻一下会发现，每个工具的 description 都写得特别啰嗦：什么时候该用，参数什么意思，调了会发生什么。
 * 因为对模型来说，这段话就是它能看到的全部说明书。你写得含糊，它就用得含糊。
 * 这跟 MIT 6.031 讲的“规格说明”是一回事：调用的人只看规格、不看实现，所以规格必须把话说全。
 *
 * 工具分两类，名字一眼就能看出来。
 * 读的那类（get_context、read_note 这些）直接执行，把结果交给模型。
 * 改的那类（create_note、edit_mind_map 这些）其实什么都不写，只生成一张改动单，交给界面按你选的权限去处理。
 * 模型再聪明，它的输出也是不能直接信的输入：它可能看错编号，可能把你三千字的笔记“整理”成三百字。
 * 所以动手之前一定有一步是摆给你看、等你点头。这一步不在模型里，在这里的代码里，模型绕不过去。
 *
 * 还有两个细节。
 * 一个是每次调用前，参数都要按工具自己的格式说明检查一遍。模型的参数是边写边传的，可能被截断；编号也可能是它编出来的。
 * 检查不过，就把原因告诉它，让它改了再来，而不是拿着一个编出来的编号去乱写。
 *
 * 另一个是导图上方块的位置不让 AI 算。它只管说“有哪些方块、谁连谁”，摆在哪儿交给学习路径那套分层排法（graph 那章的拓扑排序）。
 * 让模型去算坐标，它多半会把方块叠成一坨，还白白多花你的钱。
 */

import type { KnowledgeIndex } from '../knowledge/knowledge-index.ts';
import type { Paragraph } from '../knowledge/doc-comment.ts';
import { searchKnowledge } from '../knowledge/search.ts';
import { PROGRESS_STATES, type ProgressState } from '../progress/progress.ts';
import { EMPTY_CANVAS, type Canvas } from '../workspace/canvas.ts';
import { createCanvasItem, createTextItem, MAX_TEXT_LENGTH, validName, type NoteItem } from '../workspace/items.ts';
import { arrange, canvasFromCourseList, coursesIn } from '../workspace/learning-paths.ts';
import type { ApplyResult, Workspace } from '../workspace/workspace.ts';
import type { ChangeRequest } from './changes.ts';

/** JSON Schema 里我们用得到的那一小部分。 */
export type JsonSchema = {
  type: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: readonly string[];
  maxLength?: number;
  maxItems?: number;
  additionalProperties?: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: JsonSchema & { type: 'object' };
  /** read：直接执行；change：只生成改动单。 */
  access: 'read' | 'change';
};

/** 工具运行时能用的东西。浏览器里由 components/assistant 组装，测试里用内存实现。 */
export type ToolEnv = {
  workspace: Workspace;
  knowledge: KnowledgeIndex;
  /** 读者此刻在看哪一页。 */
  context: () => { url: string; title: string; knowledgePath: string | null };
  /** 交一张改动单，等读者处理完（或自动同意）再返回结果。 */
  requestChange: (request: ChangeRequest) => Promise<ApplyResult>;
  now: () => string;
  newId: () => string;
};

/** 工具执行的结果：给模型看的文字，加一句给读者看的简短说明。 */
export type ToolOutcome = { content: string; isError: boolean; label: string };

const str = (description: string, extra: Partial<JsonSchema> = {}): JsonSchema => ({ type: 'string', description, ...extra });
const obj = (properties: Record<string, JsonSchema>, required: string[]): JsonSchema & { type: 'object' } => ({ type: 'object', properties, required, additionalProperties: false });
const SUMMARY = str('用一句中文告诉读者这次改动要做什么、为什么，会显示在确认框顶上。', { maxLength: 300 });
const MIND_NODES: JsonSchema = {
  type: 'array', maxItems: 300,
  description: '方块列表。id 是你自己起的短编号（字母数字），只用来在 edges 里指代方块；text 是方块上的字，尽量短。',
  items: obj({ id: str('方块编号，同一张图里不能重复', { maxLength: 40 }), text: str('方块上的文字', { maxLength: 500 }) }, ['id', 'text']),
};
const MIND_EDGES: JsonSchema = {
  type: 'array', maxItems: 600,
  description: '箭头列表：from 指向 to，写方块的 id。导图一般从中心主题指向分支。',
  items: obj({ from: str('起点方块的 id'), to: str('终点方块的 id') }, ['from', 'to']),
};

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: 'get_context', access: 'read',
    description: '看读者此刻打开的是哪一页（网址、标题、它在知识树里的位置），以及今天的日期。回答“这门课”“这份笔记”这类指代不明的问题前先调用它。',
    input_schema: obj({}, []),
  },
  {
    name: 'search_textbook', access: 'read',
    description: '在这本教材里搜课程和源码讲解，中文英文都行。返回标题、位置（path）和摘录。想推荐课程、找某个概念在哪门课或哪段源码里时用。',
    input_schema: obj({ query: str('搜索词', { maxLength: 200 }) }, ['query']),
  },
  {
    name: 'read_textbook_entry', access: 'read',
    description: '读教材里的一项：课程（简介、先修课、链接、对应的源码模块）、分类（简介和下面有什么）或源码讲解（整段注释块，包括写给读者的那封信）。path 来自 search_textbook 或 get_context，比如 /programming-intro/cs61a；也可以直接写课程编号，比如 cs61a。',
    input_schema: obj({ path: str('知识路径或课程编号', { maxLength: 300 }) }, ['path']),
  },
  {
    name: 'get_progress', access: 'read',
    description: '读读者自己标的学习状态（每门课：想学 / 在学 / 学完）和源码理解度（未读 / 读过 / 读懂了）。',
    input_schema: obj({}, []),
  },
  {
    name: 'list_notes', access: 'read',
    description: '列出读者的心得（文档、导入的文件、导图）：编号、所属空间、名字、种类、更新时间、字数。space 是知识路径，比如 /programming-intro/cs61a；不填就列全部。',
    input_schema: obj({ space: str('只列这个空间里的', { maxLength: 300 }) }, []),
  },
  {
    name: 'read_note', access: 'read',
    description: '读一份心得的全文。文档返回文字；导图返回方块和箭头。改之前一定先读，改动单要以你读到的版本为基础。',
    input_schema: obj({ id: str('心得编号，来自 list_notes', { maxLength: 64 }) }, ['id']),
  },
  {
    name: 'list_learning_paths', access: 'read',
    description: '列出读者自己建的学习路径：编号、名字、包含的课程（按箭头顺序）。',
    input_schema: obj({}, []),
  },
  {
    name: 'read_learning_path', access: 'read',
    description: '读一条学习路径的全部方块和箭头。',
    input_schema: obj({ id: str('路径编号', { maxLength: 64 }) }, ['id']),
  },
  {
    name: 'create_note', access: 'change',
    description: '在某门课（或某个分类、某段源码）的心得空间里新建一份 Markdown 文档。读者确认后才会写入；工具结果会告诉你读者同意了没有。支持 Markdown、代码块、$公式$、表格。',
    input_schema: obj({
      space: str('放在哪个心得空间：知识路径，比如 /programming-intro/cs61a（用 search_textbook 或 get_context 找）', { maxLength: 300 }),
      name: str('文件名，以 .md 结尾，不能含斜杠', { maxLength: 120 }),
      text: str('文档内容（Markdown）', { maxLength: 200000 }),
      summary: SUMMARY,
    }, ['space', 'name', 'text', 'summary']),
  },
  {
    name: 'edit_note', access: 'change',
    description: '改一份已有的文字心得：给出修改后的完整全文（不是片段）。读者会看到逐行对比，确认后才写入。改之前先用 read_note 读最新的内容；不要删掉读者没让你删的内容。',
    input_schema: obj({ id: str('心得编号', { maxLength: 64 }), text: str('修改后的完整全文', { maxLength: 200000 }), summary: SUMMARY }, ['id', 'text', 'summary']),
  },
  {
    name: 'create_mind_map', access: 'change',
    description: '在某个心得空间里新建一张导图（思维导图 / 概念图）。只需给方块和箭头，位置会自动排好。读者确认后才会写入。',
    input_schema: obj({
      space: str('放在哪个心得空间：知识路径', { maxLength: 300 }),
      name: str('导图名字', { maxLength: 120 }),
      nodes: MIND_NODES, edges: MIND_EDGES, summary: SUMMARY,
    }, ['space', 'name', 'nodes', 'edges', 'summary']),
  },
  {
    name: 'edit_mind_map', access: 'change',
    description: '改一张已有的导图：给出修改后的全部方块和箭头。沿用 read_note 读到的方块 id，那些方块会留在原来的位置；新的 id 是新方块，会自动排位置；不在列表里的方块会被删掉。',
    input_schema: obj({ id: str('导图的心得编号', { maxLength: 64 }), nodes: MIND_NODES, edges: MIND_EDGES, summary: SUMMARY }, ['id', 'nodes', 'edges', 'summary']),
  },
  {
    name: 'set_course_status', access: 'change',
    description: '把一门课的学习状态标成 todo（想学）/ learning（在学）/ done（学完），或 none（清掉）。只在读者要求时用。',
    input_schema: obj({ course: str('课程编号，比如 cs61a', { maxLength: 64 }), state: { type: 'string', enum: ['todo', 'learning', 'done', 'none'] }, summary: SUMMARY }, ['course', 'state', 'summary']),
  },
  {
    name: 'create_learning_path', access: 'change',
    description: '新建一条学习路径：按学习顺序给出课程编号，会排成一串用箭头连起来的方块。只在读者想要一条路线时用；路线由读者决定，你只是帮忙起草。',
    input_schema: obj({
      name: str('路径名字', { maxLength: 80 }),
      courses: { type: 'array', maxItems: 80, description: '课程编号，按学习顺序', items: str('课程编号', { maxLength: 64 }) },
      summary: SUMMARY,
    }, ['name', 'courses', 'summary']),
  },
];

/**
 * 这一段对话能用哪些工具。只读模式下只给读的工具——不是“给了再拦”，而是模型根本看不到改动工具，
 * 连提议的机会都没有。
 */
export function toolsFor(approval: 'readonly' | 'ask' | 'auto'): readonly ToolDefinition[] {
  return approval === 'readonly' ? TOOLS.filter((t) => t.access === 'read') : TOOLS;
}

/** 按 schema 检查模型给的参数。只查我们用得到的规则；返回第一处问题，全对返回 null。 */
export function validateInput(schema: JsonSchema, value: unknown, where = '参数'): string | null {
  switch (schema.type) {
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return `${where}应该是一个对象`;
      const v = value as Record<string, unknown>;
      for (const key of schema.required ?? []) if (v[key] === undefined) return `缺少 ${key}`;
      for (const [key, child] of Object.entries(v)) {
        const sub = schema.properties?.[key];
        if (!sub) { if (schema.additionalProperties === false) return `多了不认识的参数 ${key}`; continue; }
        const problem = validateInput(sub, child, key);
        if (problem) return problem;
      }
      return null;
    }
    case 'string':
      if (typeof value !== 'string') return `${where}应该是字符串`;
      if (schema.maxLength !== undefined && value.length > schema.maxLength) return `${where}太长（最多 ${schema.maxLength} 字）`;
      if (schema.enum && !schema.enum.includes(value)) return `${where}只能是 ${schema.enum.join(' / ')}`;
      return null;
    case 'number': case 'integer':
      return typeof value === 'number' && Number.isFinite(value) ? null : `${where}应该是数字`;
    case 'boolean':
      return typeof value === 'boolean' ? null : `${where}应该是 true 或 false`;
    case 'array': {
      if (!Array.isArray(value)) return `${where}应该是数组`;
      if (schema.maxItems !== undefined && value.length > schema.maxItems) return `${where}太多（最多 ${schema.maxItems} 项）`;
      for (let i = 0; i < value.length; i++) {
        const problem = schema.items ? validateInput(schema.items, value[i], `${where}[${i}]`) : null;
        if (problem) return problem;
      }
      return null;
    }
  }
}

const json = (value: unknown) => JSON.stringify(value);
const fail = (content: string, label: string): ToolOutcome => ({ content, isError: true, label });
const ok = (value: unknown, label: string): ToolOutcome => ({ content: typeof value === 'string' ? value : json(value), isError: false, label });

function paragraphsText(paragraphs: readonly Paragraph[]): string {
  return paragraphs.map((p) => (p.kind === 'text' ? p.text : p.lines.join('\n'))).join('\n\n');
}

/** 知识路径是否存在（课程、分类、源码模块都算）。 */
function spaceTitle(index: KnowledgeIndex, path: string): string | null {
  return index.courses.find((c) => c.path === path)?.title
    ?? index.modules.find((m) => m.path === path)?.title
    ?? index.categories.find((c) => c.path === path)?.title
    ?? null;
}

function courseById(index: KnowledgeIndex, id: string) {
  return index.courses.find((c) => c.id === id);
}

/** 读内容给模型看时的上限：太长的文档截断，并说明截断了，免得一份几兆的导入文件把对话撑爆。 */
const READ_LIMIT = 60_000;

function noteSummary(item: NoteItem) {
  return {
    id: item.id, space: item.space, name: item.name, kind: item.kind === 'canvas' ? 'mind-map' : 'text', origin: item.origin, updatedAt: item.updatedAt,
    size: item.kind === 'text' ? `${item.text?.length ?? 0} 字` : `${item.canvas?.nodes.length ?? 0} 个方块`,
  };
}

/**
 * 模型给的导图（方块 + 箭头）变成真正的画布：编号换成安全的、箭头只留两头都在的、
 * 已有方块留在原位，新方块用分层排布算位置，再整体平移到老方块的右边。
 */
export function buildMindMap(
  nodes: readonly { id: string; text: string }[],
  edges: readonly { from: string; to: string }[],
  previous: Canvas = EMPTY_CANVAS,
): Canvas {
  const kept = new Map(previous.nodes.map((n) => [n.id, n]));
  const idFor = new Map<string, string>();
  const used = new Set<string>();
  nodes.forEach((n, i) => {
    const wanted = kept.has(n.id) ? n.id : `m${i}-${n.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'n'}`;
    let id = wanted; let k = 2;
    while (used.has(id)) id = `${wanted}-${k++}`;
    used.add(id); idFor.set(n.id, id);
  });
  const all = nodes.map((n) => ({ id: idFor.get(n.id)!, x: 0, y: 0, text: n.text.slice(0, 2000) }));
  const seen = new Set<string>();
  const canvasEdges = edges.flatMap((e, i) => {
    const from = idFor.get(e.from); const to = idFor.get(e.to);
    if (!from || !to || from === to || seen.has(`${from}>${to}`)) return [];
    seen.add(`${from}>${to}`);
    return [{ id: `e${i}-${from}-${to}`.slice(0, 64), from, to }];
  });
  const laid = arrange({ nodes: all, edges: canvasEdges });
  const oldRight = previous.nodes.length ? Math.max(...previous.nodes.map((n) => n.x)) + 280 : 0;
  return {
    nodes: laid.nodes.map((n) => {
      const old = kept.get(n.id);
      return old ? { ...old, text: n.text } : { ...n, x: n.x + oldRight };
    }),
    edges: canvasEdges,
  };
}

async function requestAndReport(env: ToolEnv, request: ChangeRequest, label: string, success: string): Promise<ToolOutcome> {
  const result = await env.requestChange(request);
  return result.ok ? ok(success, label) : fail(`没有写入：${result.reason}`, label);
}

/** 执行一次工具调用。所有异常都变成给模型看的错误说明，不往外抛。 */
export async function executeTool(name: string, input: unknown, env: ToolEnv): Promise<ToolOutcome> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return fail(`没有叫 ${name} 的工具。`, name);
  const problem = validateInput(tool.input_schema, input ?? {});
  if (problem) return fail(`参数不对：${problem}。请改正后重试。`, name);
  const args = (input ?? {}) as Record<string, unknown>;
  const { workspace, knowledge } = env;
  try {
    switch (name) {
      case 'get_context': {
        const c = env.context();
        return ok({ ...c, today: env.now().slice(0, 10) }, '看了当前页面');
      }
      case 'search_textbook': {
        const hits = searchKnowledge(knowledge, String(args.query), 12);
        return ok(hits.map(({ kind, title, path, excerpt }) => ({ kind, title, path, excerpt })), `搜索「${args.query}」`);
      }
      case 'read_textbook_entry': {
        const key = String(args.path).trim();
        const course = knowledge.courses.find((c) => c.path === key || c.id === key);
        if (course) {
          return ok({
            kind: 'course', id: course.id, title: course.title, path: course.path, description: course.description,
            prereqCourses: (course.prereq?.courses ?? []).map((id) => ({ id, title: courseById(knowledge, id)?.title ?? id })),
            prereqKnowledge: course.prereq?.knowledge ?? [],
            modules: knowledge.modules.filter((m) => m.courseIds.includes(course.id)).map((m) => ({ title: m.title, path: m.path })),
            note: '课程页正文（官方资源、官方作业链接）请让读者在课程页查看；练习一律用课程官方的作业。',
          }, `读了课程「${course.title}」`);
        }
        const mod = knowledge.modules.find((m) => m.path === key);
        if (mod) {
          const c = mod.comment;
          return ok({
            kind: 'module', title: mod.title, path: mod.path, file: mod.file,
            module: c.module, problem: paragraphsText(c.problem), design: paragraphsText(c.design), courses: paragraphsText(c.courses),
            exercises: c.exercises, prereq: paragraphsText(c.prereq), unclear: paragraphsText(c.unclear), letter: paragraphsText(c.letter),
          }, `读了源码讲解「${mod.title}」`);
        }
        const cat = knowledge.categories.find((c) => c.path === key);
        if (cat) {
          return ok({ kind: 'category', title: cat.title, path: cat.path, description: cat.description, children: cat.childPaths.map((p) => ({ path: p, title: spaceTitle(knowledge, p) })) }, `读了分类「${cat.title}」`);
        }
        return fail(`教材里没有 ${key}。先用 search_textbook 找到正确的 path。`, '读教材');
      }
      case 'get_progress': {
        const courses = (await Promise.all(knowledge.courses.map(async (c) => ({ id: c.id, title: c.title, state: await workspace.readStatus(c.id) }))))
          .filter((c) => c.state !== null);
        const modules = (await Promise.all(knowledge.modules.map(async (m) => ({ path: m.path, title: m.title, state: await workspace.readUnderstanding(m.path) }))))
          .filter((m) => m.state !== null);
        return ok({ courses, modules }, '看了学习状态');
      }
      case 'list_notes': {
        const space = typeof args.space === 'string' && args.space ? args.space : undefined;
        const items = await workspace.listItems(space);
        return ok(items.map(noteSummary), space ? `列出 ${space} 的心得` : '列出全部心得');
      }
      case 'read_note': {
        const item = await workspace.readItem(String(args.id));
        if (!item) return fail('没有这份心得。先用 list_notes 看编号。', '读心得');
        if (item.kind === 'canvas') {
          const canvas = item.canvas!;
          return ok({ ...noteSummary(item), nodes: canvas.nodes.map((n) => ({ id: n.id, text: n.text ?? '', ...(n.course ? { course: n.course } : {}) })), edges: canvas.edges.map((e) => ({ from: e.from, to: e.to })) }, `读了导图「${item.name}」`);
        }
        const text = item.text ?? '';
        return ok({ ...noteSummary(item), text: text.slice(0, READ_LIMIT), truncated: text.length > READ_LIMIT }, `读了「${item.name}」`);
      }
      case 'list_learning_paths': {
        const paths = await workspace.listPaths();
        return ok(paths.map((p) => ({ id: p.id, name: p.name, courses: coursesIn(p.canvas), updatedAt: p.updatedAt })), '列出学习路径');
      }
      case 'read_learning_path': {
        const path = await workspace.readPath(String(args.id));
        if (!path) return fail('没有这条学习路径。', '读学习路径');
        return ok({ id: path.id, name: path.name, nodes: path.canvas.nodes.map((n) => ({ id: n.id, course: n.course, text: n.text })), edges: path.canvas.edges.map((e) => ({ from: e.from, to: e.to })) }, `读了路径「${path.name}」`);
      }
      case 'create_note': {
        const space = String(args.space); const name = String(args.name).trim();
        if (space === '/' || !spaceTitle(knowledge, space)) return fail(`没有 ${space} 这个心得空间。用 search_textbook 找到课程的 path。`, '新建文档');
        if (!validName(name)) return fail('名字无效：不能为空，也不能含斜杠。', '新建文档');
        const text = String(args.text);
        if (text.length > MAX_TEXT_LENGTH) return fail('内容太长。', '新建文档');
        const item = createTextItem({ id: env.newId(), space, name: /\.[a-z0-9]+$/i.test(name) ? name : `${name}.md`, text, now: env.now() });
        return requestAndReport(env, { summary: String(args.summary), change: { kind: 'create-item', item } }, `新建文档「${item.name}」`, `已写入：新建了「${item.name}」，编号 ${item.id}。`);
      }
      case 'edit_note': {
        const item = await workspace.readItem(String(args.id));
        if (!item) return fail('没有这份心得。', '修改文档');
        if (item.kind !== 'text') return fail('这是导图，请用 edit_mind_map。', '修改文档');
        const after = String(args.text);
        if (after === item.text) return ok('内容和现在一样，没有改动。', `修改「${item.name}」`);
        return requestAndReport(env, { summary: String(args.summary), change: { kind: 'edit-text', itemId: item.id, name: item.name, before: item.text ?? '', after } }, `修改「${item.name}」`, `已写入：「${item.name}」改好了。`);
      }
      case 'create_mind_map': {
        const space = String(args.space); const name = String(args.name).trim();
        if (space === '/' || !spaceTitle(knowledge, space)) return fail(`没有 ${space} 这个心得空间。`, '新建导图');
        if (!validName(name)) return fail('名字无效。', '新建导图');
        const canvas = buildMindMap(args.nodes as { id: string; text: string }[], args.edges as { from: string; to: string }[]);
        const item = { ...createCanvasItem({ id: env.newId(), space, name, now: env.now() }), canvas };
        return requestAndReport(env, { summary: String(args.summary), change: { kind: 'create-item', item } }, `新建导图「${name}」`, `已写入：新建了导图「${name}」，编号 ${item.id}。`);
      }
      case 'edit_mind_map': {
        const item = await workspace.readItem(String(args.id));
        if (!item) return fail('没有这张导图。', '修改导图');
        if (item.kind !== 'canvas') return fail('这是文字文档，请用 edit_note。', '修改导图');
        const after = buildMindMap(args.nodes as { id: string; text: string }[], args.edges as { from: string; to: string }[], item.canvas);
        return requestAndReport(env, { summary: String(args.summary), change: { kind: 'replace-canvas', itemId: item.id, name: item.name, before: item.canvas!, after } }, `修改导图「${item.name}」`, `已写入：导图「${item.name}」改好了。`);
      }
      case 'set_course_status': {
        const course = courseById(knowledge, String(args.course));
        if (!course) return fail(`没有编号为 ${args.course} 的课程。`, '标学习状态');
        const after = args.state === 'none' ? null : (args.state as ProgressState);
        if (after !== null && !PROGRESS_STATES.includes(after)) return fail('状态无效。', '标学习状态');
        const before = await workspace.readStatus(course.id);
        if (before === after) return ok('状态本来就是这样，没有改动。', `标「${course.title}」`);
        return requestAndReport(env, { summary: String(args.summary), change: { kind: 'set-status', course: course.id, title: course.title, before, after } }, `标「${course.title}」`, '已写入。');
      }
      case 'create_learning_path': {
        const name = String(args.name).trim();
        if (!name) return fail('路径需要名字。', '新建学习路径');
        const ids = (args.courses as string[]).map((c) => c.trim());
        const unknown = ids.filter((id) => !courseById(knowledge, id));
        if (unknown.length) return fail(`这些不是本站收录的课程编号：${unknown.join('、')}。用 search_textbook 查正确的编号。`, '新建学习路径');
        const unique = [...new Set(ids)];
        const path = { id: env.newId(), name, canvas: canvasFromCourseList(unique), updatedAt: env.now() };
        return requestAndReport(env, { summary: String(args.summary), change: { kind: 'create-path', path } }, `新建学习路径「${name}」`, `已写入：新建了学习路径「${name}」。`);
      }
    }
    return fail(`工具 ${name} 还没有实现。`, name);
  } catch (e) {
    return fail(`出错了：${e instanceof Error ? e.message : String(e)}`, name);
  }
}
