# Upstream

| Field | Value |
|---|---|
| Repository | https://github.com/styled-components/styled-components |
| Commit | `e0663410f631e0ce82681947edf03bfabd6aef9c` |
| Package | `styled-components@6.4.3` |
| Supported upstream range | exactly `6.4.3` |
| React oracle | `19.2.7` |
| ReactDOM oracle | `19.2.7` |
| License | MIT |
| npm tarball SHA-256 | `cfc845f944613860155a65afb548b0ac0d234af56ac332e14f99ed150ab38549` |

The implementation is ported from the pinned upstream package. React component,
forward-ref, hook, JSX, and server-sheet boundaries are adapted to Octane.

The canonical pinned repository contains runtime and type suites, but the
published npm artifact does not contain them. This repository therefore records
the source provenance as unverified rather than claiming a pristine-upstream
run. `upstreamSuites.runtime` and `upstreamSuites.types` remain `present`
because the repository pin has those suites; promoting them into pristine /
one-for-one adapted lanes with complete dispositions is open follow-up work
before provenance can move to `verified`.

This bounded harness currently executes six exact same-fixture differential
cases against the pinned published React package through the
`styled-components-differential` Vitest project
(`testExecution: { group: 'react-parity' }`). Factory, SSR, distribution, and
type-contract adaptations stay ordinary package tests outside React-parity
evidence.
