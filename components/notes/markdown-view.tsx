/**
 * @module        在浏览器里把你的 Markdown 心得渲染出来——标题、列表、表格、代码高亮、数学公式、流程图
 * @problem       课程页的 Markdown 是构建网站时就渲染好的；你的心得却是你刚刚在浏览器里写下、存在浏览器里的，
 *                构建时根本不存在，只能在浏览器里当场渲染。而且渲染结果要和课程页长得一样，不然同一个网站两种排版。
 * @design        用和课程页同一套工具链（unified：remark 解析 Markdown → rehype 转成 HTML 的结构树），
 *                只是搬到浏览器里跑：remark-gfm 管表格和任务列表，remark-math + rehype-katex 管公式，
 *                最后用 hast-util-to-jsx-runtime 直接变成 React 元素——不经过 HTML 字符串，
 *                所以你在心得里写的 <script> 之类的东西只会原样显示成文字，不会被执行。
 *                代码块交给 Fumadocs 的 DynamicCodeBlock，和课程页的代码块是同一个组件、同一套 VS Code 配色；
 *                ```mermaid 代码块交给和课程页相同的流程图组件。
 * @courses       Stanford CS143 / UC Berkeley CS164（词法分析、语法树、树的变换）；
 *                CS50x Week 8–9（HTML、网页安全：为什么不能把用户输入当 HTML 执行）
 * @exercises     https://web.stanford.edu/class/cs143/ —— 编程作业里的语法分析与语法树
 * @prereq        知道 Markdown 会先被解析成一棵树，再从树生成页面；知道 XSS 是“把别人的文字当代码执行”。
 * @unclear       很长的文档每敲一个字都会整篇重新渲染一次；目前靠“停止输入一小会儿再渲染”缓解，没有做增量渲染。
 *
 * @letter
 * 这个组件是一条小型的编译器流水线，和你在 CS143 里写的那种一模一样：
 * 先把文字解析成一棵语法树（remark-parse），再对树做几次变换（加上表格、公式的节点），
 * 然后把 Markdown 的树翻译成 HTML 的树（remark-rehype），最后生成目标代码——这里的“目标代码”是 React 元素。
 *
 * 为什么最后一步不直接拼一个 HTML 字符串塞进页面？因为那样做，你心得里任何一段像 HTML 的文字都会被浏览器当真。
 * 今天是你自己写的心得，明天可能是你从网上导入的一个 .md 文件，里面藏着一段 <img onerror="...">。
 * 从树直接生成 React 元素，就只会产生我们认得的那几种标签；不认得的，统统当成普通文字。
 * 安全不是事后加一道过滤，而是一开始就选一条不会出事的路。
 */
'use client';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import type { Element, Root } from 'hast';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { useDeferredValue, useMemo, type ReactNode } from 'react';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { bundledLanguages } from 'shiki';
import { unified } from 'unified';
import { Mermaid } from '@/components/diagrams/mermaid';

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkRehype).use(rehypeKatex);

/** 代码块和课程页用同一套 VS Code 配色。 */
const CODE_THEMES = { themes: { light: 'light-plus', dark: 'dark-plus' } } as const;

/** 从 <code class="language-python"> 里取出语言名。 */
function languageOf(node: Element | undefined): string {
  const classes = node?.properties?.className;
  const list = Array.isArray(classes) ? classes.map(String) : [];
  return list.find((c) => c.startsWith('language-'))?.slice('language-'.length) ?? 'text';
}

function textOf(node: Element | undefined): string {
  let out = '';
  const walk = (n: unknown) => {
    const x = n as { type?: string; value?: string; children?: unknown[] };
    if (x.type === 'text') out += x.value ?? '';
    x.children?.forEach(walk);
  };
  walk(node);
  return out.replace(/\n$/, '');
}

/** 单独显示一段代码（导入的代码文件用它）。高亮库不认识的语言按纯文本显示，而不是报错。 */
export function CodeView({ code, lang }: { code: string; lang: string }) {
  const known = lang in bundledLanguages ? lang : 'text';
  return <DynamicCodeBlock lang={known} code={code} options={CODE_THEMES} />;
}

export function MarkdownView({ text }: { text: string }) {
  // 输入很快时先用旧的渲染结果顶着，等手停下来再渲染新的，打字不会卡。
  const deferred = useDeferredValue(text);
  const content = useMemo<ReactNode>(() => {
    const tree = processor.runSync(processor.parse(deferred)) as Root;
    return toJsxRuntime(tree, {
      passNode: true,
      Fragment,
      jsx,
      jsxs,
      components: {
        // 代码块：mermaid 画图，其他交给和课程页相同的代码块组件。
        pre: ({ node }: { node?: Element }) => {
          const code = node?.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code');
          const lang = languageOf(code);
          const source = textOf(code);
          return lang === 'mermaid' ? <Mermaid chart={source} /> : <CodeView code={source} lang={lang} />;
        },
        // 链接一律在新标签页打开：心得里的链接多半指向外部资料，别把你带离正在写的东西。
        a: ({ href, children }: { href?: string; children?: ReactNode }) => (
          <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>
        ),
      },
    });
  }, [deferred]);
  if (deferred.trim() === '') return <p className="text-sm text-fd-muted-foreground">（空文档）</p>;
  return <div className="prose max-w-none">{content}</div>;
}
