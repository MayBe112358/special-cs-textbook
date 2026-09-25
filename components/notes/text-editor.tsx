/**
 * @module        心得文档的编辑器——编辑 / 并排 / 预览三种看法，Ctrl+S 保存
 * @problem       写心得时既要能打字，又要随时看到渲染出来的样子（公式对不对、代码有没有着色）；
 *                读心得时又不想被一个输入框挡着。
 * @design        三种模式，用一组分段按钮切换，记住你上次选的：
 *                - 编辑：只有输入框（等宽字体，Tab 键插入两个空格而不是跳走）；
 *                - 并排：左边写、右边实时预览，宽屏默认用这个；
 *                - 预览：只看渲染结果。
 *                打开一份已有内容的文档时默认是预览，空文档默认是编辑——读的时候不被输入框挡着，写的时候不用先点一下。
 *                改动先进草稿暂存区（drafts.ts），标签上出现圆点；Ctrl+S 或点“保存”才写进浏览器的数据库。
 *                .md 按 Markdown 渲染，认得后缀的代码文件按语言着色，其余原样显示。
 * @courses       Stanford CS147（模式与反馈）；CS50x Week 8（表单与键盘事件）
 * @exercises     https://hci.stanford.edu/courses/cs147/
 * @prereq        知道“受控输入框”：输入框显示的文字来自 React 的 state，每敲一个字都经过 onChange。
 * @unclear       输入框是普通的 textarea，没有行号、没有语法着色、没有查找替换。要做成真正的代码编辑器得引入 CodeMirror 之类的库，
 *                那是一个不小的依赖，先不引。
 *
 * @letter
 * 这里最值得说的是“保存”这件事为什么要你亲手按。
 *
 * 很多笔记软件会自动保存，看起来更省事。但自动保存有一个代价：你永远不知道“现在存下来的是哪个版本”。
 * 写到一半删了一大段、想反悔时，它早就存进去了。VS Code 默认也不自动保存，就是为了让“存”这个动作有意义：
 * 标签上那个圆点告诉你“有东西还没落地”，Ctrl+S 之后圆点消失，你就知道它安全了。
 *
 * 另一个小细节是 Tab 键。浏览器里 Tab 默认是“跳到下一个输入框”，但在写代码块和列表缩进的时候，
 * 你要的是插入缩进。这里拦下了 Tab；想用键盘离开输入框，按 Esc 之后再按 Tab。
 */
'use client';
import { useEffect, useRef, useState } from 'react';
import { languageOf, type NoteItem } from '@/core/workspace/items';
import { CodeView, MarkdownView } from './markdown-view';

export type EditorMode = 'edit' | 'split' | 'preview';
const MODE_KEY = 'special-cs-textbook:editor-mode:v1';
const MODE_LABEL: Record<EditorMode, string> = { edit: '编辑', split: '并排', preview: '预览' };

export function Rendered({ item, text }: { item: NoteItem; text: string }) {
  const lang = languageOf(item.name);
  if (lang === 'markdown') return <MarkdownView text={text} />;
  if (lang === 'text') return <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed">{text}</pre>;
  return <CodeView code={text} lang={lang} />;
}

function readMode(fallback: EditorMode): EditorMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return saved === 'edit' || saved === 'split' || saved === 'preview' ? saved : fallback;
  } catch {
    return fallback;
  }
}

export function TextEditor({ item, text, onChange, onSave, saving }: {
  item: NoteItem;
  text: string;
  onChange: (text: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const empty = (item.text ?? '') === '';
  const [mode, setMode] = useState<EditorMode>(empty ? 'edit' : 'preview');
  const area = useRef<HTMLTextAreaElement>(null);

  // 空文档一打开就能打字；非空文档按你上次选的模式打开（第一次是预览）。
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1024px)').matches;
    setMode(empty ? (wide ? 'split' : 'edit') : readMode('preview'));
  }, [empty, item.id]);
  useEffect(() => { if (mode !== 'preview') area.current?.focus({ preventScroll: true }); }, [mode, item.id]);

  function choose(next: EditorMode) {
    setMode(next);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* 记不住也不影响使用 */ }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      const el = event.currentTarget;
      const { selectionStart: start, selectionEnd: end } = el;
      onChange(text.slice(0, start) + '  ' + text.slice(end));
      requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
    } else if (event.key === 'Escape') {
      event.currentTarget.blur();
    }
  }

  const editor = (
    <textarea
      ref={area}
      value={text}
      spellCheck={false}
      aria-label={`编辑 ${item.name}`}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder={languageOf(item.name) === 'markdown' ? '# 标题\n\n写下这门课让你想明白的事。代码用 ``` 包起来，公式用 $…$。' : ''}
      className="block h-full min-h-[50vh] w-full resize-none bg-transparent p-4 font-mono text-[13.5px] leading-relaxed text-fd-foreground outline-none placeholder:text-fd-muted-foreground/60"
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-fd-border px-3 py-1.5">
        <div className="cs-seg" role="group" aria-label="显示方式">
          {(['edit', 'split', 'preview'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => choose(m)} className={m === 'split' ? 'max-lg:hidden' : ''}>{MODE_LABEL[m]}</button>
          ))}
        </div>
        <button type="button" className="cs-btn cs-btn-primary ml-auto" disabled={saving} onClick={onSave} title="保存（Ctrl+S）">保存</button>
      </div>
      <div className={`grid min-h-0 flex-1 ${mode === 'split' ? 'grid-cols-2 divide-x divide-fd-border' : 'grid-cols-1'}`}>
        {mode !== 'preview' ? <div className="min-h-0 overflow-auto">{editor}</div> : null}
        {mode !== 'edit' ? <div className="min-h-0 overflow-auto px-6 py-5"><Rendered item={item} text={text} /></div> : null}
      </div>
    </div>
  );
}
