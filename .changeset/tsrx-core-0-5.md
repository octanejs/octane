---
'octane': patch
---

Update the shared TSRX compiler dependencies to `@tsrx/core` 0.5.5 and
`@tsrx/oxc` 0.18.0. `octane` now declares `@tsrx/oxc@0.18.0` as its optional
compiler parser peer, so a project that compiles Octane in Node upgrades its
`@tsrx/oxc` install from 0.16.0 to 0.18.0.

The parser now gives template markup TSX's exact tree: the indentation between
children is its own whitespace text, and each `@case`/`@default` arm is one block.
Octane adopts that tree at the parser boundary, so templates keep compiling to the
same static templates, component slots, and fast paths. Indentation between
children also no longer reaches a component as empty-string children in
value-position JSX, so `Children.count` and `Children.only` match React.

The TSRX language changes in this release apply to `.tsrx` files:

- A `//` preceded by whitespace, at the start of a line, or right after a tag or
  block starts a comment in template children; `https://example.com` and `a//b`
  stay text.
- A static `<script>` body cannot contain `</script` in any letter case, since
  HTML ends the element there; write `<\/script`.
- A dynamic tag, `<{expr}>`, must be an identifier, a member access, or a string
  literal; compute any other expression into a local first.
- Every compile error has a TypeScript (`TS…`) or TSRX (`TSRX…`) code.

JSX text and attribute strings are decoded once, by the parser. Both parsers
now give their `value` decoded, so Octane no longer decodes it again: the
browser compiler, and a Node compile that fell back to `@tsrx/core`'s parser,
rendered `&amp;lt;` as `<` instead of `&lt;`. Decoding follows JSX, as in
React: numeric references and the XHTML named references are decoded, and a
later HTML name such as `&check;` stays text. JSX's whitespace rule applies to
the decoded text, as Babel applies it. Layout checks read the text as written,
so text that is only `&nbsp;` still renders.

Enum member initializers are now visible to the client-only server check and to
universal renderers' `forbiddenGlobals` validation, so a client-only binding or a
forbidden global used in one is reported, and a member name used by a later
initializer is not mistaken for a global.
