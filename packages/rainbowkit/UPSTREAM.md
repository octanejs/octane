# RainbowKit upstream contract

This port targets `@rainbow-me/rainbowkit@2.2.11`, release commit
`03360ee924cfa6af13ff1d623b356bf5a170348e`, with npm archive SHA-256
`57b9440555521157bcf5c69044b15cf8eb6c1ae72fe6511c7516c64d1ef16d9e`.
The source is MIT licensed.

The supported Octane surface is the provider, connection controls, modal
hooks, and theme helpers listed in `status.json`. This is intentionally not a
drop-in port: upstream consumes Wagmi v2 while the Octane adapter consumes
Wagmi v3, and wallet factories, authentication, localization, recent
transactions, ENS/avatar data, cool mode, and pixel-identical themes remain
outside the supported surface.

The upstream runtime and type suites exist but are not vendored or adapted
one-for-one. The bounded React lane proves only that the three modal hooks are
inert outside a provider on both runtimes. The manifest remains
`recorded-unverified` until pristine suites and full artifact disposition are
present.
