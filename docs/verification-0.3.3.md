# v0.3.3 异步定位完成条件修复

日期：2026-10-15，Asia/Shanghai。分支 `fix/navigation-completion`，基于 `77636be`，实现提交 `8171b43`。

## 问题与原因

用户报告 Firefox 导航会移动几秒后停住，但尚未到达目标；重复点击后偶尔成功。检查 v0.3.2 源码后发现，缓存坐标修正之外，定位过程还有以下缺口：

| 旧逻辑 | 导致的失败路径 | 本轮处理 |
| --- | --- | --- |
| 2.4 秒无条件结束 | Firefox 的目标正文仍在异步挂载时，单次请求已停止；下次点击因缓存 / 挂载已推进而可能成功 | 在同一请求中有界等待挂载，最多 12 秒；超时明确提示未完成 |
| 只在第一次使用绝对占位坐标 | 后续占位节点移动后，重试仍按窗口方向逐屏走，可能停在错误窗口 | 区分当前占位与历史提示，持续读取并跟随当前占位位置 |
| H1 暂时不存在就返回 null 并取消 | 回复先挂载、标题稍后出现时，请求静默终止 | 已知消息的 H1 保持等待，待目标出现后继续定位 |
| 校正后立即对齐，但不重置稳定时间 | 网站不断恢复滚动位置时，瞬间对齐被累计成“稳定”，提前结束 | 每次校正、节点变化、目标缺失都重置计时；最后一次校正后持续稳定 350 ms 才完成 |

同时收紧“滚动边界”判定：只有确实到达滚动范围端点且目标与视口相交，才接受不能完全达到顶部偏移的情况。仅仅“这一次没滚动、目标在视口内”不再视为成功。

定位仍允许新点击、滚轮、触摸和滚动按键随时接管。缺失目标的整页收集限制为至少 150 ms 一次，几何校正约每 50 ms 检查，避免延长等待后增加扫描负担。界面区分“正在定位”“已定位”“已停止”和“未完成”。

## 旧版失败复现

1. **真实 Firefox / Tampermonkey，正文延迟 3.4 秒挂载。** 旧 v0.3.2 在 2.4 秒结束，单次点击未完成，等待最终位置的测试失败。报告：`artifacts/navigation-completion-0.3.2-before/report.json`。
2. **真实 Firefox 原生扩展，页面恢复滚动持续 1.9 秒。** 旧版反复校正，却把短暂对齐当成完成。最终目标偏移约 **250.40 px**，应为 **24 px**。报告：`artifacts/navigation-stability-0.3.2-before/report.json`。此测试使用保存的原 v0.3.2 ZIP，不是重新构建的新代码。

这些是能够解释用户症状的可重复失败路径；当前私人 Firefox 会话未直接接入自动化，不把受控复现当成对私人会话的直接操作。

## 新版验收

| 运行方式 | Chrome for Testing 156.0.8078.4 | Firefox 157.0 |
| --- | --- | --- |
| 原生扩展 | 37/37 | 37/37 |
| 官方 Tampermonkey | 5.5.1，37/37 | 5.5.0，37/37 |

共 **148/148 组通过**。保留原有 33 组完整功能覆盖，并新增四组独立异步回归。油猴由真实管理器从 UI 安装，未模拟 GM API，未同时加载本项目原生扩展。

Firefox 油猴实测：

| 场景 | 观测 |
| --- | --- |
| 目标延迟 3.4 秒挂载 | 一次点击，最终顶部偏移 16 px |
| 等待时占位移动约 80,000 px，1.5 秒后挂载 | 一次点击，最终偏移 16 px |
| 回复先出现，H1 约 800 ms 后出现 | 一次点击，最终 H1 偏移约 15.82 px |
| 页面持续 1.9 秒恢复旧滚动位置 | 经历 33 次页面干扰后仍继续校正，一次点击最终偏移约 24.40 px |

前面三组预期偏移为 16 px，最后一组为 24 px，容差均为 3 px。Chrome 与原生扩展的对应场景也通过。用户手动接管、连续点击、默认折叠 H1、删除持久化、标题编辑、搜索、剪贴板粘贴和文件下载均完成回归。

web-ext lint 为 0 错误、0 通知、0 警告；userscript 元信息与隔离检查通过。另执行既有 1,500 条目录模块性能基准及 126 次窗口合并差异检查，结果包含在 JSON 中，不作为整页速度保证。

## 交付与复现

**v0.3.3 已于2026-10-15更新到 Greasy Fork 原条目**：[公开安装 / 更新页](https://greasyfork.org/zh-CN/scripts/600317-对话导航-chatgpt)。线上文件与测试文件一致，平台仅补入下载和更新地址。文件：

```text
artifacts/packages/conversation-navigator-0.3.3.user.js
artifacts/packages/conversation-navigator-chrome-0.3.3.zip
artifacts/packages/conversation-navigator-firefox-0.3.3.zip
```

油猴文件 63,819 字节，SHA-256：

```text
570dc02431c0ddebaab1fd4325634d33da1b44d8be415380e8a34e55eb614c33
```

发布包的主体、manifest 和 userscript 哈希已与本轮测试输出核对。从公开脚本页或油猴管理面板更新到 v0.3.3 后，刷新 ChatGPT 并检查面板版本。

发布后已从公开页验证 Chrome 的 v0.3.2 → v0.3.3 升级：旧版保存的自定义标题及删除状态保留，刷新受控 HTTPS 会话后新版跳转通过。Firefox 的公开安装和管理器版本核验通过。发布检查不重复计入148组功能验收，也不声称操作过用户私人 Firefox 会话。

线上完整 SHA-256 为 `43744ea1f37cd7fc09f023eedd8876832fa03c4fd9f9e5c02c5645ab93de746f`；主体 SHA-256 为 `0b46fbbe92dcc4c64227f7ec1ac55daaf885529f82974e84e29fb544b44f5b26`。去掉平台补入的下载 / 更新元信息后，线上文件与本地文件完全一致。

完整命令及浏览器准备见 README。仅定位新增场景时可用：

```bash
TEST_ONLY_STARTUP=1 TEST_NAVIGATION_CASES=slow,moving,heading,restoration node tests/run.mjs
TEST_RUNTIME=tampermonkey TEST_ONLY_STARTUP=1 TEST_NAVIGATION_CASES=slow,moving,heading,restoration node tests/run.mjs
```

调试命令不代替完整的 `npm test` / `npm run test:userscript`。完整结果、旧版失败、浏览器与管理器版本、最终坐标和交付哈希见 [JSON 证据](verification-0.3.3.json)。
