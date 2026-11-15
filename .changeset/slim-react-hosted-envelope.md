---
"octane": patch
---

Reduce the client bundle cost of hosting Octane components in React. OctaneCompat no longer pulls in host element descriptors, function form actions, or fragment refs unless the hosted code uses those capabilities.
