---
'octane': patch
---

Start a `<ViewTransition>` on the live document when a boundary is nested inside a component's compiled template that has not been inserted yet. The staged clone still belongs to the inert `<template>` document, so Octane picked that document as the transition owner. Its `startViewTransition` returns `null` because it has no browsing context, and the commit threw `Cannot read properties of null (reading 'ready')`, leaving the old screen in place. The owner now resolves through the parent block's host when the boundary's own parent belongs to a document without a `defaultView`.
