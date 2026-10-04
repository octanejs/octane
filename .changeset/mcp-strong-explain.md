---
'@octanejs/mcp-server': minor
---

Add the `octane_strong_explain` tool and the `migrate-to-strong` skill. Given an `OCTANE_STRONG_*` code, in full or without its prefix and in any case, the tool returns what the diagnostic detects, its replacement, its docs URL, and before/after recipes for the React idiom it rejects. Given a recipe id such as `lazy-ref`, it returns that recipe, and with no arguments it returns the index of codes and recipes. An unknown code returns an error that lists the closest codes. The skill walks an agent through migrating a module or app to Strong mode, from `octane analyze --strong-preview` to the coverage baseline, and lists the changes that only hide a diagnostic. Bridge reports now name the Strong mode replacement for `useRef`, `useLayoutEffect`, `useMemo`, and `useCallback`. The new `@octanejs/mcp-server/strong` export serves the same explanations to other hosts.
