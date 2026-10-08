---
'@octanejs/mcp-server': patch
---

The `migrate-to-strong` skill now tells you to typecheck with `tsrx-tsc`, the
command the `typecheck` script from `octane init` runs. It used to name
`octane-tsc`, a tool that exists only inside the Octane repository.
