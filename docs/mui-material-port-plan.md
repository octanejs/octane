# Material UI → Octane port plan

Port the current stable Material UI surface to Octane as two packages:

- `@octanejs/mui-system` — the MUI System, theme, `sx`, and Octane-native
  styled engine.
- `@octanejs/material` — Material UI components, styles, utilities, and
  component subpath exports.

The upstream baseline is **Material UI v9.0.1**, tag `v9.0.1`, commit
`933bdf67f2405b9bfd4a115b957bc60fd2abaccf` (audited 2026-07-13). The real
`@mui/system@9.0.1` and `@mui/material@9.0.1` packages are the React-side
oracles. The tag contains `@mui/styled-engine@9.0.0`.

This follows the repository's Radix, Base UI, and Recharts rule: reuse pure
logic, port React-coupled code faithfully, and fix genuine Octane gaps in
Octane with regression tests and a changeset. Do not hide framework gaps in a
component-specific workaround.

## Recommendation

Proceed, but treat this as a multi-phase program rather than a single binding
PR. Material UI's behavior is only half of the product: its styling contract is
public API. The first milestone must prove the styled engine, theming, `sx`,
CSS ordering, SSR, and compound-child authoring before scaling out the
component surface.

Do not start by bulk-converting components. If the styling and children gates
below do not pass, a large component port would produce attractive demos but
not a faithful Material UI binding.

## Scope and baseline

The pinned `@mui/material` entry point exports 130 default component or
infrastructure symbols. The audited upstream source contains:

| Surface | Audit result |
| --- | ---: |
| Material runtime source | 649 files / about 63.5k lines |
| System runtime source | 113 files / about 7.3k lines |
| Material files importing React directly | 180 |
| Material `forwardRef` sites | 130 |
| Material files declaring styled components | 121 |
| Material context files | 16 |
| Material files using slot helpers | 45 |
| Material files using `React.Children` directly | 11 |
| Material files using `cloneElement` | 28 |
| Material files with direct DOM/observer work | 22 |

These counts include small generated utility/class modules and indicate scale,
not the number of files that must be rewritten by hand.

In the initial program:

- Include the public `@mui/system` runtime and the stable `@mui/material`
  component surface, including root and per-component subpath imports.
- Preserve the default Emotion-compatible styling behavior, theme component
  defaults, variants, style overrides, `sx`, slots, `slotProps`, the polymorphic
  `component` prop, CSS variables, RTL, and refs-as-props.
- Keep MUI's utility class names and Emotion-compatible generated class names
  stable wherever the same inputs are supplied.
- Exclude MUI X, MUI Lab, Material Next.js adapters, the styled-components
  engine, Pigment CSS, and docs-only recipes from the first program.
- Add `@octanejs/icons-material` as a follow-up generated package after
  `SvgIcon` is complete. Treat each MUI X package as a separate future port.
- Continue the existing `@octanejs/base-ui` port rather than reviving the
  deprecated `@mui/base`. Material-styled NumberField and Menubar recipes can be
  added after their required Base UI parts are complete; they are not exports
  of the pinned `@mui/material` package.

## Package and source shape

Use a pinned, gitignored `.mui-material/` checkout as the source of truth. Cite
the upstream source path in ported files and preserve the MIT license notices.
Do not port from transpiled package output when the tagged source is available.

Proposed workspace layout:

```text
packages/mui-system/
  src/
    styled-engine/       # Octane-native Emotion-compatible adapter
    vendor/mui-utils/    # pure utilities needed by System
    ...                  # theme, sx, css vars, Box/Grid/Stack/Container
  tests/

packages/material/
  src/
    styles/
    internal/
    vendor/mui-utils/    # or shared workspace-private source if duplication grows
    <Component>/
    index.ts
  tests/
    differential/
    conformance/
    browser/
    hydration/
    typetests/
```

Author DOM-producing components in `.tsrx` where practical so the compiler
assigns hook slots and produces the normal optimized templates. Keep pure
algorithms in `.ts`. Plain-`.ts` custom hooks must follow the existing explicit
slot/sub-slot convention and declare the package's manual hook-slot paths in
`package.json`.

`@mui/utils` and `@mui/private-theming` are implementation inputs, not new
public packages in the first release. Vendor pure utilities and port the small
React-coupled theming/hooks layer locally. Extract `@octanejs/mui-utils` later
only if external demand justifies supporting that separate public surface.

## Architectural seams

### 1. Octane-native styled engine

Material UI cannot be ported faithfully by replacing `styled()` calls with
static classes or inline style objects. Styles depend at render time on theme,
owner state, variants, component overrides, `sx`, color scheme, and slots.

Implement the API consumed by MUI System rather than porting Emotion's React
binding:

- Reuse framework-neutral Emotion primitives such as `@emotion/serialize`,
  `@emotion/cache`, and `@emotion/sheet` where their output is required for
  hash, Stylis, prefixing, and ordering parity.
- Implement Octane versions of `styled`, `ThemeContext`, `css`, `keyframes`,
  `GlobalStyles`, and `StyledEngineProvider`.
- A styled component resolves theme and style expressions, filters host props,
  serializes the result, composes the generated and utility classes, and
  renders its string tag or component through Octane descriptors.
- Preserve the `__emotion_styles`-compatible metadata used by MUI's
  `internal_mutateStyles`, including styled-on-styled composition.
- Feed server-rendered rules through Octane's `injectStyle(id, css)` so
  buffered SSR returns them in `RenderResult.css` and streaming can flush them
  with content. On the client, use an adapter-managed sheet/cache that supports
  insertion points, ordering, global-style updates/removal, and adoption of
  server rules. Extend `injectStyle` only if a general Octane capability is
  needed; its current append-and-dedupe behavior alone cannot implement every
  `StyledEngineProvider` and GlobalStyles contract.
- Prove default insertion order, `injectFirst`, cascade layers, global styles,
  nested selectors, keyframes, responsive `sx`, container queries, theme
  variants, component style overrides, and CSS-variable themes.

The React oracle may use a dedicated Emotion cache while the Octane side uses
its adapter. Tests must compare ordered canonical CSS rules in addition to DOM;
matching `innerHTML` alone cannot validate this layer.

### 2. React surface translation

- `forwardRef` becomes a normal `ref` prop. Port `useForkRef`/ref composition
  and preserve callback-ref cleanup behavior.
- React contexts become Octane contexts. Port `@mui/private-theming`, default
  props, RTL, color-scheme, and form-control contexts directly.
- `React.createElement`, dynamic `component`, and slot element types become
  Octane `createElement` descriptors.
- `cloneElement`, element-as-prop APIs, and slots use Octane's descriptor
  utilities. Do not clone compiler-generated children blocks as if they were
  descriptors.
- Replace `react-transition-group` with an Octane-native transition state
  machine while preserving callback order, timeouts, appear/enter/exit, and
  `nodeRef` behavior.
- Keep `@popperjs/core` as the pure positioning engine for MUI Popper. Do not
  swap it for Floating UI when exact Popper behavior is part of the upstream
  contract.
- Port dev warnings only when they protect a functional invariant. Drop
  React-specific diagnostics and PropTypes from the published runtime.

### 3. Compound children

Normal `.tsrx` element children arrive as an optimized render block, not a
React element tree. MUI still inspects children directly in Accordion,
AvatarGroup, BottomNavigation, Breadcrumbs, FormControl, IconButton,
ImageListItem, Select, SpeedDial, Stepper, and Tabs; ButtonGroup and
ToggleButtonGroup also do so through `getValidReactChildren`. Single-child
wrappers such as Tooltip, ClickAwayListener, transitions, Modal, and FocusTrap
also need to merge props or refs into an arbitrary child.

Resolve each use by category:

- Prefer context/registration for state injection and indexing (Tabs, Stepper,
  BottomNavigation, SpeedDial, and FormControl). This is already proven by the
  Radix, Base UI, and Recharts ports.
- Prefer CSS or local part behavior where cloning only adds presentation
  (ImageListItem and similar cases).
- For arbitrary single-child prop/ref injection, prove a wrapper mechanism that
  preserves the child's DOM shape and composes handlers/refs. A Tooltip-like
  API cannot be declared faithful if it adds a wrapper or only accepts
  prop-position descriptors.
- For structural inspection, truncation, or reordering (Accordion,
  Breadcrumbs, AvatarGroup, and non-native Select), first prove that a faithful
  registration/rendering design can retain the normal authored API, SSR
  markup, order, keys, and hydration identity.
- If a source-faithful adaptation is impossible, add a narrowly scoped
  compiler/runtime capability with dedicated client, SSR, and hydration tests.
  Do not make a package-local pseudo-VDOM or require users to pass an unnatural
  descriptor array silently.
- If neither route is viable, mark the affected component unsupported in
  `status.json`; do not call the package complete.

### 4. Types

MUI's declaration surface is deeply React-shaped and polymorphic. Port it as a
first-class deliverable rather than shipping the runtime under `any`:

- Define local structural types for renderables, component bodies, descriptors,
  refs, intrinsic tag names, and component props.
- Port `OverridableComponent`, `OverrideProps`, `component`, `slots`, and
  `slotProps` generics to Octane component bodies and descriptors.
- Preserve theme module augmentation, palette extension, component override,
  variant, `SxProps`, and owner-state inference.
- Replace `ReactNode` with Octane renderables and synthetic event types with the
  corresponding native DOM event types.
- Add compile-only tests for polymorphic roots, slot replacement, ref target,
  custom palette/theme augmentation, responsive `sx`, and controlled form
  props.

## Feasibility gates

The program moves past Phase 0 only when all three gates are green.

1. **Style gate:** `ThemeProvider` → `Box sx` → a styled custom component
   produces oracle-equivalent classes and ordered CSS on client render, buffered
   SSR, streaming SSR, and hydration. Include theme overrides, variants,
   keyframes, global styles, CSS variables, and `StyledEngineProvider` options.
2. **Composition gate:** a styled host, styled Octane component, polymorphic
   `component="a"`, custom slot, functional `slotProps`, and callback/object refs
   render and update byte-equally to React.
3. **Children gate:** port three deliberately difficult proofs—a minimal
   Tooltip/ClickAway-style wrapper for arbitrary child prop/ref injection, Tabs
   or Stepper for child indexing/state injection, and Breadcrumbs or Accordion
   for structural children handling. The ordinary nested `.tsrx` authoring form
   must work; the result must match React across updates, SSR, and hydration.

Any Octane change found by a gate gets a focused runtime/compiler regression
test and an `octane` patch changeset before the binding relies on it.

## Phased delivery

### Phase 0 — pin, scaffold, and prove the gates

- Add the pinned source checkout instructions, package manifests, root
  typecheck entries, catalog oracle dependencies, Vitest projects, aliases,
  `status.json`, and differential precompile rewrites.
- Build only enough styled engine, theme, slot, and child-registration code to
  pass the three feasibility gates.
- Establish the DOM + ordered-CSS differential result format and one paired
  browser screenshot fixture.

Exit: all feasibility gates pass. No component-count claim yet.

### Phase 1 — MUI System and theming

- Port pure theme/color/breakpoint/spacing/container-query/`sx` functions.
- Port ThemeProvider, private theming, default props, RTL, media query, CSS
  variables/color schemes, `InitColorSchemeScript`, GlobalStyles, and the
  styled engine.
- Port Box, Container, Grid, and Stack with their public types and subpaths.

Exit: the System package's stable runtime exports are covered by pure unit,
differential CSS/DOM, type, and SSR/hydration tests.

### Phase 2 — first Material vertical slice

- Port the default Material theme, styles exports, utility-class generation,
  `useDefaultProps`, slot plumbing, SvgIcon, Typography, Paper, ButtonBase,
  Button, IconButton, and TouchRipple.
- Land Button first with `disableRipple`, then add ripple/focus-visible and
  keyboard behavior without weakening the exit criteria.
- Exercise theme default props, variants, style overrides, `sx`, custom root,
  custom slots, loading state, ref, native click/keyboard, and ripple timing.

Exit: a themed contained Button with an icon, custom `sx`, theme overrides, and
interactive ripple is DOM-, CSS-, behavior-, SSR-, and hydration-equivalent to
the pinned React package.

### Phase 3 — static visual and layout components

Port the low-interaction families that reuse the proven styling substrate:

- AppBar, Toolbar, Alert/AlertTitle, Avatar, Badge, Divider, Link, Icon.
- Card, CardHeader, CardMedia, CardContent, CardActions.
- List and its static item/text/icon/avatar/subheader parts.
- Table, progress indicators, Skeleton, CssBaseline, and ScopedCssBaseline.

Exit: default + representative variant/color/size states are DOM/CSS
differential-green; semantic markup and SSR/hydration are covered per family.

### Phase 4 — form and input foundation

- Port FormControl context, InputBase, Input, FilledInput, OutlinedInput,
  InputLabel, InputAdornment, FormLabel, FormHelperText, FormGroup, and
  TextareaAutosize.
- Add TextField, Checkbox, Radio/RadioGroup, Switch, NativeSelect, and form-label
  composition.
- Then add Select, Slider, Rating, and Autocomplete with dedicated keyboard,
  focus, pointer, controlled/uncontrolled, and ARIA tests.

Octane controlled `value`/`checked` behavior is reused directly. Native events
remain intentional: text `onInput` is per-keystroke and native `change` commits
on blur/change; do not create React's synthetic `onChange` normalization.
Component-level callbacks named `onChange` may remain where MUI itself invokes
them from a native event (for example Slider or Tabs), but their event object is
native.

Exit: representative controlled and uncontrolled form flows match the React
DOM/state sequence except for the documented native text-event divergence.

### Phase 5 — transitions

- Implement the shared transition state machine and port Fade, Grow, Zoom,
  Collapse, and Slide.
- Cover appear/enter/exit, interrupted and reversed transitions, `timeout`
  forms, reduced motion, callback ordering, auto-height duration, node
  measurement, unmount-on-exit, and SSR's non-animated initial state.

Exit: deterministic fake-clock conformance tests and browser transition tests
are green. Overlay phases may then depend on this layer.

### Phase 6 — compound navigation and child-sensitive components

- Port Accordion, Breadcrumbs, AvatarGroup, ImageList/ImageListItem,
  BottomNavigation, ButtonGroup, ToggleButton, ToggleButtonGroup, Pagination,
  MobileStepper, Stepper, Tabs, MenuList, and related actions/items.
- Apply the children-gate design consistently: registration for index/value and
  roving focus, structural capability only where required.
- Verify keyed reorder identity, dynamic insertion/removal, fragments,
  conditional children, RTL keyboard behavior, disabled items, and SSR order.

Exit: ordinary nested `.tsrx` usage works without descriptor-array escape
hatches, and the React DOM/ARIA/focus sequence matches.

### Phase 7 — overlays and portals

- Port Portal, ClickAwayListener, TrapFocus, Backdrop, Modal, Popper, Popover,
  Menu/MenuItem, Dialog and its parts, Drawer, Tooltip, Snackbar, and
  SnackbarContent.
- Reuse pure `@popperjs/core`; port the MUI wrappers, modal manager, focus trap,
  scroll lock, portal, click-away, z-index, transition, and restore-focus logic.
- Cover nested modals, multiple documents/containers, Escape, backdrop click,
  outside press, focus trap/return, scroll lock, portal event behavior,
  placement/flip, aria wiring, and hydration.

Exit: open/close interaction sequences are differential-green, with separate
focus/timing tests for properties that `innerHTML` cannot observe.

### Phase 8 — complex long tail and completeness

- Complete Drawer variants/SwipeableDrawer, SpeedDial and actions, Select and
  Autocomplete edge cases, Chip interactions, pagination/table actions, and any
  deferred component modes.
- Finish the public export and type parity audit, README/migration guide,
  `status.json`, generated package/status docs, changesets, pack checks, and
  bundle/tree-shaking checks.
- Add `@octanejs/icons-material` through a reproducible generator over the
  pinned upstream SVG/icon source after `SvgIcon` is stable.

Exit: every pinned stable export is implemented or explicitly listed as a
known divergence; no silent stubs or skipped default paths remain.

## Verification strategy

Use four complementary layers.

1. **Differential DOM + CSS:** compile the same `.tsrx` fixture to Octane and
   React, rewriting `@octanejs/material` to `@mui/material` and
   `@octanejs/mui-system` to `@mui/system`. Compare canonicalized `innerHTML`
   and the ordered generated CSS after every event step. Normalize only
   renderer-owned `useId` tokens and documented style-tag wrappers; do not
   normalize MUI classes, CSS values, selectors, or order.
2. **Octane conformance:** port a representative, cited subset of upstream MUI
   tests for focus, callback order, render counts, timers, refs, DOM identity,
   measurement, subscriptions, and native events—the observations the
   differential DOM rig cannot see.
3. **SSR and hydration:** for every family, render with `octane/server`, assert
   HTML + CSS, hydrate in place, assert node identity/no mismatch, then drive an
   update. Include streaming for style and portal boundaries.
4. **Browser visual/interaction:** run paired React and Octane pages in
   Playwright with fixed viewport, fonts, color scheme, and disabled animations
   where animation is not under test. Compare screenshots and run keyboard,
   focus, pointer, layout, Popper, transition, and responsive checks in a real
   browser.

Add compile-only type tests and a package-tarball test alongside those layers.
Each phase runs its focused Vitest project while iterating, then the required
repository-wide `pnpm typecheck`, `pnpm test`, `pnpm format:check`, generated
status checks, and package checks before handoff.

## Known divergences and risk policy

- **Native events:** no synthetic event layer. Public callback names are kept
  where possible, but events are native; text controls use `onInput` for
  per-keystroke work.
- **Refs:** refs are props; there is no public `forwardRef` wrapper.
- **Children:** final behavior and normal authored APIs are the target, but the
  implementation may use registration rather than React child cloning.
- **StrictMode:** no React StrictMode double invocation. Do not port tests that
  assert development-only double-render counts as product behavior.
- **Class composition:** Octane's `class`/`className` normalization is clsx-like.
  MUI generally composes through `clsx`; differential tests must pin any edge
  where React's raw coercion would differ.

Highest technical risks, in order:

1. exact styled-engine serialization, insertion order, and SSR/streaming;
2. structural child inspection without a runtime VDOM;
3. React-shaped polymorphic TypeScript declarations;
4. transition callback/timing semantics;
5. focus/portal/modal behavior across nested roots and documents;
6. native-event differences in InputBase, Select, Autocomplete, and
   SwitchBase;
7. browser-only measurement and swipe/pointer paths.

A divergence is recorded only after it is classified as an intentional Octane
design, an upstream/environment artifact, or an infeasible API mismatch.
Genuine renderer/compiler bugs are fixed at the source.

## Definition of done

The initial Material UI program is complete when:

- root and documented component subpath exports match the pinned stable
  `@mui/material` and `@mui/system` surfaces, except an explicit divergence
  ledger;
- default, theme, variants, overrides, `sx`, slots, component polymorphism,
  refs, RTL, color schemes, and CSS variables work on client and server;
- no Octane package has a runtime dependency or peer dependency on React,
  React DOM, `@emotion/react`, `@emotion/styled`, or `@mui/material`;
- differential DOM/CSS, conformance, hydration, browser visual/interaction,
  and type suites are green;
- package tarballs contain all subpaths and tree-shake correctly;
- `status.json`, `docs/bindings-status.md`, `docs/packages.md`, README,
  changesets, and the divergence ledger are current; and
- the repository-wide test, typecheck, format, generated-doc, and pack gates
  pass.

## First implementation slice

The first coding slice should stop after these proofs:

1. scaffold `@octanejs/mui-system` and `@octanejs/material` plus the React
   differential aliases;
2. implement ThemeContext, a minimal ThemeProvider, `styled`, rule insertion,
   `sx`, GlobalStyles, and Box;
3. prove styled host/component composition, `component`, slots, refs, theme
   variants/overrides, CSS variables, client CSS order, SSR, and hydration;
4. port a minimal arbitrary-child wrapper, Tabs or Stepper, and Breadcrumbs or
   Accordion solely to settle the compound-children design; and
5. write a go/no-go audit against the three feasibility gates before beginning
   the full System phase.

Only after that slice is green should the port fan out across the 130-export
Material surface.
