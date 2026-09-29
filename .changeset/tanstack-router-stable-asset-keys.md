---
'@octanejs/tanstack-router': patch
---

Key head and body assets by content instead of list position.

`HeadContent` keyed each tag by its index, and manifest `modulepreload` links
precede the stylesheet. Navigating between routes with different preload counts
shifted the stylesheet's index, remounted its `Asset`, and removed and re-added
the `<link rel="stylesheet">`, flashing unstyled content in production builds.
`HeadContent` now keys tags by content, as `@tanstack/react-router` does, with
identical tags told apart by occurrence. `Scripts` uses the same keys, so body
scripts are no longer re-created when the hydration barrier is removed. `Asset`
compares `attrs` by value, so a rebuilt tag list no longer re-mounts unchanged
assets, and a mounted asset's element can no longer be adopted by another.
