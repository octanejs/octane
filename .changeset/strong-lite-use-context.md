---
'octane': patch
---

Render Strong components that read context with `use(Context)` without a Block of their own in production client builds, as `useContext` callers already do. This applies when every `use()` call takes a context the same module creates with `createContext`. A component that passes `use()` a promise, a prop, or an imported context keeps its Block.
