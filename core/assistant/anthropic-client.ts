/**
 * @module        Anthropic 格式的“翻译官”——用官方 SDK 调 Claude，以及 DeepSeek 这类兼容 Anthropic 接口的厂商
 * @problem       主循环（agent.ts）只认和厂商无关的对话记录。Anthropic 的接口有自己的格式：
 *                工具调用是 tool_use 块、工具结果是放在 user 消息里的 tool_result 块、回复是一段段流式事件。
 *                这些细节要有一处专门负责翻译，而且要处理好 Claude 专属的几件事：
 *                原样回传回复内容、模型拒答时的自动换模型、提示缓存。
 * @design        用 Anthropic 官方 TypeScript SDK（@anthropic-ai/sdk），在浏览器里要显式打开 dangerouslyAllowBrowser——
 *                SDK 默认拒绝在网页里用，因为 Key 会暴露给网页；这里的 Key 本来就是读者自己的、只在他自己的浏览器里，这是有意的选择。
 *                只有连的是 Anthropic 官方地址时，才打开 Claude 专属的功能：
 *                - 提示缓存：系统提示和工具清单每次都一样，缓存后续轮次便宜很多（cache_control）；
 *                - 工具参数边生成边传（eager_input_streaming），长文档不用憋到最后一口气传回来；
 *                - 服务器端换模型（fallbacks: "default"）：模型的安全分类器拒答时，服务器自动换一个模型重试；
 *                兼容接口（DeepSeek、自定义转发）多半不认这些字段，一律不发。
 *                Key 放哪个请求头看预设：官方用 x-api-key，兼容接口用 Authorization: Bearer。
 *                流式读回复：SDK 的 stream.on('text') 一段段交出文字，finalMessage() 交出完整回复。
 *                工具参数因为是边生成边传的，JSON 可能坏掉——坏了就重发这一轮（最多两次），API 本身的错误不重试。
 *                错误翻成读者看得懂的话，并把 Key 打码。
 * @courses       Stanford CS224N / UC Berkeley CS294（大语言模型接口、工具调用）；UC Berkeley CS168（HTTP、流式传输）；
 *                UC Berkeley CS161（密钥暴露面）
 * @exercises     https://cs168.io/ —— HTTP 相关的作业
 * @prereq        知道“流式”是服务器一边算一边把结果一小段一小段发回来，而不是算完再一次性发。
 * @unclear       兼容 Anthropic 格式的厂商对工具调用、流式事件的支持程度不一，只在 DeepSeek 上按文档对过格式，
 *                没有用真 Key 把所有厂商的工具调用都跑通。
 *
 * @letter
 * 这个文件里有一个参数名字特别吓人：dangerouslyAllowBrowser。SDK 的作者故意起这么个名字，
 * 就是要让你在写下它的那一刻停一下，想清楚：Key 会出现在网页里，任何能在这个页面运行的脚本都看得到它。
 *
 * 对一个公司的产品来说，这通常是错的：Key 是公司的，不该发给每个访客。
 * 但这里的情况反过来：Key 是读者自己的，网站没有服务器可以替他保管，放在他自己的浏览器里是唯一的选择。
 * 所以我们打开它，并且在设置页上把这件事写明白——“危险”不是不能做，而是做之前要知道自己在做什么。
 *
 * 另一个值得看的细节是 raw 的回传。Claude 回复里可能有思考块、有“服务器换过模型”的记录块，
 * 接口要求下一轮原样送回去；可如果你中途换了模型，这些块对新模型没有意义，送回去反而会出错。
 * 所以每份回复都记着自己的“签名”（地址 + 模型），签名对得上才原样回传——同一件事，只在它有意义的地方做。
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Connection } from './assistant.ts';
import type { CompleteRequest, ModelClient, ModelReply, StopReason, ToolCall, Turn } from './agent.ts';
import { isOfficialAnthropic, redactSecrets } from './providers.ts';

/** 打开服务器端自动换模型的几个模型（按技能文档：Claude Opus 5、Fable 5.1、Opus 5.5 默认都应打开）。 */
const FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5-1', 'claude-opus-5-5']);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function makeClient(conn: Connection): Anthropic {
  const bearer = conn.preset.auth === 'bearer';
  return new Anthropic({
    baseURL: conn.baseUrl,
    apiKey: bearer ? null : conn.apiKey,
    authToken: bearer ? conn.apiKey : null,
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
  });
}

function signatureOf(conn: Connection): string {
  return `anthropic|${conn.baseUrl}|${conn.model}`;
}

/** 把和厂商无关的对话记录翻成 Anthropic 的 messages。 */
export function toAnthropicMessages(turns: readonly Turn[], signature: string): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const turn of turns) {
    if (turn.role === 'user') {
      out.push({ role: 'user', content: turn.text });
    } else if (turn.role === 'assistant') {
      if (turn.raw && turn.raw.format === 'anthropic' && turn.raw.signature === signature) {
        out.push({ role: 'assistant', content: turn.raw.value as Anthropic.ContentBlockParam[] });
        continue;
      }
      const content: Anthropic.ContentBlockParam[] = [];
      if (turn.text) content.push({ type: 'text', text: turn.text });
      for (const call of turn.toolCalls) content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input ?? {} });
      if (content.length) out.push({ role: 'assistant', content });
    } else {
      out.push({
        role: 'user',
        content: turn.results.map((r) => ({ type: 'tool_result' as const, tool_use_id: r.id, content: r.content, is_error: r.isError })),
      });
    }
  }
  return out;
}

function stopOf(reason: string | null | undefined): StopReason {
  switch (reason) {
    case 'end_turn': case 'stop_sequence': return 'end';
    case 'tool_use': return 'tool_use';
    case 'max_tokens': return 'max_tokens';
    case 'refusal': return 'refusal';
    case 'pause_turn': return 'pause';
    default: return 'other';
  }
}

/** 把 SDK 的错误翻成读者看得懂的话。先判断最具体的，再判断笼统的。 */
export function explainAnthropicError(error: unknown, conn: Connection): Error {
  const secret = [conn.apiKey];
  const msg = (e: unknown) => redactSecrets(e instanceof Error ? e.message : String(e), secret);
  if (error instanceof Anthropic.APIUserAbortError) return new Error('已停止。');
  if (error instanceof Anthropic.AuthenticationError) return new Error('API Key 无效（401）。请检查设置里的 Key 是否填对、是否属于这家厂商。');
  if (error instanceof Anthropic.PermissionDeniedError) return new Error(`这个 Key 没有权限（403）：${msg(error)}`);
  if (error instanceof Anthropic.NotFoundError) return new Error(`接口地址或模型名不对（404）：${msg(error)}`);
  if (error instanceof Anthropic.RateLimitError) return new Error('请求太频繁，或者额度用完了（429）。稍后再试，或到厂商后台看看余额。');
  if (error instanceof Anthropic.BadRequestError) return new Error(`请求被拒绝（400）：${msg(error)}`);
  if (error instanceof Anthropic.APIConnectionError) {
    return new Error(`连不上 ${conn.baseUrl}。可能是网络问题，也可能是这个地址不允许网页直接调用（跨域 CORS）——那样需要在设置里换成一个转发地址。`);
  }
  if (error instanceof Anthropic.APIError) return new Error(`厂商返回了错误（${error.status ?? '未知'}）：${msg(error)}`);
  return new Error(msg(error));
}

export function createAnthropicClient(conn: Connection): ModelClient {
  const client = makeClient(conn);
  const official = isOfficialAnthropic(conn.preset, conn.baseUrl);
  const fallback = official && FALLBACK_MODELS.has(conn.model);
  const signature = signatureOf(conn);

  return {
    async complete(request: CompleteRequest): Promise<ModelReply> {
      const tools: Anthropic.Tool[] = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool.InputSchema,
        ...(official ? { eager_input_streaming: true } : {}),
      }));
      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model: conn.model,
        max_tokens: conn.preset.maxTokens,
        system: official ? [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }] : request.system,
        messages: toAnthropicMessages(request.turns, signature),
        tools,
        // 自动缓存到最后一条消息：多轮对话里，前面已经发过的部分下一轮按缓存价计费。
        ...(official ? { cache_control: { type: 'ephemeral' as const } } : {}),
      };

      for (let attempt = 0; ; attempt++) {
        try {
          // 普通接口和 beta 接口的流是两种类型，分开写，各自交出完整回复。
          let finished: unknown;
          if (fallback) {
            const stream = client.beta.messages.stream({ ...(params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming), betas: [FALLBACK_BETA], fallbacks: 'default' }, { signal: request.signal });
            stream.on('text', (delta) => request.onText(delta));
            finished = await stream.finalMessage();
          } else {
            const stream = client.messages.stream(params, { signal: request.signal });
            stream.on('text', (delta) => request.onText(delta));
            finished = await stream.finalMessage();
          }
          const message = finished as { content: Array<{ type: string; [key: string]: unknown }>; stop_reason: string | null };
          const blocks = message.content;
          const text = blocks.filter((b) => b.type === 'text').map((b) => String(b.text)).join('');
          const toolCalls: ToolCall[] = blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: String(b.id), name: String(b.name), input: b.input }));
          const switched = blocks.filter((b) => b.type === 'fallback').map((b) => (b.to as { model?: string } | undefined)?.model).filter(Boolean);
          const stop = stopOf(message.stop_reason);
          const details = (message as { stop_details?: { explanation?: string | null } | null }).stop_details;
          const notice = stop === 'refusal'
            ? `模型拒绝回答这个请求${details?.explanation ? `：${details.explanation}` : '。'}`
            : switched.length ? `原模型拒答，服务器自动换成 ${switched.join('、')} 继续。` : undefined;
          return { text, toolCalls, stop, raw: { format: 'anthropic', signature, value: message.content }, ...(notice ? { notice } : {}) };
        } catch (error) {
          // 边生成边传的工具参数可能是坏 JSON：这种错误不是 API 报的，重发这一轮；API 报的错不重试（SDK 已经对可重试的重试过了）。
          if (!(error instanceof Anthropic.APIError) && !request.signal?.aborted && attempt < 2) continue;
          throw explainAnthropicError(error, conn);
        }
      }
    },
  };
}

/** 设置页的“测试连接”：发一个极小的请求，能拿到回复就算通。 */
export async function testAnthropic(conn: Connection): Promise<string> {
  try {
    const message = await makeClient(conn).messages.create({ model: conn.model, max_tokens: 64, messages: [{ role: 'user', content: '请只回复“连通”两个字。' }] });
    return `连接成功（模型 ${message.model}）。`;
  } catch (error) {
    throw explainAnthropicError(error, conn);
  }
}

/** 官方地址用 SDK 的模型列表接口；兼容接口交给调用方按 modelsUrlCandidates 去试。 */
export async function listAnthropicModels(conn: Connection): Promise<string[]> {
  try {
    const ids: string[] = [];
    for await (const model of makeClient(conn).models.list({ limit: 100 })) ids.push(model.id);
    return ids.sort();
  } catch (error) {
    throw explainAnthropicError(error, conn);
  }
}
