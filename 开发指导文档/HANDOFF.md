# HANDOFF.md — 交接文档（2026-09-24）

> 给下一个对话窗口的 AI 看。先读 `PROJECT.md`、`AGENTS.md`、`ROADMAP.md`，再读本文。
> 本文只记录"现在停在哪、没做完什么、有哪些坑"，规矩和阶段划分仍以那三份为准。

---

## 1. 现在停在哪

| 项 | 状态 |
|---|---|
| 最新提交 | `0ee8885 更新阶段14界面样式与可调节阅读布局`（阶段 14 已由作者提交） |
| 进行中 | **阶段 14.5 工作区重构**（ROADMAP 里已写好 8 个步骤和验收项） |
| 代码进度 | 14.5.1～14.5.8 **全部写完**，AI 已用脚本在浏览器里逐项验证通过 |
| 作者验收 | **还没有**。ROADMAP 里 14.5 的验收框一个都没勾 |
| 提交 | **没有提交**。工作区约 37 个文件改动（新增、删除、移动都有） |
| 测试 | `npm test` 136 个全过；`npm run build` 成功（静态导出，心得区为 289 个位置生成了页面） |

**下一个窗口的第一件事**：请作者本地打开验收（见第 4 节），通过后提醒作者提交。不要自己提交，除非作者要求。

---

## 2. 阶段 14.5 做了什么（作者在上一个窗口提出的需求）

作者原话要点：左侧最外层只有三块——**课程目录、学习路径、个人心得**；知识图谱删掉（先修关系在课程页已体现）；
课程页只介绍课程（**学习状态和公开评论留在课程页，作者心得放到心得页**）；心得按课程树排布、能写文档、能导入本地
.md 和代码文件、能画导图；学习路径改成导图（课程方块 + 箭头）；引入 VS Code 式标签页；检查所有可编辑功能并留接口；
将来 AI 像 VS Code 右侧聊天窗口，用户自选模型厂商、自填 API Key，AI 能读能改用户的东西。
作者同意：手机上标签变下拉、导图只能看；可以复用已装好的 Markdown 库；导入文件存 IndexedDB。

### 新的目录结构

```
app/(workbench)/            路由组：三块共用外壳（网址里不出现 (workbench)）
  layout.tsx                TabsProvider + TerminalDock + TopBar + ActivityBar + SidebarSash + AssistantPanel
  docs/                     课程目录（原 app/docs 挪进来）
  paths/                    学习路径（导图版）
  notes/[[...slug]]/        个人心得：/notes/<知识路径>，打开某份心得用 ?item=<编号>
components/workbench/       activity-bar（左侧三图标）、tabs（标签状态）、tab-bar（标签栏/手机下拉）、
                            area-layout（三块共用的 Fumadocs DocsLayout）、drawer-areas、assistant-panel
components/canvas/          canvas-board（通用画布：方块/箭头/拖动/撤销）、canvas-editor（心得导图）
components/notes/           notes-space、text-editor、markdown-view、backup-panel、public-comments
components/paths/           paths-workbench（导图版路径）
components/workspace/       browser-workspace（IndexedDB 实现 + 旧数据自动搬家）、drafts（未保存草稿暂存）
core/workspace/             纯逻辑：canvas、items、learning-paths、diff、backup(第5版)、workspace(统一接口+清单)
core/assistant/assistant.ts AI 的约定：厂商/Key 校验、工具清单（只有 read_ 和 propose_，没有直接写）
lib/notes-tree.ts           课程树换成 /notes 网址
lib/paths-tree.ts           课程树去掉分类页（学习路径区里点分类只展开不跳走）
```

已删除：`app/graph`、`components/graph`、`components/paths/path-manager.tsx`、
`components/notes/{visitor-notes,page-notes,notes-backup}.tsx`。
`core/knowledge/graph.ts` 保留（学习路径“整理布局”复用它的分层排布）。

### 数据

- 学习状态、理解度：仍在 localStorage（终端要同步读）。
- 心得条目（文档/导入文件/导图）、导图版学习路径：IndexedDB，库名 `special-cs-textbook`，表 `items`、`paths`。
- 第一次打开心得区或学习路径区时，`browser-workspace.ts` 把旧版 localStorage 里的心得（`note:v1:`）和路径（`path:`）
  搬进 IndexedDB，**先写新再删旧**。
- 备份：新格式第 5 版（`core/workspace/backup.ts`），仍能导入 1～4 版。旧的 `core/notes/backup.ts`（第 4 版）
  保留，学习状态那一半仍由它写（它有回滚）。
- 界面偏好（不是内容）：侧边栏宽度/终端高度 `layout:v1`、标签列表 `tabs:v1`、编辑器模式、AI 面板开关，都在 localStorage。

### package.json 新增依赖

`hast-util-to-jsx-runtime`、`remark-gfm`、`remark-parse`、`remark-rehype`、`unified`、`shiki`、`@types/hast`（dev）。
都是本来就装在 node_modules 里的传递依赖，只是写成了正式依赖（用 `npm install --offline` 更新了锁文件，没下载）。

---

## 3. 已知的限制 / 可以接着做的事（都没做，要做先问作者）

- 标签页没有快捷键（浏览器占用 Ctrl+Tab/Ctrl+W），不能拖动排序，没有右键菜单。
- 导图：不能多选/框选；手机上没有双指缩放；两个标签页同时改同一张导图，后存的覆盖先存的。
- 文档编辑器是普通 textarea：没有行号、查找替换、语法着色（要做得引入 CodeMirror，属于新依赖，需作者同意）。
- 心得不能在课程之间移动，空间里不能建子文件夹；心得树上看不出哪门课写过心得。
- AI：只有约定和空面板，没有接任何模型，也没有 Key 设置表单（故意的：不能用的功能不先要 Key）。
  部分厂商不允许浏览器跨域直连，将来可能要用户填转发地址（`baseUrl`）。
- Tab 补全遇到多个候选只列出、不补到公共前缀（原有行为，作者没要求改）。
- 首页（ROADMAP 阶段 14 最后一项“陌生人十秒看懂”）还没做：现在 `/` 直接跳到 `/docs`。

---

## 4. 请作者验收的清单（对应 ROADMAP 14.5）

启动：`npm run dev` 后打开 http://localhost:3000/docs/ ，或 `npm run build` 后用静态服务器看 `out/`。
**作者的显示器是 2560×1305**，务必在这个宽度下看，也要用浏览器开发者工具切到手机尺寸看。

1. 左侧三个图标切换三块；当前那块有蓝线；再点一次收起侧边栏。
2. 侧边栏单击课程 → 斜体预览标签；双击标签固定；关标签；刷新后标签还在；手机上变下拉。
3. 课程页：只有介绍 + 我的状态 + 公开评论，没有心得编辑器、没有知识图谱。
4. 心得区：新建文档 → 写 Markdown（代码块、`$公式$`、表格）→ 标签出现圆点 → 切走再切回来草稿还在 → Ctrl+S 保存。
5. 导入 .md 和 .c 文件（拖进去也行），打开时正确着色；.png 被拒并说明原因。
6. 新建导图：双击空白加方块、从右边圆点拖箭头、拖动、Delete 删除、Ctrl+Z 撤销、刷新后还在。
7. 学习路径：新建、从左边课程树拖课程进画布、连箭头、整理布局、复制作者示例、删除确认、双击方块打开课程。
8. 心得首页：导出备份 → 换一个浏览器（或清空数据）→ 导入 → 心得和学习状态都回来。
9. 顶栏右边 AI 面板开关（Ctrl+Alt+I），打开时正文和终端让出位置。
10. 回归清单（ROADMAP 第一部分第 3 条）：终端 ls/cd/cat/open/search 等，在三块里都正常。

---

## 5. 坑（上一个窗口踩过的，别再踩）

1. **内存紧张**。上个窗口的开发服务器被 Claude Code 因内存不足自动停掉过；那之后不要擅自重启长时间运行的服务，
   需要时先问作者，或者用 `npm run build` + 静态服务器验证。
2. **停开发服务器要停干净**：只停 npm 外壳时，`next dev` 的子进程还活着，会占住 `app/` 下的目录导致改名失败
   （Permission denied）。用 PowerShell 找 CommandLine 含项目路径的 node.exe 再 Stop-Process。
3. **静态服务器别在 out/ 里启动**：`cd out && python -m http.server` 会锁住 out，下次 build 报 EBUSY。
   正确做法：在项目根目录 `python -m http.server 3300 --directory out`。
4. **类型检查会报 `.next/types` 里找不到 `app/docs/...`**：那是挪目录前生成的旧文件，重新 build 就好；
   检查时可以 `npx tsc --noEmit -p . | grep -v "^\.next"`。
5. **Bash 工具里的 heredoc 偶尔会因为内容里的引号/反引号报 “unexpected EOF”**，而且一个字都不写。
   大段文件内容用 Write 工具写，别塞进 bash heredoc 或 python -c。
6. **宽屏测试**：之前一直用 1440 宽测，作者的 2560 宽屏上布局是坏的都没发现。改布局后必须同时测 1440、2560 和手机。
7. **标签标题**：换页时新页面的 `<title>` 可能比标签栏知道“换页了”更早到，所以标题按 `window.location` 找标签（已修）。
8. **Fumadocs 的内部结构**：`globals.css` 里用了 `#nd-sidebar > div:first-child`、`[data-sidebar-placeholder]`、
   `--fd-layout-width`、`--fd-banner-height`、`--fd-header-height` 这些 Fumadocs 内部的名字。升级 Fumadocs 后要先看侧边栏、顶栏、标签栏还对不对。
9. **静态导出里读 `?item=` / `?path=` 的组件必须包在 `<Suspense>` 里**，否则 build 失败（已处理）。
10. **本仓库的 Next.js 版本有破坏性变化**，写 Next 相关代码前先读 `node_modules/next/dist/docs/` 里对应的文档（见根目录 AGENTS.md）。

---

## 6. 上个窗口用的验收方法（可以照做）

- 在一个临时目录里 `npm i playwright@1.63.0`，用 `chromium.launch({ channel: 'chrome' })` 调本机 Chrome
  （本机缓存的 Playwright 浏览器版本对不上，直接用系统 Chrome 最省事）。
- 脚本逐项点：新建/编辑/保存/切标签/导入文件（`setInputFiles`）/导图拖动连线/侧边栏拖课程（`locator.dragTo`）/
  备份导出（`waitForEvent('download')`）再在新 context 里导入。每一步打印结果，最后截图人工看一眼。
- 这些脚本在上个窗口的临时目录里，关机后就没了；需要时照上面的思路重写即可。
