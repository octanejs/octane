---
'octane': patch
---

Strong mode closes three gaps in its render determinism checks. Callbacks that
known array methods (`map`, `filter`, `forEach`, `reduce`, `flatMap`, `some`,
`every`, `find`, `sort`, and their variants) run synchronously are now checked
as render, so `items.map(item => <li key={Math.random()} />)` is rejected.
`crypto.randomUUID()` and `crypto.getRandomValues()` join
`OCTANE_STRONG_RENDER_IMPURE_CALL`, which now suggests `useId()` for element IDs
and a stable item ID for keys. Formatting a provable `Date` or an `Intl` service
during render without an explicit locale and time zone reports
`OCTANE_STRONG_RENDER_LOCALE_FORMAT`, because server and browser output can
differ. Compatibility mode and emitted code are unchanged.
