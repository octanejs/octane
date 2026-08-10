# Wagmi upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `wagmi` |
| Version | `3.7.4` |
| Canonical tag commit | `4c461abcbf1b7a0f7adbef3d80e801c2723aa274` |
| Supported upstream range | exactly `3.7.4` |
| React oracle | `19.2.7` |
| Canonical archive SHA-256 | `4be681123deea5cc4b4a4c5bf448aadf32aebeff2a51c9e5009e6602f3b4f00a` |
| License | MIT |

The npm artifact contains compiled output and declarations. The canonical
repository contains the React source, colocated runtime tests, and
`*.test-d.ts` type tests under `packages/react/src`. Those pristine artifacts
have not yet been vendored or executed from this repository, so the parity
manifest deliberately records the pin as `recorded-unverified`.

## Runtime export crosswalk

The Octane binding ports `WagmiProvider`, `createConfig`, `useConfig`,
`useConnection`, `useConnect`, `useDisconnect`, `useSwitchConnection`,
`useSwitchChain`, `useConnectors`, `useConnections`, `useChains`, `useBalance`,
`useReadContract`, `useSimulateContract`, `useWriteContract`,
`useSendTransaction`, `useWaitForTransactionReceipt`, and `useSignMessage`.
The provider/connection workflow is paired with the real React binding in
`tests/differential/parity.test.ts`; focused Octane tests cover the other
ported hooks, SSR hydration, watcher ownership, and privileged-action guards.

The rest of Wagmi 3.7.4's React entry point is an explicit gap. This includes
the remaining query, mutation, watcher, client, account-effect, call-batching,
codegen, ENS, fee, proof, transaction, typed-signing, and wallet-client hooks;
`Hydrate`; React context/error exports; and the core transport/storage helpers
re-exported by Wagmi. Consumers should import framework-neutral helpers from
`@wagmi/core` where possible. This package does not claim full export parity.

## Test-suite disposition

The tagged repository has colocated runtime and type suites under
`packages/react/src`. They are present upstream but are not yet vendored,
inventoried, or adapted here. Existing `packages/wagmi/tests` cases are
repository-authored Octane contract tests. The manifest registers one bounded
React differential lane and does not count the Octane-only security and
lifecycle cases as React parity evidence.

To advance the manifest to `verified`, vendor the pinned `packages/react`
source and tests byte-exactly, inventory and run the pristine runtime/type
suites, adapt every applicable case, and classify every upstream artifact and
Octane-authored test.
