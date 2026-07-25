---
'@octanejs/mcp-server': patch
---

Initialization instructions are now one orienting sentence plus a pointer to
`octane_engineering_plan`, instead of a standing mandate restating the
correctness, performance-evidence and self-review gates in every session. The
gates are unchanged and still returned in full by that tool.

Repo skills are read from `.rulesync/skills` rather than the deleted `.ai/skills`,
and `octane_project_map` returns the generated `AGENTS.md`. Four tool
descriptions were reworded from what they do to when to call them.
