# React Aria upstream ledger

`@octanejs/aria` targets the coordinated React Spectrum release at commit
`1c84a49a1faf50b571c84e00bcf9c60b22ddd03e`:

| Package | Version | Verified tag | npm SHA-256 | npm integrity |
| --- | --- | --- | --- | --- |
| `react-aria` | `3.50.0` | `react-aria@3.50.0` | `bcab487177dba271a36f247531043c3c940579cacc201e31bbdbba29ef2d2a7c` | `sha512-S0Os6QZk33fzUAKu1QLT9afoUaCBt1ZNdoiq0n2YMVgKIdNIQS8zxiZ8O9hYE6QyDkHKjD6q39LQZ+qaSAIgjw==` |
| `react-aria-components` | `1.19.0` | `react-aria-components@1.19.0` | `d63da4e2ab794d3a86a16ba17b719f22a256d9c0c5fd22c057d228e0f05932a1` | `sha512-2smSS5nqJ8cGYMQezuUXveZm7eMyHCqTN6mDpylQBYLYbdF5dxCCuW1DHn1VKLe1DybSfPvX/cZtJlDmvFfn8A==` |
| `react-stately` | `3.48.0` | `react-stately@3.48.0` | `55f38303d09112619b9adc754032ba3caadc7e5a0b7fbc74bfc5636369674dd4` | `sha512-ImicSAG+lTotAe5izcs1fz49Zk48w7pDusqYg04WaPhCoej8BJ24soMu3iLXIrsi273s4P1gZrYGrqReMfgEEA==` |

All three signed registry artifacts record the same `gitHead`, and all three tags resolve to
that commit. The ordered composite SHA-256 of the three npm tarballs is
`dcad3293f0f7438705f72cdd7df03351476aeaba7d0d2743c7ad6d8130aff56f`.
The supported range is these exact coordinated versions; upgrades require a new crosswalk.

## Source and test boundary

- Canonical repository: `https://github.com/adobe/react-spectrum.git`
- Source roots: `packages/react-aria/src`, `packages/react-aria-components/src`, and
  `packages/react-stately/src`
- Public entry points: each package's `exports/index.ts`
- Test roots: each package's `test` directory
- License: Apache-2.0; the pinned root `LICENSE` SHA-256 is
  `7dfe6526888bac51759c99f9a51262ba2711a8c12a067f2181609dd9a4066b84`
- React oracle: `react@19.2.7` and `react-dom@19.2.7`

The monorepo source and suites are not vendored in this retrofit because the three package
trees contain more than two thousand source/support files. The immutable external checkout
can be reproduced with:

```sh
git clone --depth 1 --branch react-aria@3.50.0 --filter=blob:none --sparse \
  https://github.com/adobe/react-spectrum.git react-spectrum-aria-3.50.0
git -C react-spectrum-aria-3.50.0 sparse-checkout set --skip-checks \
  packages/react-aria packages/react-aria-components packages/react-stately LICENSE
```

`audit/upstream-crosswalk.json` records all 1,294 public entry-point exports and all 185
test-root artifacts from that checkout. It currently classifies 767 exports as
`surface-present-unverified`, with per-symbol entry-point evidence, and 527 as explicit gaps.
Surface presence is not a behavioral parity claim. The upstream suites contain 177 runtime
test files, one type test, and seven support artifacts. They are present but have not been
adapted case-by-case, so this binding remains `recorded-unverified`.

## Executable evidence

The only React-parity-owned executable lane today is the bounded differential project. It
compiles the same `.tsrx` fixtures once for Octane and once for the pinned React packages,
covering interaction hooks, form-field event wiring, collections, Select, ComboBox, React Aria
Components render props, keyed collection updates, and Tree/Table state.

That lane is representative evidence only. Declaring the upstream runtime and type suites
`present` records that the coordinated checkout contains those suites; it is not a claim that
this binding has completed pristine full-suite, one-for-one adapted, or type-lane execution.
The export/test crosswalk and Octane-only divergence/framework contracts remain ordinary-shard
coverage until those required lanes and inventories exist.

## Intentional divergences

- Native text editing uses Octane `onInput` wiring while public value callbacks retain their
  upstream `onChange(value)` names.
- React `forwardRef` wrappers become Octane ref-as-prop components.
- The i18n server serializer keeps generated identifiers valid after 26 hoisted strings,
  correcting invalid JavaScript emitted by the pinned upstream algorithm.
- Server locale direction is derived from the injected locale, including RTL locales, rather
  than being hard-coded to `ltr`.

`native-input-event-wiring` is linked to the differential case in `audit/react-parity.json`.
The other divergences above remain documented package contracts with ordinary-shard tests; they
are not counted as completed React-parity suite evidence until adapted upstream lanes exist.
