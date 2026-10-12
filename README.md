# 对话导航 · ChatGPT

Chrome / Firefox WebExtension：在 ChatGPT 网页右侧显示用户提问目录，支持跳转、自定义导航标题，以及按对话顺序复制或导出所选模型回复的 Markdown。

当前版本 `0.2.0`，支持 `https://chatgpt.com/*` 与旧域名 `https://chat.openai.com/*`。DeepSeek、Claude 的适配接口已预留，当前未启用，也没有申请它们的站点权限。

`0.2.0` 加入窗口化会话的完整目录整理、单击即时定位与布局校正、导航独立滚轮、按会话保存的导航删除，以及默认折叠的回复 H1 子导航。

`0.1.1` 修复了新版 ChatGPT 页面导航为 0 条的问题：同时支持旧的消息角色/轮次标记，以及新页面的 `data-user-message-bubble`、`data-markdown-text-style`、`data-turn-key`。自动模式与兼容模式都支持新结构。导航面板标题下方显示版本，便于确认旧脚本是否已经重新加载。

升级时在 `about:debugging#/runtime/this-firefox` 点击扩展的「重新载入」，再刷新已有的 ChatGPT 标签页。如果是从 ZIP 安装的旧副本，先解压新版并用新版 `manifest.json` 临时载入。无需清除标题和本地存储。

## 安装

已经构建好的版本在 `dist/chrome` 和 `dist/firefox`，无需先安装 Node.js。

### Chrome

1. 打开 `chrome://extensions/`。
2. 启用右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本项目的 **`dist/chrome` 目录**。
4. 打开或刷新 ChatGPT 对话页面。

打包的 ZIP 可以解压后加载；它不是浏览器商店安装包。

### Firefox

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 点击「临时载入附加组件」。
3. 选择 **`dist/firefox/manifest.json`**。
4. 如果浏览器显示站点访问授权，允许扩展访问 ChatGPT，然后打开或刷新对话页面。

Firefox 最低版本为 142。本地版本尚未经过 Mozilla 签名，临时载入会在浏览器重启后卸载；长期安装需要经过签名流程。Chrome 与 Firefox 分开生成 manifest，内容脚本共用同一份代码。

## 使用

- 页面右侧「对话导航」按原始对话顺序列出每一次用户提问。
- 单击标题立即定位到对应提问，并自动校正随后发生的布局变化。点击另一个项目会接管上一跳转；手动滚轮、触摸或滚动键可以随时接管页面。
- 页面只渲染附近消息时，扩展会整理目录，并保留本会话已经识别的提问。首次整理会短暂访问未显示的消息位置后恢复原滚动位置；手动操作可以中断整理。超长会话自动整理最多运行 25 秒，之后滚动会话仍会继续补全目录。
- 将鼠标放在导航面板上使用滚轮，可以上下浏览全部条目，滚到边界不会继续带动会话页面。
- 点击提问右侧的 `×` 删除该导航项目。删除状态按会话保存，刷新、重新识别消息后也不会重新出现；原始提问和模型回答保留。没有手动添加导航项目的功能。
- 点击提问右侧的 `▸` 展开其模型回复中的一级标题（HTML H1 / Markdown `#`）。默认关闭；点击标题可定位到正文。子标题只读，没有改名、删除或选择回复的控件，二级及以下标题不会混入。
- 点击每条右侧的 `✎`，修改标题。点击「保存」或按 `Ctrl/⌘ + Enter` 保存，按 `Esc` 取消；「恢复原提问」取消这一条的自定义标题。
- 搜索同时匹配原始提问和自定义标题。「选中搜索结果」会把当前可见条目加入选区，「全选」选择整个对话，「清空」取消全部选择。
- 勾选需要的条目，点击「复制 Markdown」或「导出 .md」。合并顺序始终按原对话顺序，与勾选顺序无关。一条提问下的多个可见模型回复会连续合并。
- 默认只导出模型回复，以 `---` 分隔；在 `⚙` 设置里开启「导出包含提问 / 自定义标题」，可为每份回复添加二级标题。
- 自定义标题按会话保存，刷新后保留；收起状态、导出标题偏好和兼容模式也会保留。勾选状态只在当前页面会话中保留，刷新或切换对话会清空。
- 点击 `−` 收起，点击「对话导航」按钮展开。浏览器工具栏扩展按钮也可以控制显示 / 收起；页面快捷键为 `Alt + Shift + N`。
- 如果已有消息却未显示条目，在 `⚙` 设置中选择「兼容模式」。自动模式也会在标准角色标记缺失时尝试识别对话轮次和发言者标签。

如果选中的问题还没有模型回复，或最后一份所选回复正在生成，扩展会提示等待或取消勾选，避免误导性的空导出、残缺导出。

## Markdown 与数据边界

支持标题、段落、强调、列表、引用、链接、图片、行内代码、代码块、表格、删除线和 KaTeX 公式。代码块保留语言和换行；内容含反引号时自动加长围栏；表格中的竖线和换行得到转义；LaTeX 公式保留原始语法。导出过滤模型消息操作按钮和已识别的思考过程区域。

导出来源是**本会话已经读取到的页面内容**。对于窗口化页面，扩展短暂访问会话中的位置以读取消息，并在当前页面内存中保留目录及已读取回复，消息退出 DOM 后仍可导航、选择和导出。扩展不调用 ChatGPT 私有 API；服务端尚未加载的历史消息、隐藏分支无法直接取回。图片的远程链接保留在 Markdown 中，不会下载图片，带有效期的图片 URL 可能过期。复杂嵌套表格、图表、Canvas 等非文字内容不保证能够完整还原。

扩展无遥测、无后台服务器、无远程脚本。永久存储仅使用扩展自己的 `storage.local`，保存会话标识、自定义标题、已删除导航项的标识和界面偏好，不永久保存整份提问或回复正文。当前页内存中的目录和回复在刷新后重新读取。用户把完整提问保存为标题时，该标题会进入本地存储。

所需权限：

| 权限 | 用途 |
| --- | --- |
| ChatGPT 两个域名的站点访问 | 自动注入内容脚本、读取当前显示的对话 |
| `storage` | 保存自定义标题、导航删除状态与偏好 |
| `clipboardWrite` | 用户点击按钮后复制 Markdown；不读取剪贴板 |

## 开发与测试

要求 Node.js 22+、npm、`zip`。使用锁文件固定依赖版本。

```bash
npm ci
npm run build
npx playwright install chromium
npm test
npm run lint
npm run package
```

`npm test` 会启动独立配置的 headless Chromium 与 Firefox，实际安装扩展并操作 DOM。Chromium 使用 Playwright 自带的 Chrome for Testing；Firefox 使用 Selenium / GeckoDriver。默认 Firefox 路径适用于当前 Ubuntu Snap 环境；其他环境可指定路径：

```bash
FIREFOX_BINARY=/path/to/firefox GECKODRIVER=/path/to/geckodriver npm test
TEST_BROWSERS=chromium npm test
TEST_BROWSERS=firefox npm test
```

核心测试使用模拟 ChatGPT DOM，并没有伪装成真实网站对话验收：

- Chromium 在 `https://chatgpt.com` 测试地址拦截请求，返回本地夹具，加载**未经修改的生产 manifest**。
- Firefox 安装临时测试包，只增加一个测试用的 `http://chatgpt.com` 匹配规则；生产脚本不改动。独立浏览器配置的 loopback HTTP 代理返回夹具，不向 ChatGPT 发送测试对话。HTTP/HSTS 测试配置仅存在于随后删除的临时配置中。
- 复制测试会通过浏览器快捷键把剪贴板内容粘贴到另一个输入框，再检查实际文字。下载测试读取浏览器保存的 `.md`，与复制内容逐字比较。
- 测试覆盖新消息、生成中与无回复、会话切换、标题持久化、重复问题、兼容模式、草稿迁移、搜索选择、主题、窄屏、收起和工具栏消息。另包含用户提供的脱敏新版 DOM 结构（填入模拟文字），验证无旧角色属性/无 article 的识别、嵌套滚动、正文导出和混合标记去重。
- 新增 12 个长回复的正向/反向滚动页，以及有 16 个提问、DOM 仅挂载附近 4 条的窗口化页。通过实际鼠标点击、浏览器滚轮和键盘滚动验证即时定位、延迟布局校正、全目录保留、滚动隔离、H1 定位、删除持久化、用户接管与原有功能。每个浏览器 27 组。
- Firefox 工具栏页面测试需要 GeckoDriver 的 `--allow-system-access`，仅用于独立测试进程。测试结束后关闭进程并清理临时配置，不修改日常浏览器配置。

报告、截图和 Markdown 样本在 `artifacts/tests/`，交付 ZIP 在 `artifacts/packages/`。

真实网站的独立访问检查另行运行：

```bash
npm run test:live
```

该脚本不拦截请求；真实网页若提供匿名对话输入框，会尝试发送一条无敏感信息的格式测试问题。若要求登录或人机验证，会记录阻塞，不绕过验证。报告在 `artifacts/live/report.json`。本次真实域名访问遇到 Cloudflare 人机验证：已确认扩展注入，登录后的真实对话功能尚未完成验证。

## 结构与新增平台

| 路径 | 职责 |
| --- | --- |
| `src/platforms.js` | 平台适配、消息配对、稳定键、会话标识；包含 DeepSeek / Claude 占位适配器 |
| `src/content.js` | 导航交互、动态观察、跳转、标题编辑、选择与导出 |
| `src/navigation.js` | 新旧 DOM 目标解析、即时滚动、负 scrollTop 和延迟布局校正 |
| `src/inventory.js` | 保留已发现会话项目、窗口顺序合并、H1 子标题与位置提示 |
| `src/discovery.js` | 挂载未显示消息、整理目录、恢复视图及手动中断 |
| `src/panel.css` | Shadow DOM 内样式，深色主题与窄屏布局 |
| `src/markdown.js` | 渲染 DOM 转 Markdown、代码/表格/公式规则 |
| `src/storage.js` | Firefox `browser` / Chrome `chrome` API 统一层 |
| `src/popup.*` | 工具栏弹出页 |
| `scripts/build.mjs` | 生成 Chrome / Firefox MV3 扩展 |
| `tests/run.mjs` | 两个真实浏览器的后台集成测试 |
| `tests/scroll-fixture.mjs` | 长列表与窗口化会话的浏览器回归场景 |

新增平台时实现 `matches(location)`、`collect(document, mode)` 和 `conversationKey(location, turns)`，并将 `enabled` 设为 `true`。每个轮次返回 `{ key, prompt, anchor, answers }`；通用导航与导出层无需重写。随后明确添加该平台的站点权限与真实 DOM 测试。

实现参考：[Chrome 内容脚本](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[Firefox manifest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)、[Playwright 扩展测试](https://playwright.dev/docs/chrome-extensions)、[Selenium Firefox 支持](https://www.selenium.dev/documentation/webdriver/browsers/firefox/)。
