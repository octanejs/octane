---
'octane': patch
---

A host element created from an uppercase or mixed-case HTML tag, such as
`createElement('DIV', null, text)` or a dynamic `<Tag>` whose value is `'H1'`,
now hydrates and updates like its lowercase spelling. HTML tag names are
ASCII case-insensitive, so the server's `<DIV>` parses as a `div` and
`document.createElement('DIV')` builds one too. The client compared the tag
exactly, so hydration reported a recoverable mismatch and rebuilt the subtree,
and every later render replaced the element, which lost focus, selection, and
scroll. A host tree built from such tags was also rebuilt, rather than adopted,
when a component child appeared in it. The client now matches an HTML element's
tag in any casing. SVG and MathML tags stay case-sensitive (`foreignObject`),
as the DOM requires.
