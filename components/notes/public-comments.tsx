/**
 * @module        Giscus 公开评论
 * @problem       读者需要公开讨论当前页，但网站保持纯静态，不存储账号和评论数据库。
 * @design        使用 Giscus 官方脚本和仓库 Discussions；按知识路径严格匹配讨论，避免本机地址或 Pages 前缀改变讨论归属。
 * @courses       CS50x Web 开发；CS186 数据标识
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 在静态页面组合外部资源
 * @prereq        私人心得存在本机；这里的评论存在 GitHub，登录后发布会公开。
 * @unclear       仓库拥有者必须安装 Giscus 应用；真实登录和发帖需用户本人验收，脚本加载成功不等于账户授权完成。
 * @letter
 * 我没有把私人心得拿去同步到 GitHub。公开评论是一份独立数据，只有你在评论框里主动发布的内容才会公开。
 * 页面的身份也不能直接用浏览器网址：本机调试、GitHub Pages 和以后换域名，会让同一页有不同地址。
 * 这里用课程树里的知识路径作讨论标题，并要求严格匹配，因此 /programming-intro/cs61a 始终指向同一页。
 * 每次换页都移除旧评论容器，再为新页面加载脚本，避免在课程乙下面看见课程甲的讨论。
 * GitHub 的仓库和分类编号是公开标识，不是密码；代码里不存登录凭证。登录由 Giscus 与 GitHub 的授权页面处理。
 */
'use client';
import {useEffect,useRef,useState} from 'react';
export function PublicComments({pageId}:{pageId:string}) {
 const container=useRef<HTMLDivElement>(null);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  const target=container.current;if(!target)return;
  setFailed(false);
  const script=document.createElement('script');
  script.src='https://giscus.app/client.js';script.async=true;script.crossOrigin='anonymous';
  const attributes={repo:'MayBe112358/special-cs-textbook','repo-id':'R_kgDOT6Q3QA',category:'Announcements','category-id':'DIC_kwDOT6Q3QM4DF29s',mapping:'specific',term:pageId,strict:'1','reactions-enabled':'1','emit-metadata':'0','input-position':'top',theme:'preferred_color_scheme',lang:'zh-CN',loading:'lazy'};
  for(const [name,value] of Object.entries(attributes))script.setAttribute(`data-${name}`,value);
  script.onerror=()=>setFailed(true);target.appendChild(script);
  return ()=>{script.onerror=null;target.replaceChildren();};
 },[pageId]);
 return <section aria-label="公开评论" className="not-prose my-8 border-t border-fd-border pt-6">
  <h2 className="text-xl font-semibold">公开评论</h2>
  <p className="my-2 text-sm">使用 GitHub 登录后发布，内容公开保存在仓库 Discussions。私人心得不会自动发布到这里。</p>
  {failed?<p role="status">评论加载失败，可打开 GitHub 讨论区查看。</p>:null}
  <div ref={container} className="giscus"/>
  <a className="text-sm underline" href="https://github.com/MayBe112358/special-cs-textbook/discussions" target="_blank" rel="noreferrer">在 GitHub 查看公开讨论</a>
 </section>;
}
