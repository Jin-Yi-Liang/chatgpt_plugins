# v0.3.2 跳转与长会话启动修复

日期：2026-10-15，Asia/Shanghai。分支 `fix/userscript-navigation`，基于 `808f503`，实现提交 `94dbee2`。

## 问题与证据

用户报告 Firefox 能显示全部提问和 H1，但多数点击不跳转、偶尔成功且没有报错；Chrome 能跳转，首次进入已有长会话时明显缓慢。访问许可问题已由用户解决，不再作为本轮原因。

只读检查真实 Chrome 页面的滚动容器高度为 267,724 px。用户提供的 Firefox 只读统计为 263,077 px，版本 0.3.1、Tampermonkey、目录整理已 complete。没有把私人聊天正文写入测试材料。

定位到两个失败路径，并用旧构建复现：

1. **误触发目录整理。** 页面保留 `[&_[data-virtualized-turn-content]]:[content-visibility:visible]` 样式类名，但消息正文已经存在。旧版仅凭类名判断需要发现消息，随后逐视口走遍完整回复，制造布局和渲染开销。真实 Chromium 的旧构建启动测试返回 `running`，无法满足“完整会话不扫页”。
2. **窗口化位置提示过期。** 消息离开 DOM 后保留的是历史坐标；长回复重排后，占位节点位置可能移动几十万像素。旧版仍从历史坐标逐屏寻找，耗尽一次定位预算。真实 Firefox 157 / Tampermonkey 5.5.0 中，旧 v0.3.1 在重排回归中单击提问无法到达目标，测试超时失败。

Firefox 的复现验证了一个能造成用户所述症状的具体路径；并非把“无报错”本身当成根因证据。

## 修复

- 目录整理根据是否有真实未识别的消息占位节点决定，移除样式类名误判和完整回复的逐视口遍历。
- 缓存消息所在占位节点的身份。目标正文卸载后，读取当前占位节点的几何位置，再等待实际正文挂载，供提问和 H1 共用。
- 排除无实际尺寸的目标，避免把空布局框当成可以直接定位的消息。
- 点击时按需更新缺失目标，已有节点无需全量收集对话；一次定位期间缓存滚动容器，约每 50 ms 检查布局校正。
- 用户中断整理时立即恢复正文显示；整理自身负责消息收集，避免并发执行重复的整页刷新。

## 真实浏览器结果

| 运行方式 | Chrome for Testing 156.0.8078.4 | Firefox 157.0 |
| --- | --- | --- |
| 原生扩展 | 33/33 | 33/33 |
| 官方 Tampermonkey | 5.5.1，33/33 | 5.5.0，33/33 |

合计 **132/132 组通过**，其中包含原有导航、复制、下载、删除、标题持久化、H1、键盘和滚轮等 31 组，以及两个本轮新增回归。油猴环境真实安装官方管理器并从 UI 导入脚本，未同时安装本项目原生扩展，也未模拟 GM 函数。

新增用例与观测：

- 约 26 万像素高、内容完整但保留虚拟样式标记的会话：不启动目录扫描，正文初始位置保持；首个提问点击立即对齐，H1 点击也可定位。
- 在已缓存 16 个窗口化提问后，将前 8 个消息占位高度扩展为各 30,000 px：不补点即可定位已卸载的提问，以及另一窗口中的第二个 H1；目录仍保留 16 条。
- Chrome 油猴版首个点击事件到下一动画帧约 **10.7 ms**，目标距滚动容器顶部 **23.875 px**，符合 24 px 预期。
- 重排后，Firefox 油猴版提问偏移 **16 px**、H1 偏移 **15.817 px**，符合 16 px 预期及 3 px 容差。Chrome 同样通过。

这些计时针对受控测试，不代表所有真实聊天的固定速度。Firefox 返回的动画帧计时为 0，受浏览器计时精度影响，不能解释成实际零延迟。

Firefox web-ext lint：0 错误、0 通知、0 警告。userscript 元信息、授权、依赖和运行 API 隔离检查通过。另运行现有 1,500 条目录模块性能基准及 126 次窗口合并差异检查，结果记录在 JSON。

## 交付与复现

本轮仅提交本地，**Greasy Fork 仍为 v0.3.1**。本地修复文件为：

```text
artifacts/packages/conversation-navigator-0.3.2.user.js
artifacts/packages/conversation-navigator-chrome-0.3.2.zip
artifacts/packages/conversation-navigator-firefox-0.3.2.zip
```

发布包内容脚本、manifest 和 userscript 哈希已与测试报告逐项核对。油猴文件为 61,741 字节，SHA-256：

```text
4165344bfe0f1d699f8b3c23345e16e7b3487dd4867acd3057e71116ac0dc62a
```

测试修复时，在 Tampermonkey 的已有脚本中更新为本地完整 v0.3.2，随后刷新 ChatGPT，并核对面板版本。保留名称和 namespace，避免另建重复脚本。

复现命令：

```bash
npm ci
npm test
npm run test:userscript
npm run lint
npm run check:userscript
npm run package
```

需先按 README 准备浏览器、驱动与系统工具。仅调试新增场景可执行 `TEST_ONLY_STARTUP=1 node tests/run.mjs`，该结果不代表完整验收。

[完整 JSON 证据](verification-0.3.2.json) 包含旧版失败、新版逐组结果、坐标、动画帧计时、性能样本及包哈希。运行报告分别在 `artifacts/tests/`、`artifacts/tests-userscript/`，旧版复现报告在 `artifacts/navigation-0.3.1-before/` 和 `artifacts/firefox-reflow-0.3.1-before/`。

测试会话采用模拟内容和已知页面结构，未直接操作用户的私人 Firefox 会话；用户现场验收应在安装本地 v0.3.2 后单独记录。
