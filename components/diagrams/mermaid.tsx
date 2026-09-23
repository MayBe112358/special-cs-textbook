/**
 * @module        把 MDX 里的 mermaid 代码块画成流程图
 * @problem       有些话画成图比写成段落清楚得多——一条命令从输入到跳转经过哪几步，
 *                用箭头画出来，一眼就看完了。但画图工具都很大（mermaid 解包后有几兆），
 *                如果让每个读者打开任何一页都先下载它，为了少数几张图拖慢整个网站，不划算。
 * @design        只有真正出现流程图的页面才加载 mermaid：用动态 import 把它推迟到组件挂载之后，
 *                没有图的页面连一个字节都不会下载。图在浏览器里画，不在构建时画——
 *                因为配色要跟着深浅主题变，而主题是读者当场选的，构建时还不知道。
 *                画不出来时把原始文字显示出来，不让读者面对一块空白。
 * @courses       Harvard CS50x Week 8（网页与脚本加载）；UC Berkeley CS61A（副作用与时序）；
 *                MIT 6.031 或同类软件构造课（按需加载与失败处理）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 页面脚本与交互
 * @prereq        知道网页打开后还能再去下载别的东西；知道"深色模式"是读者在浏览器里选的，
 *                构建网站的那台机器并不知道他会选哪一种。
 * @unclear       图是在浏览器里画的，所以关掉 JavaScript 就只剩下原始文字。
 *                要做成构建时就画好，需要在构建机器上跑一个无头浏览器，那会让构建重很多，
 *                这一步先不做。
 *
 * @letter
 * 这个组件里最值得说的是那行 `await import('mermaid')`。
 *
 * 平常写 `import mermaid from 'mermaid'` 放在文件开头，意思是"这个文件要用它，先装进来"。
 * 结果是：只要有一个页面用到这个组件，打包工具就会把 mermaid 整个塞进那一份 JavaScript 里，
 * 每个打开网站的人都得先下载。而全站真正有流程图的可能只有三五页。
 *
 * 写成 `await import(...)` 就不一样了——它把"取来"这件事推迟到这行代码真的被执行的时候。
 * 组件没有被渲染，这行就不会跑，mermaid 也就永远不会被下载。
 * 这是同一件事的两种时机：一种在构建时决定，一种在运行时决定。
 * 你学完任何一门讲编译与链接的课（CS61C 后半段、CS143）之后回头看这行，
 * 会发现它其实是"静态链接和动态链接"那个老问题在网页上的样子。
 *
 * 另一件事是主题。这张图的颜色不能在构建时定死，因为深色还是浅色是你在浏览器里当场选的。
 * 所以这里盯着 <html> 上的那个 class，它一变就重画一次。
 * 盯的办法是 MutationObserver——你可以把它理解成"某个东西变了就叫我一声"，
 * 比起每隔一会儿去看一眼（轮询），它既准确又省电。
 *
 * 最后，失败时显示原始文字，不显示空白。这本教材的态度是：
 * 画不出来是画不出来，但你至少该看得见作者想画的是什么。
 */
'use client';
import { useEffect, useId, useState } from 'react';

type Render = { kind: 'loading' } | { kind: 'done'; svg: string } | { kind: 'failed'; reason: string };

export function Mermaid({ chart }: { chart: string }) {
  // useId 保证同一页上的多张图互不撞号；mermaid 要求这个编号能当作 HTML 的 id，所以去掉冒号。
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [dark, setDark] = useState(false);
  const [render, setRender] = useState<Render>({ kind: 'loading' });

  // 主题写在 <html> 的 class 上。它一变就重画，所以这里盯着它，而不是只在挂载时读一次。
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains('dark'));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // 这一行之前，mermaid 一个字节都还没有被下载。
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? 'dark' : 'default',
          // strict：图里的文字一律当文字处理，不当成网页标签执行。
          securityLevel: 'strict',
          fontFamily: 'inherit',
        });
        const { svg } = await mermaid.render(id, chart);
        // 主题在画的过程中又被切走了，这次结果就作废——否则会把旧配色盖在新主题上。
        if (!cancelled) setRender({ kind: 'done', svg });
      } catch (error) {
        if (!cancelled) setRender({ kind: 'failed', reason: error instanceof Error ? error.message : '未知原因' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, dark, id]);

  if (render.kind === 'done') {
    // 这段 SVG 是 mermaid 根据本项目内容文件里的文字画出来的，不是读者输入的东西。
    return <figure className="my-6 overflow-auto" role="img" aria-label="流程图" dangerouslySetInnerHTML={{ __html: render.svg }} />;
  }

  return (
    <figure className="my-6">
      <p className="text-sm text-fd-muted-foreground">
        {render.kind === 'loading' ? '正在绘制流程图……' : `流程图没能画出来（${render.reason}），下面是它的原始描述。`}
      </p>
      {render.kind === 'failed' ? (
        <pre>
          <code>{chart}</code>
        </pre>
      ) : null}
    </figure>
  );
}
