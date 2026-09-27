/**
 * @module        讲解区的阅读顺序——把一百多个源码模块排成十来章，给每一篇算出“第几章、上一篇、下一篇”
 * @problem       侧边栏和终端里的讲解区，是照仓库真实的目录排的（app、components、core……）。找文件很方便，
 *                可第一次来读的人不知道从哪读起：按字母顺序，第一篇是 app/layout，那是整本书里最不适合开头的一篇。
 *                一本教材得有章节顺序，还得有每章的导读。
 * @design        章节顺序是内容，写在 content/internals-chapters.json（导读、每章有哪些模块、按什么顺序）。
 *                这里只做两件纯粹的事：
 *                buildChapters 拿章节清单和索引里的全部模块对一遍：清单里写了不存在的模块、同一个模块写了两次，都直接报错；
 *                索引里有、清单里没排的模块，自动收进最后一个“附录：还没排进章节的文件”，新文件永远不会从讲解区消失。
 *                readingPosition 给一个模块算出它在第几章第几篇，以及整本书顺序里的上一篇、下一篇（跨章也接得上）。
 *                侧边栏和终端的目录不变，仍然是仓库的真实结构：终端里 cd 的路径和鼠标点到的地方必须是同一棵树。
 *                阅读顺序是叠在上面的另一种看法，出现在讲解区首页和每篇讲解页的页头、页脚。
 * @courses       UC Berkeley CS61B（列表与映射：把两份清单对上）；UC Berkeley CS61A（数据抽象）；
 *                UC Berkeley CS186 / CMU 15-445（外键检查：引用的东西必须存在）
 * @exercises     https://sp21.datastructur.es/materials/proj/proj2/proj2 —— CS61B Gitlet：同一份数据按不同方式组织和查找
 * @prereq        知道数组有顺序、Map 能按名字找东西。
 * @unclear       章节归属是人排的，排得合不合理只能靠读者读过之后反馈。
 *                附录只是兜底：新加的文件落进附录时，应该找时间把它排进合适的章节，而不是一直放在那儿。
 *
 * @letter
 * 讲解区一直有个毛病：它是按文件夹排的。
 * 按文件夹排，找东西很方便，你知道命令引擎在 core/terminal 底下，一找一个准。可要是从头读，就很别扭了。
 * 第一篇是 app/layout，讲网站最外层的骨架，还没读过命令引擎、没见过“地址栏是唯一真相”，你根本不知道它为什么要那样写。
 *
 * 一本书的目录和一个仓库的目录，本来就是两样东西。仓库按“东西放在哪”分，书按“先懂什么、再懂什么”排。
 * 所以这里没有去动仓库的目录，也没有改侧边栏：终端里 cd 的路径和鼠标点到的地方得是同一棵树，这条规矩不能为了阅读顺序破掉。
 * 阅读顺序是叠在上面的另一层：讲解区首页按章列出来，每一篇的页头告诉你“这是第几章第几篇”，页脚的上一篇、下一篇也照这个顺序走。
 *
 * 章节清单写在 content 里，是内容，不是代码。谁来调整章节，改那个 JSON 就行，不用碰这里。
 * 这里只负责把清单和真实的文件对一遍账，对不上就报错，构建直接失败。
 * 清单里写错一个路径，最糟的结果不是报错，而是那一篇悄悄从目录里少了，谁都不知道。
 *
 * 反过来，新加了一个源文件、忘了往章节里排，这里不报错，而是把它放进最后的附录。
 * 为什么两边宽严不一样？写错路径是“清单说了假话”，必须当场指出来；忘了排是“清单没说全”，文件本身没问题，先让它有个地方待着，读者照样找得到。
 */

export type ChapterSpec = { id: string; title: string; intro: string; modules: string[] };
export type ChapterFile = { intro: string; chapters: ChapterSpec[] };

export type Chapter = ChapterSpec & { number: number; appendix: boolean };

export const APPENDIX_ID = 'appendix';

/** 把章节清单和索引里的全部模块对一遍账。写错、写重就报错；没排进来的收进附录。 */
export function buildChapters(file: ChapterFile, modulePaths: readonly string[]): Chapter[] {
  const known = new Set(modulePaths);
  const seen = new Set<string>();
  const ids = new Set<string>();
  const chapters: Chapter[] = file.chapters.map((spec, index) => {
    if (!spec.id || ids.has(spec.id) || spec.id === APPENDIX_ID) throw new Error(`章节编号无效或重复：${spec.id}`);
    ids.add(spec.id);
    for (const path of spec.modules) {
      if (!known.has(path)) throw new Error(`章节「${spec.title}」里的 ${path} 不是一个存在的源码模块。`);
      if (seen.has(path)) throw new Error(`${path} 被排进了两个位置，一个模块只能出现一次。`);
      seen.add(path);
    }
    return { ...spec, number: index + 1, appendix: false };
  });

  // 索引里有、清单里没排的，按索引原来的顺序收进附录。
  const leftover = modulePaths.filter((path) => !seen.has(path));
  if (leftover.length > 0) {
    chapters.push({
      id: APPENDIX_ID,
      title: '附录：还没排进章节的文件',
      intro: '这些文件是新加的，还没来得及排进上面哪一章。它们照样是正文的一部分，只是还没找到在书里的位置。',
      modules: leftover,
      number: chapters.length + 1,
      appendix: true,
    });
  }
  return chapters;
}

export type ReadingPosition = {
  chapter: Chapter;
  /** 在这一章里是第几篇，从 1 开始。 */
  index: number;
  previous: string | null;
  next: string | null;
};

/** 一个模块在整本书里的位置。上一篇、下一篇按全书顺序走，跨章也接得上。不在任何一章里就是 null。 */
export function readingPosition(chapters: readonly Chapter[], path: string): ReadingPosition | null {
  const order = chapters.flatMap((chapter) => chapter.modules);
  const at = order.indexOf(path);
  if (at < 0) return null;
  const chapter = chapters.find((c) => c.modules.includes(path))!;
  return {
    chapter,
    index: chapter.modules.indexOf(path) + 1,
    previous: at > 0 ? order[at - 1]! : null,
    next: at < order.length - 1 ? order[at + 1]! : null,
  };
}
