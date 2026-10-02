---
'@octanejs/cli': minor
---

Add a Strong coverage baseline to `octane analyze`, and analyze modules under `compiler.strong`.

- `octane analyze --strong-baseline init` records every module that compiles
  without Strong mode in `octane-strong-baseline.json`. While the file exists,
  every run fails on a module that is neither Strong nor listed
  (`OCTANE_STRONG_COVERAGE_REGRESSION`), such as one whose `"use strong"` was
  deleted, and on a listed name that is now Strong, gone, or no longer compiled
  by Octane (`OCTANE_STRONG_COVERAGE_STALE`). `--strong-baseline update` only
  removes names, so a new exception is always a reviewed edit to the file.
- `octane analyze` now reads `compiler.strong` from `octane.config.ts` and
  analyzes the modules it reaches in Strong mode, as the build does. Before,
  those modules were analyzed without their Strong diagnostics.
- A compiler error that carries its own code, such as a Strong rule, is
  reported under that code instead of `OCTANE_PARSE_ERROR`, so `--code` can
  select it.
