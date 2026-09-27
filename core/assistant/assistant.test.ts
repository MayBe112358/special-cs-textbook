/**
 * @module        AI 助手的测试——厂商预设、设置、工具、改动单、主循环、两种格式的翻译
 * @problem       AI 这一块接的是别人的服务器，真去调要花钱、要网络、结果每次不一样。
 *                但“Key 缺了要说清楚”“改东西必须经过同意”“内容被改过就作废”“流式字节切乱了也要拼对”
 *                这些规矩全是我们自己的代码，必须能在不联网、不花钱的情况下钉住。
 * @design        全部在内存里跑：统一编辑接口用内存实现，知识索引手写一份迷你版，
 *                模型用一个“假模型”——按剧本依次交回预先写好的回复，看主循环怎么处理。
 *                SSE 解析喂一串故意切在奇怪位置的字节。
 * @courses       UC Berkeley CS61A（测试）；MIT 6.031（测试替身：用假对象替代外部依赖）
 * @exercises     https://web.mit.edu/6.031/www/sp22/ —— MIT 6.031 测试相关的阅读与练习
 * @prereq        知道“测试替身”：测试时用一个行为可控的假对象，替代真实的网络服务。
 * @unclear       真实厂商的回复格式只能靠浏览器里用真 Key 验收；这里测的是我们这一侧的规矩。
 * @letter
 * AI 这块接的是别人家的服务器，真去调要花钱、要联网，而且每次回的都不一样。那怎么测？
 *
 * 答案是找个“替身演员”。这里最值得看的是那几条用假模型的测试。
 * 真模型你管不了它说什么，所以没法测“它先要读笔记、再交改动单、你拒绝了之后它会怎样”这种流程。
 * 把模型换成一个照着剧本念台词的假演员：第一次不管你说啥，它都回“我先看看”外加一个 read_note；第二次回“你的笔记讲的是递归”。然后测试去查：工具真的被执行了吗？结果真的带回给模型了吗？
 * 这样整个流程就能一遍遍重复、一步步检查了。
 * MIT 6.031 管这个叫测试替身（test double）。以后你测任何依赖网络的代码，都会用上这一招。
 *
 * 另一个值得看的是 SSE 解析那条。它把一串回复每 7 个字符切一刀，一小段一小段喂进去，于是一行 data 会被切成好几截，工具参数的 JSON 也被切得七零八落。
 * 真实网络里这种事天天发生，只是你手动测的时候很难碰上。
 *
 * 这些测试守的都是我们自己这一侧的规矩：Key 没填要说清楚，改东西必须经过同意，内容被改过就作废，字节切乱了也要拼对。
 * 至于每家厂商的真实回复长啥样，得用真 Key 在浏览器里验，这里管不到。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { KnowledgeIndex } from '../knowledge/knowledge-index.ts';
import { createMemoryWorkspace } from '../workspace/workspace.ts';
import { createTextItem, createCanvasItem } from '../workspace/items.ts';
import { DEFAULT_SETTINGS, maskKey, parseSettings, resolveConnection, type AssistantSettings } from './assistant.ts';
import { modelsUrlCandidates, parseModelList, redactSecrets, findPreset } from './providers.ts';
import { applyChange, describeChange, type ChangeRequest } from './changes.ts';
import { buildMindMap, executeTool, TOOLS, validateInput, type ToolEnv } from './tools.ts';
import { runAgent, type ModelClient, type ModelReply, type Turn, type AgentEvent } from './agent.ts';
import { createDeltaAccumulator, createSseParser, toOpenAIMessages } from './openai-client.ts';
import { toAnthropicMessages } from './anthropic-client.ts';

const NOW = '2026-09-27T10:00:00.000Z';

const knowledge = {
  version: 2, generatedAt: NOW, sourceDir: 'content/docs',
  categories: [
    { id: '', title: '课程目录', description: '', path: '/', url: '/docs', parentPath: null, childPaths: ['/programming-intro'] },
    { id: 'programming-intro', title: '编程入门', description: '入门课', path: '/programming-intro', url: '/docs/programming-intro', parentPath: '/', childPaths: ['/programming-intro/cs61a', '/programming-intro/cs61b'] },
  ],
  courses: [
    { id: 'cs61a', title: 'UC Berkeley CS61A', description: '函数、抽象和解释器', path: '/programming-intro/cs61a', url: '/docs/programming-intro/cs61a', categoryPath: '/programming-intro', prereq: null, file: 'x' },
    { id: 'cs61b', title: 'UC Berkeley CS61B', description: '数据结构', path: '/programming-intro/cs61b', url: '/docs/programming-intro/cs61b', categoryPath: '/programming-intro', prereq: { courses: ['cs61a'], knowledge: [] }, file: 'y' },
  ],
  modules: [],
} as unknown as KnowledgeIndex;

function makeEnv(decide: (req: ChangeRequest) => boolean = () => true) {
  const workspace = createMemoryWorkspace();
  const requests: ChangeRequest[] = [];
  let n = 0;
  const env: ToolEnv = {
    workspace, knowledge,
    context: () => ({ url: '/docs/programming-intro/cs61a', title: 'UC Berkeley CS61A', knowledgePath: '/programming-intro/cs61a' }),
    requestChange: async (req) => { requests.push(req); return applyChange(workspace, req.change, decide(req), NOW); },
    now: () => NOW,
    newId: () => `id${++n}`,
  };
  return { env, workspace, requests };
}

test('厂商预设：模型列表地址按 cc-switch 的规则推；Key 在报错里被打码', () => {
  assert.deepEqual(modelsUrlCandidates('https://api.siliconflow.cn'), ['https://api.siliconflow.cn/v1/models']);
  assert.deepEqual(modelsUrlCandidates('https://api.openai.com/v1/'), ['https://api.openai.com/v1/models']);
  assert.deepEqual(modelsUrlCandidates('https://open.bigmodel.cn/api/paas/v4'), ['https://open.bigmodel.cn/api/paas/v4/models', 'https://open.bigmodel.cn/api/paas/v4/v1/models']);
  assert.deepEqual(modelsUrlCandidates('https://api.deepseek.com/anthropic'), ['https://api.deepseek.com/anthropic/v1/models', 'https://api.deepseek.com/v1/models', 'https://api.deepseek.com/models']);
  assert.deepEqual(parseModelList({ data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }] }), ['a', 'b']);
  assert.deepEqual(parseModelList({ models: [{ name: 'models/gemini-x' }] }), ['gemini-x']);
  assert.equal(redactSecrets('bad key sk-abcdefghijklmnop here', ['sk-abcdefghijklmnop']), 'bad key sk-a•••• here');
  assert.equal(maskKey('sk-abcdefghijkl'), 'sk-a••••ijkl');
  // 每家都登记了格式和拿 Key 的地方（自定义除外）。
  assert.ok(['anthropic', 'openai', 'deepseek', 'qwen', 'zhipu', 'minimax', 'kimi', 'gemini'].every((id) => findPreset(id)?.keyUrl));
});

test('设置：坏数据不整个丢；缺 Key、要转发、地址不加密都说清楚', () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  const parsed = parseSettings({ active: 'nobody', approval: 'yes', profiles: { deepseek: { apiKey: ' sk-1234567890 ', model: 3 }, nobody: { apiKey: 'x' } } });
  assert.equal(parsed.active, 'anthropic');
  assert.equal(parsed.approval, 'ask', '认不得的确认方式按最安全的“每次确认”算');
  assert.deepEqual(parsed.profiles, { deepseek: { apiKey: 'sk-1234567890', model: '', baseUrl: '' } });

  const s = (patch: Partial<AssistantSettings>): AssistantSettings => ({ ...DEFAULT_SETTINGS, ...patch });
  assert.match((resolveConnection(s({ active: 'deepseek' })) as { reason: string }).reason, /API Key/);
  const ok = resolveConnection(s({ active: 'deepseek', profiles: { deepseek: { apiKey: 'sk-1234567890', model: '', baseUrl: '' } } }));
  assert.ok(ok.ok && ok.connection.model === 'deepseek-v4-pro' && ok.connection.format === 'anthropic' && !ok.connection.relayed);
  assert.match((resolveConnection(s({ active: 'kimi', profiles: { kimi: { apiKey: 'sk-1234567890', model: '', baseUrl: '' } } })) as { reason: string }).reason, /转发/);
  const relayed = resolveConnection(s({ active: 'kimi', profiles: { kimi: { apiKey: 'sk-1234567890', model: '', baseUrl: 'https://relay.example.com/v1/' } } }));
  assert.ok(relayed.ok && relayed.connection.baseUrl === 'https://relay.example.com/v1' && relayed.connection.relayed);
  assert.match((resolveConnection(s({ active: 'custom-openai', profiles: { 'custom-openai': { apiKey: 'sk-1234567890', model: 'm', baseUrl: '' } } })) as { reason: string }).reason, /接口地址/);
  assert.match((resolveConnection(s({ active: 'custom-openai', profiles: { 'custom-openai': { apiKey: 'sk-1234567890', model: 'm', baseUrl: 'http://example.com' } } })) as { reason: string }).reason, /https/);
  assert.match((resolveConnection(s({ active: 'openai', profiles: { openai: { apiKey: 'sk-1234567890', model: '', baseUrl: '' } } })) as { reason: string }).reason, /模型/);
});

test('工具清单：改东西的工具只交改动单；没有删除工具；名字不重复；参数按 schema 检查', () => {
  assert.equal(new Set(TOOLS.map((t) => t.name)).size, TOOLS.length);
  assert.ok(!TOOLS.some((t) => /delete|remove/.test(t.name)));
  assert.ok(TOOLS.filter((t) => t.access === 'change').every((t) => t.input_schema.required?.includes('summary')));
  const createNote = TOOLS.find((t) => t.name === 'create_note')!.input_schema;
  assert.equal(validateInput(createNote, { space: '/a', name: 'x.md', text: '', summary: 's' }), null);
  assert.match(validateInput(createNote, { space: '/a', name: 'x.md', summary: 's' })!, /缺少 text/);
  assert.match(validateInput(createNote, { space: '/a', name: 3, text: '', summary: 's' })!, /name应该是字符串/);
  assert.match(validateInput(createNote, { space: '/a', name: 'x', text: '', summary: 's', evil: 1 })!, /evil/);
});

test('读的工具：搜教材、读课程、列心得、读心得', async () => {
  const { env, workspace } = makeEnv();
  await workspace.writeItem(createTextItem({ id: 'n1', space: '/programming-intro/cs61a', name: '笔记.md', text: '递归', now: NOW }));
  const search = JSON.parse((await executeTool('search_textbook', { query: '解释器' }, env)).content);
  assert.equal(search[0].path, '/programming-intro/cs61a');
  const course = JSON.parse((await executeTool('read_textbook_entry', { path: 'cs61b' }, env)).content);
  assert.deepEqual(course.prereqCourses, [{ id: 'cs61a', title: 'UC Berkeley CS61A' }]);
  assert.equal((await executeTool('read_textbook_entry', { path: '/nowhere' }, env)).isError, true);
  const list = JSON.parse((await executeTool('list_notes', {}, env)).content);
  assert.equal(list[0].id, 'n1');
  assert.equal(JSON.parse((await executeTool('read_note', { id: 'n1' }, env)).content).text, '递归');
  assert.equal((await executeTool('no_such_tool', {}, env)).isError, true);
});

test('改的工具：读者同意才写入；拒绝就不写，并告诉模型', async () => {
  const yes = makeEnv(() => true);
  const created = await executeTool('create_note', { space: '/programming-intro/cs61a', name: '提纲', text: '# 提纲', summary: '整理提纲' }, yes.env);
  assert.equal(created.isError, false);
  const items = await yes.workspace.listItems('/programming-intro/cs61a');
  assert.equal(items[0]!.name, '提纲.md', '没写后缀的补上 .md');
  assert.equal(yes.requests[0]!.summary, '整理提纲');

  const no = makeEnv(() => false);
  const refused = await executeTool('set_course_status', { course: 'cs61a', state: 'learning', summary: '标成在学' }, no.env);
  assert.equal(refused.isError, true);
  assert.match(refused.content, /没有同意/);
  assert.equal(await no.workspace.readStatus('cs61a'), null);

  assert.equal((await executeTool('create_note', { space: '/', name: 'x', text: '', summary: 's' }, yes.env)).isError, true, '心得首页不是一个空间');
  assert.match((await executeTool('create_learning_path', { name: '路线', courses: ['cs61a', 'cs999'], summary: 's' }, yes.env)).content, /cs999/);
});

test('改动单：AI 读过之后内容又被改了，作废不写', async () => {
  const workspace = createMemoryWorkspace();
  await workspace.writeItem(createTextItem({ id: 'n1', space: '/programming-intro/cs61a', name: 'a.md', text: '旧', now: NOW }));
  const change = { kind: 'edit-text' as const, itemId: 'n1', name: 'a.md', before: '旧', after: 'AI 改的' };
  await workspace.writeItem({ ...(await workspace.readItem('n1'))!, text: '我刚手改的' });
  const result = await applyChange(workspace, change, true, NOW);
  assert.equal(result.ok, false);
  assert.equal((await workspace.readItem('n1'))!.text, '我刚手改的');
  assert.equal((await applyChange(workspace, { ...change, before: '我刚手改的' }, false, NOW)).ok, false, '没同意不写');
  assert.ok(describeChange(change).diff!.some((l) => l.type === 'add' && l.text === 'AI 改的'));
});

test('导图：AI 给的方块自动排位置；沿用的方块留在原地；指向不存在方块的箭头丢掉', () => {
  const first = buildMindMap([{ id: 'root', text: '递归' }, { id: 'a', text: '基本情况' }, { id: 'b', text: '递归情况' }], [{ from: 'root', to: 'a' }, { from: 'root', to: 'b' }, { from: 'a', to: 'ghost' }]);
  assert.equal(first.nodes.length, 3);
  assert.equal(first.edges.length, 2);
  const rootId = first.nodes.find((n) => n.text === '递归')!.id;
  const moved = { ...first, nodes: first.nodes.map((n) => (n.id === rootId ? { ...n, x: 999, y: 777 } : n)) };
  const second = buildMindMap([{ id: rootId, text: '递归（改）' }, { id: 'c', text: '尾递归' }], [{ from: rootId, to: 'c' }], moved);
  const kept = second.nodes.find((n) => n.id === rootId)!;
  assert.deepEqual([kept.x, kept.y, kept.text], [999, 777, '递归（改）']);
  assert.equal(second.nodes.length, 2, '没列出的方块被删掉');
  const item = { ...createCanvasItem({ id: 'm', space: '/programming-intro/cs61a', name: '图', now: NOW }), canvas: first };
  assert.match(describeChange({ kind: 'create-item', item }).bullets![0]!, /加方块/);
});

/** 照剧本念台词的假模型。 */
function scriptedModel(replies: ModelReply[]): ModelClient & { seen: Turn[][] } {
  const seen: Turn[][] = [];
  return {
    seen,
    async complete(req) {
      seen.push([...req.turns]);
      const reply = replies.shift();
      if (!reply) throw new Error('剧本念完了');
      if (reply.text) req.onText(reply.text);
      return reply;
    },
  };
}

test('主循环：模型要工具 → 执行 → 把结果交回去 → 模型说完', async () => {
  const { env, workspace } = makeEnv();
  await workspace.writeItem(createTextItem({ id: 'n1', space: '/programming-intro/cs61a', name: '笔记.md', text: '递归', now: NOW }));
  const model = scriptedModel([
    { text: '我先看看。', toolCalls: [{ id: 't1', name: 'read_note', input: { id: 'n1' } }], stop: 'tool_use' },
    { text: '你的笔记讲的是递归。', toolCalls: [], stop: 'end' },
  ]);
  const events: AgentEvent[] = [];
  const run = await runAgent({ client: model, system: 's', turns: [{ role: 'user', text: '我的笔记讲了什么？' }], env, onEvent: (e) => events.push(e) });
  assert.equal(run.stopped, 'done');
  assert.deepEqual(run.turns.map((t) => t.role), ['user', 'assistant', 'tool', 'assistant']);
  const toolTurn = run.turns[2] as Extract<Turn, { role: 'tool' }>;
  assert.equal(JSON.parse(toolTurn.results[0]!.content).text, '递归');
  assert.equal(model.seen[1]!.length, 3, '第二次问模型时带上了工具结果');
  assert.ok(events.some((e) => e.type === 'tool-end' && e.label === '读了「笔记.md」'));
});

test('主循环：被截断的工具调用不执行；拒答不执行；中止时补上结果', async () => {
  const { env, workspace } = makeEnv();
  const truncated = scriptedModel([
    { text: '', toolCalls: [{ id: 't1', name: 'create_note', input: { space: '/programming-intro/cs61a', name: 'x', text: '半', summary: 's' } }], stop: 'max_tokens' },
    { text: '好的，我分步来。', toolCalls: [], stop: 'end' },
  ]);
  const run = await runAgent({ client: truncated, system: 's', turns: [{ role: 'user', text: '写' }], env, onEvent: () => {} });
  assert.equal((await workspace.listItems()).length, 0);
  assert.equal(run.stopped, 'done');

  const refusal = scriptedModel([{ text: '', toolCalls: [{ id: 't1', name: 'set_course_status', input: { course: 'cs61a', state: 'done', summary: 's' } }], stop: 'refusal', notice: '拒绝' }]);
  const refused = await runAgent({ client: refusal, system: 's', turns: [{ role: 'user', text: 'x' }], env, onEvent: () => {} });
  assert.equal(refused.stopped, 'refusal');
  assert.equal(await workspace.readStatus('cs61a'), null);

  const controller = new AbortController();
  const slow: ModelClient = { async complete() { controller.abort(); return { text: '', toolCalls: [{ id: 't9', name: 'get_progress', input: {} }], stop: 'tool_use' }; } };
  const aborted = await runAgent({ client: slow, system: 's', turns: [{ role: 'user', text: 'x' }], env, onEvent: () => {}, signal: controller.signal });
  assert.equal(aborted.stopped, 'aborted');
  const last = aborted.turns.at(-1)!;
  assert.ok(last.role === 'tool' && last.results[0]!.id === 't9', '中止后每个工具调用都有结果，下次能接着聊');
});

test('OpenAI 流式：字节切在奇怪的地方也能拼对；工具参数按 index 拼起来再解析', () => {
  let shown = '';
  const acc = createDeltaAccumulator((d) => { shown += d; });
  const parser = createSseParser((data) => acc.feed(data));
  const lines = [
    'data: {"choices":[{"delta":{"content":"你"}}]}',
    'data: {"choices":[{"delta":{"content":"好"}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"read_note","arguments":"{\\"id\\":"}}]}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"n1\\"}"}}]},"finish_reason":"tool_calls"}]}',
    'data: [DONE]',
  ].join('\n\n') + '\n\n';
  for (let i = 0; i < lines.length; i += 7) parser.push(lines.slice(i, i + 7));
  parser.end();
  const result = acc.result();
  assert.equal(shown, '你好');
  assert.equal(result.finish, 'tool_calls');
  assert.deepEqual(result.toolCalls, [{ id: 'c1', name: 'read_note', input: { id: 'n1' } }]);

  const broken = createDeltaAccumulator(() => {});
  broken.feed('{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c2","function":{"name":"x","arguments":"{\\"a\\":"}}]}}]}');
  assert.ok(broken.result().toolCalls[0]!.inputError, '半截 JSON 标出来，交给主循环让模型重来');
});

test('两种格式的翻译：工具结果放对位置；Claude 的原始回复只在同一模型时原样回传', () => {
  const turns: Turn[] = [
    { role: 'user', text: '问' },
    { role: 'assistant', text: '查一下', toolCalls: [{ id: 't1', name: 'get_progress', input: {} }], raw: { format: 'anthropic', signature: 'sig-A', value: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'tool_use', id: 't1', name: 'get_progress', input: {} }] } },
    { role: 'tool', results: [{ id: 't1', name: 'get_progress', content: '{}', isError: false }] },
  ];
  const same = toAnthropicMessages(turns, 'sig-A');
  assert.equal((same[1]!.content as { type: string }[])[0]!.type, 'thinking');
  const other = toAnthropicMessages(turns, 'sig-B');
  assert.deepEqual((other[1]!.content as { type: string }[]).map((b) => b.type), ['text', 'tool_use']);
  assert.equal((other[2]!.content as { type: string }[])[0]!.type, 'tool_result');

  const openai = toOpenAIMessages('系统', turns);
  assert.deepEqual(openai.map((m) => m.role), ['system', 'user', 'assistant', 'tool']);
  assert.equal((openai[2] as { tool_calls: { function: { arguments: string } }[] }).tool_calls[0]!.function.arguments, '{}');
});

test('权限：只读模式下模型拿不到任何改动工具，系统提示里说清楚', async () => {
  const { toolsFor } = await import('./tools.ts');
  const { buildSystemPrompt } = await import('./agent.ts');
  assert.ok(toolsFor('readonly').every((t) => t.access === 'read'));
  assert.ok(toolsFor('readonly').length > 0);
  assert.equal(toolsFor('ask').length, TOOLS.length);
  assert.match(buildSystemPrompt('panel', 'readonly'), /只读/);
  assert.doesNotMatch(buildSystemPrompt('panel', 'ask'), /只读模式/);
});

test('设置：记住最近用过的模型；按对话自己的模型合出连接；Key 仍从设置里取', async () => {
  const { rememberChoice, defaultChoice, providerReady } = await import('./assistant.ts');
  let s = parseSettings({ profiles: { deepseek: { apiKey: 'sk-1234567890' } }, recent: [{ provider: 'nobody', model: 'x' }, { provider: 'deepseek', model: 'deepseek-flash' }], modelLists: { deepseek: ['a', 3], nobody: ['z'] } });
  assert.deepEqual(s.recent, [{ provider: 'deepseek', model: 'deepseek-flash' }]);
  assert.deepEqual(s.modelLists, { deepseek: ['a'] });
  s = rememberChoice(s, { provider: 'deepseek', model: 'deepseek-v4-pro' });
  assert.deepEqual(s.recent.map((r) => r.model), ['deepseek-v4-pro', 'deepseek-flash']);
  assert.deepEqual(defaultChoice(s), { provider: 'deepseek', model: 'deepseek-v4-pro' });
  assert.equal(providerReady(s, 'deepseek'), true);
  assert.equal(providerReady(s, 'anthropic'), false);
  const conn = resolveConnection(s, { provider: 'deepseek', model: 'deepseek-flash' });
  assert.ok(conn.ok && conn.connection.model === 'deepseek-flash' && conn.connection.apiKey === 'sk-1234567890');
  assert.equal(parseSettings({ approval: 'readonly' }).approval, 'readonly');
});

test('对话记录：标题取第一句；重新打开时收拾残局；坏数据被拒；按日期分组；按你说的话搜索', async () => {
  const { titleFrom, settle, validateConversation, groupConversations, searchConversations, messageCount } = await import('./conversations.ts');
  assert.equal(titleFrom('  递归和尾递归有什么区别？\n第二行'), '递归和尾递归有什么区别？');
  assert.equal(titleFrom('一'.repeat(40)).length, 31);
  const settled = settle([
    { kind: 'assistant', id: 'a', text: '说到一半', streaming: true },
    { kind: 'tool', id: 't', name: 'read_note', label: 'read_note', status: 'running' },
    { kind: 'change', id: 'c', summary: 's', preview: { title: 'x' }, status: 'pending', auto: false },
  ]);
  assert.deepEqual(settled.map((r) => ('status' in r ? r.status : r.kind === 'assistant' ? r.streaming : null)), [false, 'error', 'rejected']);

  const base = { id: 'c1', title: '递归', titleEdited: false, surface: 'panel', provider: 'deepseek', model: 'deepseek-flash', approval: 'ask', context: null,
    createdAt: NOW, updatedAt: NOW, turns: [{ role: 'user', text: '问' }], records: [{ kind: 'user', id: 'u', text: '讲讲尾递归' }, { kind: 'assistant', id: 'a', text: '好', streaming: false }] };
  const conv = validateConversation(base);
  assert.equal(messageCount(conv), 2);
  assert.throws(() => validateConversation({ ...base, approval: 'god-mode' }), /权限/);
  assert.throws(() => validateConversation({ ...base, turns: [{ role: 'hacker' }] }), /记录/);

  const now = new Date('2026-09-27T12:00:00');
  const at = (iso: string, id: string) => ({ ...conv, id, updatedAt: new Date(iso).toISOString() });
  const groups = groupConversations([at('2026-09-27T09:00:00', 'today'), at('2026-09-26T20:00:00', 'yday'), at('2026-09-22T09:00:00', 'week'), at('2026-08-01T09:00:00', 'old')], now);
  assert.deepEqual(groups.map((g) => [g.label, g.conversations.map((c) => c.id)]), [['今天', ['today']], ['昨天', ['yday']], ['最近 7 天', ['week']], ['更早', ['old']]]);
  assert.equal(searchConversations([conv], '尾递归').length, 1, '搜你说过的话');
  assert.equal(searchConversations([conv], '好').length, 0, '不搜 AI 的回答');
});

test('备份：对话记录是可选的；带上时校验、查重，导入默认不覆盖本机已有的', async () => {
  const { buildBackup, parseAnyBackup, planImport } = await import('../workspace/backup.ts');
  const conv = { id: 'c1', title: 't', titleEdited: false, surface: 'terminal' as const, provider: 'deepseek', model: 'm', approval: 'auto' as const, context: null, createdAt: NOW, updatedAt: NOW, turns: [], records: [] };
  const plain = parseAnyBackup(buildBackup({ progress: [], understanding: [], items: [], paths: [] }));
  assert.equal(plain.chats, undefined);
  const withChats = parseAnyBackup(buildBackup({ progress: [], understanding: [], items: [], paths: [], chats: [conv] }));
  assert.equal(withChats.chats?.[0]?.id, 'c1');
  assert.throws(() => parseAnyBackup(buildBackup({ progress: [], understanding: [], items: [], paths: [], chats: [conv, conv] })), /重复/);
  const plan = planImport(withChats, { itemIds: new Set(), pathIds: new Set(), chatIds: new Set(['c1']) }, false);
  assert.equal(plan.chats.length, 0);
  assert.equal(plan.conflicts, 1);
  assert.equal(planImport(withChats, { itemIds: new Set(), pathIds: new Set(), chatIds: new Set(['c1']) }, true).chats.length, 1);
});

test('新对话默认：记着的那家没配置时，换成第一家能用的', async () => {
  const { defaultChoice } = await import('./assistant.ts');
  const s = parseSettings({ active: 'anthropic', profiles: { qwen: { apiKey: 'sk-1234567890' } } });
  assert.deepEqual(defaultChoice(s), { provider: 'qwen', model: 'qwen3.8-max' });
  assert.equal(defaultChoice(parseSettings({})).provider, 'anthropic', '一家都没配置时保持原样，由界面提示去填 Key');
});

test('主循环：模型硬要调用这一轮没交给它的工具（比如只读模式下的改动工具），不执行', async () => {
  const { toolsFor } = await import('./tools.ts');
  const { env, workspace } = makeEnv(() => true);
  const model = scriptedModel([
    { text: '', toolCalls: [{ id: 't1', name: 'create_note', input: { space: '/programming-intro/cs61a', name: 'x', text: 'y', summary: 's' } }], stop: 'tool_use' },
    { text: '好的，我不能改。', toolCalls: [], stop: 'end' },
  ]);
  const run = await runAgent({ client: model, system: 's', turns: [{ role: 'user', text: '写' }], env, onEvent: () => {}, tools: toolsFor('readonly') });
  assert.equal((await workspace.listItems()).length, 0);
  const toolTurn = run.turns.find((t) => t.role === 'tool') as Extract<Turn, { role: 'tool' }>;
  assert.match(toolTurn.results[0]!.content, /当前权限下没有/);
});
