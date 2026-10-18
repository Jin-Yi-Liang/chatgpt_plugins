# 油猴构建、安装与 Greasy Fork 发布

资料及操作核实日期：**2026-10-18**。当前公开版本 **v0.5.0**。

v0.5.0 已完成188组本地验收并发布到原条目600317。支持双击模型公式复制 LaTeX / Markdown，并保留三级目录与远距离定位：

- [公开安装 / 更新页](https://greasyfork.org/zh-CN/scripts/600317-对话导航-chatgpt)
- [直接安装 .user.js](https://update.greasyfork.org/scripts/600317/对话导航%20%C2%B7%20ChatGPT.user.js)
- 旧分支已整合到本地与远程 main（bf78d3e）；新功能分支 `codex/formula-copy` 按本轮要求仅提交本地，未再次合回 main。

已核对公开文件与188组验收文件一致，平台仅补入下载和更新URL。Chrome实际公开升级后保留标题/删除状态，并通过公式双击后的实际Ctrl+V；Firefox公开安装核验通过。本地 SHA-256 为 `71dd4c35f5a256541c7242b11bcab8c4be72c1d5552afbfd38c92533cb3c30c7`。本版证据见 [v0.5.0 验收记录](verification-0.5.0.md)，首次发布历史见 [v0.3.1 记录](verification-0.3.1.md)。

## 1. 安装与分发的关系

| 项目 | 用途 |
| --- | --- |
| Tampermonkey | 安装在 Chrome / Firefox 中，负责运行与更新用户脚本 |
| Greasy Fork | 托管完整脚本、安装入口、版本记录和用户反馈 |
| GitHub | 源码、构建流程、问题反馈；也可独立分发完整 `.user.js` |

用户先装脚本管理器，再安装脚本。见 [Greasy Fork 安装帮助](https://greasyfork.org/zh-CN/help/installing-user-scripts)。本项目只启用 ChatGPT；DeepSeek / Claude 仅预留接口。

## 2. 从源码生成交付文件

需要 Node.js 22+ 与 npm。先取得包含本版分支的源码；远程 main 为已整合的 v0.3.4；本轮 v0.5.0 功能分支暂在本地，当前工作区可直接构建；v0.5.0 可从公开页安装或使用本地文件。以下命令均在项目根目录运行：

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

v0.5.0 的三个发布文件：

```text
artifacts/packages/conversation-navigator-0.5.0.user.js
artifacts/packages/conversation-navigator-chrome-0.5.0.zip
artifacts/packages/conversation-navigator-firefox-0.5.0.zip
```

只上传 `.user.js` 到 Greasy Fork。扩展 ZIP、manifest、`src/content.js` 都不能替代完整用户脚本。生成目录不提交 Git；他人可从源码重建。

## 3. 本地安装油猴版

1. 从 [Tampermonkey 官网](https://www.tampermonkey.net/) 进入 Chrome Web Store 或 Firefox AMO 安装官方管理器。
2. Chrome 如要求授权用户脚本，打开 Tampermonkey 扩展详情中的“允许用户脚本 / Allow User Scripts”。Tampermonkey 5.3+ 与 Chrome 138+ 的说明见 [官方 FAQ Q209](https://www.tampermonkey.net/faq.php?q=Q209)。
3. 停用本项目原生扩展，避免重复注入占用同一个面板。
4. 打开 Tampermonkey 管理面板 → “实用工具 / Utilities” → 从文件导入。
5. 选择完整 `.user.js`，在确认页核对名称“对话导航 · ChatGPT”、版本 `0.5.0`、两个 ChatGPT HTTPS 域名，点击安装。
6. 刷新 ChatGPT 并进入已有会话。面板应显示 `ChatGPT · v0.5.0`。
7. 用无敏感信息的会话检查单击跳转、长目录滚轮、标题保存、导航项删除、H1/H2/H3 逐层折叠目录、多选复制和下载。

另一种安装方式：Tampermonkey 新建脚本，替换编辑器内容为完整构建文件并保存。更新已有副本时在原脚本条目中替换，保持 `@name` 与 `@namespace`，避免创建重复脚本。

原生扩展与油猴、不同浏览器的本地状态独立保存；v0.5.0 没有自动迁移标题或删除状态。

## 4. 本次实现与发布规则

| 能力 | 实现 |
| --- | --- |
| 本地状态 | `GM_getValue` / `GM_setValue`，保持核心代码异步接口 |
| 复制 Markdown | 真实 `GM_setClipboard`；不读取剪贴板 |
| 下载 Markdown | Blob 与浏览器下载；无需 `GM_download` 或白名单配置 |
| 显示 / 收起 | 页面按钮、`Alt + Shift + N`、`GM_registerMenuCommand` |
| 核心功能 | 与 Chrome / Firefox 原生扩展共用导航、目录、H1/H2/H3 与 Markdown 转换 |
| 主代码 | 完整包含在 `.user.js` 中，保持可读，不压缩或混淆 |
| 第三方库 | 固定版本 Turndown 7.2.4 与 turndown-plugin-gfm 1.0.2，通过 jsDelivr `@require` 加载，带 SHA-256 |
| 授权 | 仅上述四个 GM API；匹配仅两个 ChatGPT HTTPS 域名；禁止 frames |

构建时从锁定安装的库文件计算 SHA-256，元信息版本来自 `package.json`。库升级需重新锁定、构建与测试。主脚本当前为 **63,819 字节**。

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
| 原生扩展 | 47/47 通过 | 47/47 通过 |
| Tampermonkey | 5.5.1，47/47 通过 | 5.5.0，47/47 通过 |

共 **188/188 组**，包括单击位置与重排校正、窗口化目录、真实滚轮 / 键盘、标题及删除持久化、只读三级标题、剪贴板实际粘贴、浏览器实际下载及内容一致性、菜单、会话切换、主题和窄屏。web-ext lint 为 0 错误 / 0 通知 / 0 警告。

测试使用隔离真实浏览器与模拟会话、用户提供的脱敏 DOM。Firefox 测试副本仅增加本地代理需要的 HTTP 匹配，正文未修改；生产脚本仅匹配 HTTPS。Chrome 采用官方 CRX 解压并恢复官方扩展 ID，Firefox 采用 AMO 签名 XPI。**这些结果不代表新版油猴已在用户登录 ChatGPT 的会话里现场验收，也不代表已经完成线上安装或更新测试。**

证据：[v0.5.0 验收说明](verification-0.5.0.md)、[可复核数据](verification-0.5.0.json)。完整运行报告位于 `artifacts/tests/report.json` 与 `artifacts/tests-userscript/report.json`。

## 6. 账号准备与实际发布表单

首次发布需要先登录作者账号，平台也可能要求邮箱验证与 2FA，或仅第三方登录。作者已亲自完成必要设置；2026-10-16 已成功进入代码表单并提交。

涉及密码、认证器、恢复信息的步骤应由作者本人执行，不将这些信息放入源码、自动化报告或公开 Issue。

实际创建入口：[创建脚本版本](https://greasyfork.org/zh-CN/script_versions/new)。也可从个人控制台点击“发布您编写的脚本”。新作者如遇用途确认，选择“我编写了一个脚本并且想分享给其他人”。

## 7. 发布与更新流程

1. 在“脚本类型”选择“公开用户脚本”。
2. 将 `artifacts/packages/conversation-navigator-0.5.0.user.js` 的完整内容填入“代码”，不是扩展 ZIP，也不是开发入口。
3. 在“附加信息”选择 **Markdown**，粘贴 [公开介绍](greasyfork-description.md)。
4. “脚本语言”选择“汉语（中国）”，与默认名称、描述和第一份附加信息一致；英文名称由元信息提供。
5. 核对四项 GM 授权、固定依赖、MIT、版本和两个 HTTPS 匹配，首次发布点击“发布脚本”，已有条目从“更新”进入并点击“发布新版本”。如平台出现人机验证，由作者本人处理；本次提交没有出现需人工处理的挑战。
6. 页面跳转到脚本条目 `600317`，检查公开名称、版本 `0.5.0`、许可、适用站点、介绍表格和安装按钮。
7. 下载公开安装文件，与通过测试的文件比较主体代码及版本、匹配、授权、依赖、namespace、许可。元信息中平台增加的更新地址另行记录。
8. 在隔离浏览器配置中安装官方 Tampermonkey，从公开页点击安装并检查管理器中的版本。这一分发链路与本地完整功能验收分别记录，见 [本版验收说明](verification-0.5.0.md)。

本次代码和介绍已经公开。运行截图保存在本地验收材料；浏览器自动化扩展未启用本地文件上传权限，因此公开条目未附截图，发布的代码和说明不受影响。

main 在前次整合中已同步到 `bf78d3e`（v0.3.4）。本轮 v0.5.0 源码按要求保存在本地 `codex/formula-copy` 分支；公开安装文件包含完整主代码，可直接从 Greasy Fork 安装。

## 8. 后续版本更新

1. 在源码修改共享功能或适配层，更新 `package.json` 和锁文件中的版本，补充 CHANGELOG。
2. 构建、运行上面的两套浏览器测试与检查。若修改依赖，重新核对固定版本 / SHA-256。
3. 提交源码、测试及文档到 Git，生成新版本 `.user.js`。
4. 从自己的已有脚本页进入发布新版本，上传完整新文件，填写更新说明；保持 `@name` 和 `@namespace`，不要创建新脚本条目。
5. 在保留旧版标题、删除状态和偏好的浏览器中触发 Tampermonkey 更新；核对新版、状态持久化和核心功能。本轮已验证0.4.0→0.5.0的公开手动升级，不能把该结果等同于已经触发管理器的定时自动更新。
6. 校验线上主代码与经过测试的构建一致，记录版本 / URL / 哈希，更新 README 和发布记录。

本次采用完整代码直接发布，没有配置自动远程同步，也没有主逻辑更新轮询。Greasy Fork / Tampermonkey 负责后续脚本更新地址；见 [官方元信息说明](https://greasyfork.org/zh-CN/help/meta-keys)。

## 9. 发布验证与证据

本地完整功能验收：四种运行环境各47组，共188组通过。独立性能基准命令 `npm run test:performance` 使用真实 Chromium 和 1,500 条固定目录，对照 v0.3.0；结果仅代表目录模块计算，不等同于整页性能。

发布记录、线上主体哈希、公开安装验证和限制汇总在 [v0.5.0 验收说明](verification-0.5.0.md) 与 [JSON 数据](verification-0.5.0.json)。本轮公开手动升级及标题/删除状态保留已验证；管理器定时自动检查周期未单独触发测试。
