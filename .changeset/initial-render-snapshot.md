---
"octane": minor
"@octanejs/lynx": patch
---

Add `useInitialValue(factory)` for a render value deliberately captured at mount. The Strong compiler can migrate a simple lazy `useState` declaration that discards its setter to this hook.
