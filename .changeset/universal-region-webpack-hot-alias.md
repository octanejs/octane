---
'octane': patch
---

Fix a webpack and Rspack HMR syntax error in modules that hold more than one universal renderer unit, such as a DOM module with two `<Canvas>` regions or a universal module with a nested renderer region. Each region now declares its own hot-module alias instead of redeclaring `__octaneWebpackHot`.
