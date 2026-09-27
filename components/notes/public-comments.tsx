/**
 * @module        Giscus 公开评论
 * @problem       读者需要公开讨论当前页，但网站保持纯静态，不存储账号和评论数据库。
 * @design        使用 Giscus 官方脚本和仓库 Discussions；按知识路径严格匹配讨论，避免本机地址或 Pages 前缀改变讨论归属。
 * @courses       Harvard CS50x Week 8（网页里嵌入第三方组件）；UC Berkeley CS186（用稳定的键标识数据）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：在静态页面里组合外部资源
 * @prereq        私人心得存在本机；这里的评论存在 GitHub，登录后发布会公开。
 * @unclear       仓库拥有者必须安装 Giscus 应用；真实登录和发帖需用户本人验收，脚本加载成功不等于账户授权完成。
 * @letter
 * 课程页最底下的评论区是 Giscus 提供的，评论其实存在这个项目 GitHub 仓库的 Discussions 里。
 * 网站本身还是纯静态的，没有账号、没有数据库，登录和发帖都由 GitHub 那边处理。
 *
 * 先说清楚一件事：你的私人心得跟这里一点关系都没有。心得只在你自己的浏览器里，不会被同步到 GitHub。
 * 只有你在这个评论框里亲手点了“发布”的内容，才会公开。
 *
 * 有个细节挺容易踩坑：一条评论到底属于哪一页，靠什么认？
 * 最直接的想法是用网址。可同一页在本机调试时是 localhost:3000/docs/...，部署到 GitHub Pages 以后前面又多了一截 /special-cs-textbook，哪天换了域名还会再变。
 * 用网址认的话，这一页的讨论就会散成好几堆。
 * 所以这里用的是课程树里的位置，比如 /programming-intro/cs61a，还要求一字不差地匹配。不管网站部署在哪儿，同一页永远对着同一条讨论。
 *
 * 你从一门课跳到另一门课的时候，这里会把旧的评论框整个拆掉，再给新页面重新加载一个。
 * 不然就可能出现在课程乙底下看到课程甲的讨论。
 *
 * 还有深浅色：评论框跟着网站的主题走，不是跟着你电脑的系统设置走。你在网站里切到深色，评论框也得是深色。
 * 可它住在别人家的 iframe 里，我们改不了它的样式，只能按 Giscus 定好的规矩给它发一条消息，说“换个主题”。
 */
'use client';
import {useEffect,useRef,useState} from 'react';

/** 网站当前是不是深色。Fumadocs 切主题时只改 <html> 上的 class，所以直接看它。 */
function siteTheme(){return document.documentElement.classList.contains('dark')?'dark':'light';}

export function PublicComments({pageId}:{pageId:string}) {
 const container=useRef<HTMLDivElement>(null);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  const target=container.current;if(!target)return;
  setFailed(false);
  const script=document.createElement('script');
  script.src='https://giscus.app/client.js';script.async=true;script.crossOrigin='anonymous';
  const attributes={repo:'MayBe112358/special-cs-textbook','repo-id':'R_kgDOT6Q3QA',category:'Announcements','category-id':'DIC_kwDOT6Q3QM4DF29s',mapping:'specific',term:pageId,strict:'1','reactions-enabled':'1','emit-metadata':'0','input-position':'top',theme:siteTheme(),lang:'zh-CN',loading:'lazy'};
  for(const [name,value] of Object.entries(attributes))script.setAttribute(`data-${name}`,value);
  script.onerror=()=>setFailed(true);target.appendChild(script);
  return ()=>{script.onerror=null;target.replaceChildren();};
 },[pageId]);
 // 网站切换深浅色时，告诉评论框也换。
 useEffect(()=>{
  const observer=new MutationObserver(()=>{
   const frame=container.current?.querySelector<HTMLIFrameElement>('iframe.giscus-frame');
   frame?.contentWindow?.postMessage({giscus:{setConfig:{theme:siteTheme()}}},'https://giscus.app');
  });
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  return ()=>observer.disconnect();
 },[]);
 return <section aria-label="公开评论" className="not-prose mt-12 space-y-2">
  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-fd-border pb-2">
   <h2 id="comments" className="scroll-mt-24 text-xl font-semibold">公开评论</h2>
   <a className="text-xs text-fd-primary hover:underline" href="https://github.com/MayBe112358/special-cs-textbook/discussions" target="_blank" rel="noreferrer">在 GitHub 查看全部讨论</a>
  </div>
  <p className="text-xs text-fd-muted-foreground">用 GitHub 登录后发布，内容公开保存在仓库 Discussions。你在“个人心得”里写的东西不会自动发到这里。</p>
  {failed?<p role="status" className="text-sm text-cs-error">评论加载失败，可以打开 GitHub 讨论区查看。</p>:null}
  <div ref={container} className="giscus"/>
 </section>;
}
