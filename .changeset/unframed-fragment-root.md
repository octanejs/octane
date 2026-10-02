---
'octane': patch
---

Hydrate the component after one whose template has several roots and that found the server's nodes without a range of its own, as when the server rendered a different `@if` arm. In development builds the next component read the fragment's first root as its own, reported a mismatch, removed that root and rendered itself a second time. In production builds the fragment was rebuilt, and rebuilding it discarded the next component's server range and left that range's closing marker behind. Both builds now adopt the fragment's server nodes when every root matches, and the next component adopts its own server range.
