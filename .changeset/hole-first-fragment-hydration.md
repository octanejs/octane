---
'octane': patch
---

Rebuild a hydrated fragment that starts with a hole when the server rendered something else there, such as another `@if` arm. A leading component call, text hole, or nested block matches any server node, so hydration adopted the other arm's nodes as the fragment's roots: its static roots were never built, and a component in the hole took one of the server nodes as its position. Hydration now compares the first static element root after the leading holes with the server node it would adopt. On a mismatch it rebuilds the fragment on the client, as it already did for a fragment that starts with a static root, and reports one `onRecoverableError`. The development warning names that static root and the server node found in its place. Matching fragments adopt their server nodes as before. A `HYDRATION_RANGE_BOUNDARY` passthrough root, whose owner may adopt one range level off, keeps its existing behavior.
