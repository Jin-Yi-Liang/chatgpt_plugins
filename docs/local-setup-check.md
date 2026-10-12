# 本地运行流程验证

日期：2026-10-13。

从公开 GitHub 地址独立克隆源码，禁用 Git credential helper 和交互认证，确认仓库不依赖作者本机的 node_modules、dist 或私有文件。

源码提交：d2292f822be3c1c324230bbf1a255a3b14d9b658。

执行流程：

```bash
git clone --depth 1 https://github.com/Jin-Yi-Liang/chatgpt_plugins.git
cd chatgpt_plugins
npm ci
npm run build
npm run lint
npm run package
npx playwright install chromium
npm test
```

本次实际环境为 Linux，Node.js 22.23.3、npm 10.9.9，Firefox 与 GeckoDriver 使用本机已安装的 Ubuntu Snap 二进制。新克隆目录没有预装项目 npm 依赖。浏览器二进制可以复用官方安装缓存。

| 检查 | 结果 |
| --- | --- |
| npm ci | 固定依赖成功安装 |
| npm run build | Chrome / Firefox 两个 manifest 和 bundle 生成 |
| npm run lint | 0 errors / 0 notices / 0 warnings |
| npm run package | 两份 ZIP 生成 |
| Chrome for Testing 156.0.8078.4 | 27/27 通过 |
| Firefox 157.0 | 27/27 通过 |
| 构建一致性 | 新克隆的 content.js 与 manifest.json 哈希与 v0.2.0 历史验收一致 |

README 的仓库内文件 / 图片链接已经检查存在。上述验证属于扩展项目；尚未构建或测试油猴运行版本。用户于本日另行反馈正常 Firefox、Chrome 会话中实测无问题，这一反馈与隔离浏览器回归结果分别记录。

完整新克隆运行报告留在本机 artifacts/readme-check/project/artifacts/tests/report.json，日志为 artifacts/readme-check/browser-tests.log。生成物不提交 Git；本文保存可共享的验证摘要。
