---
'octane': patch
---

Run a hook with an omitted dependency array on every render when its callback reads a binding declared after the hook call. That covers a later `const`, `let`, `class` or `var`, and the `const` that receives the hook's own result, such as a `useCallback` that calls itself. The compiler read the binding where the hook is called to fill the inferred array. A `let`, `const` or `class` threw `ReferenceError: Cannot access … before initialization` there. A `var` was still `undefined`, so the hook never re-ran when it changed. React runs a hook with an omitted array on every render, and Octane now does the same in this case. Strong mode reports `OCTANE_STRONG_UNTRACKED_EFFECT` instead, asking for the declaration to come before the hook.
