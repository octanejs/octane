---
'@octanejs/mcp-server': patch
'octane': patch
---

Add an agent driver. `@octanejs/mcp-server` gains nine `octane_app_*` tools that drive one page of an Octane app's Vite development server in Chromium: open it, read its accessibility tree and component state, tap and type, move its clock, screenshot it and read its logs. The page loads the new `octane/agent` entry ahead of the app's own scripts, so `octane/testing`'s test clock owns the runtime's time from boot and nothing moves between two operations until the agent advances, steps a frame or settles the clock. Playwright is an optional peer dependency, needed only by these tools.
