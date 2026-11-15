---
'@octanejs/codemod': patch
---

Stop write mode before editing a project with an unresolved React type projection, including a `typeof` query on a missing React export. Preview mode still shows proposed changes and reports the blocker as `react-type-projection`.
