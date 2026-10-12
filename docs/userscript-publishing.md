# 油猴构建、安装与 Greasy Fork 发布

资料及操作核实日期：**2026-10-13**。当前版本 **v0.3.0**。

油猴运行层、完整脚本构建和真实双浏览器验收已完成。代码在本地 `feat/tampermonkey` 分支，从 `main` 的 `856316b` 开始，源码实现提交 `246997d`。本轮没有推送 GitHub，没有合并 main。

**当前尚未发布到 Greasy Fork。** 已登录作者账号，并从个人控制台进入发布入口；平台要求先设置安全登录方法。该账号目前需要完成“邮箱验证 + 2FA”，或按页面流程配置“仅第三方登录”。涉及邮箱确认、认证器和账号凭据的步骤由作者本人完成。没有提交脚本，也没有生成公开安装链接。

## 1. 安装与分发的关系

| 项目 | 用途 |
| --- | --- |
| Tampermonkey | 安装在 Chrome / Firefox 中，负责运行与更新用户脚本 |
| Greasy Fork | 托管完整脚本、安装入口、版本记录和用户反馈 |
| GitHub | 源码、构建流程、问题反馈；也可独立分发完整 `.user.js` |

用户先装脚本管理器，再安装脚本。见 [Greasy Fork 安装帮助](https://greasyfork.org/zh-CN/help/installing-user-scripts)。本项目只启用 ChatGPT；DeepSeek / Claude 仅预留接口。

## 2. 从源码生成交付文件

需要 Node.js 22+ 与 npm。先取得包含本版分支的源码；本地分支尚未推送时，远程克隆无法取得本版实现。以下命令均在项目根目录运行：

```bash
npm ci
npm run build
npm run check:userscript
```

油猴输出：

```text
dist/userscript/chatgpt-conversation-navigator.user.js
```

只构建油猴可用 `npm run build:userscript`。需要同时生成扩展 ZIP 和可分发脚本时，准备系统 `zip` 后执行：

```bash
npm run package
```

v0.3.0 的三个发布文件：

```text
artifacts/packages/conversation-navigator-0.3.0.user.js
artifacts/packages/conversation-navigator-chrome-0.3.0.zip
artifacts/packages/conversation-navigator-firefox-0.3.0.zip
```

只上传 `.user.js` 到 Greasy Fork。扩展 ZIP、manifest、`src/content.js` 都不能替代完整用户脚本。生成目录不提交 Git；他人可从源码重建。

## 3. 本地安装油猴版

1. 从 [Tampermonkey 官网](https://www.tampermonkey.net/) 进入 Chrome Web Store 或 Firefox AMO 安装官方管理器。
2. Chrome 如要求授权用户脚本，打开 Tampermonkey 扩展详情中的“允许用户脚本 / Allow User Scripts”。Tampermonkey 5.3+ 与 Chrome 138+ 的说明见 [官方 FAQ Q209](https://www.tampermonkey.net/faq.php?q=Q209)。
3. 停用本项目原生扩展，避免重复注入占用同一个面板。
4. 打开 Tampermonkey 管理面板 → “实用工具 / Utilities” → 从文件导入。
5. 选择完整 `.user.js`，在确认页核对名称“对话导航 · ChatGPT”、版本 `0.3.0`、两个 ChatGPT HTTPS 域名，点击安装。
6. 刷新 ChatGPT 并进入已有会话。面板应显示 `ChatGPT · v0.3.0`。
7. 用无敏感信息的会话检查单击跳转、长目录滚轮、标题保存、导航项删除、H1 折叠子导航、多选复制和下载。

另一种安装方式：Tampermonkey 新建脚本，替换编辑器内容为完整构建文件并保存。更新已有副本时在原脚本条目中替换，保持 `@name` 与 `@namespace`，避免创建重复脚本。

原生扩展与油猴、不同浏览器的本地状态独立保存；v0.3.0 没有自动迁移标题或删除状态。

## 4. 本次实现与发布规则

| 能力 | 实现 |
| --- | --- |
| 本地状态 | `GM_getValue` / `GM_setValue`，保持核心代码异步接口 |
| 复制 Markdown | 真实 `GM_setClipboard`；不读取剪贴板 |
| 下载 Markdown | Blob 与浏览器下载；无需 `GM_download` 或白名单配置 |
| 显示 / 收起 | 页面按钮、`Alt + Shift + N`、`GM_registerMenuCommand` |
| 核心功能 | 与 Chrome / Firefox 原生扩展共用导航、目录、H1 与 Markdown 转换 |
| 主代码 | 完整包含在 `.user.js` 中，保持可读，不压缩或混淆 |
| 第三方库 | 固定版本 Turndown 7.2.4 与 turndown-plugin-gfm 1.0.2，通过 jsDelivr `@require` 加载，带 SHA-256 |
| 授权 | 仅上述四个 GM API；匹配仅两个 ChatGPT HTTPS 域名；禁止 frames |

构建时从锁定安装的库文件计算 SHA-256，元信息版本来自 `package.json`。库升级需重新锁定、构建与测试。主脚本当前为 **53,592 字节**。

完整元信息请查看构建文件，不要单独复制元信息后发布空壳。`check:userscript` 会检查版本、匹配、四项授权、两个带哈希的依赖及扩展 API / 动态加载器隔离。

规则参考：[Greasy Fork 发布规则](https://greasyfork.org/zh-CN/help/code-rules)、[外部脚本规定](https://greasyfork.org/zh-CN/help/external-scripts)、[允许的 CDN](https://greasyfork.org/zh-CN/help/cdns)、[元信息字段](https://greasyfork.org/zh-CN/help/meta-keys)。GM API 见 [Tampermonkey 文档](https://www.tampermonkey.net/documentation.php)。库的许可来源：[Turndown MIT](https://github.com/mixmark-io/turndown/blob/master/LICENSE)、[GFM 插件 MIT](https://github.com/mixmark-io/turndown-plugin-gfm/blob/master/LICENSE)。

## 5. 真实浏览器发布前测试

准备 Playwright Chromium、系统 Firefox、兼容 GeckoDriver 和系统 `zip` / `curl` / `unzip`。详细路径说明见 [README](../README.md#7-运行真实浏览器测试)。

```bash
npx playwright install chromium
npm test
npm run test:userscript
npm run lint
npm run check:userscript
npm run package
```

`npm test` 安装本项目原生扩展；`npm run test:userscript` 仅安装官方 Tampermonkey，然后通过其管理面板真实导入本项目脚本，没有伪造 GM API。管理器下载来源和包哈希记录在 `artifacts/tampermonkey/sources.json`。

| 运行方式 | Chromium / Chrome for Testing 156.0.8078.4 | Firefox 157.0 |
| --- | --- | --- |
| 原生扩展 | 27/27 通过 | 27/27 通过 |
| Tampermonkey | 5.5.1，27/27 通过 | 5.5.0，27/27 通过 |

共 **108/108 组**，包括单击位置与重排校正、窗口化目录、真实滚轮 / 键盘、标题及删除持久化、只读 H1、剪贴板实际粘贴、浏览器实际下载及内容一致性、菜单、会话切换、主题和窄屏。web-ext lint 为 0 错误 / 0 通知 / 0 警告。

测试使用隔离真实浏览器与模拟会话、用户提供的脱敏 DOM。Firefox 测试副本仅增加本地代理需要的 HTTP 匹配，正文未修改；生产脚本仅匹配 HTTPS。Chrome 采用官方 CRX 解压并恢复官方扩展 ID，Firefox 采用 AMO 签名 XPI。**这些结果不代表新版油猴已在用户登录 ChatGPT 的会话里现场验收，也不代表已经完成线上安装或更新测试。**

证据：[v0.3.0 验收说明](verification-0.3.0.md)、[可复核数据](verification-0.3.0.json)。完整运行报告位于 `artifacts/tests/report.json` 与 `artifacts/tests-userscript/report.json`。

## 6. 作者现在需要完成的账号步骤

当前浏览器已停在首次发布的安全登录要求页。平台提供两条路径：

1. **保留邮箱 / 密码登录**：点击发送验证链接，在自己的邮箱中完成验证；回到 Greasy Fork，点击启用 2FA，按页面指示绑定认证器并妥善保存恢复信息。这些涉及凭据的操作由作者本人执行，不将验证码、密码或恢复码交给自动化。
2. **仅使用第三方登录**：按页面流程添加 GitHub / GitLab / Google 登录，再移除 Greasy Fork 密码。页面显示这条替代路径；采用前请本人确认第三方登录可用，避免失去账号访问。具体授权与登录方式变更由作者本人操作。

账号保护完成后，回到个人控制台点击“发布您编写的脚本”。本次实际入口为 [创建脚本版本](https://greasyfork.org/zh-CN/script_versions/new)。首次作者会先看到用途确认页，选择“我编写了一个脚本并且想分享给其他人”。此前文档中的 `/scripts/new` 链接并非本次有效入口，已经改正。

无需重新构建已验收的 v0.3.0。作者完成账号设置后可继续使用当前登录会话发布。

## 7. 首次发布的完整操作

1. 进入上节实际发布入口，完成作者用途确认。若仍停在安全要求页，先完成账号保护。
2. 选择普通 JavaScript 用户脚本，将 `artifacts/packages/conversation-navigator-0.3.0.user.js` 的**完整内容**粘贴 / 导入代码字段。该字段的具体控件需以安全校验通过后的页面为准；本次尚未进入实际代码表单。
3. 核对从元信息读取的名称、简短描述、版本 `0.3.0`、MIT、ChatGPT 两个站点。只声明已完成的平台能力。
4. 在详细介绍中选择 Markdown（如页面提供该格式），粘贴 [greasyfork-description.md](greasyfork-description.md) 的完整内容。介绍已包含安装、功能、数据、依赖、限制、反馈；不含私人会话。
5. 如页面需要更新说明，填写：`首次发布油猴版：提问导航、自定义及删除导航项、折叠的回复 H1、多选 Markdown 复制和导出。`
6. 检查平台提示，预览介绍并提交发布。平台如要求人工验证或其他账号动作，作者自行完成；不要跳过警告或伪造通过状态。
7. 保存生成的公开脚本页 URL、安装 `.user.js` URL 和版本号。在新窗口中确认公开页可访问、显示版本和绿色安装按钮。平台审核 / 管理状态以实际页面为准，不承诺固定时间。
8. 核对线上代码主体与测试文件一致。Greasy Fork 可能增加 `@downloadURL` / `@updateURL`；记录这些元信息差异，比较主代码及固定依赖，不能仅凭页面版本号就认定文件一致。
9. 分别用干净 Chrome / Firefox 配置安装官方 Tampermonkey，**从公开脚本页点击安装**并核对确认页，然后在 ChatGPT 运行第 3 节的手动验收。这一步验证公开分发链路，不用作者原来的本地副本代替。
10. 完成后把公开安装页链接加进 README，保存线上核对和真实安装证据。当前这几项仍待发布后执行。

GitHub 源码链接仍指向本项目仓库。该本地新分支尚未推送；若希望公众能查看本版对应源码，需由作者把新分支推送后提供分支 / commit 链接，或合并 main 后提供仓库主页。本轮没有执行这类远程操作。

## 8. 后续版本更新

1. 在源码修改共享功能或适配层，更新 `package.json` 和锁文件中的版本，补充 CHANGELOG。
2. 构建、运行上面的两套浏览器测试与检查。若修改依赖，重新核对固定版本 / SHA-256。
3. 提交源码、测试及文档到 Git，生成新版本 `.user.js`。
4. 从自己的已有脚本页进入发布新版本，上传完整新文件，填写更新说明；保持 `@name` 和 `@namespace`，不要创建新脚本条目。
5. 在保留旧版标题、删除状态和偏好的浏览器中触发 Tampermonkey 更新；核对新版、状态持久化和核心功能。这是**待未来更新时执行**的验收，首次发布不能提前声称已通过。
6. 校验线上主代码与经过测试的构建一致，记录版本 / URL / 哈希，更新 README 和发布记录。

本次采用完整代码直接发布，没有配置自动远程同步，也没有主逻辑更新轮询。Greasy Fork / Tampermonkey 负责后续脚本更新地址；见 [官方元信息说明](https://greasyfork.org/zh-CN/help/meta-keys)。

## 9. 当前交付状态

| 项目 | 状态 |
| --- | --- |
| 新分支与油猴实现 | 完成，`feat/tampermonkey` |
| 完整发布文件 / 四项 GM 授权 / 固定依赖 | 完成 |
| 两套真实双浏览器验收 | 108/108 通过 |
| 文档和可直接粘贴的公开介绍 | 完成 |
| Greasy Fork 注册 / 登录 | 作者已完成 |
| 发布所需安全登录配置 | 待作者本人完成 |
| 脚本提交 / 公开安装页 | 尚未执行 |
| 公开安装链路与后续更新验收 | 发布后 / 后续版本执行 |
| GitHub 推送 / main 合并 | 本轮未执行 |
