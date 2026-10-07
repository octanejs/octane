---
'octane': patch
---

Stop rendering a hydrated signal reader a second time when nothing it read changed.

After a hydration commit, releasing the adopted server values rendered every component that read a signal during hydration again, in the same task, even when the live value still matched the server's. Parents render their children, so a section-level read rendered the whole section twice. Release now compares each historical read with what a live read would return:

- A read whose live value is `Object.is`-equal to the server value moves to the live signal without rendering. A snapshot read also needs the same status and activity metadata. Later writes render the reader as before.
- A reader renders again when any read changed: an early edit, a newer query result or a changed selection, a pending selection, a later stream value, or a stream that has since completed under a snapshot read.
- A targeted binding (`{value$}`) keeps its own live subscription, so its component never starts depending on that signal.
- Decoded objects and arrays are fresh copies, so a component that read one still renders again.

On the `app-frame-hydration` benchmark, the `frame-live-sections` scenario drops from 3,078 to 1,653 renders for its 1,653 Blocks. Hydration is about 11% faster cold and 13% faster warm at 4× CPU throttle (paired head/base 0.886 and 0.873 over 20 pairs). It also allocates 680 KB less heap. The leaf-only `frame` scenario drops from 1,703 to 1,653 renders.
