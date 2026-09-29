# HANDOFF.md — 当前交接（2026-09-29）

## 当前状态

- **1.0 已完成**。作者确认验收工作已做过，并授权完成版本发布。
- 阶段 0～15 完成，当前重点是文字深化、资源更新与勘误，按 `1.0.x` 迭代。
- 对外说明以根目录 README 为入口，版本记录见 GitHub Releases；发布基线为 `v1.0.0`。
- 最新提交与部署状态以 Git 和 GitHub Actions 为准。
- 最近一次验证：159 项测试通过、122 个源码文件注释块检查通过、GitHub Pages 构建部署成功。
- 历史交接中的“未提交”“AI 尚未接入”“等待作者验收”已过时。

## 已具备的能力

- 130 门课程、63 个目录，索引包含 126 个源码模块；课程与源码双向关联，讲解区按章节阅读。
- 工作区包含课程目录、学习路径、个人心得，支持标签拖动、预览标签、右键操作和刷新恢复。
- 终端、静态搜索、学习状态、理解度、Markdown 心得、文件导入、导图、心得移动、备份导入导出。
- AI 助手支持多厂商配置、对话历史、模型与权限选择、改动确认、终端 `agent`，Key 保存在读者浏览器。
- README、贡献指南、MIT 许可证、自动检查与 Pages 部署已配置。

## 验收与维护约定

作者已确认完成验收；本记录依据作者确认，不新增逐厂商、逐浏览器的测试结果。
旧路线图中的历史复选框不是待办。后续只检查改动及其影响范围。

文字深化、链接更新、勘误和兼容修复使用 `1.0.x`；新增兼容功能使用 `1.x.0`。
日常修改正常提交和部署，积累一批后再发布版本。新增功能和架构调整仍由作者决定。
仓库只提交源码、教材内容和必要项目文件；构建产物、缓存、日志、临时截图和本地配置不提交。

## 已知使用边界

- 个人数据保存在浏览器，跨设备通过备份导出导入；没有账号或云同步。
- 手机导图只读；导图不支持多选，同一导图在多个标签页同时修改时后存覆盖先存。
- 文档编辑器为 textarea；空间不能创建子文件夹。
- 部分模型接口需要读者配置转发地址；厂商可用性以实际接口为准。

## 部署与验证

`npm test` 会先通过 `pretest` 生成知识索引，解决干净 CI 环境缺少索引的问题。
`npm run check:letters` 检查注释块；`npm run build` 做类型检查和静态导出。
推送 `main` 后，GitHub Actions 依次检查、构建并部署；失败时查看日志，不绕过检查。

以下保留历史排障经验，按当前环境选用。

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
