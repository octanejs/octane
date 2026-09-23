---
'@octanejs/tanstack-router': patch
---

Restore upstream's `modulepreload` links in `HeadContent` and `useTags` output.

TanStack Router emits one script preload link per matched route's manifest `preloads`, placed after meta tags and before route links. The binding had stopped emitting them, so every Router and Start app discovered its boot chunks only after running the entry script. The head output now matches `@tanstack/react-router` again. To drop the hints for your own site, filter `useTags()` output for `rel: 'modulepreload'` and render the remaining tags with `Asset`.
