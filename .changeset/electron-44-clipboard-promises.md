---
"@octanejs/electron": patch
---

Support Electron 44's asynchronous clipboard API. Clipboard writes now wait for the native operation and propagate failures to renderer callers, while retaining compatibility with synchronous Electron hosts.
