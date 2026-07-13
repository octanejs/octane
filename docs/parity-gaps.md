# React-parity gaps (generated)

<!-- GENERATED FILE — do not edit. Regenerate with `pnpm parity:gaps`. -->

The **executable** parity backlog: every `it.fails(...)` or `test.fails(...)` pin under
`packages/octane/tests`. Each pin is a real, currently-failing divergence from
React — when the runtime is fixed the pin flips red in the suite and must be
converted to a plain `it`, and this index must be regenerated
(`pnpm parity:gaps`; CI runs `parity:gaps:check`).

`// GAP` comments in test files are NOT the backlog — many annotate
since-fixed behavior or intentional platform differences. Only the pins below
are live gaps.

**0 active pin(s).**
