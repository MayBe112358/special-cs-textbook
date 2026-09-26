/**
 * @module        注释块检查——每个源码文件顶部都要有完整的结构化注释，@letter 不能是空的
 * @problem       AGENTS.md 里最重要的一条规矩是“注释就是教材正文”，也是最容易被跳过的一条：
 *                功能能跑，少了注释没有任何东西会报错，于是新文件越积越多，教材就悄悄退化成一个普通网站。
 * @design        把这条规矩交给机器守：扫 app、components、core、lib、scripts 下所有 .ts / .tsx，
 *                要求第一个 /** … *\/ 注释块里七个字段都在，而且 @letter 后面真有一段话（至少 20 个字）。
 *                不合格就列出是哪个文件、缺了什么，然后以失败退出——GitHub Actions 看到失败就不让这次提交通过检查。
 *                只查“有没有”，不查“写得好不好”：后者只有人读了才知道。
 * @courses       MIT Missing Semester（自动化与持续集成）；UC Berkeley CS169 / MIT 6.031（代码规范与静态检查）
 * @exercises     https://missing.csail.mit.edu/2020/metaprogramming/ —— 持续集成与构建系统
 * @prereq        知道一个命令以非 0 的退出码结束就表示“失败”，CI 靠它判断这一步过没过。
 * @unclear       字段内容写的是不是真话、@courses 列得全不全，机器判断不了，仍然靠人审。
 *
 * @letter
 * 你可能会觉得奇怪：为注释写一个检查程序，是不是太较真了？
 *
 * 想一想规矩是怎么失效的。没有人会故意不写注释，只是某一次赶时间，“这个文件很小，先不写了”；
 * 下一次看到已经有一个没写的，就觉得再多一个也无妨。规矩不是被推翻的，是被一点点磨掉的。
 * 把它写成一个会失败的检查，意思是：这件事不再依赖任何人记得，而是依赖一台每次都会检查的机器。
 *
 * 这是持续集成（CI）的核心想法。Missing Semester 讲它时举的例子是测试和格式，
 * 这里守的是一本教材的正文——道理一模一样：凡是你希望“每一次”都成立的事，都该交给机器去查。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve('.');
const FOLDERS = ['app', 'components', 'core', 'lib', 'scripts'];
const FIELDS = ['@module', '@problem', '@design', '@courses', '@exercises', '@prereq', '@unclear', '@letter'];
// 生成出来的文件不是人写的，不算教材的一章。
const SKIP = [/\.d\.ts$/, /[\\/]generated[\\/]/];

function collect(directory: string, files: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) collect(absolute, files);
    else if (/\.tsx?$/.test(entry.name) && !SKIP.some((pattern) => pattern.test(absolute))) files.push(absolute);
  }
}

/** 查一个文件，返回它缺了什么；什么都不缺返回空数组。 */
function problemsOf(source: string): string[] {
  // 文件开头可能有 BOM 或 'use client' 之类，注释块不一定在第一个字符，所以找第一个 /**。
  const start = source.indexOf('/**');
  const end = start < 0 ? -1 : source.indexOf('*/', start);
  if (start < 0 || end < 0) return ['顶部没有 /** … */ 注释块'];
  const block = source.slice(start, end);
  const missing = FIELDS.filter((field) => !new RegExp(`${field}\\b`).test(block));
  if (missing.length > 0) return [`缺少字段：${missing.join(' ')}`];
  const letter = block.slice(block.indexOf('@letter') + '@letter'.length).replace(/^\s*\*/gm, '').replace(/\s+/g, '');
  return letter.length < 20 ? ['@letter 是空的或只有一句话'] : [];
}

const files: string[] = [];
for (const folder of FOLDERS) collect(join(ROOT, folder), files);

const failures = files.flatMap((file) => problemsOf(readFileSync(file, 'utf8')).map((problem) => `${relative(ROOT, file).replace(/\\/g, '/')}：${problem}`));
if (failures.length > 0) {
  console.error(`注释块检查没通过（${failures.length} 处）：\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  console.error('每个源码文件都要有完整的注释块，格式见 开发指导文档/AGENTS.md 第 1 节。');
  process.exit(1);
}
console.log(`注释块检查通过：${files.length} 个源码文件都有完整的注释块。`);
