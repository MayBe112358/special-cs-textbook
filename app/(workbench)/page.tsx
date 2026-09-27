/**
 * @module        网站根地址——首页，也是标签全关掉之后落脚的地方
 * @problem       以前根地址只做一件事：跳到 /docs。第一次来的人直接掉进课程树，不知道这是什么；
 *                标签全关掉以后也只能回课程目录，没有一个真正的“起点”。
 * @design        首页放进 (workbench) 这个路由组，于是它和三块工作区共用顶栏、活动栏、终端；
 *                左边照常是课程树（和 VS Code 的欢迎页一样，侧边栏不因为到了欢迎页就消失）。
 *                首页自己不占标签：它是“什么都没打开”时看到的那一页（见 components/workbench/tabs.tsx）。
 *                页面内容在 components/home/home.tsx。
 * @courses       CS50x Week 8（HTML、CSS、主页）；Stanford CS147（导航与起点）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/ —— CS50x Homepage：做一个自己的主页
 * @prereq        知道 Next.js 里文件夹名带括号的是“路由组”，括号里的名字不出现在网址里；
 *                所以 app/(workbench)/page.tsx 对应的网址就是根地址 /。
 * @unclear       首页的左边用的是课程目录那棵树；如果将来首页想换成别的侧边栏（比如“最近打开”），改这里。
 *
 * @letter
 * 网站根地址 / 对应的就是这个文件。它很短，只管“首页放在哪儿”，不管“首页长啥样”，长相都在 components/home 里。
 *
 * 它住在 (workbench) 这个路由组里，所以首页和三块工作区共用顶栏、活动栏、终端。左边照样是课程树，就像 VS Code 打开欢迎页时，侧边栏也不会消失。
 *
 * 以前这里只有一句 redirect("/docs")：一进网站就直接跳进课程目录。
 * 那时候的信里说，“等首页有了自己的目标，再让它承担真正的介绍任务”。
 * 后来这个目标有了：让陌生人十秒钟看懂这是什么，让老读者一步回到上次停下的地方。
 */
import { AreaLayout } from '@/components/workbench/area-layout';
import { Home } from '@/components/home/home';
import { source } from '@/lib/source';

export default function HomePage() {
  return (
    <AreaLayout tree={source.getPageTree()}>
      <main className="flex min-w-0 flex-col [grid-area:main]">
        <Home />
      </main>
    </AreaLayout>
  );
}
