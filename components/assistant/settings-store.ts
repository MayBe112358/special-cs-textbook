/**
 * @module        AI 设置在浏览器里的存取——读、写、订阅变化
 * @problem       AI 面板、设置页、终端里的 agent 命令都要读同一份设置；在设置页换了厂商，
 *                面板顶上的模型名和终端里下一次对话都要立刻跟着变。
 * @design        设置整份存在 localStorage 的一个键里（core/assistant/assistant.ts 的 ASSISTANT_SETTINGS_KEY），
 *                读出来一律过 parseSettings，坏了也不至于整个打不开。写入后广播一个事件，
 *                useAssistantSettings 用 useSyncExternalStore 订阅它——和学习状态那套“写完喊一声”的做法一样。
 *                另一个标签页改了设置，浏览器自带的 storage 事件也会通知到这里。
 * @courses       CS50x Week 8（浏览器存储）；UC Berkeley CS61A（观察者）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        知道 localStorage 只能存字符串，所以要 JSON 序列化；知道它只在这台浏览器里。
 * @unclear       隐私模式下 localStorage 可能写不进去；那时设置只在这一页有效，刷新就没了，界面会提示。
 * @letter
 * useSyncExternalStore 这个名字有点长，意思是“订阅一份不归 React 管的数据”。
 * 设置存在浏览器里，React 不知道它什么时候变；我们告诉 React 两件事：怎么读当前的值、变了怎么通知你。
 * 剩下的——什么时候重画、别画出一半新一半旧的样子——React 替我们管。
 * 注意 read() 里的缓存：它必须对同一份数据返回同一个对象，否则 React 会以为数据一直在变，陷入无限重画。
 */
'use client';
import { useSyncExternalStore } from 'react';
import { ASSISTANT_SETTINGS_KEY, DEFAULT_SETTINGS, parseSettings, type AssistantSettings } from '@/core/assistant/assistant';

const EVENT = 'special-cs-textbook:assistant-settings';
let cachedRaw: string | null | undefined;
let cached: AssistantSettings = DEFAULT_SETTINGS;

export function readSettings(): AssistantSettings {
  let raw: string | null = null;
  try { raw = localStorage.getItem(ASSISTANT_SETTINGS_KEY); } catch { /* 读不了就用默认值 */ }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try { cached = raw ? parseSettings(JSON.parse(raw)) : DEFAULT_SETTINGS; } catch { cached = DEFAULT_SETTINGS; }
  }
  return cached;
}

/** 写入设置。写不进去（隐私模式、空间满）时抛错，由界面告诉读者。 */
export function writeSettings(next: AssistantSettings): void {
  localStorage.setItem(ASSISTANT_SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

export function updateSettings(patch: (old: AssistantSettings) => AssistantSettings): void {
  writeSettings(patch(readSettings()));
}

function subscribe(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === ASSISTANT_SETTINGS_KEY) listener(); };
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', onStorage); };
}

export function useAssistantSettings(): AssistantSettings {
  return useSyncExternalStore(subscribe, readSettings, () => DEFAULT_SETTINGS);
}
