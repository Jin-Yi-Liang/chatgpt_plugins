# 0.1.1

修复用户在 Firefox 打开已有 ChatGPT 会话后，导航一直显示 0 条的问题。

用户提供的控制台统计显示：页面有 main，但旧版依赖的 data-message-author-role、conversation-turn、data-turn、article 均为 0。脱敏 DOM 中实际使用 data-user-message-bubble、data-markdown-text-style、data-turn-key。0.1.0 在这份脱敏结构补入模拟文字后的浏览器测试中仍识别为 0 条，直接复现了识别失败。

本版本加入这套语义标记的识别和回复正文提取，自动模式与兼容模式都支持。轮次键用于保存独立标题；同一消息有新旧两套标记时去重。另修复 display:contents 容器的可见性误判和兼容轮次位于 main 之外的识别，并为没有独立布局框的容器选择可滚动的子元素。面板显示 v0.1.1，便于检查旧内容脚本是否已重新加载。

验收：Chrome for Testing 156.0.8078.4 与 Firefox 157.0 各 18/18 组通过；Firefox web-ext lint 为 0 错误、0 通知、0 警告。新增测试使用用户提供的脱敏 DOM 结构与模拟正文，包含标题显示、重复提问改名持久化、嵌套滚动、实际剪贴板粘贴、下载正文和混合标记去重。不是用户当前登录标签页的现场验收。

证据在 artifacts/tests/report.json、modern-before-fix.json、firefox-modern-export.md 和 firefox-modern.png。
