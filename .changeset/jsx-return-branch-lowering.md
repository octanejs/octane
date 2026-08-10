---
'octane': patch
---

The compiler now lowers React-style conditional JSX returns
(`if (c) return <A/>; return <B/>;`, including ternary returns) to the same
template control flow as `@if`/`@else` when the branch shapes are provably
remount-equivalent under React semantics, so branch-selected output stops
running through the de-opt descriptor renderer on both client and server.
Hooks, direct-call helpers, fragment arms, same-type arms, self-recursive
arms, and every other return shape keep the established value ABI.
