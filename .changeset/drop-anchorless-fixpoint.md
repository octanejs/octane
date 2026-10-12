---
'octane': patch
---

Mount a hookless component without an anchor comment when its root is a complete `@if`/`@else` chain or `@switch` with a `@default` whose arms render other components, even when one of those components can render nothing. The runtime now keeps such an arm in place when the component inside it empties or swaps its element, so a host whose children are all components no longer clones and positions an empty comment for these children. Rendering, hydration and update behavior are unchanged.
