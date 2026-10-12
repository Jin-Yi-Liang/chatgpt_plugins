# Project state

- Activity: implement / feature; fresh project, current directory, direct session.
- Workspace: `/home/michael/workspace/project/chatgpt_plugins`; initially empty, no Git repository or revision.
- Authorized scope: implement Firefox / Chrome ChatGPT navigation extension, reserve DeepSeek / Claude adapter interfaces, run background browser tests.
- Delivery: local source, generated extension directories, ZIP packages, documentation and test evidence. No commit, push or marketplace submission requested.
- Decisions: MV3 content script, isolated Shadow DOM, no backend; store custom titles and UI preferences locally; export current rendered replies in conversation order; platform adapter contract in `src/platforms.js`.
- Current evidence: `artifacts/tests/report.json`, screenshots and exported Markdown; separate real-host check in `artifacts/live/report.json`.
- Real-site limit: independent headless profile encountered Cloudflare human verification. Extension injection on the domain verified; signed-in conversation behavior remains unverified.
- Verification: v0.1.1 bundled code passed 18 integration groups in Chrome for Testing 156.0.8078.4 and 18 in Firefox 157.0. Firefox web-ext lint: 0 errors, 0 notices, 0 warnings. Bundle SHA-256 receipts are in the report.
- Reported issue: user's Firefox navigation panel was visible but stayed at 0. User's DOM has no author-role/old turn/article markers; it uses data-user-message-bubble, data-markdown-text-style and data-turn-key. The old build reproduced 0 on this redacted structure with synthetic content. v0.1.1 supports the markers and modern Markdown body boundaries.
- Current status: fix and fixture regression verification done; delivery local. Current Firefox process has no automation flags and no connected browser surface, so live signed-in tab behavior has not been observed directly.
- Next: reload the existing temporary extension and refresh the ChatGPT tab; panel version should read v0.1.1. Confirm the user's live conversation titles after reload.
