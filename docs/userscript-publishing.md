# 油猴适配与 Greasy Fork 发布指南

资料核实日期：**2026-10-13**。

本文说明怎样把本项目转换成油猴脚本并公开分发。**当前 v0.2.0 仅有 Chrome / Firefox 扩展，尚未实现以下 userscript 入口与构建。** 现有 `npm run build` / `npm run package` 生成的是扩展目录和 ZIP，不能直接上传为油猴脚本。

## 1. 先区分三个角色

| 角色 | 用途 |
| --- | --- |
| Tampermonkey（篡改猴，常称油猴） | 装在浏览器中的用户脚本管理器，安装、运行和更新脚本 |
| Greasy Fork | 发布脚本、提供安装页面、版本记录和反馈 |
| GitHub | 保存源码、构建说明及版本；也可以自行分发完整 `.user.js` |

用户通常先安装脚本管理器，再在脚本页面点击安装。这是 [Greasy Fork 官方安装流程](https://greasyfork.org/zh-CN/help/installing-user-scripts)。

本项目已有页面识别、导航、目录维护和 Markdown 转换。发布页面的操作不复杂，主要工作是增加油猴运行接口和独立构建，并在 Chrome / Firefox 的真实 Tampermonkey 环境重测。

## 2. 发布前需要适配什么

下面是实现准备，不代表这些接口已经写入仓库。

| 当前扩展代码 | 油猴版本应处理的部分 |
| --- | --- |
| `browser/chrome.storage.local` | 增加 `GM_getValue` / `GM_setValue` 存储实现，保持上层异步接口 |
| `clipboardWrite` + Clipboard API | 增加 `GM_setClipboard` 复制实现，验证连续 Markdown 的实际粘贴结果 |
| `runtime.onMessage` 与工具栏 popup | 油猴入口不直接绑定扩展消息；用页面按钮及 `GM_registerMenuCommand` 控制显示 / 收起 |
| `manifest.json` | 用 Userscript 元数据声明名称、版本、站点和所需授权 |
| Chrome / Firefox ZIP | 新增单文件、可读的 `.user.js` 输出 |
| 扩展集成测试 | 保留原测试，再增加“真正安装在 Tampermonkey 中”的验收 |

这些 GM API 的说明见 [Tampermonkey 官方文档](https://www.tampermonkey.net/documentation.php)。现有页面 DOM、跳转、目录、H1 和 Markdown 核心逻辑可以复用；需要适配的是运行环境。不能仅把 `dist/chrome/content.js` 改名成 `.user.js`，因为它仍会调用扩展专用 API。

建议为扩展和油猴保留不同入口 / 运行适配层，继续共用核心代码。油猴版存储和当前扩展存储是不同容器，应明确是否提供迁移，不能默认承诺已有自定义标题会自动转移。

## 3. 准备 `.user.js` 元信息

下面是后续油猴版本的元信息示例，**不是完整脚本，也不是已发布版本**。示例版本 `0.3.0` 需按实际发布版本调整：

```javascript
// ==UserScript==
// @name         对话导航 · ChatGPT
// @namespace    https://github.com/Jin-Yi-Liang/chatgpt_plugins
// @version      0.3.0
// @description  按提问导航 ChatGPT，会话目录、只读一级标题、Markdown 复制和导出
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @license      MIT
// @homepageURL  https://github.com/Jin-Yi-Liang/chatgpt_plugins
// @supportURL   https://github.com/Jin-Yi-Liang/chatgpt_plugins/issues
// ==/UserScript==

// 此处应是经过适配和构建的完整脚本主体，而不是远程主程序加载器。
```

- `@grant` 应与真正使用的接口一致。若后续使用 `GM_download`，再添加对应授权并验证下载；现有 Blob 下载方式也需要在油猴沙箱内测试。
- 保持 `@namespace` / `@name` 的身份稳定，后续修改代码时递增 `@version`。
- 匹配规则只包含已实现的 ChatGPT 站点。DeepSeek / Claude 尚未实现，不加入发布声明。

Greasy Fork 对字段和版本的处理见 [官方元信息说明](https://greasyfork.org/zh-CN/help/meta-keys)，运行授权与加载时机见 [Tampermonkey 元信息文档](https://www.tampermonkey.net/documentation.php)。

## 4. 打包及第三方依赖

1. 增加独立 userscript 构建入口，输出例如 `dist/userscript/chatgpt-conversation-navigator.user.js`。**该路径目前不存在，也没有对应 npm 命令。**
2. 在脚本顶部加入完整元信息，主体不依赖 Node、模块加载器或扩展专用 API。
3. 保留可阅读的输出，不启用代码压缩或混淆。Greasy Fork 允许可读的打包代码，脚本上限为 2 MB。见 [发布规则](https://greasyfork.org/zh-CN/help/code-rules)。
4. 处理 Turndown 和 GFM 插件的来源及 MIT 授权。优先评估允许来源的固定版本 `@require`；如有技术原因必须内嵌，附来源、版本和许可说明，并说明原因。见同一份发布规则。
5. 若引入外部执行代码，按 [Greasy Fork 外部脚本规定](https://greasyfork.org/zh-CN/help/external-scripts) 选择允许的来源或完整性保护方式。不要把主功能写成下载远程代码后执行的壳。

当前扩展构建未压缩，且附带 `THIRD_PARTY_NOTICES.txt`；油猴发布是单个文件，需要把适用的来源与许可信息带入该文件或按平台允许方式引用，不能依赖 ZIP 中的授权附件。

## 5. 在本地验证真正的油猴版本

油猴适配完成后，先测试再发布：

1. 从 [Tampermonkey 官网](https://www.tampermonkey.net/) 进入对应浏览器的官方安装入口，分别安装 Chrome 和 Firefox 版本。
2. 暂停本项目原生扩展，避免两种版本竞争同一个导航根节点，使验收结果混淆。
3. 在 Tampermonkey 控制面板创建新脚本，替换为**完整构建后的 `.user.js`**，保存并启用。
4. 确认匹配站点许可。对于 Tampermonkey 5.3+ 和 Chrome 138+，可在扩展详情中启用“允许用户脚本 / Allow User Scripts”：右键 Tampermonkey 图标 → 管理扩展 → 打开对应开关。官方也提供开发者模式作为另一种授权方式，具体按 [官方 FAQ 的 Q209](https://www.tampermonkey.net/faq.php?q=Q209) 操作。
5. 刷新 ChatGPT，分别执行下面的手动验收。
6. 自动化验收也必须安装 Tampermonkey 和脚本，调用其真实 GM API；仅在页面里伪造 GM 函数，不能作为发布验收。

| 场景 | 预期 |
| --- | --- |
| 已有 / 新会话 | 提问目录正确，切换会话数据隔离 |
| 长会话及窗口化页面 | 单击首、中、末提问；目录不丢项，未渲染项能重新定位 |
| 滚轮和手动接管 | 面板上下滚动正常；定位中手动操作可接管 |
| 标题改名 | 保存、取消、恢复、刷新持久化正常 |
| 删除导航项 | 刷新和重新发现后仍删除，原始对话保留 |
| 回复 H1 | 默认折叠，只显示 H1，两处标题都可跳转；没有编辑 / 删除控件 |
| 复制与导出 | 非连续多选按顺序合并；实际粘贴与下载文件相同 |
| Markdown | 代码、表格、链接和公式保留 |
| 沙箱与权限 | 页面 CSP、不同浏览器的 GM 存储 / 剪贴板 / 下载均工作 |
| 更新 | 更新到新版本后标题、删除状态与偏好仍可读取 |

目前的 54 组扩展测试不能替代这份油猴验收。

## 6. 在 Greasy Fork 发布第一版

完成前面的适配与验收后：

1. 打开 [Greasy Fork](https://greasyfork.org/zh-CN)，注册 / 登录自己的账号。
2. 从个人用户页面进入“发布你编写的脚本 / Publish a script you've written”；常用入口是 [新脚本页面](https://greasyfork.org/zh-CN/scripts/new)，需要先登录。具体控件以登录后页面为准。
3. 创建普通用户脚本，粘贴或导入完整 `.user.js` 内容。不要上传扩展 ZIP、manifest 或仅含元信息的空文件。
4. 检查名称、描述、版本、语言、许可和匹配站点。
5. 填写完整介绍：用途、安装方式、主功能、快捷键、数据存储方式、窗口化整理的行为及限制。
6. 加入无敏感信息的界面截图，并链接到本项目源码和支持入口。
7. 保存 / 发布，处理平台给出的格式或规则提示。发布后仍须遵守平台规则与后续管理要求，不保证固定审核时间或自动通过。
8. 打开生成的脚本页面，检查代码、描述、匹配站点和版本。
9. 用另一份干净浏览器配置，在脚本页点击安装按钮，经 Tampermonkey 安装后验收。不要只验证作者已编辑过的本地副本。
10. 验收通过后，把脚本页链接加到 README 的安装区域，再将该链接发给普通用户。

发布介绍可以按这个提纲填写：

```text
用途：在 ChatGPT 中按提问导航长会话。
功能：单击定位、完整目录、独立滚轮、自定义标题、删除导航项、折叠的回复 H1、Markdown 复制和导出。
使用：安装 Tampermonkey → 安装脚本 → 刷新 ChatGPT → 在右侧操作。
数据：标题、删除状态和偏好保存在脚本管理器本地存储；正文仅在当前页面内存中用于功能。
限制：仅支持 ChatGPT，未加载的服务端历史 / 隐藏分支不能直接取回，页面结构变化可能需要更新。
反馈：浏览器、Tampermonkey / 脚本版本、复现步骤、脱敏截图。
源码：本项目 GitHub 仓库。
```

关于用户从脚本页面安装的步骤，可直接引用 [Greasy Fork 安装帮助](https://greasyfork.org/zh-CN/help/installing-user-scripts)。

## 7. 后续更新与 GitHub 管理

建议 GitHub 作为源码主仓库，Greasy Fork 托管完整可安装脚本：

1. 修改共享代码和必要的适配器。
2. 更新项目 / 脚本版本，重新构建扩展与 userscript。
3. 重跑扩展测试和真实 Tampermonkey 测试。
4. 提交源码、锁文件、构建说明和更新日志到 Git。
5. 在已有 Greasy Fork 脚本条目中提交新版本，保持名称和 namespace 稳定。
6. 确认线上代码确实是刚验证的构建，并测试一次从旧版本更新。
7. 再更新 README 的发布链接和说明。

第一版推荐直接上传完整代码，减少同步配置带来的变量。若后续使用平台同步设置，确认它同步的是完整 `.user.js`，而不是开发入口或远程加载器。Greasy Fork 会处理脚本的更新地址，见 [元信息说明](https://greasyfork.org/zh-CN/help/meta-keys)；不要在主逻辑里另写频繁更新轮询。

也可以只在 GitHub 独立分发完整 `.user.js`，但那是另一种分发方式。不能把 Greasy Fork 上的版本做成指引用户绕开平台实际代码的占位壳，见 [发布规则](https://greasyfork.org/zh-CN/help/code-rules)。

## 8. 发布前核对表

- [ ] 有真正适配后的 `.user.js`，不是改后缀的扩展 bundle。
- [ ] 元信息身份、版本、许可、匹配站点正确。
- [ ] 只声明真正需要的 GM 授权。
- [ ] 输出可读，第三方库来源、版本和授权明确。
- [ ] 发布完整主功能，外部执行代码符合平台规定。
- [ ] Chrome 和 Firefox 的 Tampermonkey 环境均完成真实安装及功能验收。
- [ ] 原生扩展和油猴测试结果分别记录。
- [ ] 描述准确反映行为和限制，截图不含私人聊天。
- [ ] 从线上脚本页完成过一次干净安装与更新验证。
- [ ] README 包含实际安装页链接与源码构建步骤。

本轮只整理了文档及发布流程，没有生成油猴运行版本、注册账号或向 Greasy Fork 提交脚本。
