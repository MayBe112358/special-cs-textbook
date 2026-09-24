/**
 * @module        学习路径页面入口
 * @problem       访问者需要一个固定地址管理自己的路线。
 * @design        构建时只传课程目录，私人路径到浏览器挂载后才读取。
 * @courses       CS50x Web；CS61A 数据边界
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— 页面导航
 * @prereq        静态 HTML 不能包含尚未打开页面的读者的私人数据。
 * @unclear       路径不提供跨设备链接分享，迁移依靠备份。
 * @letter
 * 我把公开课程目录和私人路径的相遇点放在这里。网页可以提前生成，但你的选择不能被提前猜出来。
 * 因此页面只交给编辑器一张公开清单，编辑器打开后再读本机数据，仍然不需要服务器或账号。
 */
import Link from 'next/link';
import {TopBar} from '@/components/top-bar';
import {PathManager} from '@/components/paths/path-manager';
import index from '@/core/knowledge/generated/knowledge-index.json';
export default function PathsPage(){return <><TopBar/><main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-6 md:px-8 md:pt-10">
  <h1 className="text-2xl font-semibold md:text-3xl">我的学习路径</h1>
  <p className="mb-8 mt-2 text-fd-muted-foreground">在课程树上自己组路线：可以有多条，一门课也可以同时出现在多条里。路径只保存在这台浏览器。</p>
  <PathManager courses={index.courses} categories={index.categories.filter(c=>!c.path.startsWith('/internals'))}/>
</main></>;}
