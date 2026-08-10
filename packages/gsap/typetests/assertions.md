# Type parity assertions

`@gsap/react` 2.1.2 ships no type-test suite, so both sides of this lane are
port-authored. The two files assert the same public-surface claims, one against
the published upstream typings compiled with `tsc`, one against
`@octanejs/gsap` compiled with `tsrx-tsc`.

Permitted differences between the two files, and nothing else:

| # | Transformation | Why |
| --- | --- | --- |
| 1 | import root `@gsap/react` → `@octanejs/gsap` | the package under test |
| 2 | adapted side also asserts `register` / `headless` | present on the published runtime but omitted from upstream `.d.ts` |

Every shared assertion group below appears in both files under the same heading.

1. Callback form returns a `context`.
2. Positional dependency array is accepted.
3. Config with `scope` element and empty dependencies is accepted.
4. Config-only call with ref-like `scope` and `revertOnUpdate` is accepted.
5. String `scope` selector is accepted.
6. Non-function callback is rejected.
7. Non-ref/non-element/non-string `scope` is rejected.
