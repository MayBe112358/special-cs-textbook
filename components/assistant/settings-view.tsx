/**
 * @module        AI 的“Key 与接口”页——每家厂商的 Key、（需要时）转发地址、模型列表、测试连接
 * @problem       第一次用 AI 的读者要在这里完成全部准备：它得告诉你每家去哪申请 Key、哪几家必须填转发地址、
 *                Key 存在哪、会不会被发到别处；填完还得能当场试一下通不通，而不是等到聊天时才报一串看不懂的错。
 * @design        一张竖排的表单，从上到下正好是准备的顺序：厂商 → API Key → 接口地址 → 模型 → 测试。
 *                每家的 Key / 模型 / 地址分开记着，顶上的下拉框只是“正在设置哪一家”，不影响聊天用哪个模型——
 *                聊天用哪个模型、AI 有什么权限，在聊天框底部选（pickers.tsx），跟着每段对话走。
 *                输入即保存（不用另点“保存”），存在这台浏览器的 localStorage 里；Key 默认打码，可以点“显示”。
 *                需要转发地址的厂商（Kimi、Gemini）顶上明确写出原因（浏览器跨域限制）。
 *                “获取模型列表”向厂商实时要一次，拿到的列表存进设置，聊天框的模型菜单里就是最新的模型；拿不到也可以手填。
 *                “测试连接”发一个极小的请求，成功就说成功，失败就把错误说成人话。
 * @courses       Stanford CS147（表单设计、错误预防与恢复）；UC Berkeley CS161（密钥的存放与展示）
 * @exercises     https://hci.stanford.edu/courses/cs147/
 * @prereq        知道 &lt;input type="password"&gt; 只是在屏幕上打码，值本身并没有加密。
 * @unclear       测试连接和获取模型列表会真的向厂商发请求，可能产生极少量费用（一次回复几个字）。
 *
 * @letter
 * 设置页上最容易被忽略、但最重要的是那几行小字：Key 存在哪里、不会进备份、请在厂商后台设额度上限。
 *
 * 为什么要设额度上限？因为这个网站是纯静态的，Key 只能放在你自己的浏览器里，
 * 而浏览器里的东西，理论上任何在这个页面运行的脚本都能读到。我们尽力不让别的脚本进来，
 * 但“尽力”不是“保证”。额度上限是最后一道保险：就算 Key 真的泄露，损失也有个头。
 * 安全课里这叫纵深防御（defense in depth）——不指望任何一道墙永远不倒。
 */
'use client';
import { useState } from 'react';
import { maskKey, profileOf, resolveConnection, type AssistantSettings, type ProviderProfile } from '@/core/assistant/assistant';
import { listModels, testConnection } from '@/core/assistant/clients';
import { PROVIDER_PRESETS, findPreset } from '@/core/assistant/providers';
import { updateSettings, useAssistantSettings } from './settings-store';

function save(change: (s: AssistantSettings) => AssistantSettings, onError: (m: string) => void) {
  try { updateSettings(change); } catch { onError('浏览器不允许保存设置（可能是隐私模式或空间已满），刷新后需要重新填写。'); }
}

export function SettingsView({ onDone }: { onDone: () => void }) {
  const settings = useAssistantSettings();
  // 正在设置哪一家：只是这一页上的选择，不改聊天用的模型。
  const [editing, setEditing] = useState(settings.active);
  const preset = findPreset(editing) ?? findPreset(settings.active)!;
  const profile = profileOf(settings, preset.id);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<'' | 'test' | 'models'>('');
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const error = (text: string) => setMessage({ text, tone: 'error' });

  const setProfile = (patch: Partial<ProviderProfile>) => {
    setMessage(null);
    save((s) => ({ ...s, profiles: { ...s.profiles, [preset.id]: { ...profileOf(s, preset.id), ...patch } } }), error);
  };

  async function run(kind: 'test' | 'models') {
    const choice = { provider: preset.id, model: profile.model || preset.defaultModel };
    const resolved = resolveConnection(settings, choice);
    // 取模型列表时模型可以还没选：先用一个占位名把连接凑齐。
    const conn = resolved.ok ? resolved.connection : kind === 'models' ? (() => {
      const r = resolveConnection(settings, { provider: preset.id, model: choice.model || 'placeholder' });
      return r.ok ? r.connection : null;
    })() : null;
    if (!conn) { error((resolved as { reason: string }).reason); return; }
    setBusy(kind); setMessage(null);
    try {
      if (kind === 'test') setMessage({ text: await testConnection(conn), tone: 'ok' });
      else {
        const list = await listModels(conn);
        save((s) => ({ ...s, modelLists: { ...s.modelLists, [preset.id]: list } }), error);
        setMessage({ text: `拿到 ${list.length} 个模型，聊天框的模型菜单里已经有了。`, tone: 'ok' });
      }
    } catch (e) {
      error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  const choices = settings.modelLists[preset.id] ?? preset.models;
  const label = 'block text-xs font-medium text-fd-foreground';
  const hint = 'text-[11px] leading-relaxed text-fd-muted-foreground';

  return (
    <div className="space-y-4 p-3 text-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs text-fd-muted-foreground">每家的 Key 和地址。聊天用哪个模型、AI 有什么权限，在聊天框底部选。</p>
        <button type="button" className="cs-btn" onClick={onDone}>完成</button>
      </div>

      <div className="space-y-1">
        <label className={label} htmlFor="ai-provider">设置哪一家</label>
        <select id="ai-provider" className="cs-input w-full" value={preset.id}
          onChange={(e) => { setMessage(null); setEditing(e.target.value); }}>
          {PROVIDER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.needsRelay ? '（需转发地址）' : ''}{profileOf(settings, p.id).apiKey ? ' ✓' : ''}</option>
          ))}
        </select>
        <p className={hint}>
          {preset.format === 'anthropic' ? '走 Anthropic 接口格式' : '走 OpenAI 兼容接口格式'}。每家分开记着，✓ 表示已经填了 Key。
        </p>
      </div>

      {preset.needsRelay ? (
        <p className="rounded border border-cs-warn/40 bg-cs-warn/10 p-2 text-[11px] leading-relaxed text-fd-foreground">
          「{preset.name}」的服务器不允许网页直接调用（浏览器的跨域限制，CORS），需要在下面填一个你自己的转发地址（反向代理），格式和官方接口一样。
        </p>
      ) : null}

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <label className={label} htmlFor="ai-key">API Key</label>
          {preset.keyUrl ? <a className="text-[11px] text-fd-primary hover:underline" href={preset.keyUrl} target="_blank" rel="noreferrer noopener">去哪申请 →</a> : null}
        </div>
        <div className="flex gap-1.5">
          <input id="ai-key" className="cs-input min-w-0 flex-1 font-mono text-xs" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false}
            placeholder="粘贴你的 API Key" value={profile.apiKey} onChange={(e) => setProfile({ apiKey: e.target.value.trim() })} />
          <button type="button" className="cs-btn shrink-0" onClick={() => setShowKey((v) => !v)}>{showKey ? '隐藏' : '显示'}</button>
        </div>
        <p className={hint}>
          {profile.apiKey ? `已保存：${maskKey(profile.apiKey)}。` : ''}Key 只存在这台浏览器里，请求由浏览器直接发给{preset.name}，不经过这个网站（它没有服务器），也不会进备份文件。建议在厂商后台给这个 Key 设一个额度上限。
          {profile.apiKey ? <> <button type="button" className="text-cs-error hover:underline" onClick={() => setProfile({ apiKey: '' })}>清除这家的 Key</button></> : null}
        </p>
      </div>

      <div className="space-y-1">
        <label className={label} htmlFor="ai-base">{preset.custom ? '接口地址' : preset.needsRelay ? '转发地址' : '接口地址（可选）'}</label>
        <input id="ai-base" className="cs-input w-full font-mono text-xs" inputMode="url" spellCheck={false}
          placeholder={preset.baseUrl || (preset.format === 'openai' ? 'https://example.com/v1' : 'https://example.com')}
          value={profile.baseUrl} onChange={(e) => setProfile({ baseUrl: e.target.value })} />
        <p className={hint}>
          {preset.custom
            ? preset.format === 'openai' ? '填到版本号那一段，比如 https://example.com/v1，程序会接上 /chat/completions。' : '填到 /v1/messages 之前，比如 https://example.com。'
            : `留空就用官方地址 ${preset.baseUrl}。必须是 https。`}
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <label className={label} htmlFor="ai-model">默认模型</label>
          <button type="button" className="text-[11px] text-fd-primary hover:underline disabled:opacity-50" disabled={busy !== ''} onClick={() => void run('models')}>
            {busy === 'models' ? '正在获取…' : '获取模型列表'}
          </button>
        </div>
        <input id="ai-model" className="cs-input w-full font-mono text-xs" list="ai-model-list" spellCheck={false}
          placeholder={preset.defaultModel || '选择或填写模型名'} value={profile.model} onChange={(e) => setProfile({ model: e.target.value.trim() })} />
        <datalist id="ai-model-list">{choices.map((m) => <option key={m} value={m} />)}</datalist>
        <p className={hint}>{preset.defaultModel ? `留空就用 ${preset.defaultModel}。` : '这家没有预设模型，请先获取模型列表或手动填写。'}模型名更新很快，以“获取模型列表”拿到的为准。</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="cs-btn cs-btn-primary" disabled={busy !== ''} onClick={() => void run('test')}>{busy === 'test' ? '正在测试…' : '测试连接'}</button>
        <span className={hint}>会发一个极小的请求，可能产生很少的费用。</span>
      </div>
      {message ? <p role={message.tone === 'error' ? 'alert' : 'status'} className={`break-words text-xs ${message.tone === 'ok' ? 'text-cs-ok' : 'text-cs-error'}`}>{message.text}</p> : null}

    </div>
  );
}
