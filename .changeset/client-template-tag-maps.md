---
'octane': patch
---

Expose an inspection-only client output AST that expands hoisted template
literals into exact element, attribute, text, comment, and marker nodes. The
same linear scan supplies source-map anchors for authored host tags and static
attributes; normal compiles keep the existing path without cloning, collection,
template scans, or an output parse.
