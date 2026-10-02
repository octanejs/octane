---
'octane': patch
---

Hydrate the component after one that adopted a server element in place. When the server rendered a different `@if`/`@switch` arm, a component that found that arm's element where its own server range belonged adopted it, but the next component adopted the same element again, and the server's range for the next component stayed on the page. When the first component's own holes left the cursor inside the element, the next component claimed the enclosing block's range instead, which discarded the arm. Hydration now continues after the adopted element. A returned single-root component that hydration rebuilt at the end of its parent's server range no longer takes that range's end marker as its own, so a later render that hides it removes it, and showing it again no longer throws.
