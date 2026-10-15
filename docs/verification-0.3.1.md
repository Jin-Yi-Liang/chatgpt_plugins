# v0.3.1 长会话与交互优化验收

日期：2026-10-15，Asia/Shanghai。分支 `perf/navigation-experience`，基于油猴版 `b20bc04`，实现提交 `845d2d9`。

## 用户可见改进

目录按稳定消息键保留行节点、勾选和编辑器，回复的一级标题更新或追加提问时，不再销毁标题草稿及光标。展开 / 收起 H1、编辑完成、删除项目和面板收放后，键盘焦点停在可继续操作的控件。

搜索显示“匹配 X / 共 Y 条”，保留跨筛选选择，并提示筛选外已选回复会一并导出。“当前提问”清空筛选并只滚动导航列表，正文位置保持不动。无匹配或全部删除时，按钮和空态与实际状态一致。

目录只在新键或先后关系变化时排序；新键批次插入，定位直接查索引及已挂载窗口范围，避免每帧重新扫描整份目录。

## 复现与完整回归

先用旧 v0.3.0 构建执行新增交互测试，真实 Chromium 中复现：H1 更新后编辑 textarea 被销毁，未保存草稿和选区丢失。失败报告在 `artifacts/optimization-before/report.json`。

随后构建 v0.3.1，在隔离的真实浏览器中执行原有 27 组及新增 4 组：

| 运行方式 | 浏览器 | 管理器 | 结果 |
| --- | --- | --- | --- |
| 原生扩展 | Chrome for Testing 156.0.8078.4 | — | 31/31 |
| 原生扩展 | Firefox 157.0 | — | 31/31 |
| 油猴 | Chrome for Testing 156.0.8078.4 | Tampermonkey 5.5.1 | 31/31 |
| 油猴 | Firefox 157.0 | Tampermonkey 5.5.0 | 31/31 |

共 **124/124 组通过**。油猴通过真实官方管理器导入，未加载本项目原生扩展，不模拟 GM API。web-ext lint 为 0 错误、0 通知、0 警告；userscript 元信息、四项授权、固定依赖与扩展 API 隔离检查通过。

新增场景验证同一 textarea、草稿、光标方向和焦点保留；键盘 Enter / Space / Escape 操作；跨筛选导出内容；全部删除持久化；100 条目录更新及增长到 200 条时原有 100 个行节点、滚动位置和两条勾选全部保留。“当前提问”只滚动目录，不改变正文位置。

组合输入验证使用 `isComposing` KeyboardEvent 测试快捷键边界，没有声称测试了真实操作系统输入法。对话内容采用模拟会话及脱敏 DOM，不声称操作过用户登录 ChatGPT 的私人对话。Firefox 完整功能测试副本仅增加本地代理所需的 HTTP 匹配，主体代码与生产版一致。

## 性能对照

`npm run test:performance` 在真实 Chromium 156 中，对固定 1,500 条 DOM 分别运行基线与候选，采用基线 → 候选 → 候选 → 基线的顺序。这里测量目录模块，排除页面消息收集和 UI 渲染。

| 测量 | v0.3.0 两次样本 | v0.3.1 两次样本 |
| --- | --- | --- |
| 初次合并 1,500 条 | 52.5 / 55.1 ms | 35.6 / 34.8 ms |
| 尾部窗口流式更新 100 次 | 57.4 / 52.7 ms | 35.7 / 33.5 ms |
| 已挂载项目 resolve 100 次 | 72.4 / 72.6 ms | 0.3 / 0.2 ms |
| 无结构变化 merge 10 次的 Array.sort 调用 | 15,000 / 15,000 | 0 / 0 |

测量结果具有机器和负载依赖，不能解释为整页或所有真实会话的固定加速比例。另外执行 126 次窗口合并的差异检查，涵盖重叠 / 断开的窗口、完整顺序、同键节点替换、流式 H1、重复标题、未挂载方向、空窗口、重复键和矛盾顺序的回退，全部通过。

## 发布与代码一致性

2026-10-15 已首次发布：[Greasy Fork 对话导航 · ChatGPT](https://greasyfork.org/zh-CN/scripts/600317-对话导航-chatgpt)，版本 `0.3.1`，MIT，两个 ChatGPT 站点。

本地已验收 `.user.js` 为 61,569 字节，SHA-256：

```text
e12a4dfd348e1c746e43c0252bc6c277a957b0bc110127c53bdb4f8f63e03a5f
```

线上文件完整 SHA-256 为 `d64028ba8ddb8d4dc9ff7c3cdee82cf3b6ebb04c1f3ff6e43ba76b2bf8c15f70`。平台补入 `@downloadURL` / `@updateURL`，因此整文件哈希不同；主体代码逐字一致，版本、匹配、授权、固定依赖、namespace 和许可也逐项一致。主体 SHA-256 为 `83f65797784a154ad5d6899b92beb0bc9b2444b6c9369781caeaf69b93ae6f99`。

公开安装链路由 `npm run test:published` 验证：Chrome 与 Firefox 均从公开页完成实际安装，并确认管理器中的版本为 0.3.1。Chrome 另验证从线上安装的生产脚本在受控 HTTPS 会话显示三条提问并执行跳转；Firefox 此步骤只核对安装链路与管理器版本。结果与范围记录在 JSON；不能把完整模拟会话验收转称为真实登录 ChatGPT 现场验收。未来版本的自动更新和本地状态保留，需要在后续实际更新时测试。

## 证据与复现

- [完整 JSON](verification-0.3.1.json)：两套功能报告、旧版失败、性能对照、交付哈希与发布结果。
- `artifacts/tests/`、`artifacts/tests-userscript/`：实际剪贴板粘贴、下载、截图和每组结果。
- `artifacts/performance/inventory-report.json`：性能原始样本、源码哈希及差异检查。
- `artifacts/publication/`：公开文件、线上核对、发布截图和公开安装报告。

依赖和浏览器准备见 [README](../README.md)。完整复现命令：

```bash
npm ci
npx playwright install chromium
npm test
npm run test:userscript
npm run test:performance
npm run lint
npm run check:userscript
npm run package
```

公开安装配置在已提交的 `tests/published-release.json`，也可通过 `PUBLICATION_LINKS_FILE` 指定另一份 JSON。执行 `npm run test:published` 会启动全新浏览器配置，从公开页点击安装，不能使用作者已编辑过的脚本代替。
