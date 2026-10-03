---
'octane': patch
---

Keep a component-local `derived$` or `query$` when its captured values are unchanged. Since local declarations started following new props, every render ran the declaration's closure again, even with equal props. A `derived$` that returned an object produced a new object on each render, so an effect or memoized child that depended on it ran on every parent render. The compiler now lists the render values a local declaration captures, as it does for a hook with an omitted dependency list. A render whose captured values are all unchanged keeps the accepted definition and its value without running the closure, and skips the per-render staging work. A changed value still reruns the declaration as before. A handle from a local `signal$` with no key or a literal key is not a captured value, so a `derived$` that reads one keeps its value until the signal changes.

Declarations reached through a custom hook also no longer share a cell with an explicit key that spells out the hook's call path, such as `'user/h:…'` declared directly in the component, and their path is no longer rebuilt for each declaration on every render.
