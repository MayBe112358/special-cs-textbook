/**
 * @module        按接口格式挑“翻译官”，以及设置页用的“测试连接”“获取模型列表”
 * @problem       界面只知道“读者选了哪家”，不该关心那家走 Anthropic 格式还是 OpenAI 格式。
 * @design        三个入口，都按 connection.format 分派：createModelClient、testConnection、listModels。
 *                取模型列表：Anthropic 官方地址用 SDK；其余按预设里写死的 modelsUrl，或按 modelsUrlCandidates 的规则
 *                （照 cc-switch）一个个试，第一个拿到列表的算数。请求头按预设的鉴权方式带 Key。
 * @courses       MIT 6.031（分派与多态）；UC Berkeley CS61A（高阶函数：按数据挑函数）
 * @exercises     https://web.mit.edu/6.031/www/sp22/ —— MIT 6.031 关于接口、多态与分派的阅读和练习
 * @prereq        知道“分派”：根据数据的种类，决定调用哪一个函数。
 * @unclear       有的厂商不提供模型列表接口，或者它也不允许网页调用；拉不到时设置页仍然可以手填模型名。
 *
 * @letter
 * AI 这一块里最短的就是这个文件了。它干的事叫“分派”：看一眼这家厂商走哪种格式，把活交给对应的那个翻译官。
 *
 * 界面、终端、主循环都只认这儿的三个函数：建一个对话客户端、测试连接、拉模型列表。它们谁都不用关心背后是 Anthropic 格式还是 OpenAI 格式。
 * 将来要是再加一种格式，比如 Gemini 自己的原生接口，只要在这里多一个分支，写一个新的翻译官，别处一行都不用动。
 *
 * 拉模型列表这件事稍微麻烦点。有的厂商把列表放在一个固定地址，有的得按规则挨个猜几个地址试试，第一个拿到列表的算数（这个猜法也是照 cc-switch 学的）。
 * 还有的干脆不给列表，或者给了但不许网页来拿。拉不到也没关系，设置页里还是可以手动填模型名。
 */

import type { Connection } from './assistant.ts';
import type { ModelClient } from './agent.ts';
import { createAnthropicClient, listAnthropicModels, testAnthropic } from './anthropic-client.ts';
import { createOpenAIClient, explainHttpError, testOpenAI } from './openai-client.ts';
import { isOfficialAnthropic, modelsUrlCandidates, parseModelList } from './providers.ts';

export function createModelClient(conn: Connection): ModelClient {
  return conn.format === 'anthropic' ? createAnthropicClient(conn) : createOpenAIClient(conn);
}

export function testConnection(conn: Connection): Promise<string> {
  return conn.format === 'anthropic' ? testAnthropic(conn) : testOpenAI(conn);
}

export async function listModels(conn: Connection): Promise<string[]> {
  if (isOfficialAnthropic(conn.preset, conn.baseUrl)) return listAnthropicModels(conn);
  const candidates = !conn.relayed && conn.preset.modelsUrl ? [conn.preset.modelsUrl] : modelsUrlCandidates(conn.baseUrl);
  const headers: Record<string, string> = conn.preset.auth === 'x-api-key'
    ? { 'x-api-key': conn.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
    : { authorization: `Bearer ${conn.apiKey}` };
  let lastError: Error = new Error('这家没有提供模型列表接口，请手动填写模型名。');
  for (const url of candidates) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) { lastError = await explainHttpError(response, conn); continue; }
      const models = parseModelList(await response.json());
      if (models.length) return models;
    } catch {
      lastError = new Error(`取不到模型列表（${url}）：可能是这个地址不允许网页直接调用。可以手动填写模型名。`);
    }
  }
  throw lastError;
}
