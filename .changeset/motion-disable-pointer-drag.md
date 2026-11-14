---
'@octanejs/motion': patch
---

Honor `dragListener={false}` when starting a drag from a Motion host. Keep an active drag running if the prop changes, and omit `dragListener` and `dragControls` from host markup.
