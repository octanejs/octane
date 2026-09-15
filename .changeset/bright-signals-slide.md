---
'octane': patch
'@octanejs/mcp-server': patch
'@octanejs/email': patch
'@octanejs/textarea-autosize': patch
'@octanejs/calendar': patch
'@octanejs/floating-ui': patch
'@octanejs/image-crop': patch
'@octanejs/recharts': patch
'@octanejs/resizable-panels': patch
'@octanejs/sonner': patch
'@octanejs/xyflow': patch
---

Accept native signal handles in DOM styles, including individual CSS properties and whole style values. Direct template styles update without rerunning component setup, and preserve signal cleanup, Suspense, server rendering, and hydration. Export `SignalCSSProperties` for signal-aware style objects while keeping `CSSProperties` compatible with ordinary CSS consumers.

Keep binding CSS compatibility aliases pointed at plain `CSSProperties` when their layout helpers consume ordinary CSS values.

Expose the signal style regression benchmark through the MCP benchmark tool.
