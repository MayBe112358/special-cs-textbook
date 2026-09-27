/**
 * @module        模型厂商预设——每家的接口地址、接口格式、Key 放哪、默认模型、去哪拿 Key
 * @problem       读者要自己选厂商、自己填 Key。如果让读者从零填“接口地址是什么、走哪种格式”，
 *                十个人里九个会填错；而每家的地址、格式、鉴权方式又各不相同，写错一处就连不上。
 * @design        一张预设表，每家一行，字段参照开源项目 cc-switch（github.com/farion1231/cc-switch）整理的供应商资料：
 *                接口地址（baseUrl）、接口格式（format）、Key 放在哪个请求头（auth）、默认模型、拿 Key 的页面。
 *                但“用哪种格式”这一列不照抄它——cc-switch 是桌面程序，请求从你电脑直接发出，没有跨域限制；
 *                我们的请求从网页发出，厂商服务器必须明确允许别的网站调用（CORS），浏览器才放行。
 *                2026-09-27 逐家发了一次浏览器式的预检请求（OPTIONS，带上真实会用到的请求头）实测：
 *                - Anthropic、DeepSeek 的 Anthropic 格式接口放行 → 用 Anthropic 格式（官方 SDK）；
 *                - 智谱、通义千问、MiniMax 的 Anthropic 格式接口不放行（或不放行 SDK 的请求头），
 *                  但它们的 OpenAI 格式接口放行 → 用 OpenAI 格式；
 *                - OpenAI 放行；
 *                - Kimi（月之暗面）和 Gemini 两种格式都不放行 → 标 needsRelay，要读者填一个转发地址。
 *                读者填了自己的接口地址，就用读者的，不用预设的。
 *                预设里的模型名只是初始值：厂商改名很快，设置页会从厂商那里实时拉模型列表。
 *                只收厂商官方地址，不收中转站和带推广参数的链接。
 * @courses       UC Berkeley CS168 / Stanford CS144（HTTP、同源策略与 CORS）；CS50x Week 8（浏览器与网络请求）；
 *                MIT 6.031（数据驱动的设计：把“每家不一样”的部分收进一张表）
 * @exercises     https://cs168.io/ —— CS168 里 HTTP 与 Web 相关作业
 *                https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：网页与浏览器基础
 * @prereq        知道浏览器出于安全，默认不让一个网站的脚本去读另一个网站的回应，除非对方在回应头里说“允许”。
 * @unclear       CORS 实测只是预检通过，还没有拿真 Key 把每家的对话和工具调用都跑一遍；
 *                厂商随时可能改策略。连不上时，设置页的“测试连接”会把浏览器报的错原样告诉你。
 *
 * @letter
 * 这张表里最值得看的是 format 那一列。它记的不是“厂商支持什么格式”，而是“浏览器能用哪种格式”。
 *
 * 举个例子：智谱明明有 Anthropic 格式的接口，为啥偏偏走 OpenAI 格式？
 * 因为网页发出去的请求，浏览器会先替你问对方一句：“maybe112358.github.io 上的脚本想调你，带着这几个请求头，行不行？”
 * 对方不回“行”，浏览器就不发真正的请求。这个先问一句的机制叫 CORS。
 * 它是在保护你：要是没有它，你随便打开一个网页，那个网页就能带着你浏览器里的登录状态，偷偷去调别的网站。
 *
 * 桌面程序根本碰不到这个问题，因为它的请求不是从网页里发的。所以照抄桌面程序的配置，在这儿一定会踩坑。
 * 那怎么知道每家到底放不放行？只能挨个去试。
 * 2026 年 9 月 27 日，我们对着每家的地址发了一遍浏览器那种“先问一句”的请求（OPTIONS 预检），带上真正会用到的请求头，看它们怎么回。结果都写在上面的 @design 里了。
 * 有两家（Kimi 和 Gemini）两种格式都不放行，那就只能请你自己填一个转发地址。
 *
 * 有件事得老实说：预检通过只说明浏览器愿意把请求发出去，不代表对话、工具调用每一步都没问题。
 * 我们还没用真 Key 把每家都完整跑一遍。厂商也随时可能改规矩。
 * 连不上的时候，设置页的“测试连接”会把浏览器报的错原样给你看。
 *
 * 你在网络课（CS168、CS144）上学到 HTTP 头的时候，可以回来再看看这张表。每一行背后，都是一次真实发生过的一问一答。
 */

export type ApiFormat = 'anthropic' | 'openai';

export type ProviderPreset = {
  id: string;
  name: string;
  /** 调用时用哪种接口格式。决定的依据见上面：浏览器能直连的那一种。 */
  format: ApiFormat;
  /** 官方接口地址。OpenAI 格式写到版本号那一段（/v1、/v4），后面由程序拼 /chat/completions。 */
  baseUrl: string;
  /** Key 放在哪个请求头：Anthropic 官方用 x-api-key，兼容接口一般用 Authorization: Bearer。 */
  auth: 'x-api-key' | 'bearer';
  defaultModel: string;
  /** 设置页下拉框里先列出来的几个；实时拉到的列表会覆盖它。 */
  models: readonly string[];
  /** 取模型列表的完整地址；不填就按 modelsUrlCandidates 的规则从 baseUrl 推。 */
  modelsUrl?: string;
  /** 去哪里申请 API Key。 */
  keyUrl: string;
  /** 浏览器不能直连，必须填转发地址。 */
  needsRelay?: boolean;
  /** 自定义：接口地址必须由读者填。 */
  custom?: boolean;
  /** 单次回答最多写多少 token。官方 Anthropic 可以给得很大；兼容接口上限各不相同，给个稳妥的数。 */
  maxTokens: number;
};

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'anthropic', name: 'Anthropic（Claude）', format: 'anthropic', baseUrl: 'https://api.anthropic.com', auth: 'x-api-key',
    defaultModel: 'claude-opus-5', models: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-fable-5-1'],
    keyUrl: 'https://console.anthropic.com/settings/keys', maxTokens: 64000,
  },
  {
    id: 'openai', name: 'OpenAI', format: 'openai', baseUrl: 'https://api.openai.com/v1', auth: 'bearer',
    defaultModel: '', models: [], keyUrl: 'https://platform.openai.com/api-keys', maxTokens: 16000,
  },
  {
    id: 'deepseek', name: 'DeepSeek', format: 'anthropic', baseUrl: 'https://api.deepseek.com/anthropic', auth: 'bearer',
    defaultModel: 'deepseek-v4-pro', models: ['deepseek-v4-pro', 'deepseek-flash'], modelsUrl: 'https://api.deepseek.com/models',
    keyUrl: 'https://platform.deepseek.com/api_keys', maxTokens: 8192,
  },
  {
    id: 'qwen', name: '通义千问（阿里云百炼）', format: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', auth: 'bearer',
    defaultModel: 'qwen3.8-max', models: ['qwen3.8-max', 'qwen3.7-plus', 'qwen3.8-flash'],
    keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1', maxTokens: 8192,
  },
  {
    id: 'zhipu', name: '智谱 GLM', format: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', auth: 'bearer',
    defaultModel: 'glm-5.3', models: ['glm-5.3'], keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', maxTokens: 8192,
  },
  {
    id: 'minimax', name: 'MiniMax', format: 'openai', baseUrl: 'https://api.minimax.cn/v1', auth: 'bearer',
    defaultModel: 'MiniMax-M3', models: ['MiniMax-M3'], keyUrl: 'https://platform.minimax.cn/user-center/basic-information/interface-key', maxTokens: 8192,
  },
  {
    id: 'kimi', name: 'Kimi（月之暗面）', format: 'openai', baseUrl: 'https://api.moonshot.cn/v1', auth: 'bearer',
    defaultModel: 'kimi-k2.7-code', models: ['kimi-k2.7-code'], keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    needsRelay: true, maxTokens: 8192,
  },
  {
    id: 'gemini', name: 'Google Gemini', format: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', auth: 'bearer',
    defaultModel: 'gemini-3.6-flash', models: ['gemini-3.6-flash'], keyUrl: 'https://aistudio.google.com/app/apikey',
    needsRelay: true, maxTokens: 8192,
  },
  {
    id: 'custom-openai', name: '自定义（OpenAI 兼容接口）', format: 'openai', baseUrl: '', auth: 'bearer',
    defaultModel: '', models: [], keyUrl: '', custom: true, maxTokens: 8192,
  },
  {
    id: 'custom-anthropic', name: '自定义（Anthropic 兼容接口）', format: 'anthropic', baseUrl: '', auth: 'bearer',
    defaultModel: '', models: [], keyUrl: '', custom: true, maxTokens: 8192,
  },
];

export function findPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

/** 是不是 Anthropic 官方接口（没被读者换成转发地址）。只有官方接口才开 Claude 专属的功能，兼容接口多半不认。 */
export function isOfficialAnthropic(preset: ProviderPreset, baseUrl: string): boolean {
  return preset.id === 'anthropic' && baseUrl.replace(/\/+$/, '') === preset.baseUrl;
}

/**
 * 从接口地址推出“模型列表”在哪。规则照 cc-switch 的 model_fetch.rs：
 * - 地址已经以版本段结尾（/v1、/v4……）：版本号已经在路径里了，拼 /models；
 * - 版本段不是 /v1 时，再补一个 /v1/models 兜底；
 * - 没有版本段：拼 /v1/models；
 * - 地址以 /anthropic 这类兼容子路径结尾：剥掉它，再试根上的 /v1/models 和 /models。
 */
export function modelsUrlCandidates(baseUrl: string): string[] {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (!trimmed) return [];
  const out: string[] = [];
  const version = /\/v(\d+)[a-z]*$/i.exec(trimmed);
  if (version) {
    out.push(`${trimmed}/models`);
    if (version[1] !== '1') out.push(`${trimmed}/v1/models`);
  } else {
    out.push(`${trimmed}/v1/models`);
  }
  const compat = /\/(anthropic|apps\/anthropic|openai|compatible-mode\/v1)$/i.exec(trimmed);
  if (compat) {
    const root = trimmed.slice(0, compat.index);
    out.push(`${root}/v1/models`, `${root}/models`);
  }
  return [...new Set(out)];
}

/** 从 /models 的回应里取出模型编号。OpenAI 和 Anthropic 都是 { data: [{ id }] }；有的厂商是 { models: [...] }。 */
export function parseModelList(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as Record<string, unknown>;
  const list = Array.isArray(b.data) ? b.data : Array.isArray(b.models) ? b.models : [];
  const ids = list.flatMap((m) => {
    if (typeof m === 'string') return [m];
    if (m && typeof m === 'object') {
      const r = m as Record<string, unknown>;
      const id = r.id ?? r.name ?? r.slug;
      return typeof id === 'string' ? [id.replace(/^models\//, '')] : [];
    }
    return [];
  });
  return [...new Set(ids)].sort();
}

/**
 * 把错误信息里的 Key 遮掉再给人看。厂商的报错有时会把请求头原样带回来；
 * 读者截图求助时，不该把自己的 Key 一起发出去。
 */
export function redactSecrets(message: string, secrets: readonly string[]): string {
  let out = message;
  for (const secret of secrets) {
    if (secret.length >= 8) out = out.split(secret).join(`${secret.slice(0, 4)}••••`);
  }
  return out.replace(/\b(sk-[A-Za-z0-9_-]{4})[A-Za-z0-9_-]{8,}/g, '$1••••');
}
