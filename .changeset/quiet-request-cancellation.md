---
'@octanejs/app-core': patch
'@octanejs/vite-plugin': patch
'@octanejs/rsbuild-plugin': patch
---

Cancel Node request signals when clients disconnect after their upload completes, including while an async handler or streaming response is still running. The Node request helper accepts the corresponding response so custom hosts can preserve the same cancellation lifetime.
