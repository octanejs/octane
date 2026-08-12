// The renderer-bearing upstream suite lives in a TSRX fixture module.
// Upstream `_useStore` cases are not applicable here; authenticated omission
// evidence is ordinary (experimental-use-store.parity.test.ts and
// typetests/_useStore-omission.test-d.ts), inventoried as divergence cases
// outside the parity-only adapted-types compiler project.
// OCTANE DIVERGENCE[tanstack-store-experimental-use-store][types:tanstack-store-useStore-omission]
import '../_fixtures/upstream/index.tsrx';
