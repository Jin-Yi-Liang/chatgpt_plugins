# v0.3.0 油猴与原生扩展验收

验收日期：2026-10-13（Asia/Shanghai）。源码分支：`feat/tampermonkey`；从本地 `main` 的 `856316b` 创建；实现提交 `246997d`。完整结果及包哈希见 [verification-0.3.0.json](verification-0.3.0.json)。

## 结果

| 运行环境 | 浏览器版本 | 脚本管理器 | 结果 |
| --- | --- | --- | --- |
| Chrome 原生扩展 | Chrome for Testing 156.0.8078.4 | 不适用 | 27/27 |
| Firefox 原生扩展 | Firefox 157.0 | 不适用 | 27/27 |
| Chrome 油猴脚本 | Chrome for Testing 156.0.8078.4 | Tampermonkey 5.5.1 | 27/27 |
| Firefox 油猴脚本 | Firefox 157.0 | Tampermonkey 5.5.0 | 27/27 |

合计 **108/108 组通过**。Firefox web-ext lint：0 错误、0 通知、0 警告。userscript 元信息与运行隔离检查通过。

## 实际运行方式

原生扩展由真实浏览器安装后执行。油猴测试只加载官方 Tampermonkey，未安装本项目原生扩展，通过管理器的 Utilities 文件导入和安装确认页面安装脚本。使用真实 GM 存储、剪贴板和菜单；固定依赖由真实 jsDelivr `@require` 提供，没有模拟 GM API。

Chrome 管理器来自 Google 官方更新服务 CRX，测试中解压并从签名头公钥恢复官方 ID，其实现文件未修改。Firefox 使用 AMO 官方签名 XPI，并按 AMO 文件哈希检查包内容。来源、版本和 SHA-256 同时保存在完整结果中。

两份真实浏览器均采用隔离配置和 headless 进程；会话数据为模拟内容与用户提供的脱敏 DOM。Firefox 的测试副本仅增加本地代理所需的 HTTP 匹配，主代码保持与发布脚本一致；生产版本只匹配 `https://chatgpt.com/*` 与 `https://chat.openai.com/*`。

这些结果证明本版在真实扩展 / 脚本管理器环境中的功能，不等同于新版油猴在登录 ChatGPT 会话上的现场验收。用户对此前 v0.2.0 的现场认可单独记录，不转用为新版现场证据。

## 覆盖

- 标准结构、用户脱敏的新版结构、兼容模式、display:contents 与 main 外轮次。
- 单击首 / 中 / 末条目定位，当前同键节点重建、正向 / 反向滚动、延迟布局重排与替换后校正。
- 窗口化目录自动发现、视图恢复、未渲染消息定位、目录保留与手动滚动接管。
- 真实滚轮浏览导航，上下边界不带动页面；键盘操作。
- 自定义标题、刷新持久化、安全显示、恢复标题、取消编辑。
- 导航删除不影响原始对话，重新发现与刷新后保持删除。
- H1 默认折叠、只读且可定位，没有编辑和删除控件。
- 非连续多选、顺序合并、实际剪贴板粘贴、浏览器实际下载及逐字一致性。
- Markdown 代码 / 表格 / 公式、新版正文边界、生成中与空回复提示。
- SPA 会话切换、历史前进后退、草稿会话迁移、搜索、主题、窄屏、折叠状态及实际 Tampermonkey 菜单。

## 构建与交付一致性

`npm run package` 生成的 userscript 与测试文件 SHA-256 一致，大小 53,592 字节：

```text
815037f5a61cc33aa59f1234242f81ab8a59efdc72a7301ced0a1848b2a9209a
```

两个原生扩展的内容脚本和 manifest 也逐项对照测试报告中的哈希，全部一致。ZIP 的整体哈希见 JSON；ZIP 内部时间戳可能使重新打包后的 ZIP 哈希不同，功能代码与元信息应按对应文件核对。

本地证据目录：

| 路径 | 内容 |
| --- | --- |
| `artifacts/tests/report.json` | 原生扩展 54 组、坐标采样和构建哈希 |
| `artifacts/tests-userscript/report.json` | 真实油猴 54 组、管理器版本、坐标和脚本哈希 |
| 两个测试目录的 `*-clipboard.md` / `*-export.md` | 实际粘贴和下载的内容 |
| 两个测试目录的 PNG | 实际浏览器运行截图 |
| `artifacts/tampermonkey/sources.json` | 官方管理器来源和包哈希 |
| `artifacts/packages/` | 经过核对的 v0.3.0 发布文件 |

## 发布状态

作者已在 Greasy Fork 完成注册和登录。实际发布入口从个人控制台进入 `/zh-CN/script_versions/new`，首次作者用途确认后要求设置安全登录方法。页面提供“验证邮箱并启用 2FA”或“仅第三方登录”两种路径。

自动化已停在该账号步骤；没有修改登录方式、提交脚本或取得公开安装 URL。账号信息截图仅保存在忽略的本地 artifacts 中，不提交到 Git。发布操作交接见 [userscript-publishing.md](userscript-publishing.md)，可直接粘贴的介绍见 [greasyfork-description.md](greasyfork-description.md)。

公开脚本代码核对、从公开安装页在干净 Chrome / Firefox 安装、后续版本更新与存储保留验证，均需在实际发布后执行，当前不记为通过。
