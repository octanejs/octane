# @octanejs/shadcn

## 0.0.8

### Patch Changes

- 749223b: Add `accordion` to the Base UI base, at `@octanejs/shadcn/base-ui/Accordion`.

  Transcribed from upstream's Base UI source with class strings and `data-slot` names verbatim, and
  running on the newly ported `@octanejs/base-ui/accordion` primitive — the first primitive-backed
  family in this base. `@octanejs/base-ui` is now a dependency of the package.

- 749223b: Add `alert-dialog` to the Base UI base, at `@octanejs/shadcn/base-ui/AlertDialog`.

  Transcribed from upstream's Base UI source and running on `@octanejs/base-ui`'s AlertDialog —
  the first portalled family in this base. Upstream maps Overlay to Backdrop, Content to Popup, and
  Cancel to Close. This port also maps Action to Close, with both actions composing a Button through
  Base UI's render-as-element contract so confirming dismisses the dialog.

  The overlay and popup use stable keys so Octane can reconcile the portal siblings by identity.

  The title drops upstream's `cn-font-heading`, matching the React Aria base: this package ships
  the default-Tailwind utilities-inlined flavor rather than the pinned `cn-*` semantic hooks, so
  that class resolves to nothing here.

- 749223b: Start the Base UI base, reachable at `@octanejs/shadcn/base-ui/<Family>`.

  Seven primitive-free families land: `alert`, `aspect-ratio`, `card`, `empty`, `native-select`,
  `skeleton` and `spinner`. Only `alert` is transcribed from upstream's Base UI source and
  verified byte-identical to it — the other six are derived from the React Aria base and each
  file's header says so, because the bases do genuinely diverge.

  Nothing primitive-backed is included. Base UI's primitive API is structurally different from
  React Aria's, so those families cannot be derived and need transcribed upstream sources.

- 749223b: Add `checkbox`, `switch` and `radio-group` to the Base UI base.

  Their conditional utilities are adapted rather than copied. Base UI publishes bare
  `data-checked`/`data-unchecked` where the Radix base publishes `data-state="checked"`, and every
  Root renders a `<span role="…">` that is never `:disabled`, so `disabled:` variants become
  `data-disabled:`. Copying either wrong form yields a control whose appearance never changes.

  Both dialects are pinned by tests that assert the rendered DOM carries the attributes the class
  strings target, so a wrong-base copy fails rather than rendering silently dead styling.

- 749223b: Add the foundation families to the Base UI base: `button`, `input`, `label`, `separator`,
  `textarea` and `kbd`.

  `button`, `input`, `label` and `separator` run on real `@octanejs/base-ui` primitives, so their
  behavior is the primitive's rather than derived. `textarea` and `kbd` are plain hosts because
  Base UI ships no textarea or Keyboard primitive.

  `separator` takes the React Aria base's class string rather than the Radix one on purpose: Base
  UI publishes orientation as `aria-orientation`, so Radix's `data-horizontal:` utilities would
  never match and the separator would render with no thickness.

  No `LinkButton` — Base UI has no `Link` primitive, and upstream composes links through `render`
  instead. `pagination`, which consumes it in the React Aria base, stays unported until the
  upstream source shows how.

- 749223b: Add `dialog`, `popover` and `tooltip` to the Base UI base.

  Positioning is adapted rather than copied. Base UI inserts a Positioner layer
  (`Portal > Positioner > Popup`) and publishes its transform origin as `--transform-origin`, where
  Radix publishes `--radix-<part>-content-transform-origin`. A copied Radix class would reference a
  variable nothing sets, so the popup would scale from the wrong corner on open — visible only in
  motion. Tooltip additionally drops Radix's `data-[state=delayed-open]` utilities, which have no
  Base UI counterpart.

  `PopoverAnchor` is deliberately absent: Base UI positions through the Positioner's `anchor` prop
  rather than rendering an Anchor element, so there is no part to port. Recorded as a known
  divergence in the cross-base contract test.

- Updated dependencies [2ee31bd]
- Updated dependencies [d6d8a60]
- Updated dependencies [c1ad31b]
  - @octanejs/base-ui@0.1.21
  - octane@0.1.23
  - @octanejs/aria@0.0.17
  - @octanejs/lucide@0.1.18
  - @octanejs/radix@0.1.22
  - @octanejs/sonner@0.1.18

## 0.0.7

### Patch Changes

- a3aced9: Add the React Aria base, and distribute per component family instead of through
  one barrel.

  **Breaking:** the `@octanejs/shadcn` root entry is gone. Import the family you
  need — `import { Button } from '@octanejs/shadcn/Button'` — or install through
  the registry, which is unchanged and remains the primary distribution. The
  barrel pulled every family, and transitively every primitive of every base, into
  a consumer bundle to use one component. `cn` moves to `@octanejs/shadcn/cn`,
  shared types to `@octanejs/shadcn/types`, and `useIsMobile` to
  `@octanejs/shadcn/hooks/use-mobile`.

  Component sources move under `src/bases/<base>/ui/`, matching upstream's layout.
  Emitted registry output is byte-identical, so nothing installed via the shadcn
  CLI is affected.

  **New:** 33 families of the React Aria base, over `@octanejs/aria/components`,
  addressed as `@octanejs/shadcn/react-aria/<Family>`. Sources are upstream's
  `aria-nova` style and are class-string identical to it. `select` and `sonner`
  are not ported yet (they need `input-group` and `next-themes`); `hover-card`,
  `menubar`, and `navigation-menu` do not exist in upstream's aria base at all.

  Known limitation: the families whose children are a stateful render prop —
  `checkbox`, `switch`, `radio-group`, `breadcrumb` — do not re-render that child
  when selection changes, so the tick, thumb, and dot stay in their initial state.
  The cause is octane's handling of a call-returned closure in a children
  position, not these sources.

- Updated dependencies [43df1f9]
- Updated dependencies [7a112b4]
  - octane@0.1.22
  - @octanejs/aria@0.0.16
  - @octanejs/lucide@0.1.17
  - @octanejs/radix@0.1.21
  - @octanejs/sonner@0.1.17

## 0.0.6

### Patch Changes

- Updated dependencies [10efc28]
- Updated dependencies [39bfc49]
- Updated dependencies [4863b39]
- Updated dependencies [ef82ba3]
  - octane@0.1.21
  - @octanejs/lucide@0.1.16
  - @octanejs/radix@0.1.20
  - @octanejs/sonner@0.1.16

## 0.0.5

### Patch Changes

- Updated dependencies [c6370b6]
- Updated dependencies [dd272ad]
- Updated dependencies [c151b71]
- Updated dependencies [66b51d8]
- Updated dependencies [a57c32a]
- Updated dependencies [e38a557]
- Updated dependencies [bd90e27]
- Updated dependencies [ae6811d]
- Updated dependencies [62d81b8]
  - octane@0.1.20
  - @octanejs/lucide@0.1.15
  - @octanejs/radix@0.1.19
  - @octanejs/sonner@0.1.15

## 0.0.4

### Patch Changes

- Updated dependencies [9d5d642]
- Updated dependencies [f469b3f]
- Updated dependencies [ac2ae2f]
- Updated dependencies [3aada64]
  - octane@0.1.19
  - @octanejs/lucide@0.1.14
  - @octanejs/radix@0.1.18
  - @octanejs/sonner@0.1.14

## 0.0.3

### Patch Changes

- Updated dependencies [c3ba5e0]
- Updated dependencies [430061e]
- Updated dependencies [a21ff46]
- Updated dependencies [1821f63]
- Updated dependencies [3db74e9]
- Updated dependencies [0d4ed9e]
- Updated dependencies [7bdf1fa]
- Updated dependencies [e1927d8]
- Updated dependencies [dac0e66]
- Updated dependencies [54c60fa]
- Updated dependencies [59a95d6]
- Updated dependencies [138fbd9]
- Updated dependencies [50c1ab5]
- Updated dependencies [ff0f898]
- Updated dependencies [e0c5490]
- Updated dependencies [e6a158e]
  - octane@0.1.18
  - @octanejs/sonner@0.1.13
  - @octanejs/lucide@0.1.13
  - @octanejs/radix@0.1.17

## 0.0.2

### Patch Changes

- 6d85dcb: The generated shadcn registry resolves sibling `workspace:*` specifiers to the
  sibling's current version, so the install specs the upstream shadcn CLI reads
  stay installable from npm. The registry is regenerated at release time, which
  keeps those pins tracking the versions each release actually ships.
- 5fc18b7: `@octanejs/shadcn` now depends on its `@octanejs/lucide`, `@octanejs/radix` and
  `@octanejs/sonner` siblings through the `workspace:*` protocol, like every other
  package in the repo. The exact-version pins resolved those siblings from the npm
  registry instead of the workspace, so the package built against stale published
  copies, and `changeset version` rewrote the pins on every release, which left
  `pnpm-lock.yaml` out of date and failed the release job's frozen install.
  `pnpm pack` still substitutes the concrete sibling versions into the published
  manifest, so the published dependency ranges are unchanged in form.
- Updated dependencies [bd31a2d]
- Updated dependencies [9e0ef45]
- Updated dependencies [dea219b]
- Updated dependencies [2374980]
- Updated dependencies [2374980]
- Updated dependencies [ac687f8]
- Updated dependencies [7997d39]
- Updated dependencies [eb69cb6]
  - octane@0.1.17
  - @octanejs/lucide@0.1.12
  - @octanejs/radix@0.1.16
  - @octanejs/sonner@0.1.12
