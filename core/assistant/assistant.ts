/**
 * @module        将来的 AI 助手——模型厂商和 API Key 怎么配置、它能调用哪些操作（现在只有约定，还不接任何模型）
 * @problem       作者打算以后加一个像 VS Code 那样的 AI 聊天面板：读者自己选模型厂商、填自己的 API Key，
 *                让 AI 读自己的心得、帮忙改心得和学习路径。到那时再临时想“AI 能碰什么、Key 存哪”，
 *                很容易为了赶功能开一个口子，让 AI 绕过读者直接改数据。
 * @design        现在只把约定写下来：
 *                - AssistantConfig：用哪家、哪个模型、（可选）自定义接口地址、API Key。Key 只存在读者自己的浏览器里，
 *                  这个网站没有服务器，Key 不会经过任何第三方；请求由浏览器直接发给读者选的厂商。
 *                - ASSISTANT_TOOLS：AI 能用的“工具”清单，全部由 core/workspace/workspace.ts 的统一编辑接口推导出来：
 *                  读的工具直接读；改的工具只能生成一份 EditProposal，必须经过读者点“同意”才会写入。
 *                清单里没有“直接写入”的工具——这是故意的。
 * @courses       UC Berkeley CS161 / Stanford CS155（最小权限原则、密钥管理）；MIT 6.031（接口先于实现）；
 *                Stanford CS224N / UC Berkeley CS294（大语言模型的工具调用）
 * @exercises     https://cs161.org/ —— 安全设计原则相关的作业
 * @prereq        知道 API Key 相当于密码：谁拿到它，谁就能用你的额度。
 * @unclear       浏览器直接请求模型厂商时，有的厂商不允许跨域（CORS）调用，到时可能需要读者自己提供一个转发地址（baseUrl）。
 *                哪些厂商能直连，要到真正接入时逐一验证。
 *
 * @letter
 * 这个文件现在一行“智能”都没有，全是规矩。先立规矩、后写功能，是因为 AI 这类功能一旦做出来，
 * 改规矩的代价会非常大——已经习惯了“AI 直接帮我改好”的读者，很难再接受“每次都要点一下同意”。
 *
 * 规矩只有两条：Key 永远只在你的浏览器里；AI 永远不能不经过你就改你的东西。
 * 第二条在代码里的样子，就是 ASSISTANT_TOOLS 里所有“改”的工具都以 propose_ 开头，
 * 它们的结果只是一份提议，真正写入要走 applyProposal，而 applyProposal 要求一个只有你点按钮才会产生的 approved=true。
 * 这就是安全课讲的“最小权限”：给一个程序它完成工作所需的最少权力，多一点都不给。
 */

import { EDITABLE_RESOURCES } from '../workspace/workspace.ts';

export const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic（Claude）' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'google', name: 'Google（Gemini）' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'custom', name: '自定义（兼容 OpenAI 接口的服务）' },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]['id'];

export type AssistantConfig = {
  provider: ProviderId;
  model: string;
  /** 自定义服务或转发地址；用官方地址时留空。 */
  baseUrl?: string;
  apiKey: string;
};

/** Key 存在浏览器里的位置。只在读者自己的浏览器里，不进备份文件——备份可能被发给别人，Key 不该跟着走。 */
export const ASSISTANT_CONFIG_KEY = 'special-cs-textbook:assistant:v1';

export function validateAssistantConfig(value: unknown): AssistantConfig {
  if (!value || typeof value !== 'object') throw new Error('AI 设置格式错误。');
  const v = value as Record<string, unknown>;
  if (!PROVIDERS.some((p) => p.id === v.provider)) throw new Error('请选择一个模型厂商。');
  if (typeof v.model !== 'string' || !v.model.trim() || v.model.length > 200) throw new Error('请填写模型名称。');
  if (typeof v.apiKey !== 'string' || v.apiKey.trim().length < 8 || v.apiKey.length > 500 || /\s/.test(v.apiKey.trim())) throw new Error('API Key 看起来不完整。');
  let baseUrl: string | undefined;
  if (v.baseUrl !== undefined && v.baseUrl !== '') {
    if (typeof v.baseUrl !== 'string') throw new Error('接口地址无效。');
    let url: URL;
    try { url = new URL(v.baseUrl); } catch { throw new Error('接口地址无效。'); }
    // Key 会随请求发出去；只允许加密连接（本机调试的 localhost 例外）。
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error('接口地址必须是 https 开头，否则 API Key 会被明文发出。');
    baseUrl = url.toString().replace(/\/+$/, '');
  }
  if (v.provider === 'custom' && !baseUrl) throw new Error('自定义服务需要填写接口地址。');
  return { provider: v.provider as ProviderId, model: v.model.trim(), apiKey: v.apiKey.trim(), ...(baseUrl ? { baseUrl } : {}) };
}

/** 给界面显示的 Key：只露头尾，中间打码。 */
export function maskKey(key: string): string {
  return key.length <= 8 ? '••••' : `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export type AssistantTool = {
  name: string;
  description: string;
  /** read：只读；propose：只能生成改动提议，必须由读者确认才会写入。没有第三种。 */
  access: 'read' | 'propose';
  resource: (typeof EDITABLE_RESOURCES)[number]['kind'];
};

/**
 * AI 能用的工具，从可编辑内容清单推出来：清单里每一类东西都有“读”；标了 read-write 的再多一个“提议修改”。
 * 新增一类可编辑内容时只需在清单里登记，这里自动多出对应的工具。
 */
export const ASSISTANT_TOOLS: readonly AssistantTool[] = EDITABLE_RESOURCES.flatMap((r) => [
  { name: `read_${r.kind.replace(/-/g, '_')}`, description: `读取：${r.title}（${r.description}）`, access: 'read' as const, resource: r.kind },
  ...(r.ai === 'read-write'
    ? [{ name: `propose_${r.kind.replace(/-/g, '_')}_edit`, description: `提议修改：${r.title}。只生成改前 / 改后的对比，读者同意后才会写入。`, access: 'propose' as const, resource: r.kind }]
    : []),
]);
