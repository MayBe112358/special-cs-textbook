/**
 * @module        讲解区阅读顺序的测试——清单写错要报、没排的进附录、上一篇下一篇跨章接得上，以及真实清单排全了没有
 * @problem       章节清单是手写的 JSON，一百多个路径，写错一个字母，那一篇就会从目录里悄悄消失。
 * @design        前三个测试用手写的小清单检查规则本身；最后一个测试读真实的 content/internals-chapters.json 和真实的知识索引，
 *                确认每个源码模块都排进了章节、附录是空的。新加文件忘了排，npm test 会提醒你。
 * @courses       UC Berkeley CS61B（测试）；UC Berkeley CS186 / CMU 15-445（引用完整性检查）
 * @exercises     https://sp21.datastructur.es/materials/lab/lab3/lab3 —— CS61B Lab 3：怎么写测试来抓错
 * @prereq        读过 core/knowledge/chapters 那一篇。
 * @unclear       最后一个测试依赖构建时生成的知识索引，没先跑过 npm run index 的话它读不到文件。
 *
 * @letter
 * 前三个测试守规则，最后一个守内容，它俩的分工值得说一下。
 *
 * 规则那几条用的是手写的小清单：两个模块、一章，简单到一眼能看懂。它们检查的是“写错了会不会报”“没排的会不会进附录”“跨章的时候下一篇接不接得上”。
 * 这类测试不会因为今天多写了一个文件就变红，它们只关心规矩本身对不对。
 *
 * 最后那条就不一样了，它直接去读真实的章节清单和真实的索引，检查“每个文件都排进了某一章”。
 * 你新写一个源文件，忘了往章节里排，它就会变红，告诉你是哪个文件。
 * 这其实是把“内容有没有写全”也交给了机器，跟 check-letters 检查“每个文件都有信”是同一个路数。
 * 构建不会因为这个失败（没排的文件会进附录，网站照样能用），但测试会提醒你：书还没排完。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APPENDIX_ID, buildChapters, readingPosition, type ChapterFile } from './chapters.ts';

const file = (chapters: ChapterFile['chapters']): ChapterFile => ({ intro: '', chapters });

test('清单写了不存在的模块、写了两次、章节编号重复，都当场报错', () => {
  assert.throws(() => buildChapters(file([{ id: 'a', title: 'A', intro: '', modules: ['/x'] }]), ['/y']), /不是一个存在的源码模块/);
  assert.throws(() => buildChapters(file([{ id: 'a', title: 'A', intro: '', modules: ['/x', '/x'] }]), ['/x']), /两个位置/);
  assert.throws(() => buildChapters(file([{ id: 'a', title: 'A', intro: '', modules: [] }, { id: 'a', title: 'B', intro: '', modules: [] }]), []), /重复/);
});

test('没排进章节的模块收进附录，按索引原来的顺序', () => {
  const chapters = buildChapters(file([{ id: 'a', title: 'A', intro: '', modules: ['/b'] }]), ['/a', '/b', '/c']);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[1]!.id, APPENDIX_ID);
  assert.deepEqual(chapters[1]!.modules, ['/a', '/c']);
  // 全都排了就没有附录。
  assert.equal(buildChapters(file([{ id: 'a', title: 'A', intro: '', modules: ['/a'] }]), ['/a']).length, 1);
});

test('上一篇、下一篇按全书顺序走，跨章也接得上；第几篇从 1 数起', () => {
  const chapters = buildChapters(file([
    { id: 'a', title: 'A', intro: '', modules: ['/1', '/2'] },
    { id: 'b', title: 'B', intro: '', modules: ['/3'] },
  ]), ['/1', '/2', '/3']);
  const second = readingPosition(chapters, '/2')!;
  assert.equal(second.chapter.id, 'a');
  assert.equal(second.index, 2);
  assert.equal(second.previous, '/1');
  assert.equal(second.next, '/3');
  assert.equal(readingPosition(chapters, '/1')!.previous, null);
  assert.equal(readingPosition(chapters, '/3')!.next, null);
  assert.equal(readingPosition(chapters, '/不存在'), null);
});

test('真实的章节清单：每个源码模块都排进了某一章，没有附录', () => {
  const chaptersFile = JSON.parse(readFileSync(new URL('../../content/internals-chapters.json', import.meta.url), 'utf8')) as ChapterFile;
  const index = JSON.parse(readFileSync(new URL('./generated/knowledge-index.json', import.meta.url), 'utf8')) as { modules: { path: string }[] };
  const chapters = buildChapters(chaptersFile, index.modules.map((m) => m.path));
  const appendix = chapters.find((c) => c.id === APPENDIX_ID);
  assert.equal(appendix, undefined, `这些文件还没排进章节：${appendix?.modules.join('、')}`);
});
