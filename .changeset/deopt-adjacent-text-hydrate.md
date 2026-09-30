---
'octane': patch
---

`hydrateRoot` now adopts adjacent text children of a `createElement` host
without a mismatch. `createElement('div', null, 'hello ', name)` rendered two
text nodes on the client, but the server wrote them as one run of text, which
the browser parses as a single node. Every hydrate reported a recoverable text
mismatch, rewrote the first node, and built the second. The server now writes
React's `<!-- -->` separator between adjacent texts, including across nested
arrays and empty values. Hydration adopts each server text node and leaves the
separator in place, as React does. `<textarea>`, `<title>`, and other raw-text
content is unchanged, because a comment there would be literal text.

A controlled or default `<select>` value now also preselects, during server
rendering, an `<option>` without a `value` whose label is split across adjacent
texts, such as `<option>{'Item '}{n as string}</option>`. The label is compared
as its flattened text, as in React.
