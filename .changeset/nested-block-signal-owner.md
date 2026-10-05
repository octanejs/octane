---
'octane': patch
---

Resolve a component's `signal$`, `derived$` and `query$` handles to the component's own cells when a nested `@{ … }` block reads them, as directive arms and keyed rows already do. The block previously got cells of its own, so it started a second request for each query and computed from signals the component never updated. The fix applies in the browser, on the server and during hydration, and covers a nested block in JSX a component returns. A nested block still owns, and retires, the declarations it makes itself.
