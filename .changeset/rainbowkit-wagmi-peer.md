---
'@octanejs/rainbowkit': patch
---

`@octanejs/wagmi` is now a peer dependency, as `wagmi` is for `@rainbow-me/rainbowkit`, so `RainbowKitProvider`, `ConnectButton`, and `WalletButton` read the application's `WagmiProvider`. Before, the binding pinned its own exact release, so an app on another `@octanejs/wagmi` release got a second copy with its own Wagmi context, and the components threw `WagmiProviderNotFoundError` under the app's provider. The `Connector` type now comes from `@octanejs/wagmi` too, and the direct `@wagmi/core` dependency is gone.
