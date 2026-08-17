/**
 * @module        网站根地址的入口页
 * @problem       访问者打开网站根地址时，需要一个明确入口进入当前唯一的文档区域。
 * @design        使用 Next.js 的路由跳转进入 /docs，不复制另一份首页内容。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        网址可以从一个路径跳转到另一个路径。
 * @unclear       正式首页将在对应 ROADMAP 步骤中另行设计。
 *
 * @letter
 * 阶段 1 还没有定义正式首页，因此根地址只负责把你带到文档。这里不提前做欢迎页，是为了让这次验收
 * 聚焦在三栏文档框架；等首页自己的目标出现时，再让它承担真正的介绍任务。
 */
import { redirect } from "next/navigation";
export default function HomePage() { redirect("/docs"); }
