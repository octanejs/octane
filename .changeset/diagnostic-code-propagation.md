---
'@octanejs/cli': patch
---

Propagate real diagnostic codes through `octane analyze` and the MCP
`octane_compile` surface instead of flattening every thrown failure to
`OCTANE_PARSE_ERROR`/`OCTANE_COMPILE_ERROR`. The code is a diagnostic's
identity for agents — they filter findings and search docs on it — so
`thrownFailure` now preserves the thrown `code`, and `octane_compile`
diagnostics carry it on each entry. `docs-meta` registers kebab and
SCREAMING spellings so search resolves a diagnostic under either form.
