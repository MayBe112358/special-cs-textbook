/**
 * @module        AI 助手的设置——各家的 Key、模型、转发地址，以及新对话默认用哪个模型、什么权限
 * @problem       读者自己选模型厂商、自己填 API Key。Key 是钱：谁拿到它，谁就能花你的额度。
 *                它存在哪、怎么检查、会不会跟着备份文件流出去，都要先说清楚，再写聊天功能。
 *                读者还可能在几家之间来回换（今天用 DeepSeek，明天试 Claude），每换一次就重填一遍 Key 很烦。
 * @design        AssistantSettings：一个“当前用哪家”，加上每家各自记住的 Key / 模型 / 转发地址——
 *                像 cc-switch 那样在几份配置之间一键切换，切回来不用重填。
 *                approval 是权限，读者自己选，三档：readonly（只读：AI 拿不到任何改动工具）、
 *                ask（每一处改动都先给对比，点同意才写入）、auto（直接写入，但对话里照样列出改了什么）。默认 ask。
 *                模型和权限在聊天框底部选，跟着每一段对话走（存在对话记录里）；这里的 active / approval
 *                只是“新开一段对话时默认用什么”——也就是你最近一次选的。recent 是最近用过的几个模型，
 *                modelLists 是各家实时拉到的模型列表，聊天框的模型菜单用它们。
 *                设置只存在读者自己的浏览器里（localStorage），不进备份文件——备份可能被发给别人，Key 不该跟着走。
 *                这个网站没有服务器，请求由浏览器直接发给读者选的厂商。
 *                resolveConnection 把设置和厂商预设（providers.ts）合起来，得到这一次真正要连的地址、格式、Key 和模型；
 *                缺什么就说缺什么，不猜。
 * @courses       UC Berkeley CS161 / Stanford CS155（密钥管理、最小权限）；MIT 6.031（规格与校验）
 * @exercises     https://cs161.org/ —— 安全设计原则相关的作业
 * @prereq        知道 API Key 相当于密码；知道 localStorage 只在这台浏览器里。
 * @unclear       Key 存在 localStorage 里是明文。任何能在这个网站上运行脚本的东西（比如一个被篡改的依赖包）都读得到它。
 *                纯静态网站没有更安全的地方可放；请给这个 Key 在厂商后台设一个额度上限。
 *
 * @letter
 * 这个文件里最重要的一个字段是 approval，它只有两个值，但它是整个 AI 功能的“刹车”。
 *
 * 默认是 ask：AI 想改你的任何东西，都得先把“改前 / 改后”摆在你面前，你点了同意才写。
 * 你也可以换成 auto，让它放手去做——这是你的选择，不是我们替你做的决定。
 * 但就算是 auto，它改了什么也会一条条列在对话里，并且写入前仍然核对“改前”是不是还是那个样子，
 * 免得覆盖你刚刚手改的内容（这件事在 core/workspace/workspace.ts 的 applyProposal 里讲过）。
 *
 * 安全课里有句话叫“默认安全”（secure by default）：用户什么都不改的时候，系统应该处在最安全的状态。
 * approval 默认是 ask，就是这句话在这里的样子。
 */

import { PROVIDER_PRESETS, findPreset, type ApiFormat, type ProviderPreset } from './providers.ts';

/** 每家厂商各自记住的设置。 */
export type ProviderProfile = {
  apiKey: string;
  /** 空字符串表示用预设的默认模型。 */
  model: string;
  /** 转发地址或自定义接口地址；空字符串表示用预设的官方地址。 */
  baseUrl: string;
};

export type ApprovalMode = 'readonly' | 'ask' | 'auto';

/** 一次模型选择：哪家的哪个模型。 */
export type ModelChoice = { provider: string; model: string };

export type AssistantSettings = {
  /** 新对话默认用哪家（最近一次选的）。 */
  active: string;
  profiles: Record<string, ProviderProfile>;
  /** 新对话默认的权限（最近一次选的）。 */
  approval: ApprovalMode;
  /** 最近用过的模型，新的在前，最多 6 个。 */
  recent: ModelChoice[];
  /** 各家实时拉到的模型列表。 */
  modelLists: Record<string, string[]>;
};

/** 设置存在浏览器里的位置。只在读者自己的浏览器里，不进备份文件。 */
export const ASSISTANT_SETTINGS_KEY = 'special-cs-textbook:assistant:v2';

export const DEFAULT_SETTINGS: AssistantSettings = { active: 'anthropic', profiles: {}, approval: 'ask', recent: [], modelLists: {} };
const MAX_RECENT = 6;

const EMPTY_PROFILE: ProviderProfile = { apiKey: '', model: '', baseUrl: '' };

export function profileOf(settings: AssistantSettings, id: string): ProviderProfile {
  return settings.profiles[id] ?? EMPTY_PROFILE;
}

/** 接口地址：只允许加密连接（本机调试的 localhost 例外），否则 Key 会被明文发出去。返回去掉结尾斜杠的地址。 */
export function normalizeBaseUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('接口地址无效。'); }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('接口地址必须是 https 开头，否则 API Key 会被明文发出。');
  }
  return url.toString().replace(/\/+$/, '');
}

export function validApiKey(key: string): boolean {
  const k = key.trim();
  return k.length >= 8 && k.length <= 500 && !/\s/.test(k);
}

/** 从浏览器里读出来的设置可能是旧的、坏的：认得的字段留下，认不得的扔掉，不因为一处坏了就全丢。 */
export function parseSettings(value: unknown): AssistantSettings {
  if (!value || typeof value !== 'object') return DEFAULT_SETTINGS;
  const v = value as Record<string, unknown>;
  const active = typeof v.active === 'string' && findPreset(v.active) ? v.active : DEFAULT_SETTINGS.active;
  const approval: ApprovalMode = v.approval === 'auto' || v.approval === 'readonly' ? v.approval : 'ask';
  const profiles: Record<string, ProviderProfile> = {};
  if (v.profiles && typeof v.profiles === 'object') {
    for (const [id, raw] of Object.entries(v.profiles as Record<string, unknown>)) {
      if (!findPreset(id) || !raw || typeof raw !== 'object') continue;
      const p = raw as Record<string, unknown>;
      const str = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
      profiles[id] = { apiKey: str(p.apiKey, 500), model: str(p.model, 200), baseUrl: str(p.baseUrl, 500) };
    }
  }
  const recent: ModelChoice[] = Array.isArray(v.recent)
    ? v.recent.flatMap((r) => (r && typeof r === 'object' && findPreset(String((r as ModelChoice).provider)) && typeof (r as ModelChoice).model === 'string' && (r as ModelChoice).model
      ? [{ provider: (r as ModelChoice).provider, model: (r as ModelChoice).model.slice(0, 200) }] : [])).slice(0, MAX_RECENT)
    : [];
  const modelLists: Record<string, string[]> = {};
  if (v.modelLists && typeof v.modelLists === 'object') {
    for (const [id, list] of Object.entries(v.modelLists as Record<string, unknown>)) {
      if (findPreset(id) && Array.isArray(list)) modelLists[id] = list.filter((m): m is string => typeof m === 'string' && m.length <= 200).slice(0, 500);
    }
  }
  return { active, profiles, approval, recent, modelLists };
}

/** 记下一次模型选择：它成为新对话的默认，并排到“最近用过”的最前面。 */
export function rememberChoice(settings: AssistantSettings, choice: ModelChoice): AssistantSettings {
  const recent = [choice, ...settings.recent.filter((r) => r.provider !== choice.provider || r.model !== choice.model)].slice(0, MAX_RECENT);
  const profile = profileOf(settings, choice.provider);
  return { ...settings, active: choice.provider, recent, profiles: { ...settings.profiles, [choice.provider]: { ...profile, model: choice.model } } };
}

/**
 * 新对话默认用的模型：最近一次选的那家，和它记着的模型（没有就用预设默认）。
 * 那家还没配置好（比如第一次用，刚在设置页填了 DeepSeek 的 Key）：换成最近用过的、或第一家已经能用的，
 * 免得你填完 Key 回到聊天框还看到“未配置”。
 */
export function defaultChoice(settings: AssistantSettings): ModelChoice {
  const ready = (id: string) => providerReady(settings, id);
  const id = ready(settings.active) ? settings.active
    : settings.recent.find((r) => ready(r.provider))?.provider ?? PROVIDER_PRESETS.find((p) => ready(p.id))?.id ?? settings.active;
  const preset = findPreset(id) ?? PROVIDER_PRESETS[0]!;
  const remembered = id === settings.active ? undefined : settings.recent.find((r) => r.provider === id)?.model;
  return { provider: preset.id, model: remembered || profileOf(settings, preset.id).model || preset.defaultModel };
}

/** 这家能不能用：Key 填了、需要转发的填了转发地址、自定义的填了地址。 */
export function providerReady(settings: AssistantSettings, id: string): boolean {
  return resolveConnection(settings, { provider: id, model: 'x' }).ok;
}

/** 这一次真正要连的：哪家、什么格式、哪个地址、哪个模型、哪个 Key。 */
export type Connection = {
  preset: ProviderPreset;
  format: ApiFormat;
  baseUrl: string;
  model: string;
  apiKey: string;
  /** 读者换成了自己的地址（转发或自定义）。 */
  relayed: boolean;
};

export type ConnectionResult = { ok: true; connection: Connection } | { ok: false; reason: string };

/**
 * 合出一次连接。choice 是某段对话自己选的模型；不传就用新对话的默认（最近一次选的）。
 * Key 和地址永远从设置里取——对话记录里不存 Key。
 */
export function resolveConnection(settings: AssistantSettings, choice?: ModelChoice): ConnectionResult {
  const preset = findPreset(choice?.provider ?? settings.active) ?? PROVIDER_PRESETS[0]!;
  const profile = profileOf(settings, preset.id);
  let baseUrl: string;
  try { baseUrl = normalizeBaseUrl(profile.baseUrl) || preset.baseUrl; } catch (e) { return { ok: false, reason: (e as Error).message }; }
  if (!baseUrl) return { ok: false, reason: `「${preset.name}」需要填写接口地址。` };
  if (preset.needsRelay && baseUrl === preset.baseUrl) {
    return { ok: false, reason: `「${preset.name}」不允许网页直接调用，需要在设置里填一个转发地址。` };
  }
  if (!validApiKey(profile.apiKey)) return { ok: false, reason: `还没有填写「${preset.name}」的 API Key（或者看起来不完整）。` };
  const model = choice?.model || profile.model || preset.defaultModel;
  if (!model) return { ok: false, reason: `请为「${preset.name}」选择或填写一个模型。` };
  return { ok: true, connection: { preset, format: preset.format, baseUrl, model, apiKey: profile.apiKey.trim(), relayed: baseUrl !== preset.baseUrl } };
}

/** 给界面显示的 Key：只露头尾，中间打码。 */
export function maskKey(key: string): string {
  return key.length <= 8 ? '••••' : `${key.slice(0, 4)}••••${key.slice(-4)}`;
}
