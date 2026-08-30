---
'@octanejs/lynx': patch
---

Keep the background transport's correlated readiness request alive until the
main thread answers or the transport closes. Lynx initializes its main and
background scripts independently, so the initial request and main's unsolicited
announcement can both precede their peer listener; repeating the same id makes
that listener-installation race recoverable without changing the wire shape.
