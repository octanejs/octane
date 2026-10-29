# `@octanejs/dnd-kit-core` upstream ledger

`@octanejs/dnd-kit-core` ports `@dnd-kit/core@6.3.1` from
`https://github.com/clauderic/dnd-kit.git`, the legacy dnd kit API.

## Pin

- Package: `@dnd-kit/core@6.3.1`, the latest release.
- Source commit: `e9215e820798459ae036896fce7fd9a6fe855772`, the `@dnd-kit/core@6.3.1` release tag. It holds all
  five legacy packages at their latest releases. Their trees there are
  byte-identical to their own release tags; this package's tag is
  `@dnd-kit/core@6.3.1` at `e9215e820798459ae036896fce7fd9a6fe855772`.
- npm integrity: `sha512-xkGBRQQab4RLwgXxoqETICr6S5JlogafbhNsidmrkVv2YRs5MLwpjoF2qpiGjQt8S9AoxtIV603s0GIUpY5eYQ==`
- npm tarball SHA-256: `f68d69af50234872c2e3345bc8bf98d8bcb0a9481eab6d370605c99e76a98c33`
- License: MIT. `LICENSE.upstream` is the upstream package's license, byte for byte.
- React oracle: `react@19.2.7` and `react-dom@19.2.7` from the default catalog.

The legacy packages were published without a `gitHead` or npm provenance, so the
repository's preflight cannot tie the npm artifact to a commit on its own. The
source is pinned to the release tag instead, and the parity status stays
`recorded-unverified`.

`upstream/` holds the pinned package directory byte for byte. Each file
is checked against its git blob SHA in `audit/upstream.lock.json`:

```sh
pnpm react-port:materialize run --check --package-dir packages/dnd-kit-core
```

## Source boundary

`src/` mirrors `upstream/src/` file for file, formatted with the repository's
Prettier settings, with `react`/`react-dom` imports pointed at `octane` and
`@dnd-kit/*` imports pointed at the `@octanejs/dnd-kit-*` packages. Files that
change beyond that:

- `components/DndContext/DndContext.tsx`: renders its contexts as `<Context value>` (Octane has no `.Provider`), imports `unstable_batchedUpdates` from `octane`, and uses the native activator event directly instead of `event.nativeEvent`.
- `sensors/{pointer,mouse,touch,keyboard}/*Sensor.ts`, `sensors/types.ts`, `hooks/utilities/useSyntheticListeners.ts`, `types/react.ts`: activator handlers and listener maps take the native event, and `SyntheticEventName` derives from Octane's `DOMAttributes`. This is the recorded `native-activator-events` divergence.
- `components/DragOverlay/components/PositionedOverlay/PositionedOverlay.tsx`: takes `ref` as a prop and calls `createElement`, because Octane has no `forwardRef`.
- `components/DragOverlay/components/AnimationManager/AnimationManager.tsx`: marked with `descriptorChildren`, so compiled call sites pass the overlay as an element descriptor it can clone during the drop animation.
- `components/DragOverlay/DragOverlay.tsx`, `components/DragOverlay/components/NullifiedContextProvider/NullifiedContextProvider.tsx`, `components/Accessibility/Accessibility.tsx`, `store/types.ts`: Octane imports, `memo`, and `<Context value>` providers.
- `hooks/useDroppable.ts`, `hooks/utilities/useDroppableMeasuring.ts`, `sensors/pointer/AbstractPointerSensor.ts`: `NodeJS.Timeout` becomes `ReturnType<typeof setTimeout>`, so browser consumers type-check without Node types.
- Every `.tsx` file carries the Octane JSX pragma; `components/Accessibility/components/RestoreFocus.tsx` and `components/DndMonitor/useDndMonitorProvider.tsx` change by that line only.

## Public surface

Every runtime export of `@dnd-kit/core@6.3.1` is ported under the same name: `DndContext`, `DragOverlay`, the default announcements, instructions, and drop animation, `useDndMonitor`, `useDraggable`, `useDroppable`, `useDndContext`, the measuring and auto-scroll enums, `applyModifiers`, the four sensors with `useSensor`/`useSensors` and `KeyboardCode`/`defaultKeyboardCoordinateGetter`, the four collision algorithms, `getClientRect`, `getFirstCollision`, `getScrollableAncestors`, `defaultCoordinates`, and every public type.
`tests/exports.test.ts` compares the export names and value kinds with the published
package, and `typetests/public-api.test-d.ts` checks the public types.

## Tests

| Upstream | Disposition |
| --- | --- |
| `test/core.test.tsx (1 placeholder case)` | Runs unchanged against the pinned source and React (`dnd-kit-core-pristine`), and regenerated from the lock against the port (`dnd-kit-core-upstream`). |
| Repository Cypress specs (`cypress/integration/draggable_spec.ts`, `sortable_spec.ts`) | Not ported. They drive the Storybook stories outside the package boundary. The differential below covers the same pointer and keyboard drags against the published package. |

Because the upstream unit tests are placeholders, the behavioral contract is the
repo-authored differential: `tests/differential/parity.test.ts` (a pointer drag through a `DragOverlay` and its pending drop animation, a keyboard drag with the default announcements, a keyboard cancel, and a mouse drag with custom announcements in an explicit container), plus `tests/native-events.test.ts` for the divergence. `audit/react-parity.json` registers all three
lanes; `node scripts/react-parity/dnd-kit-legacy-manifest.mjs` regenerates it and
the runtime inventories.
