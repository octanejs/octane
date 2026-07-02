---
"octane": patch
---

`dangerouslySetInnerHTML` now works on the de-opt host path (`createElement`-built elements).

`createElement('style', { dangerouslySetInnerHTML: { __html } })` (and any other
element built through the runtime de-opt path rather than compiled JSX) rendered
empty: props application correctly wrote `el.innerHTML`, but the unconditional child
reconciliation that followed ran with (empty) `children` and wiped it. Per the React
contract the two are mutually exclusive — when `dangerouslySetInnerHTML` is present
the raw HTML owns the element's content, and the de-opt paths (`hostElementBody`,
including both hydration branches, and the value-position host reconciler) now skip
child processing entirely. SSR already implemented raw-HTML-wins; this aligns the
client. Surfaced by Radix ScrollArea's injected `<style>` viewport rules.
