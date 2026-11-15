---
"@octanejs/codemod": patch
---

Report React Intl scalar formatter calls inside synchronous functions invoked inline during render. The formatter can depend on the original React renderer even when it returns plain text.
