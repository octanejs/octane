---
'octane': patch
---

Fix an `@if`/`@switch` arm whose only output is a hookless component's inner branch. When that branch emptied or swapped its element, the arm's next swap rendered after every later sibling, or left the replaced element behind. In production builds, two such components side by side around an imported hookless component could throw `NotFoundError` after one emptied in the same render that the other swapped arms. The arm now follows its boundary through the component.
