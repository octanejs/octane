---
"octane": minor
---

Add `useInitialValue(initial)` for a render value deliberately captured at mount. The Strong compiler can migrate a simple `useState` declaration that discards its setter to this hook.
