---
'octane': patch
---

Custom hooks now work across module boundaries, in plain `.ts`/`.js` and in `.tsx`. A custom hook (any `use[A-Z]` function) defined in a plain `.ts`/`.js` file gets its base octane hooks slotted by a new lightweight, surgical Vite-plugin pass that edits ONLY the hook call sites and leaves every other byte — including TypeScript the full compiler can't print (index signatures, generic type aliases) — verbatim; the `.tsrx`/`.tsx` caller still wraps the call in `withSlot`, so reuse and nested composition keep independent state across the boundary. `.tsx` (TS + JSX) files now go through the full compiler alongside `.tsrx`, so components and hooks authored in `.tsx` work too. The pass only runs on files importing a hook from `octane`, skips `node_modules` (published bindings ship pre-slotted), and honors a `// octane-no-slot` opt-out plus the plugin's new `exclude` option for hand-written slot-forwarding bindings in a monorepo.
