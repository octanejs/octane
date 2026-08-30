# `@octanejs/solana-kit`

Octane-native Solana client, Wallet Standard, TanStack Query, and transaction integration for the exactly aligned `@solana/kit@7.0.0` family.

## Installation

```sh
npm install @octanejs/solana-kit
pnpm add @octanejs/solana-kit
```

Use `@solana/kit` directly for addresses, codecs, RPC, signers, transaction messages, submission, and confirmation. This package is the reactive UI seam; it does not wrap or re-export Kit.

## Supported

- `ClientProvider`, `ClientContext`, `useClient`, `useClientCapability`, and `createClientStore`
- validated, generation-safe wallet discovery and account selection with `createWalletStore`
- explicit-action sign/send/confirm orchestration with typed failure and indeterminate reconciliation
- `useRequestQuery` from `@octanejs/solana-kit/query`, backed by `@octanejs/tanstack-query`

The Wallet Standard adapter is private and structural. Public types contain no React or `@wallet-standard/react` types, and there is no second Octane consumer that warrants a separately published package.

## Deliberate limits

`@solana/react/swr` is excluded because Octane has no SWR binding. The upstream selected-wallet provider and signer hooks expose `@wallet-standard/react` or React dispatch types, so this first surface uses the narrower Octane-native wallet store instead. Subscription/tracked-data query hooks are deferred pending a dedicated streamed-query characterization.

Wallet discovery is browser-only and activates only when an application supplies a registry. Server rendering is inert. Browser hosts need `BigInt`, `fetch`, WebSocket, Web Crypto with Ed25519 support, and a Wallet Standard registry. Signing and submission must be called from an explicit user action and are never retried automatically.
