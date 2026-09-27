/**
 * @module        AI 对话的主循环——问模型、执行它要的工具、把结果交回去，直到它说完
 * @problem       一次“帮我把 CS61A 的笔记画成导图”不是一问一答：模型要先列心得、再读笔记、再交导图改动单，
 *                每一步都要程序替它执行，再把结果喂回去。这个来回不管接的是哪家模型都一样，
 *                不该在聊天面板和终端里各写一遍，也不该因为换了厂商就重写。
 * @design        三层分开：
 *                - Turn：和厂商无关的对话记录（读者说了什么、模型说了什么并要了哪些工具、工具返回了什么）；
 *                - ModelClient：一家“翻译官”，把 Turn 翻成那家的请求格式、流式读回来、再翻回 Turn。
 *                  现在有两家：anthropic-client.ts（官方 SDK）和 openai-client.ts；
 *                - runAgent：主循环本身，只认 Turn 和 ModelClient。
 *                模型的原始回复（raw）也存下来：下一轮如果还是同一个地址、同一个模型，就原样发回去
 *                （Claude 的思考块、服务器端换模型的记录都要求原样回传）；换了模型就只用翻译过的文字和工具调用。
 *                每一步的进展通过 onEvent 往外报（字一个个出来、开始调哪个工具、结果如何），界面据此刷新。
 *                中途被读者停下时，给还没回答的工具调用补上“被中止”的结果，保证下次接着聊时记录是完整的。
 *                不引用 React、不碰浏览器；网络请求由 ModelClient 负责。
 * @courses       UC Berkeley CS61A（解释器的求值循环：读—求值—回写）；Stanford CS224N / UC Berkeley CS294（智能体与工具调用）；
 *                MIT 6.031（接口与实现分离）
 * @exercises     https://inst.eecs.berkeley.edu/~cs61a/sp25/proj/scheme/ —— Scheme 解释器（2025 春季存档）：自己写一遍求值循环
 * @prereq        知道 async / await：等一个要花时间的操作做完再往下走。
 * @unclear       没有做上下文压缩：对话很长时，早先的内容会一直发给模型，费用会越来越高。
 *                面板上有“新对话”按钮，长对话请开新的。
 *
 * @letter
 * 做过 CS61A 的 Scheme 解释器的话，这个循环你会觉得眼熟：读一个表达式，求值，把结果交回去，再读下一个。
 * 这里只是把“求值”换成了“问模型”，把“内置函数”换成了“工具”。
 *
 * 拿一次真实的对话走一遍。你在 CS61A 的页面上说“帮我把这门课的笔记画成导图”：
 *
 * 第一圈，把你这句话连同工具清单发给模型。模型回：“我先看看你在哪页”，外加一个工具调用 get_context。
 * 循环替它执行 get_context，把结果（你在 /programming-intro/cs61a）塞回对话里，再问一次模型。
 * 第二圈，模型说要 list_notes，看这门课下有哪些心得。执行，塞回去，再问。
 * 第三圈，read_note，读你那份笔记。
 * 第四圈，它交了一个 create_mind_map。这个工具不直接画，而是生成一张改动单，停下来等你点同意。你点了，写入，把“已写入”塞回去。
 * 第五圈，模型说“画好了，一共 8 个方块”，这回没有工具调用了，循环结束。
 *
 * 模型每说要调一个工具，就像解释器碰到一个函数调用：把参数准备好，真的去执行，把返回值放回原处，接着往下算。
 * 不同的是，这里有些“函数”会停下来等你。所以 runAgent 从头到尾都是异步的，它随时可能在等网络、等模型、等你。
 *
 * 几个收尾的地方值得看一眼，都是出过岔子才会想到的：
 * 你中途点了停止，还没执行的工具调用会被补上一条“读者中止了”的结果。不补的话，这段对话的记录就断了一截，下次接着聊时模型那边会报错。
 * 模型的回复写太长被截断了，这时候就算有工具调用，参数也可能只写了一半，看着还像是合法的 JSON，绝不能执行，得让它分几次重来。
 * 模型有时候会“编”一个你没给它的工具名，比如只读模式下硬要调 edit_note。这里会再查一遍，没交给它的工具一律不执行。
 * 连着调了 24 次工具还没说完，就先停下，免得一个出了岔子的模型把你的额度烧光。
 *
 * 为什么不用 SDK 自带的工具循环？因为我们要接的不止 Claude 一家，而且每一步都要停下来，让界面画出“AI 正在读你的哪份笔记”。
 * 自己写的这个循环也就几十行，每一步你都看得见。
 */

import type { ApiFormat } from './providers.ts';
import { executeTool, TOOLS, type ToolDefinition, type ToolEnv } from './tools.ts';

export type ToolCall = { id: string; name: string; input: unknown; inputError?: string };
export type ToolResultEntry = { id: string; name: string; content: string; isError: boolean };

/** 模型原始回复的来历：同一地址、同一模型才会原样回传。 */
export type RawReply = { format: ApiFormat; signature: string; value: unknown };

export type Turn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[]; raw?: RawReply }
  | { role: 'tool'; results: ToolResultEntry[] };

export type StopReason = 'end' | 'tool_use' | 'max_tokens' | 'refusal' | 'pause' | 'other';

export type ModelReply = { text: string; toolCalls: ToolCall[]; stop: StopReason; raw?: RawReply; notice?: string };

export type CompleteRequest = {
  system: string;
  turns: readonly Turn[];
  tools: readonly ToolDefinition[];
  signal?: AbortSignal;
  onText: (delta: string) => void;
};

/** 一家模型的“翻译官”。 */
export interface ModelClient {
  complete(request: CompleteRequest): Promise<ModelReply>;
}

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'reply-done' }
  | { type: 'tool-start'; id: string; name: string; input: unknown }
  | { type: 'tool-end'; id: string; name: string; label: string; isError: boolean; content: string }
  | { type: 'notice'; text: string };

export type AgentRun = { turns: Turn[]; stopped: 'done' | 'aborted' | 'limit' | 'refusal' | 'error' };

/** 这次对话在哪里进行：面板里可以长一点，终端里要短。 */
export type Surface = 'panel' | 'terminal';

export function buildSystemPrompt(surface: Surface, approval: 'readonly' | 'ask' | 'auto' = 'ask'): string {
  return [
    '你是网站《一本特殊的 CS 教材》里的学习助手，帮读者自学计算机科学。',
    '这本教材的设定：课程目录照 CS 自学指南（csdiy.wiki）的分类排成一棵树；这个网站自己的源代码和代码顶部写给读者的注释才是正文；练习一律用各门课官方的 lab / project / 作业，不自编习题。推荐练习时，请指向课程官方的作业（可以请读者到对应课程页查看官方作业链接），不要自己出题。',
    '你可以用工具读取读者自己的数据：读者在各门课下写的心得文档和导图、建的学习路径、标的学习状态，以及教材里的课程和源码讲解。回答“这门课”“这份笔记”一类问题前，先用 get_context 看读者在哪一页。',
    '你可以帮读者写心得、整理笔记、画导图、起草学习路径、标学习状态，但只能通过 create_note、edit_note、create_mind_map、edit_mind_map、set_course_status、create_learning_path 这些工具提出改动。每一次改动读者都可能拒绝；被拒绝时不要换个说法再提一遍，先问读者想怎么改。改已有内容前先读最新的版本，保留读者没有要求删改的部分。你不能删除任何东西；读者想删，请读者自己动手。',
    '回答用中文，先给结论。不确定的地方直接说不确定，不要编造课程信息、链接或编号——需要时用 search_textbook 查。',
    ...(approval === 'readonly'
      ? ['这段对话是只读模式：你没有任何改动工具，只能读和回答。读者要你写心得、画导图或改东西时，告诉读者把聊天框底部的权限切到“每次确认”或“自动同意”（终端里需要到左侧 AI 面板切换）。']
      : []),
    surface === 'terminal'
      ? '读者是在网页底部的终端里用 agent 命令和你对话，界面很窄：回答尽量简短，少用标题和表格。'
      : '读者是在网页左侧的 AI 面板里和你对话。可以用 Markdown（列表、代码块、$公式$）。',
  ].join('\n\n');
}

/** 找出最后一条模型回复里还没有得到结果的工具调用。 */
function unansweredCalls(turns: readonly Turn[]): ToolCall[] {
  const last = turns.at(-1);
  return last?.role === 'assistant' ? last.toolCalls : [];
}

/**
 * 跑一轮：从读者最新的一句话开始，一直到模型说完（或被停下、或到步数上限）。
 * turns 必须以读者的一句话结尾；返回加上了这一轮全部记录的新数组，不改传进来的那个。
 */
export async function runAgent(options: {
  client: ModelClient;
  system: string;
  turns: readonly Turn[];
  env: ToolEnv;
  onEvent: (event: AgentEvent) => void;
  signal?: AbortSignal;
  maxSteps?: number;
  tools?: readonly ToolDefinition[];
}): Promise<AgentRun> {
  const { client, system, env, onEvent, signal } = options;
  const tools = options.tools ?? TOOLS;
  const turns: Turn[] = [...options.turns];
  const maxSteps = options.maxSteps ?? 24;

  const abortPending = (): AgentRun => {
    const pending = unansweredCalls(turns);
    if (pending.length) turns.push({ role: 'tool', results: pending.map((c) => ({ id: c.id, name: c.name, content: '读者中止了这次操作，工具没有执行。', isError: true })) });
    return { turns, stopped: 'aborted' };
  };

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) return abortPending();
    let reply: ModelReply;
    try {
      reply = await client.complete({ system, turns, tools, signal, onText: (delta) => onEvent({ type: 'text', delta }) });
    } catch (error) {
      if (signal?.aborted) return abortPending();
      throw error;
    }
    onEvent({ type: 'reply-done' });
    if (reply.text || reply.toolCalls.length || reply.raw) {
      turns.push({ role: 'assistant', text: reply.text, toolCalls: reply.toolCalls, ...(reply.raw ? { raw: reply.raw } : {}) });
    }
    if (reply.notice) onEvent({ type: 'notice', text: reply.notice });

    if (reply.stop === 'refusal') {
      // 被拒绝的那一轮里即使有工具调用，也可能只写了一半，一律不执行。
      if (reply.toolCalls.length) turns.push({ role: 'tool', results: reply.toolCalls.map((c) => ({ id: c.id, name: c.name, content: '模型拒绝了这次请求，工具没有执行。', isError: true })) });
      return { turns, stopped: 'refusal' };
    }
    if (reply.stop === 'pause') continue;
    if (reply.toolCalls.length === 0) {
      if (reply.stop === 'max_tokens') onEvent({ type: 'notice', text: '回答太长，被截断了。可以说“继续”让它接着写。' });
      return { turns, stopped: 'done' };
    }
    if (reply.stop === 'max_tokens') {
      // 参数写到一半被截断的工具调用，看起来可能还是“合法”的——不能执行。
      turns.push({ role: 'tool', results: reply.toolCalls.map((c) => ({ id: c.id, name: c.name, content: '回答超出长度上限，这次工具调用的参数不完整，没有执行。请分几次、每次少做一点。', isError: true })) });
      onEvent({ type: 'notice', text: '模型这一步写得太长被截断了，已让它分步重来。' });
      continue;
    }

    const results: ToolResultEntry[] = [];
    for (const call of reply.toolCalls) {
      if (signal?.aborted) {
        results.push({ id: call.id, name: call.name, content: '读者中止了这次操作，工具没有执行。', isError: true });
        continue;
      }
      onEvent({ type: 'tool-start', id: call.id, name: call.name, input: call.input });
      // 只执行这一轮交给模型的工具。只读模式下模型根本看不到改动工具；万一它硬要调（模型会“编”工具名），这里也不执行。
      const offered = tools.some((t) => t.name === call.name);
      const outcome = !offered
        ? { content: `当前权限下没有 ${call.name} 这个工具，没有执行。`, isError: true, label: `${call.name}（当前权限下不可用）` }
        : call.inputError
          ? { content: `参数不是合法的 JSON：${call.inputError}。请重新调用。`, isError: true, label: call.name }
          : await executeTool(call.name, call.input, env);
      onEvent({ type: 'tool-end', id: call.id, name: call.name, label: outcome.label, isError: outcome.isError, content: outcome.content });
      results.push({ id: call.id, name: call.name, content: outcome.content, isError: outcome.isError });
    }
    turns.push({ role: 'tool', results });
    if (signal?.aborted) return { turns, stopped: 'aborted' };
  }
  onEvent({ type: 'notice', text: `这一轮已经连续调用了 ${maxSteps} 次工具，先停在这里。可以说“继续”。` });
  return { turns, stopped: 'limit' };
}
