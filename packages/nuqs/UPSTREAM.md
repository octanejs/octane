# Upstream provenance

- Repository: https://github.com/47ng/nuqs
- Release: `v2.9.1`
- Commit: `b72c526f9dd94bf5a105b320fcb5955cbc68a8b3`
- Source and test root: `packages/nuqs/src`
- License: MIT
- Archive SHA-256: `23b331aa1371c760b349b81a26ca87c505e5991c14e23b6fd0ab8759dc3784c5`
- Supported upstream range: exactly `2.9.1`
- Upstream React peer range: `>=18.2.0 || ^19.0.0-0` (from `nuqs@2.9.1`)
- React oracle: `react@19.2.7`, `react-dom@19.2.7`, `@types/react@19.2.17`,
  `@types/react-dom@19.2.3`

Nuqs colocates runtime, browser, and type tests with source, so
`upstreamSuites.runtime` and `upstreamSuites.types` are `present`. Those suites
have not been vendored and adapted one-for-one yet, so the parity manifest
remains `recorded-unverified` until required pristine-upstream and adapted-octane
lanes (and upstream-suite type evidence) exist.

Interim evidence that does run today:

- a same-fixture differential against `nuqs@2.9.1` using the React oracle above
- paired pristine (`tsc` vs published `nuqs`) and adapted (`tsrx-tsc` vs
  `@octanejs/nuqs`) public-API typetests with structural import-only verification

Repo-authored Octane-only divergence probes stay on the ordinary `nuqs` Vitest
project and are classified as `octane-only-divergence` with structured
`react-parity.json` divergence records. Those records cite `conformance:` case
ids authenticated by `@parity-case` markers in the ordinary test files; they are
not adapted-parity ownership and are not executed by `run-required`. Do not
claim verified parity until real one-for-one upstream paired case evidence
exists.
