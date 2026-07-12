---
'@octanejs/tanstack-virtual': patch
---

New binding: TanStack Virtual for octane. The framework-agnostic `@tanstack/virtual-core` is reused verbatim; the React adapter (`useVirtualizer`, `useWindowVirtualizer`) is transcribed onto octane hooks preserving upstream's force-update + flushSync-on-sync-scroll wiring and three-layout-effect lifecycle. Differential-verified byte-identical against real @tanstack/react-virtual 3.14.5 on React across scrolling, count changes, horizontal mode, and dynamic measurement.
