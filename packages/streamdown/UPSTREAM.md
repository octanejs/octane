# Upstream

- Repository: https://github.com/vercel/streamdown
- Commit: `e5deed330aa4231751a106445d93d62e4716a22f`
- Core package: `streamdown@2.5.0`
- Plugin packages:
  - `@streamdown/code@1.1.1`
  - `@streamdown/math@1.0.2`
  - `@streamdown/mermaid@1.0.2`
  - `@streamdown/cjk@1.0.3`
- License: Apache-2.0
- Core npm tarball SHA-256: `8dc9e1f04cda91beab7818cc11fd5cee8c5f316b84934686c892c8cfb9b808ac`

The framework-neutral Markdown, HAST, remark/rehype, code-highlighting,
Mermaid, math, and CJK logic is retained from upstream. React-owned component,
hook, portal, element, and JSX-runtime boundaries are ported to Octane.

## Upstream test suite

The pinned repository commit contains an executable suite under
`packages/streamdown/__tests__`, plus suites for each official plugin package
and `remend`. Published npm tarballs omit those tests; repository presence is
authoritative, so `upstreamSuites.runtime` is `present`.

Every upstream `__tests__` artifact at the pin is inventoried in
[`audit/upstream-suite-artifacts.json`](./audit/upstream-suite-artifacts.json).
This bounded harness currently executes eight exact same-fixture differential
cases against the pinned published React packages through the
`streamdown-differential` Vitest project (`testExecution: { group: 'react-parity' }`).
Native-event delivery and consolidated plugin subpath contracts stay ordinary
package tests outside parity evidence.

Promoting the inventoried upstream suite into pristine / one-for-one adapted
lanes (framework-neutral remend unchanged; React-facing suites adapted or given
specific incompatibility reasons) remains open follow-up work before provenance
can move to `verified`.
