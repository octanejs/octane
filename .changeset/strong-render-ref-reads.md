---
'octane': patch
'@octanejs/mcp-server': patch
---

Reject render-time reads of `useRef.current` in Strong modules with a source-located diagnostic, while retaining event and effect reads and compatibility-mode behavior. Document the rule in Octane's authoring guidance and MCP skill.
