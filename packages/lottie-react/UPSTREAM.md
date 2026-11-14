# lottie-react upstream evidence

| Item | Pin |
| --- | --- |
| npm package | `lottie-react@2.4.1` |
| npm integrity | `sha512-LQrH7jlkigIIv++wIyrOYFLHSKQpEY4zehPicL9bQsrt1rnoKRYCYgpCUe5maqylNtacy58/sQDZTkwMcTRxZw==` |
| npm tarball SHA-256 | `8c28c26157e5e69a6d93111005ad78044f9ae3492e9b20edd78ac4da288e513b` |
| Source commit | `bd794d226e14c714e7d740a1f7fa9dcf284d7235` from npm's `gitHead` |
| Published declaration SHA-256 | `d114d7f758e0ae8f0a2070004c89cc92810580fab416a470a78bbcf34f315357` |
| License | MIT, David Gamote and other contributors |
| Animation engine | `lottie-web@5.13.0` |
| React oracle | `react@19.2.7`, `react-dom@19.2.7`, `@types/react@19.2.17`, `@types/react-dom@19.2.3` |

The [pinned source](https://github.com/Gamote/lottie-react/tree/bd794d226e14c714e7d740a1f7fa9dcf284d7235) supplies the component, hooks, types, and upstream Jest tests. The lock records their Git blobs. The original npm tarball and a byte-exact copy of its `build/index.d.ts` live under `upstream-artifact/`. The npm declaration is authoritative for the released callback types. `LICENSE.upstream` preserves the upstream notice byte for byte, including its CC0 provision for sample code.

## Published surface

| Release export | Octane binding |
| --- | --- |
| Default `Lottie` | `Lottie` with Octane container props and animation event callbacks |
| `useLottie` | Renderer options, animation lifecycle, playback methods, refs, and the Octane `View` |
| `useLottieInteractivity` | Scroll and cursor actions on the hook's player and view |
| `LottiePlayer` | The `lottie-web` player export |
| `Action`, `Axis`, `InteractivityProps`, `Position` | Interactivity types |
| `LottieComponentProps`, `LottieOptions`, `LottieRef`, `LottieRefCurrentProps`, `PartialLottieComponentProps`, `PartialLottieOptions` | Component, hook, and player handle types |
| `Listener`, `PartialListener` | Player event listener types |

The binding publishes authored sources through its root entry. Octane element, ref, DOM event, and style types describe the framework-facing portions of the API.

## Evidence

The pinned suite contains five component, eight animation-hook, and eighteen interactivity registrations. The runtime crosswalk maps those Jest registrations to the React and Octane lanes. The release has zero dedicated upstream type-test registrations. Paired declaration checks exercise the published React and Octane signatures, and the public type project asserts all sixteen exports. The repository pack check compiles the installed binding and its consumer in both Node and browser ambient configurations.

Run `pnpm --dir packages/lottie-react upstream:verify` to check the pristine source lock, artifact hashes, and upstream license.
