# @octanejs/drei

An Octane port of the complete pinned `@react-three/drei@10.7.7` public web API.

## Installation

```sh
npm install @octanejs/drei @octanejs/three three
pnpm add @octanejs/drei @octanejs/three three
```

This package is under active parity development. Compatibility claims are tied
to the executable upstream crosswalk and React/Octane evidence described in
[UPSTREAM.md](./UPSTREAM.md); no unsupported export is exposed as a stub.

Compiler configuration must use `dreiRenderers` from `@octanejs/drei/config`.
The preset includes the Three renderer and the Three-to-DOM child boundary used
by `Html` and PivotControls annotations.
