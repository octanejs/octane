---
'@octanejs/tanstack-table': patch
---

New binding: TanStack Table for octane. The framework-agnostic `@tanstack/table-core` is reused verbatim; the React adapter (`useReactTable`, `flexRender`) is transcribed onto octane hooks preserving upstream's useState-based wiring, with `flexRender` rendering component cells through octane's `createElement` descriptors. Differential-verified byte-identical against real @tanstack/react-table 8.21.3 on React across sorting, filtering, pagination, selection, visibility, and expanding.
