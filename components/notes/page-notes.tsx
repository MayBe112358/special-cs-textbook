/**
 * @module        每页的作者心得与私人心得
 * @problem       作者公开的记录跟着项目走，访问者自己的笔记只在本机；两者必须在来源和界面上分清。
 * @design        构建时从 content/author-notes.json 按知识路径读取作者文字，再接上独立的私人编辑器；内容文件不读浏览器状态。
 * @courses       CS50x Web 开发；CS61A 数据抽象
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 页面组织与公开内容
 * @prereq        同一页可以同时显示公开内容和本机内容，但它们不是同一份数据。
 * @unclear       作者尚未提供逐课心得，空页面如实显示未记录；不由 AI 代编学习经历。
 * @letter
 * 你在这里看到两种“心得”，但它们的主人不同。作者那份是仓库内容，任何人都会读到同样的文字。
 * 你的那份来自当前浏览器，作者和其他访问者都看不到。把两份数据放在不同地方，不只是换两个标题，
 * 而是让清理私人笔记这件事根本碰不到作者文件。页面只负责把它们依次展示出来。
 * 初始作者文字摘自已有项目指导，标出了出处；以后作者真的写下一段学习心得，就在内容文件中补上，
 * 而不是让 AI 冒充作者说自己学会了什么。教材尤其需要诚实地留下这些空白。
 */
import authorNotes from '@/content/author-notes.json';
import {VisitorNotes} from './visitor-notes';
export function PageNotes({pageId}:{pageId:string}) {
  const records=(authorNotes as Record<string,{title:string;source?:string;text:string}[]>)[pageId]??[];
  return <>
    <section aria-label="作者的心得" className="not-prose my-8 border-t border-fd-border pt-6">
      <h2 className="text-xl font-semibold">作者的心得</h2>
      <p className="my-2 text-sm text-fd-muted-foreground">公开内容，随项目保存，所有读者都能看到。</p>
      {records.length===0?<p>作者尚未在这一页记录心得。</p>:records.map((note,index)=><div key={index} className="my-4">
        <h3 className="font-semibold">{note.title}</h3><p className="my-2 whitespace-pre-wrap">{note.text}</p>
        {note.source?<p className="text-sm text-fd-muted-foreground">{note.source}</p>:null}
      </div>)}
    </section>
    <VisitorNotes key={pageId} pageId={pageId}/>
  </>;
}
