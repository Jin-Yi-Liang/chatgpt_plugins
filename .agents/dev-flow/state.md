# Project state

- Activity: implement / feature; fresh project, current directory, direct session.
- Workspace: `/home/michael/workspace/project/chatgpt_plugins`; initially empty, no Git repository or revision.
- Authorized scope: implement Firefox / Chrome ChatGPT navigation extension, reserve DeepSeek / Claude adapter interfaces, run background browser tests.
- Delivery: local source, generated extension directories, ZIP packages, documentation and test evidence. No commit, push or marketplace submission requested.
- Decisions: MV3 content script, isolated Shadow DOM, no backend; store custom titles and UI preferences locally; export current rendered replies in conversation order; platform adapter contract in `src/platforms.js`.
- Current evidence: `artifacts/tests/report.json`, screenshots and exported Markdown; separate real-host check in `artifacts/live/report.json`.
- Real-site limit: independent headless profile encountered Cloudflare human verification. Extension injection on the domain verified; signed-in conversation behavior remains unverified.
- Verification: v0.2.0 bundled code passed 27 integration groups in Chrome for Testing 156.0.8078.4 and 27 in Firefox 157.0. Firefox web-ext lint: 0 errors, 0 notices, 0 warnings. Code/test revision and bundle receipts are committed in docs/verification-0.2.0.json.
- Reported issue: user's Firefox navigation panel was visible but stayed at 0. User's DOM has no author-role/old turn/article markers; it uses data-user-message-bubble, data-markdown-text-style and data-turn-key. The old build reproduced 0 on this redacted structure with synthetic content. v0.1.1 supports the markers and modern Markdown body boundaries.
- Latest scope: fix multiple-click navigation and disappearing/windowed items; enable independent wheel scrolling, persistent navigation deletion and default-collapsed read-only H1 children. User also requested a local Git repository with commits, without a remote.
- Implementation: live-key target resolution with instant scrolling and bounded layout corrections; per-conversation inventory/heading cache and DOM discovery; deletion tombstones; actual mouse/wheel/key/copy/download checks. Old v0.1.1 fails same-key DOM replacement navigation in both real engines.
- Git: main initialized with baseline fcab95c; implementation f4ed318; browser regressions e008790; release docs d2292f8. User subsequently configured/published origin at https://github.com/Jin-Yi-Liang/chatgpt_plugins.git; read-only check showed remote main at d2292f8. Documentation changes remain local until pushed.
- Current status: implementation, complete browser regression and package hash verification done; delivery local. Current signed-in Firefox tab is not connected to automation, so it has not been directly operated.
- User acceptance: on 2026-10-13 user confirmed Firefox and Chrome live usage works.
- Current documentation task: README expanded to clone/install/build/load/develop/test/package/troubleshoot; added repository-tracked screenshot and a Tampermonkey/Greasy Fork publishing guide. A fresh anonymous GitHub clone completed npm ci, build, lint, package and 27+27 actual-browser tests with reproducible bundle hashes. See docs/local-setup-check.md.
- Userscript status: not implemented. Current extension storage/message APIs need GM/runtime adaptation and a .user.js build plus real Tampermonkey validation before Greasy Fork publication. This turn documents the process without publishing or pushing.
- Next: push documentation only when authorized; implement the userscript runtime/build when requested, then test actual Tampermonkey on both browsers and prepare publication.
