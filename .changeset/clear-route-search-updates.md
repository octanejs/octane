---
'@octanejs/tanstack-router': patch
---

Render same-route search-parameter store updates urgently, matching React's external-store behavior. A route component that suspends on the new search input now shows its pending fallback instead of automatically retaining the previous content. Use `useDeferredValue` on the search input consumed by the suspending content to keep the previous view until the new data is ready.
