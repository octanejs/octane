---
'octane': patch
'@octanejs/mcp-server': patch
---

Align ViewTransition with React 19.3: fix activation classes, type maps, authored
style restoration, mutation and layout detection, nested sharing, instance refs,
and callback cleanup at animation finish. Forward native transition types, keep
unanimated controls interactive, and wait for relevant resources and navigation.
Animate streamed Suspense reveals with coordinated hydration and client updates.

Prepare ViewTransition renders with staged DOM commits so snapshot activation uses the finished boundary props while preserving existing node identity and committed lifecycle visibility.

Keep ordinary DOM operations on an inline native receiver path to avoid per-node staging helper calls when no ViewTransition is active.

Add opt-in `scope="element"` boundaries with local names and pseudo-element handles,
independent sibling and nested animations, coordinated streamed reveals, and
normal DOM commits when native element transitions are unavailable.

Expose the ViewTransition bundle and native-work benchmark through the MCP benchmark tools.
