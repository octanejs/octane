---
'octane': patch
'@octanejs/base-ui': patch
'@octanejs/floating-ui': patch
---

Add `createResizeObserver` to deliver coalesced native resize notifications in a
separate task, with queued-entry cleanup on unobserve and disconnect. Ordinary
state updates keep their existing microtask batching.

Use deferred observer callbacks in Base UI measurement components and Floating
UI's element-resize adapter so geometry-affecting updates can settle without
ResizeObserver delivery-loop warnings. These bindings now require Octane 0.3.7
or newer in the 0.3 release line. Initial synchronous measurement and positioning
remain available, and the global ResizeObserver constructor is unchanged.
