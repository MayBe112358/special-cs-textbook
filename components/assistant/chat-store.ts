/**
 * @module        AI 对话记录在浏览器里的存取——读、写、删、清空，以及“变了”的通知
 * @problem       对话要在关掉浏览器之后还在；面板和终端各自在写对话，历史列表要看到两边的最新情况。
 * @design        存进和心得同一个 IndexedDB 数据库的 chats 表（components/workspace/browser-workspace.ts 负责建表，
 *                这里借它的连接）。读出来一律过 validateConversation，坏的一段跳过，不让整个历史打不开。
 *                每次写入或删除后广播 CHATS_CHANGED，useConversations 订阅它重新读——和心得那套“写完喊一声”一样。
 *                列表按最后更新时间排，新的在前。
 * @courses       UC Berkeley CS186 / CMU 15-445（持久化存储）；CS50x Week 8（浏览器存储）；UC Berkeley CS61A（观察者）
 * @exercises     https://cs186berkeley.net/
 * @prereq        知道 IndexedDB 是浏览器自带的小数据库，操作都是异步的。
 * @unclear       面板和终端同时开着同一段对话时，谁后存谁的算数，另一边的最新几句可能被覆盖。一般不会这么用。
 * @letter
 * 对话记录和心得住在同一个数据库里，但不走统一编辑接口（core/workspace/workspace.ts）。
 * 那扇门是给“AI 能读能改的东西”准备的，而对话记录是 AI 自己说过的话——让 AI 去改自己的聊天记录，没有意义，也不该有这个口子。
 * 同一个数据库、不同的门：放在哪里是存储的问题，谁能碰是权限的问题，两件事分开想。
 */
'use client';
import { useCallback, useEffect, useState } from 'react';
import { validateConversation, type Conversation } from '@/core/assistant/conversations';
import { getWorkspace } from '@/components/workspace/browser-workspace';

const CHATS_CHANGED = 'special-cs-textbook:chats-changed';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('浏览器本地数据库出错。'));
  });
}

async function store(mode: IDBTransactionMode) {
  const { db } = await getWorkspace();
  const tx = db.transaction('chats', mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('写入没有完成。'));
  });
  return { chats: tx.objectStore('chats'), done };
}

function notify() {
  window.dispatchEvent(new Event(CHATS_CHANGED));
}

export async function listChats(): Promise<Conversation[]> {
  const { chats } = await store('readonly');
  const raw = await request(chats.getAll());
  return raw.flatMap((v) => { try { return [validateConversation(v)]; } catch { return []; } })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function readChat(id: string): Promise<Conversation | null> {
  const { chats } = await store('readonly');
  const raw = await request(chats.get(id));
  try { return raw === undefined ? null : validateConversation(raw); } catch { return null; }
}

export async function writeChat(conversation: Conversation): Promise<void> {
  const { chats, done } = await store('readwrite');
  chats.put(validateConversation(conversation));
  await done;
  notify();
}

export async function writeChats(list: readonly Conversation[]): Promise<void> {
  if (list.length === 0) return;
  const { chats, done } = await store('readwrite');
  for (const c of list) chats.put(validateConversation(c));
  await done;
  notify();
}

export async function deleteChat(id: string): Promise<void> {
  const { chats, done } = await store('readwrite');
  chats.delete(id);
  await done;
  notify();
}

export async function clearChats(): Promise<void> {
  const { chats, done } = await store('readwrite');
  chats.clear();
  await done;
  notify();
}

/** 历史列表用：全部对话，任何地方存了新的都会重新读。 */
export function useConversations() {
  const [list, setList] = useState<Conversation[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setList(await listChats()); setError(''); } catch (e) { setError(e instanceof Error ? e.message : '读不到对话记录。'); }
  }, []);
  useEffect(() => {
    void load();
    const on = () => void load();
    window.addEventListener(CHATS_CHANGED, on);
    return () => window.removeEventListener(CHATS_CHANGED, on);
  }, [load]);
  return { list, error };
}
