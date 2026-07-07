---
'octane': patch
---

Compiler: an SVG `<title>` (the accessibility tooltip element) is no longer
head-hoisted — hoisting `<title>`/`<meta>`/`<link>` to document.head now skips
svg-namespace subtrees, matching React 19's exception. Previously a tooltip
inside `<svg>` was hoisted on the client (stomping the document title) and made
the server compile throw ("does not support node type HeadHoist"). Also fixes
the server emitter's namespace tracking (`nsForSelf`/`nsForChildren` were
called with the node instead of the tag, so svg subtrees never entered the svg
namespace server-side). Regression tests:
packages/octane/tests/svg-title-hoist.test.ts.
