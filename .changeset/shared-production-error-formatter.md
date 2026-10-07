---
'octane': patch
---

Ship the production text of argument-free errors once per application instead
of once per module.

The published package gave each module whose errors take no arguments its own
copy of the "Minified Octane error" formatter, about 190 bytes each. A bundle
carried one per such module, and a code-split application one in every chunk
that included any of them. Those modules now import one shared formatter, so a
bundle holds that text at most twice: once for argument-free errors and once in
the generic formatter that encodes arguments. Error messages are unchanged.

A hydrating signals application built from the published package drops from 9
copies to 2 (1.4 KB raw). Split across 19 chunks, it drops from 22 copies in 10
chunks to 2 copies in one chunk (3.7 KB raw, 1.1 KB gzip).
