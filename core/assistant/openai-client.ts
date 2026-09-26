/**
 * @module        OpenAI 格式的“翻译官”——OpenAI、通义千问、智谱、MiniMax，以及任何兼容 OpenAI 接口的服务
 * @problem       大多数厂商都提供“和 OpenAI 一样”的对话接口（/chat/completions）。只要会说这一种格式，
 *                就能接上一大片厂商。但它和 Anthropic 的格式处处不同：系统提示是一条 system 消息、
 *                工具调用挂在 tool_calls 上且参数是一段 JSON 字符串、工具结果是一条条 role=tool 的消息、
 *                流式回复里工具参数是一小截一小截拼出来的。
 * @design        不引入 OpenAI 的 SDK：这一种格式很简单，用浏览器自带的 fetch 就够，也不用为十几家厂商各装一个包。
 *                请求：POST {baseUrl}/chat/completions，stream: true，Key 放在 Authorization: Bearer。
 *                读回复：服务器按 SSE（Server-Sent Events）格式一行行发 "data: {...}"，直到 "data: [DONE]"。
 *                每一小段里 choices[0].delta.content 是新出的字，delta.tool_calls 按 index 拼出每个工具调用的名字和参数。
 *                有的厂商会额外发 reasoning_content（思考过程），这里不显示。
 *                参数拼完再 JSON.parse；解析不了就标上 inputError，交给主循环告诉模型“参数坏了，重来”。
 *                不发 max_tokens：各家对这个字段的名字和上限都不一样（OpenAI 新模型只认 max_completion_tokens），
 *                用厂商的默认值最不容易出错。
 * @courses       UC Berkeley CS168 / Stanford CS144（HTTP、流式传输）；CS50x Week 8（fetch 与 JSON）；
 *                UC Berkeley CS61A（数据抽象：同一份对话记录，两种写法）
 * @exercises     https://cs168.io/ ; https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        知道 fetch 能发网络请求；知道服务器可以把回复拆成很多小段慢慢发。
 * @unclear       各家对“兼容”的理解不完全一样（比如有的在流式里不给工具调用的 id）；遇到没有 id 的，这里自己补一个。
 *                没有用真 Key 把每一家都跑一遍。
 *
 * @letter
 * 流式读取是这个文件里最值得看的部分。
 *
 * 服务器不是把整段回答算完再发给你，而是算出一个字发一个字。浏览器收到的是一串字节，
 * 每一次 read() 拿到的可能是半行、一行、三行——它不按你的方便来切。所以代码里有一个 buffer：
 * 把收到的字节先攒起来，按换行切，完整的行拿去处理，最后那半行留着等下一批。
 * 你在网络课里学 TCP 的时候会听到同一句话：TCP 是字节流，不是消息流，“消息的边界”要你自己划。
 *
 * 工具调用的参数也是这么一截一截来的：第一段 {"id":"a"，第二段 bc","text":"……。
 * 所以要按 index 把它们拼起来，等整条流结束了再解析——提前解析，只会得到一堆半截的 JSON。
 */

import type { Connection } from './assistant.ts';
import type { CompleteRequest, ModelClient, ModelReply, StopReason, ToolCall, Turn } from './agent.ts';
import { redactSecrets } from './providers.ts';

type OpenAIMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export function toOpenAIMessages(system: string, turns: readonly Turn[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [{ role: 'system', content: system }];
  for (const turn of turns) {
    if (turn.role === 'user') out.push({ role: 'user', content: turn.text });
    else if (turn.role === 'assistant') {
      if (!turn.text && turn.toolCalls.length === 0) continue;
      out.push({
        role: 'assistant',
        content: turn.text || null,
        ...(turn.toolCalls.length ? { tool_calls: turn.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) } })) } : {}),
      });
    } else {
      for (const r of turn.results) out.push({ role: 'tool', tool_call_id: r.id, content: r.isError ? `错误：${r.content}` : r.content });
    }
  }
  return out;
}

function stopOf(reason: string | null): StopReason {
  switch (reason) {
    case 'stop': return 'end';
    case 'tool_calls': case 'function_call': return 'tool_use';
    case 'length': return 'max_tokens';
    case 'content_filter': return 'refusal';
    default: return 'other';
  }
}

function headers(conn: Connection): Record<string, string> {
  return { 'content-type': 'application/json', authorization: `Bearer ${conn.apiKey}` };
}

/** 读出错误回应里的说明文字，把 Key 打码，并按状态码说人话。 */
export async function explainHttpError(response: Response, conn: Connection): Promise<Error> {
  let detail = '';
  try {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
      detail = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message ?? parsed.message ?? body;
    } catch { detail = body; }
  } catch { /* 读不到正文就算了 */ }
  detail = redactSecrets(detail.slice(0, 400), [conn.apiKey]);
  switch (response.status) {
    case 401: return new Error('API Key 无效（401）。请检查设置里的 Key 是否填对、是否属于这家厂商。');
    case 403: return new Error(`这个 Key 没有权限（403）：${detail}`);
    case 404: return new Error(`接口地址或模型名不对（404）：${detail}`);
    case 429: return new Error('请求太频繁，或者额度用完了（429）。稍后再试，或到厂商后台看看余额。');
    default: return new Error(`厂商返回了错误（${response.status}）：${detail}`);
  }
}

/** fetch 本身抛错（没有拿到任何回应）：多半是网络不通，或者被浏览器的跨域规则拦下了。 */
export function explainNetworkError(error: unknown, conn: Connection): Error {
  if (error instanceof DOMException && error.name === 'AbortError') return new Error('已停止。');
  return new Error(`连不上 ${conn.baseUrl}。可能是网络问题，也可能是这个地址不允许网页直接调用（跨域 CORS）——那样需要在设置里换成一个转发地址。`);
}

/**
 * 把一段段 SSE 文字拼成完整的行，每一行 "data: ..." 交给 onData。返回“喂字节”和“收尾”两个函数。
 * 单独拿出来，是为了能在测试里喂它切得乱七八糟的字节，看它拼得对不对。
 */
export function createSseParser(onData: (data: string) => void) {
  let buffer = '';
  const handleLine = (raw: string) => {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('data:')) onData(line.slice(5).trimStart());
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    },
    end() { if (buffer) handleLine(buffer); buffer = ''; },
  };
}

/** 流式回复的累加器：文字、按 index 拼起来的工具调用、结束原因。 */
export function createDeltaAccumulator(onText: (delta: string) => void) {
  let text = '';
  let finish: string | null = null;
  const calls = new Map<number, { id: string; name: string; args: string }>();
  return {
    feed(data: string) {
      if (data === '[DONE]') return;
      let chunk: { choices?: { delta?: { content?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[] };
      try { chunk = JSON.parse(data); } catch { return; }
      const choice = chunk.choices?.[0];
      if (!choice) return;
      const delta = choice.delta ?? {};
      if (typeof delta.content === 'string' && delta.content) { text += delta.content; onText(delta.content); }
      for (const tc of delta.tool_calls ?? []) {
        const index = tc.index ?? calls.size;
        const entry = calls.get(index) ?? { id: '', name: '', args: '' };
        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.name += tc.function.name;
        if (tc.function?.arguments) entry.args += tc.function.arguments;
        calls.set(index, entry);
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    },
    result(): { text: string; toolCalls: ToolCall[]; finish: string | null } {
      const toolCalls = [...calls.entries()].sort(([a], [b]) => a - b).map(([index, c]): ToolCall => {
        const id = c.id || `call_${index}_${Math.random().toString(36).slice(2, 8)}`;
        if (!c.args.trim()) return { id, name: c.name, input: {} };
        try { return { id, name: c.name, input: JSON.parse(c.args) }; } catch (e) { return { id, name: c.name, input: {}, inputError: (e as Error).message }; }
      });
      return { text, toolCalls, finish };
    },
  };
}

export function createOpenAIClient(conn: Connection): ModelClient {
  return {
    async complete(request: CompleteRequest): Promise<ModelReply> {
      let response: Response;
      try {
        response = await fetch(`${conn.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: headers(conn),
          signal: request.signal,
          body: JSON.stringify({
            model: conn.model,
            stream: true,
            messages: toOpenAIMessages(request.system, request.turns),
            tools: request.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })),
          }),
        });
      } catch (error) {
        throw explainNetworkError(error, conn);
      }
      if (!response.ok || !response.body) throw await explainHttpError(response, conn);

      const acc = createDeltaAccumulator(request.onText);
      const parser = createSseParser((data) => acc.feed(data));
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.push(decoder.decode(value, { stream: true }));
        }
        parser.push(decoder.decode());
        parser.end();
      } catch (error) {
        throw explainNetworkError(error, conn);
      }
      const { text, toolCalls, finish } = acc.result();
      const stop = toolCalls.length && finish !== 'length' ? 'tool_use' : stopOf(finish);
      return { text, toolCalls, stop, ...(stop === 'refusal' ? { notice: '厂商的内容过滤拦下了这次回答。' } : {}) };
    },
  };
}

/** 设置页的“测试连接”：发一个极小的非流式请求。 */
export async function testOpenAI(conn: Connection): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${conn.baseUrl}/chat/completions`, {
      method: 'POST', headers: headers(conn),
      body: JSON.stringify({ model: conn.model, messages: [{ role: 'user', content: '请只回复“连通”两个字。' }] }),
    });
  } catch (error) {
    throw explainNetworkError(error, conn);
  }
  if (!response.ok) throw await explainHttpError(response, conn);
  const body = await response.json().catch(() => ({})) as { model?: string };
  return `连接成功（模型 ${body.model ?? conn.model}）。`;
}
