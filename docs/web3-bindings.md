# Web3 bindings

Octane's Web3 bindings are designed for both full Octane applications and
incremental adoption inside an existing React 19 application.

The React-hosted example below uses `OctaneCompat`. For the opposite direction,
`ReactCompat` from `octane/react` hosts a React-owned component inside Octane;
that component's hooks and providers remain React's. See the
[React compatibility guide](https://octanejs.dev/docs/react-compat) for both
directions and the [ReactCompat contract](./react-compat.md) for its compiler,
commit, context, and SSR requirements.

## Packages

- `@octanejs/wagmi` provides Octane hooks and a provider over Wagmi v3 core.
- `@octanejs/rainbowkit` provides Octane-native wallet connection UI over
  `@octanejs/wagmi`. It follows RainbowKit's user-facing connection contracts,
  but targets Wagmi v3 rather than upstream RainbowKit's Wagmi v2 peer range.

Both packages are experimental. Use deterministic connectors in automated tests;
real injected-wallet conformance still requires a secure browser context and a
sanctioned test wallet.

## Incremental React adoption

A React host keeps ownership of routing, layout, and the island host element.
The compiled Octane subtree owns its descendants, Wagmi subscriptions, wallet
state, and RainbowKit overlays:

```tsx
import { OctaneCompat } from 'octane/react';
import { WalletIsland } from './wallet-island.tsrx';

export function AccountRoute({ route, label }) {
  return (
    <main data-route={route}>
      <h1>{label}</h1>
      <OctaneCompat
        component={WalletIsland}
        props={{ route, label }}
      />
    </main>
  );
}
```

Compile `.tsrx` modules with the Octane plugin while leaving `.tsx` host modules
on the normal React toolchain. Do not alias `react`, `react-dom`, or their JSX
runtimes to Octane: that removes the real React host instead of creating an
island boundary.

For SSR, render the same island position with `OctaneCompat` from
`octane/react/server`, then hydrate with `octane/react` on the client. The React
host treats the island contents as opaque, and Octane adopts the server nodes.

Keep the boundary narrow. Pass route labels, chain identifiers, feature flags,
and other documented serializable configuration as island props or React
context. Construct Wagmi clients, query clients, transports, and connectors
inside the island integration module rather than moving mutable framework
objects through application routing state.

Unmounting `OctaneCompat` disposes the hosted Octane root. Wagmi watchers,
RainbowKit dialogs, focus isolation, and scroll locks are released with that
root, while the surrounding React route remains mounted.

The repository pins this integration in both environments:

- `packages/octane/tests/react-hosted/web3-island.test.ts` covers development
  and production compilation, React SSR hydration, rejected-request recovery,
  connection state, navigation, and exact teardown.
- `packages/octane/tests/browser/react-hosted-web3/` resolves each source-published
  binding through its normal workspace package export map—without source
  aliases—then serves the production Vite build to a real Chromium journey. The
  test asserts that Chromium receives the built, hashed asset rather than the
  source entry. The host `.tsx` stays on React's JSX pipeline while the island
  `.tsrx` is compiled by Octane.
