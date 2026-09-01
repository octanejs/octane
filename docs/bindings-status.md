# @octanejs/\* bindings status (generated)

<!-- GENERATED FILE — do not edit. Edit packages/<name>/status.json and
     regenerate with `pnpm bindings:status`. -->

The central status table for the 106 `@octanejs/*` framework bindings.
Each row is sourced from that package's `packages/<name>/status.json` — the
machine-readable status block maintained next to the code it describes — merged
with the version in its `package.json`. CI runs `pnpm bindings:status:check`,
so a scope change that isn't reflected here fails the build.

The bindings deliberately sit at different maturity levels: some have broad
differential evidence against the real React library, others are thin bindings
over a framework-agnostic core, and some are explicitly partial or alpha. "Last
checked" records when the stated scope and its supporting evidence were most
recently reviewed. It does **not** certify full semantic parity outside the
supported surface and known test coverage described for that package.

| Package | Ports | Supported surface | Known divergences | SSR / hydration | Last checked |
| --- | --- | --- | --- | --- | --- |
| [`@octanejs/alien-signals`](#octanejsalien-signals) | `react-alien-signals@0.3.0` | Complete react-alien-signals hook and helper surface over the unchanged alien-signals@1.0.4 core, with Octane-native subscriptions and lifecycle ownership. | `useSignalValue` accepts any readable signal, including computed signals, correcting the upstream declaration to match its documented behavior; `useSignalScope` starts its scope after client commit and returns a cancellation-safe controller, avoiding render-phase effects | Supported and hydration-tested. Reads use the same server snapshot; effects and scopes begin only after client commit and stop on unmount. | 2026-07-30 |
| [`@octanejs/animejs`](#octanejsanimejs) | `animejs@4.5.0` | Anime.js is re-exported unchanged; `useAnimeScope` binds scoped DOM animation setup, refresh, dependency recreation, and cleanup to Octane, and `@octanejs/animejs/adapters/three` exposes Anime.js's official Three adapter. | `useAnimeScope` is an Octane-native lifecycle helper; it is not an upstream Anime.js API; Only the root and `adapters/three` entry points are re-exported; other Anime.js subpaths are explicit gaps whose APIs remain available from the supported root where upstream exposes them there; The Three adapter mutates raw objects while `@octanejs/three` retains frame-loop ownership; demand and never loops require explicit invalidation or advancement | Supported. The hook returns inert refs during server rendering and creates no Anime.js scope until its client effect runs. | 2026-07-30 |
| [`@octanejs/apollo-client`](#octanejsapollo-client) | `@apollo/client@4.2.6` | Complete published client adapter surface: all 18 @apollo/client/react runtime exports and their Apollo 4.2.6 TypeScript declarations, framework-neutral root/testing exports, an Octane MockedProvider, and the Octane-native /react/ssr prerenderStatic entry. | Suspense unwraps stable Apollo promises through Octane use() instead of React's use() or a thrown-promise fallback; The React class-based MockedProvider is an equivalent Octane function component; React Server Components and Apollo's React Compiler-generated entry are intentionally not exposed | Dedicated Node-mode tests cover multi-pass useQuery, nested query waterfalls, per-request cache isolation, ssr:false/no-cache, render limits, and scoped CSS; client hydration verifies cache restoration, in-place adoption, and no duplicate fetch. Streaming cache patches remain open. | 2026-08-02 |
| [`@octanejs/aria`](#octanejsaria) | `react-aria@3.50.0` | The `@octanejs/aria/components` entry point matches the complete named public surface of `react-aria-components@1.19.0`: 280 runtime exports and 313 type exports, checked in both directions with no missing or extra names. This includes calendar/date/time, color, drag-and-drop, DropZone/FileTrigger, toast, data hooks, and virtualized layout APIs in addition to the previously ported primitives, overlays, collections, Tree, and Table. The root behavior-hook and `/stately` entries remain curated React Aria 3.50.0 / React Stately 3.48.0 surfaces rather than separate full-export claims. | `native-input-event-wiring`: Text-input DOM wiring uses Octane's native `onInput` per keystroke instead of React's synthetic `onChange`; public value-level callbacks are unchanged; `ref-as-prop`: React `forwardRef` wrappers become Octane ref-as-prop components; React Server Components are not part of the Octane binding; `valid-hoisted-identifiers`: The i18n server serializer keeps hoisted-string identifiers valid past 26 entries instead of emitting invalid JavaScript identifiers; `server-rtl-direction`: The SSR locale direction derives from the injected locale via `isRTL` rather than being hard-coded to `ltr` | Dedicated Node-mode coverage verifies SSRProvider, hydration-safe labelled relationships, server snapshots, and injected LTR/RTL locales; real Vite-compiled Octane server markup is hydrated in place and remains interactive. The newly completed advanced component families have client behavior and type/export coverage but do not yet extend the package's existing SSR evidence. | 2026-08-18 |
| [`@octanejs/auto-animate`](#octanejsauto-animate) | `@formkit/auto-animate@0.10.0` | Vanilla autoAnimate core is reused from @formkit/auto-animate@0.10.0. The React useAutoAnimate hook is ported at ./react. Vue, Preact, Solid, Angular, Nuxt, Marko, and Qwik entry points are explicit gaps. | Consumers import from @octanejs/auto-animate and @octanejs/auto-animate/react rather than @formkit/auto-animate and @formkit/auto-animate/react; useAutoAnimate treats a compiler-injected symbol in the options position as omitted options; Vue, Preact, Solid, Angular, Nuxt, Marko, and Qwik bindings are not ported | The vanilla core is DOM-only; the hook attaches in a ref callback and destroys the controller on unmount. No server DOM mutations. | 2026-08-20 |
| [`@octanejs/base-ui`](#octanejsbase-ui) | `@base-ui/react@1.6.0` | Alpha, in progress: 35 of 43 upstream subpaths. The implemented surface has a complete byte-exact upstream inventory, 98 same-fixture React/Octane differential cases, and 49 Accordion, Collapsible, and Tabs adapted cases. This is bounded evidence and remains recorded-unverified because eight public subpaths and most of the canonical runtime/type suite are not yet adapted. Menu covers all 20 upstream parts, Toast all 11 parts, Collapsible all 3 parts, Accordion all 5 parts, and Tabs 4 of 5 parts (Indicator unported); their detailed gaps and evidence are recorded in UPSTREAM.md and audit/react-parity.json. | `native-event-semantics`: Host handlers receive native DOM events rather than React synthetic events; text edits use native `input`, form-facing NumberField commits use native `change`, and propagation reads `cancelBubble`; `ref-as-prop-class-composition`: React `forwardRef` wrappers become ref-as-prop, and class values use Octane's composition rules; `unported-internal-hover`: The internal standalone floating-ui-react `useHover` combiner is not republished because no ported Base UI component consumes it; `number-field-interaction-gaps`: `NumberField.ScrubArea` and hold-to-repeat stepping remain unported; steppers respond to single presses only | Dedicated Node-mode tests cover server snapshots, accessible separators, edge-aligned slider visibility, and closed dialogs; hydration adopts Vite-compiled Octane server markup, transitions to the client snapshot, and preserves interaction. Open overlays and remaining components are not yet covered. | 2026-08-01 |
| [`@octanejs/better-auth`](#octanejsbetter-auth) | `better-auth@1.6.29` | The public framework-agnostic Better Auth client is reused unchanged. `createAuthClient` converts the built-in session atom and plugin-provided atoms into Octane hooks while preserving endpoint actions, `$fetch`, `$store`, `$ERROR_CODES`, `$Infer`, and plugin inference. The upstream-compatible `useStore` helper is also included. | React-framework server helpers such as `better-auth/tanstack-start` are not re-exported; use Better Auth's standard Fetch API handler or an Octane-specific server integration | `useStore` supplies the current Nanostore value as the server snapshot. Better Auth's session atom does not start browser refresh or network activity while rendering on the server. | 2026-08-17 |
| [`@octanejs/calendar`](#octanejscalendar) | `react-calendar@6.0.1` | Public react-calendar 6.0.1 runtime and type surface: default and named Calendar, CenturyView, DecadeView, MonthView, YearView, Navigation, CalendarProps, and all types exported by the upstream root. The three framework-neutral shared suites run without weakened assertions; representative Calendar and tile cases are adapted to Octane. | Component refs are ordinary Octane props. Calendar ref exposes the upstream imperative handle; inputRef remains the DOM wrapper ref; Callbacks receive native MouseEvent objects, which persist without React's synthetic event.persist() method; Renderable public types use OctaneNode instead of React.ReactNode | Supported. Pass locale explicitly when server and browser locale defaults may differ. | 2026-08-20 |
| [`@octanejs/cmdk`](#octanejscmdk) | `cmdk@1.1.1` | Complete against the published `cmdk@1.1.1` public surface: `Command` (the root itself) and the `CommandRoot` named export, `Command.Input`, `Command.List`, `Command.Item`, `Command.Group`, `Command.Separator`, `Command.Dialog`, `Command.Empty`, `Command.Loading`, the flat `CommandX` aliases, `useCommandState`, and `defaultFilter` — with the DOM-authoritative store and item/group registration, `useValue` text-content inference, `onInput`-driven search, score filtering plus item and group DOM sorting, keyboard navigation (arrows/Home/End/vim/Enter), controlled `value`/`onValueChange`/`loop`/`shouldFilter`/custom `filter`/`forceMount`, the `--cmdk-list-height` ResizeObserver, and a Radix-backed `Command.Dialog`. `asChild` is the one unsupported prop (see divergences). | No forwardRef: components take `ref` as a normal prop; multi-ref uses octane's `ref={[a, b]}` instead of composeRefs; `Command.Input` drives search from the native `onInput` event; the public `onValueChange(search)` API is unchanged (no synthetic `onChange`); Item value is inferred from the provided `value` prop or the rendered `textContent`; cmdk's string-child inspection is dropped because octane's compiled children are opaque. An item that has never been scored therefore renders once so the inference can read its text — treating unscored as score zero deadlocks it. Consumer-visible mid-search arrivals match upstream; Score ranking is expressed as CSS `order` inside a flex container, not by relocating DOM nodes. Upstream's sort() is DOM-authoritative: it appendChild's matching items into the list sizer. Octane fences every component's DOM with comment markers and tracks the range between them, and a template construct like `@for` or `@if` wraps each item in a SECOND, outer range — so relocating an item carries it out of every range at once, and the loop later clears an empty range while the real node is orphaned in the list forever. Carrying the flanking markers along only repairs the innermost range, so it breaks again at each new nesting construct. Ranking declaratively removes the class of bug: no node moves, no range is violated, and clearing the search restores true source order because the styles are simply dropped. The cost is that the list sizer and each group's item container are flex columns WHILE a filter is active, so a consumer relying on physical DOM order (`:nth-child` styling, drag handles) or on a custom container `display` diverges from upstream. Selection, arrow-key navigation and alt+arrow group navigation all read the ranked order, not DOM order, so what is selected always matches what is on screen. Every valid item is ranked rather than only the matches: an unranked flex child keeps the initial `order` of 0, which sorts it AHEAD of every match, so a force-mounted non-match would jump to the top of its container. Ranking everything puts zero-scoring items last, which is where upstream's append-in-score-order leaves them too. Ranks land on the child the container actually lays out, resolved at any nesting depth, because `order` applies to a flex CHILD — upstream resolves a single wrapper level, which its appendChild model tolerates but this one does not. Ungrouped items and group hosts share the sizer's rank space, so the former are numbered densely and the latter continue past them, matching upstream's order of appending items before groups; `aria-activedescendant` is wired on the initial auto-select and after every filter; upstream queues that work from inside its own layout-effect flush and its batcher discards it, so upstream only sets the attribute after a directly user-driven selection. The runtimes agree on which item is selected; Ids are `radix-` prefixed to match upstream, which takes them from `@radix-ui/react-id`; Group reordering resolves each group element by its registered value rather than upstream's `[cmdk-group=""][data-value="<groupId>"]` selector. That selector can never match — `data-value` holds the group's heading text, never its id — so upstream's group sort is effectively dead code; the port makes groups genuinely reorder by their best item score; Re-registering an item value during an active search re-derives the whole filter aggregate (match count and matching groups), not just that item's score. Upstream only re-sorts, leaving `filtered.count`/`filtered.groups` describing the previous values — so an item that starts matching renders while `Command.Empty` still shows "no results" (and its group can stay hidden). Upstream's own item-registration path already re-derives the aggregate the same way, so the omission reads as an oversight rather than intent; Force-mounted items are counted so `Command.Empty` can see them. Upstream skips registration entirely for a `forceMount` item, so it never reaches `filtered.count` — with a search that matches nothing, upstream renders the force-mounted item and "no results" on top of each other. The port tracks the live force-mounted count separately (`filtered.count` keeps its upstream meaning for `useCommandState`) and Empty consults both; Removing the selected force-mounted item moves the selection on. Because upstream never registers a `forceMount` item it has no teardown for one either, so the selected value keeps pointing at a node that is gone: nothing renders `aria-selected`, `aria-activedescendant` dangles at a removed id, and Enter does nothing until the user arrows away. The port re-selects from the force-mount teardown, the same way the plain item teardown does; Every registration path releases the value it registered. Items, force-mounted items and groups all register through the same `useValue`, so remount cycles stay quiet and the dev-only duplicate-value report stays honest; Registration teardowns hop a microtask before scheduling their follow-up work. Octane runs a removed child's effect cleanups during the PARENT's render, so scheduling straight from a teardown lands its state update mid-render and the runtime reports "Cannot update a component (`CommandRoot`) while rendering a different component" — advice a teardown cannot act on, since it does not choose when it runs. The queued work is unchanged and still runs before paint; only the teardown paths defer, because every other caller schedules from a layout effect where the synchronous update is load-bearing. React has no equivalent problem: it runs cleanups in the commit phase; `Command.Empty` renders nothing during SSR. Items register in layout effects, which never run on the server, so the match count is unavoidably 0 there and upstream ships "no results" above a fully-populated list on every server-rendered page — permanently so for readers without JavaScript. The port supplies a server snapshot of "not empty" instead, and the empty state appears on the client once the count is real; An item leaving a group is removed from that group's member set. Upstream deletes the item from `ids`/`allItems` but never from `allGroups`, so a group accumulates dead item ids for the lifetime of the Command — unbounded growth in a menu whose results churn, plus wasted work in every filter pass; `Command.Dialog` additionally forwards `defaultOpen` and `modal` to the underlying Radix `Dialog.Root`. Upstream cmdk forwards only `open`/`onOpenChange`, so it has no uncontrolled open state and is always modal; Duplicate item values are reported in development. Selection is keyed by value, so two items sharing one both render `aria-selected="true"` while only the first responds to Enter — an invalid single-select listbox. The runtime cannot pick a winner (cmdk requires unique values), so the port warns instead of failing silently; upstream neither warns nor resolves it; The layout-effect batcher reports a throwing queued callback through `console.error` (as octane reports effect exceptions) instead of rethrowing out of the flush. Upstream's batcher has no such isolation, so a throwing `onValueChange` reached from that flush rethrows there; `asChild` is not supported: cmdk's SlottableWithNestedChildren clones a child element and re-parents the component's own content into it, which has no faithful equivalent over octane's opaque compiled children. Components always render their own host element; `Command.Dialog` builds on @octanejs/radix's Dialog (composed via createElement descriptors, since radix's Portal iterates children) instead of @radix-ui/react-dialog; The vendored scorer gained explicit parameter type annotations for strict typecheck and repo-style formatting; the algorithm and score constants are unchanged from cmdk@1.1.1 | Supported and tested: the menu server-renders all items in source order without browser globals (the DOM-authoritative filter/selection is post-hydration work), and no empty state — items cannot register on the server, so `Command.Empty` renders nothing there rather than claiming "no results" over a full list. `hydrateRoot` adopts the server nodes without a mismatch, then activates — values infer from textContent, the first item selects, and typing filters live. | 2026-08-03 |
| [`@octanejs/colorful`](#octanejscolorful) | `react-colorful@5.8.0` | Complete against the published react-colorful 5.8.0 root runtime and type surface: all 14 picker variants, HexColorInput, setNonce, six public color types, controlled updates, mouse/touch/keyboard input, commit callbacks, ARIA state, and automatic closest-root styling. | React synthetic event attribute types are represented by Octane native DOM event attributes; observable DOM events and callback values retain the upstream contract | All pickers and HexColorInput render deterministically without browser globals, hydrate by adopting existing nodes, install styles only on the client, and become interactive after hydration. | 2026-08-03 |
| [`@octanejs/content-loader`](#octanejscontent-loader) | `react-content-loader@7.1.2` | Web runtime at react-content-loader 7.1.2: default ContentLoader, Facebook, Instagram, Code, List, and BulletList presets, and IContentLoaderProps. ./native is an explicit gap. | Consumers import from @octanejs/content-loader instead of react-content-loader; The React Native ./native entry is not published because Octane has no React Native renderer; React test-renderer and shallow-renderer observations are asserted through mounted SVG DOM without changing their numeric expectations; useId values use Octane's opaque identifier format; Octane serializes SVG/CSS url() functions with quotes while React's test renderer reports the unquoted form; uniqueKey/baseUrl relationships are unchanged; Octane inserts empty comment holes between children; snapshots compare the public SVG tree after stripping those markers; rtl=false uses an empty style object instead of null so the style spread typechecks; IContentLoaderProps.style is an object map rather than Octane's string-or-object SVG style union, matching React SVGAttributes; Git package.json at the pin SHA advertises 6.2.1; npm published 7.1.2 from that SHA | Supported. uniqueKey pins clip and gradient identifiers; otherwise useId remains opaque and request-local. | 2026-08-20 |
| [`@octanejs/day-picker`](#octanejsday-picker) | `react-day-picker@10.0.1` | DayPicker, public components, hooks, date classes, helpers, labels, formatters, locales, styles, and public types. | React DOM prop types are preserved publicly and normalized at Octane render boundaries | Calendar markup and accessibility attributes render without browser globals. | 2026-08-02 |
| [`@octanejs/devtools`](#octanejsdevtools) | `octane@workspace` | Octane-native DevTools plugin (not an upstream port): renders live runtime diagnostics into a TanStack Devtools host via @tanstack/devtools-event-client. P1 ships the Components tree + state inspector. | none known | The plugin renders no anchor of its own; it is a client-only panel plugged into @octanejs/tanstack-devtools. Include it only in dev. | 2026-07-24 |
| [`@octanejs/dexie`](#octanejsdexie) | `dexie-react-hooks@4.4.0` | Port of the public dexie-react-hooks surface: useObservable, useLiveQuery, useSuspendingObservable, useSuspendingLiveQuery, usePermissions, and useDocument, with Dexie's framework-neutral API re-exported from the package root. | Suspending hooks integrate with Octane's use() rather than React's use() or thrown-promise implementation details; Hook call-site slots are forwarded through Octane's compiler binding ABI; useDocument requires consumers to install and import y-dexie and yjs before using the hook; those integrations remain optional | Supported for non-suspending live queries: SSR returns the configured default without opening IndexedDB, and hydration adopts the server host before replacing the default with live data. Suspending live queries remain client-oriented and do not claim server data loading. | 2026-08-02 |
| [`@octanejs/dnd-kit`](#octanejsdnd-kit) | `@dnd-kit/react@0.5.0` | Complete modern dnd-kit React-adapter surface: DragDropProvider, DragOverlay, useDraggable/useDroppable, manager/monitor/operation hooks, PointerSensor/KeyboardSensor re-exports, the public signal-hook utilities, useSortable, and all four upstream entry points. | DragOverlay distinguishes octane compiled children blocks from function render props; ordinary typed usage is behaviorally equivalent; useSortable retains the upstream keyboard plugin by default but omits OptimisticSortingPlugin because moving one host element before application state commits can split an Octane keyed DOM range; explicit plugin arrays remain authoritative | Static SSR and hydration are covered; DOM plugins initialize only after client refs register. | 2026-08-03 |
| [`@octanejs/draggable`](#octanejsdraggable) | `react-draggable@4.7.1` | Complete against the published react-draggable 4.7.1 root runtime and type surface: default Draggable, named DraggableCore, controlled and uncontrolled positioning, bounds, grid, axis, offsets, mouse and touch gestures, and all eight public types. | React component instance, lifecycle, React.Component assignability, findDOMNode fallback, and instance refs are unavailable; use the structural nodeRef prop with an Octane host ref; React-specific node and synthetic-event types are represented by OctaneNode and native mouse/touch events while retaining the observable callback and data contract | Draggable and DraggableCore render deterministically without browser globals, adopt their existing HTML or SVG child during hydration, and become interactive after hydration. | 2026-08-03 |
| [`@octanejs/drei`](#octanejsdrei) | `@react-three/drei@10.7.7` | Complete port of the pinned @react-three/drei 10.7.7 public web API (commit b8b99fd4ca1dfb8d821335671320512daa6efea4): 379 source exports and 217 runtime exports are accounted for by the executable crosswalk, with 299 parity assertions across 105 test files. | View: inline Canvas views are ported. Calling View from an Octane DOM root fails with the universal renderer-boundary diagnostic, and View.Port is a callable no-op. Octane components are statically renderer-owned, so one component cannot switch between DOM and Three renderers or transport authored Three children between independent roots as React Drei does with tunnel-rat | Browser-dependent helpers remain client-only; server-safe behavior is verified per export. | 2026-08-02 |
| [`@octanejs/dropzone`](#octanejsdropzone) | `react-dropzone@20.0.0` | Exact mapped port of the react-dropzone 20.0.0 root runtime and type namespace at canonical commit 01fc05c5996bf615caf812627f7491375e647c7d. The binding preserves the default Dropzone component, useDropzone, ErrorCode, all public types, root package conditions, and ./package.json export. Runtime coverage executes 218 pristine canonical React cases plus 109 adapted, differential, SSR, hydration, browser, and evidence cases. | Consumers import from @octanejs/dropzone and author TSRX instead of importing react-dropzone and authoring React JSX; option names and observable file-acquisition behavior remain mapped to the pinned upstream contract; The package points its types/import/require conditions at authored Octane source under repository policy; packed-consumer checks prove equivalent ESM, CommonJS, TypeScript, package-json, and public-namespace resolution without React runtime leakage | Supported and tested — server rendering and hydration preserve the hidden input and getter-provided root contract without browser-global access during render. | 2026-08-02 |
| [`@octanejs/electron`](#octanejselectron) | `electron@43.2.0` | Process-split Electron bindings: ./main registers ipcMain handlers, ./main/native re-exports main-only Electron APIs (Menu, Tray, session, protocol, BrowserWindow, …), ./preload exposes Electron IPC and desktop helpers via contextBridge, and the renderer entry provides Octane hooks (useInvoke, useInvokeState, useIpcEvent, useNativeTheme, useWindowState) plus promise helpers for app/window/dialog/shell/clipboard/screen. Menu/Tray/session/protocol stay intentional main-only under contextIsolation. | There is no React binding upstream; Electron is framework-agnostic, so this package mirrors the React Electron process layout rather than porting a React library; Renderer code uses window.__OCTANE_ELECTRON__ because contextIsolation forbids importing electron in the page; Menu, Tray, session, and protocol are re-exported from @octanejs/electron/main/native for main-process consumers and are intentionally not bridged into the renderer; Hook call-site slots are forwarded through Octane's compiler binding ABI; useInvoke integrates with Octane's use() rather than React's use(); useInvokeState returns to pending on refetch and does not implement stale-while-revalidate; Built-in desktop helpers use octane:* IPC channels; apps may allowlist additional channels in preload | Server rendering performs no IPC. useInvokeState renders pending and issues the command on the client after hydration; useIpcEvent and reactive desktop hooks subscribe only on the client. useInvoke without a host rejects with ElectronUnavailableError. | 2026-08-02 |
| [`@octanejs/email`](#octanejsemail) | `react-email@6.9.2` | Email component surface: Body, Button, CodeBlock, CodeInline, Column, Container, Font, Head, Heading, Hr, Html, Img, Link, Markdown, Preview, Row, Section, Tailwind, Text, Prism themes, the pixel-based Tailwind preset, and an Octane-native static render helper. | render accepts an Octane component plus props rather than a pre-created React node, matching octane/server's entry-point API; Preview accepts its inspectable preview copy through the text prop; natural .tsrx children are opaque render blocks; Markdown accepts its source through a string children prop; JSX children compile to children blocks and are rejected rather than invoked as render props; Refs are ordinary Octane ref props rather than forwardRef components; Head uses Octane's metadata-hoisting channel; render reconstructs the consumer-visible document head around hoisted tags; Tailwind transforms fully rendered static HTML rather than cloning a React element tree, allowing natural .tsrx children and nested compiled components | Supported and tested through renderToStaticMarkup: output has the React Email XHTML Transitional doctype and no hydration markers. | 2026-08-10 |
| [`@octanejs/email-cli`](#octanejsemail-cli) | `react-email@6.9.2` | Octane-native `export` and `dev` commands: recursive .tsrx template discovery, static HTML export, nested output paths, static assets, development template index and previews, Vite live reload, and compile/render error pages. | The preview application is a lightweight Octane/Vite server rather than upstream's bundled React/Next application; The executable is named octane-email to avoid colliding with upstream's email binary | Templates compile with the Octane Vite plugin in SSR mode and render through @octanejs/email. | 2026-08-10 |
| [`@octanejs/embla-carousel`](#octanejsembla-carousel) | `embla-carousel-react@8.6.0` | Complete package-root adapter: default useEmblaCarousel hook, its viewport-ref and tuple types, and globalOptions; the framework-neutral Embla core and reactive equality utilities are reused unchanged. | none known | The hook constructs no carousel without DOM globals; client attachment initializes the core. | 2026-08-02 |
| [`@octanejs/floating-ui`](#octanejsfloating-ui) | `@floating-ui/react@0.27.19` | Complete @floating-ui/react 0.27.19 export surface: positioning (`useFloating`, ref-aware `arrow`, and the framework-neutral middleware re-exports), floating tree and list primitives, every interaction hook, portals/overlays/focus management/arrows/composites, transitions, both delay-group APIs, and the deprecated `inner`/`useInnerOffset` pair. Runtime parity is executable and bounded: 272 adapted assertions pass compatibly, 29 remain executable expected-failure negative controls, and 6 upstream-declared skips are non-evidence. | `ref-as-prop`: React forwardRef component APIs become Octane ref-as-prop APIs; Twenty-nine upstream assertions remain executable expected-failure controls across ref/focus/effect scheduling, dynamic-child registration, iframe realms, render counts, React-only context fixtures, and list registration; audit/expected-failures.json names every case; The combined Octane entry point cannot preserve every @floating-ui/react-dom-only type narrowing; the one-for-one adapted type program records those diagnostics explicitly | No dedicated SSR/hydration lane; the supported claims are client positioning and interactions. | 2026-08-26 |
| [`@octanejs/formisch`](#octanejsformisch) | `@formisch/react@1.0.0-rc.0` | Ports the Formisch React adapter surface while vendoring its React-selected core and modular methods into one React-free Octane package. | Octane native text controls use `onInput`; selects, checkboxes, and radios use native `onChange`; React synthetic event and renderable types are replaced with native DOM events and OctaneNode; React StrictMode-specific delayed signal cleanup is omitted in favor of Octane lifecycle cleanup | Supported and tested: sequential requests stay isolated, hydration adopts existing form controls, and native input updates activate after hydration. | 2026-07-30 |
| [`@octanejs/gsap`](#octanejsgsap) | `@gsap/react@2.1.2` | Full useGSAP hook contract: callback, dependency-array and config signatures; scoped contexts; contextSafe; revertOnUpdate; register; and headless. | The adapter imports Octane hooks and uses compiler-selected manual hook slots instead of React hooks; GSAP remains an external peer dependency and is not redistributed by this MIT-licensed adapter | Server rendering creates stable context helpers without running GSAP effects. Client hydration activates the standard lifecycle. | 2026-08-02 |
| [`@octanejs/hook-form`](#octanejshook-form) | `react-hook-form@7.81.0` | Complete port of react-hook-form 7.81.0 (tag commit 46b217e034dd92f7aa3cb3a478815556b416b299). The automated parity check runs all 1,193 original tests against the pinned React package as a pristine baseline; the Octane port separately runs byte-locked, unfiltered DOM and server suites with exact collected/executed inventories containing 1,187 entries representing 1,178 unique file/full-name identities. The nine duplicate entries are repeated titles within the DOM inventory; the server inventory is disjoint. Coverage includes `useForm`, `useController`, `useFieldArray`, `useFormState`, `useWatch`, `useFormContext`/`FormProvider`, schema resolvers, and all validation modes. | `register()` returns `onInput` (octane's native per-keystroke event) instead of React's synthetic `onChange`; mode names and `register` option keys keep the upstream spelling; The structured parity ledger records native no-op input delivery, microtask batching, duplicate resolver notification, async act flush, reset render-count, and eager `Object.is` bailout differences with executable case identities, consumer impact, and migration guidance; the suite contains no skipped or expected-failure cases | Supported and tested — the upstream `*.server.test.tsx` suite runs via `octane/server` with byte-identical markup. | 2026-08-01 |
| [`@octanejs/html-react-parser`](#octanejshtml-react-parser) | `html-react-parser@6.1.7` | Public runtime surface at html-react-parser 6.1.7: default parse, attributesToProps, domToReact, htmlToDOM, HTMLReactParserOptions, and re-exported domhandler node classes. library defaults to Octane createElement/cloneElement/isValidElement. | Consumers import from @octanejs/html-react-parser instead of html-react-parser; Default element library is Octane, not React; PRESERVE_CUSTOM_ATTRIBUTES is hardcoded true because Octane matches React 16+ DOM attributes while octane.version is 0.x; Public types use ElementDescriptor/OctaneNode instead of React JSX.Element/ReactNode; Octane serializes style objects through CSSOM, so custom-element style attribute spelling can differ from React snapshots while the parsed style object stays identical | Parsing is string-to-element-tree and is SSR-safe. Rendering the tree uses Octane server renderToStaticMarkup. | 2026-08-20 |
| [`@octanejs/i18next`](#octanejsi18next) | `react-i18next@17.0.9` | Complete runtime port of react-i18next 17.0.9: useTranslation, I18nextProvider/context, Trans/TransWithoutContext, IcuTrans/IcuTransWithoutContext, Translation, the withTranslation/withSSR HOCs, useSSR, namespace reporting, initialization/default helpers, and the root ICU helper exports over the unchanged i18next core. | Trans children that must be inspected are passed in prop position (`children={<>…</>}`) or through `defaults` + `components`; natural .tsrx block children are opaque compiled render bodies and fall back with a development warning; Suspense uses octane's `use(thenable)` instead of throwing a Promise; withTranslation's `withRef` option uses octane's ref-as-prop model; class components are unsupported; The React/Babel-specific `icu.macro` subpath is not shipped; the runtime IcuTrans APIs are fully supported | Preloaded renderToString output and namespace collection are covered; useSSR, withSSR, getInitialProps, and composeInitialProps are ported. A dedicated hydration differential is still open. | 2026-08-02 |
| [`@octanejs/image-crop`](#octanejsimage-crop) | `react-image-crop@11.1.2` | ReactCrop, default and Component aliases, crop types, aspect/centering/conversion/containment/nudge utilities, browser canvas/image helpers, pointer and keyboard crop interactions, selection addons, circular masks, rule-of-thirds overlays, and stylesheet compatibility exports. | Event callbacks receive native DOM PointerEvent objects because Octane has no synthetic event layer; The upstream Sass source compatibility path resolves to the precompiled CSS artifact | ReactCrop renders its static wrapper, media child, mask, and selection markup without reading browser globals during render; crop interaction remains client-only. | 2026-08-20 |
| [`@octanejs/inertia`](#octanejsinertia) | `@inertiajs/react@3.6.1` | Octane Inertia 3.6.1 adapter foundation: framework-neutral router, HTTP client, progress, and server exports reuse @inertiajs/core unchanged; page, remember, poll, prefetch, form-state, router-submit, direct-HTTP, precognition, and layout-property hooks are ported to Octane. | React, ReactDOM, StrictMode, forwardRef, and synthetic events are not runtime dependencies; the Octane adapter uses Octane roots, refs-as-props, and native events | The framework-neutral Inertia server entry is exposed. Hook initialization is request-local and covered in the server runtime; Octane page rendering and hydration are completed by the adapter SSR unit. | 2026-07-30 |
| [`@octanejs/ink`](#octanejsink) | `ink@7.1.1` | Complete against Ink 7.1.1's published exports: terminal render roots, Yoga-backed Box and Text primitives, Static/Transform/Newline/Spacer, application and stream hooks, input/paste/focus/cursor/animation/window-size/metrics hooks, measurement helpers, DOM element types, and Kitty keyboard protocol helpers. | Octane programmatic roots accept a component and props separately instead of a pre-created React element; The concurrent render option remains accepted for source compatibility, but scheduling is owned by Octane rather than React Concurrent Mode; Components are authored as .ink.tsrx and require @octanejs/ink's renderer configuration and JSX intrinsics | Ink is a native terminal renderer. renderToString uses the same Octane universal host driver and Yoga/ANSI renderer without a terminal session. | 2026-08-10 |
| [`@octanejs/input-otp`](#octanejsinput-otp) | `input-otp@1.5.0` | Complete against input-otp@1.5.0: OTPInput, OTPInputContext, the three exported regexp patterns, public props and slot types including nonce, controlled and uncontrolled values, one-input accessibility and mobile-autofill markup, default spellcheck off, translation opt-out, render/context projection, keyboard selection and deletion, paste transformation, completion callbacks, overflow-aware password-manager displacement, SSR, and hydration. | Octane's native per-edit `input` event drives the hidden text input internally; the public callback remains the source-compatible `onChange(newValue)`; Refs are ordinary Octane ref props rather than React `forwardRef`; consumer ref behavior is unchanged | Supported and tested — rendering is deterministic and browser-global-free; hydration adopts the server input and cleanup removes owned listeners, observers, timers, and styles. | 2026-08-20 |
| [`@octanejs/intersection-observer`](#octanejsintersection-observer) | `react-intersection-observer@10.1.0` | Public runtime surface at react-intersection-observer 10.1.0: useInView, useOnInView, InView, observe, defaultFallbackInView, and test utilities. Pinned upstream unit and browser suites plus one-for-one adapted runtime/type probes are registered with react-parity:check. | Public node and prop types use Octane structural types and do not import React; InView is implemented as a function component while preserving the upstream render-prop and wrapper behavior; In TSRX, an InView render function must be supplied through the children prop; nested children compile to an opaque render block; Unsupported false fallback (`fallbackInView={false}` / `defaultFallbackInView(false)`) does not emit `onChange(false)` on mount under Octane (`intersection-observer-initial-false-onchange`): treat the default hidden state as authoritative rather than waiting for that callback; Unsupported IntersectionObserver without a fallback surfaces as a passive-effect `console.error` under Octane rather than a synchronous mount throw (`intersection-observer-unsupported-mount-error-surface`); wrap with an error boundary/`tryBlock` or supply `fallbackInView`/`defaultFallbackInView` instead of try/catch around render; `@octanejs/intersection-observer/test-utils` does not auto-register Vitest/Jest beforeEach/afterEach (`intersection-observer-test-utils-manual-setup`); call `setupIntersectionMocking`/`resetIntersectionMocking` in the test setup file | Supported. Observation begins in an effect; initialInView controls deterministic server output. | 2026-07-30 |
| [`@octanejs/jotai`](#octanejsjotai) | `jotai@2.20.2` | Complete 1:1 port: the framework-agnostic vanilla core (`jotai/vanilla`, `/vanilla/utils`, `/vanilla/internals`) is reused verbatim; the React layer (`Provider`, `useStore`, `useAtom`, `useAtomValue`, `useSetAtom`) and `react/utils` (`useResetAtom`, `useReducerAtom`, `useAtomCallback`, `useHydrateAtoms`) are ported onto octane hooks, preserving upstream's useReducer force-update + effect-subscription implementation, async atoms via octane's `use()`. | none known | No SSR-specific surface; `useHydrateAtoms` is ported and usable for hydration seeding; no dedicated SSR tests. | 2026-08-02 |
| [`@octanejs/lexical`](#octanejslexical) | `@lexical/react@0.46.0` | The 35 legacy `@lexical/react` modules represented by this port cover composer + contexts, the editable surface, plain/rich text, the plugin/menu set, and the `useLexical*` hooks. The 0.46.0 extension subsystem, collaboration plugin, and tree view remain excluded as itemized in UPSTREAM.md. | Positioning uses `@floating-ui/dom` instead of `@floating-ui/react`; The class-based `LexicalErrorBoundary` becomes an Octane error boundary; `forwardRef` becomes ref-as-prop | No dedicated SSR/hydration tests. | 2026-08-02 |
| [`@octanejs/livestore`](#octanejslivestore) | `@livestore/react@0.4.0` | Ports the complete stable renderer surface (registry provider/access, Suspense store loading and augmentation, reactive queries, client documents, and sync status) plus the exported experimental LiveList over LiveStore's unchanged 0.4.0 framework-neutral packages. | ReactApi and withReactApi retain their historical upstream names but attach Octane hooks; The public query error label identifies octane; LiveStore framework-toolkit 0.4.0 still records its internal refresh-reason renderer tag as react; React Strict Mode double invocation is not emulated | Supported at the binding boundary: server rendering reads existing synchronous state without running passive subscriptions or browser-only store work; client Suspense and hydration are covered separately. | 2026-08-02 |
| [`@octanejs/lucide`](#octanejslucide) | `lucide-react@1.24.0` | Complete against the published `lucide-react@1.24.0` runtime surface: every canonical icon and alias, the `icons` namespace, `Icon`, `createLucideIcon`, `LucideProvider`, `useLucideContext`, `DynamicIcon`, `iconNames`, `dynamicIconImports`, and per-icon subpath imports. | Icon refs are normal Octane `ref` props rather than React `forwardRef` components; Event callbacks receive native DOM events rather than React synthetic events | Supported and tested: icons and provider defaults render through `octane/server`, and client hydration adopts the server-rendered SVG element. | 2026-08-02 |
| [`@octanejs/mantine-hooks`](#octanejsmantine-hooks) | `@mantine/hooks@9.5.0` | Complete @mantine/hooks 9.5.0 runtime export surface: state, timing, storage, viewport, input, focus, pointer, observer, hotkey, scrolling, collapse, drag, splitter, mask, and utility hooks. | Hooks use Octane's compiler-injected hook slots and runtime lifecycle instead of React's dispatcher; DOM subscriptions receive native browser events; React is retained only as a source-compatibility type vocabulary for refs, events, actions, and CSS properties; it is not loaded at runtime | Dedicated Node-mode coverage verifies deterministic state-hook output and guarded media-query initial values without a browser. DOM-only effects remain inert during server rendering. | 2026-08-02 |
| [`@octanejs/markdown`](#octanejsmarkdown) | `react-markdown@10.1.0` | Complete react-markdown 10.1.0 root runtime and public type surface: Markdown, MarkdownAsync, MarkdownHooks, defaultUrlTransform, and all six exported type families. | Rendered elements, component mappings, hooks, and public renderable types target Octane instead of React; React 19 may emit automatic image preload hints during server rendering; Octane preserves the Markdown image output without that renderer-specific hint; React's synchronous renderer throws when MarkdownAsync suspends; Octane's MarkdownAsync returns an awaitable ElementDescriptor | Synchronous and awaited asynchronous Markdown are deterministic and browser-global-free; hydration adoption and updates are covered for default output, plugins, filtering, URLs, and component mappings. MarkdownHooks preserves its fallback and resolves on the client. | 2026-08-02 |
| [`@octanejs/mdx`](#octanejsmdx) | `@mdx-js/mdx@3.1.1` | The full compile-don't-interpret pipeline: `.mdx`/`.md` → `@mdx-js/mdx` (reused verbatim) → octane compiler, via the `octaneMdx()` Vite plugin plus the `./compile` and `./server` entries; compiler warnings propagate through direct and Vite compile surfaces with authored `.mdx` ranges; `@mdx-js/react`'s provider layer (`MDXProvider`/`useMDXComponents`) is ported onto octane context. The octane website runs on it. | `useMDXComponents` drops upstream's `useMemo` referential-stability wrapper so the call is valid in both server and client runtimes (same observable mapping) | Full SSR + hydration coverage — server-compiled documents render via `renderToString` and hydrate byte-for-byte (`ssr.test.ts`, `hydration.test.ts`). | 2026-07-17 |
| [`@octanejs/mobx`](#octanejsmobx) | `mobx-react-lite@4.1.1` | The framework-independent MobX core is re-exported verbatim. The function-component binding includes observer, Observer, useObserver, useLocalObservable, enableStaticRendering, isUsingStaticRendering, and the deprecated useStaticRendering alias. | React class components and the legacy mobx-react Provider/inject APIs are not included; forwardRef compatibility options are omitted because Octane uses refs as props; React-specific batching, prop-types validation, React DevTools integration, and useDebugValue output are omitted | enableStaticRendering(true) renders observed components without creating a Reaction or retaining observable subscriptions. | 2026-08-02 |
| [`@octanejs/monaco-editor`](#octanejsmonaco-editor) | `@monaco-editor/react@4.7.0` | Editor (default), DiffEditor, loader, useMonaco, and the complete upstream 4.7.0 prop and callback type surface, including controlled values, model paths, languages, themes, options, view-state restoration, validation, and model ownership. | Components are compiled Octane `.tsrx` modules and accept OctaneNode for loading content; they do not depend on React; MonacoContainer uses Octane ref as an ordinary prop instead of upstream private _ref; Model disposal is ownership-aware: binding-owned models are tracked in a WeakSet with lease counts in a WeakMap, so externally created or shared models are not disposed by the wrong owner; superseded owned path models are cleaned up on unmount; View state is stored in a WeakMap keyed by model identity rather than upstream path-string Map; CSS style modules use plain records instead of React CSSProperties | Editor and DiffEditor render a deterministic loading shell without touching browser globals; live Monaco construction begins in a client effect. Hydration adopts server DOM (section, slot nodes) and reaches a ready editor without mismatch warnings. | 2026-08-10 |
| [`@octanejs/motion`](#octanejsmotion) | `motion@12.42.2` | Core surface: `motion.<tag>` (animate, gestures, variants with propagation/stagger, drag, layout basics), `AnimatePresence`, `MotionConfig`, live `useReducedMotion`, reduced-motion enforcement, `LayoutGroup` layoutId namespaces, `LazyMotion` with `domAnimation`/`domMax`, the `m` proxy and complete `./react-m` named host entry, plus the motion-value hooks (`useMotionValue`, `useScroll`, `useTransform`, `useSpring`, `useAnimate`, `useMotionValueEvent`); motion-dom's animation engine and gesture primitives are reused verbatim. | Exit animations run via cleanup-before-detach instead of React's deferred-deletion machinery; `layout`/`layoutId` use single-element FLIP, not the full projection tree; An `initial` target without an `animate` target does not materialize inline initial styles; set the starting style explicitly or provide an animation target | No SSR-specific surface; no dedicated SSR tests. | 2026-08-02 |
| [`@octanejs/nuqs`](#octanejsnuqs) | `nuqs@2.9.1` | Full vendored port: the framework-agnostic core (`parsers`/`parseAs*`/`createParser`, `createSerializer`, `createLoader`, `createStandardSchemaV1`, the throttle/debounce update queues, sync emitter and URL encoding) is vendored verbatim from nuqs 2.9.1; the React layer (`useQueryState`, `useQueryStates`, the `useSyncExternalStores` helper and the adapter context) is ported onto octane's hooks — same `useState`/`useEffect`/`useSyncExternalStore` implementation shape as upstream, so re-render and URL-reconciliation behaviour matches nuqs on React. Adapters ported: `@octanejs/nuqs/adapters/react` (`NuqsAdapter`, `enableHistorySync`), `/adapters/custom` (`unstable_createAdapterProvider`), `/adapters/testing` (`NuqsTestingAdapter`, `withNuqsTestingAdapter`). Server surface (`@octanejs/nuqs/server`) exposes `createLoader`/`createSerializer`/parsers/`createStandardSchemaV1`. | Router-specific React adapters are not shipped; use the standalone or custom adapter; createSearchParamsCache is unavailable because Octane does not implement React.cache; TransitionStartFunction is declared locally instead of importing React types; NuqsTestingAdapter resets the shared update queue once per mount instead of every render | The react-free server entry has a dedicated Node lane for parsing and serialising search params. Client hydration remains outside the supported evidence claim. | 2026-08-02 |
| [`@octanejs/opentui`](#octanejsopentui) | `@opentui/react@0.5.8` | Technical-preview OpenTUI 0.5.8 renderer: renderer-local TSRX intrinsics for the complete built-in catalogue and text modifiers, custom `extend()` renderables, component-plus-props roots, OpenTUI prop/style/event application, refs and retained visibility, same-renderer `RootRenderable` portals, terminal error fallback, `act`/`flushSync`, all public hooks, `TimeToFirstDraw`, the core slot/plugin registry adapted to universal renderables, and an FFI-backed test utility. Native behavioral coverage exercises terminal frames, state and prop updates, host identity, keyboard and resize hooks, multi-argument select callbacks, subscription cleanup, portals, slots, errors, and teardown under Bun. | Octane owns reconciliation, components, hooks, context, scheduling, errors, refs, and effects instead of embedding React Reconciler; Components are authored in `.opentui.tsrx`; the package does not export React `createElement` or accept React element trees. Programmatic roots render an Octane component plus props; Refs are ordinary Octane props and may be composed with `ref={[a, b]}`; there is no `forwardRef` layer; Slot plugins return universal renderables and plugin errors use source `octane` instead of `react`. `createReactSlotRegistry` and the upstream `React*` type names remain migration aliases for the canonical Octane-named API; React DevTools and OpenTUI's React runtime-plugin bundling subpaths are not ported. Applications configure the Octane compiler with `opentuiRenderers`; Portal targets are explicitly limited to borrowed `RootRenderable` instances from the same `CliRenderer` context and are never destroyed by the binding | Unsupported. OpenTUI is a native terminal renderer; `.opentui.tsrx` modules are rejected from server graphs and have no HTML hydration contract. | 2026-08-25 |
| [`@octanejs/pdf`](#octanejspdf) | `react-pdf@10.4.1` | Complete against the documented react-pdf 10.4.1 root contract: Document, Page, Thumbnail, Outline, all three context hooks, PasswordResponses, pdfjs, all ten root types, both documented layer styles, and the unchanged PDF.js worker import. | React nodes, refs, DOM events, and CSS property types are represented by Octane nodes, refs-as-props, native DOM events, and Octane class/style values while preserving observable behavior; The permissive upstream ./* export exposes React implementation and source artifacts; these are pinned framework-private evidence rather than supported Octane entry points. Root imports and the two documented CSS paths are exact public support | Document renders deterministic loading, no-data, and error shells without browser globals or workers. The browser build adopts the server shell before starting PDF.js and uses the modern worker-backed build; Node resolves the legacy PDF.js build. | 2026-08-04 |
| [`@octanejs/phosphor-icons`](#octanejsphosphor-icons) | `@phosphor-icons/react@2.1.10` | All 1,512 canonical icons from @phosphor-icons/core@2.1.1, including the upstream deprecated Icon-suffixed aliases, six weights, IconContext, IconBase, root exports, and per-icon imports. | Icon refs are normal Octane ref props rather than React forwardRef components; Event callbacks receive native DOM events rather than React synthetic events; The React package's SSR namespace is unnecessary because Octane icons use the same components on client and server | Supported and tested against @phosphor-icons/react/ssr for every weight; hydration adopts and updates server-rendered SVG hosts. | 2026-08-02 |
| [`@octanejs/popper`](#octanejspopper) | `react-popper@2.3.0` | Complete against the published react-popper 2.3.0 root runtime and type surface: Manager, Reference, Popper, usePopper, render-function refs and styles, explicit and virtual references, arrows, hide data, lifecycle actions, Popper modifiers, and all public types. | React component classes are Octane function components; React node, ref, and CSS property types are represented by OctaneNode and native structural equivalents while preserving observable render-function values; Development misuse warnings are emitted directly through console.error instead of React Popper's warning helper | Manager, Reference, and Popper render deterministic initial markup without browser globals, adopt server nodes during hydration, then create and clean up the Popper instance after client refs attach. | 2026-08-03 |
| [`@octanejs/portabletext`](#octanejsportabletext) | `@portabletext/react@8.0.1` | Complete runtime surface: PortableText, defaultComponents, mergeComponents, toPlainText, PortableTextBlock and ListNestMode, plus renderer component and TypeGen helper types. | Renderer callbacks return OctaneNode rather than ReactNode; Custom component refs and events use Octane's normal ref prop and native DOM events; PortableTextReactComponents and ReactPortableTextList are compatibility aliases; Octane-named equivalents are preferred | Supported and differential-tested against @portabletext/react@8.0.1 static markup. | 2026-08-24 |
| [`@octanejs/radix`](#octanejsradix) | `radix-ui@1.6.4` | Surface-present against the unified `radix-ui@1.6.4` component exports. Sixteen repo-authored differential cases compare representative primitives and interactions against the real package; the complete 38-file canonical upstream suite is preserved but not adapted, so the binding remains recorded-unverified. | `Slot`/`asChild` compose element descriptors (prop-position JSX, `createElement`, `.map()` returns), not children-position JSX; `forwardRef` becomes octane's ref-as-prop | SSR/hydration coverage for the overlay/portal components is still open (tracked in the migration plan). | 2026-08-03 |
| [`@octanejs/rainbowkit`](#octanejsrainbowkit) | `@rainbow-me/rainbowkit@2.2.11` | Octane-native RainbowKitProvider, ConnectButton and ConnectButton.Custom, WalletButton, connect/account/chain modal hooks, connector selection, account/chain actions, native accessible dialogs, and light/dark/midnight themes. | IMPORTANT: upstream RainbowKit 2.2.11 declares wagmi ^2.9.0. This adapter intentionally consumes @octanejs/wagmi v3 and is not drop-in dependency or peer-range parity; The React DOM and vanilla-extract implementation is replaced by native Octane TSRX, DOM events, focus/scroll containment, and CSS custom properties; The wallet list merges optional configured descriptors with the enclosing Wagmi v3 connector list, deduplicated by canonical connector uid with explicit id/name fallback. Unavailable configured entries remain visible with a reason. RainbowKit wallet factories, vendor SDKs, and WalletConnect project configuration remain application-owned; Authentication, recent transactions, ENS/avatar resolution, localization, cool mode, account avatars/balances, chain icons, and pixel-identical upstream themes are unsupported and their upstream props are not accepted; rainbowTheme is an explicitly documented Octane-only purple/rounded preset; it is not an upstream RainbowKit export | The provider and controls emit deterministic disconnected markup without browser wallet access. Connector discovery and live Wagmi state become authoritative after hydration; no hydrated UI state authorizes wallet actions. | 2026-08-02 |
| [`@octanejs/react-error-boundary`](#octanejsreact-error-boundary) | `react-error-boundary@6.1.2` | Complete against the published react-error-boundary 6.1.2 function/type surface adapted to Octane: ErrorBoundary, ErrorBoundaryContext, getErrorMessage, fallback variants, onError/onReset callbacks, resetKeys, useErrorBoundary (including error), withErrorBoundary, OnErrorCallback, and UseErrorBoundaryApi. | Component stack information is currently an empty string because Octane does not expose a public component-stack formatter; Event-handler and asynchronous errors must be passed to useErrorBoundary().showBoundary(), matching upstream's explicit forwarding requirement; Server rendering that must match upstream error propagation uses the explicit @octanejs/react-error-boundary/server entry | The explicit server entry renders children without a boundary so descendant errors propagate, matching react-error-boundary 6.1.2. | 2026-08-02 |
| [`@octanejs/react-map-gl`](#octanejsreact-map-gl) | `@vis.gl/react-mapbox@8.1.2 (b1e46fcf)` | Complete against the pinned @vis.gl/react-mapbox 8.1.2 public surface — the package react-map-gl/mapbox re-exports: Map (and default), Marker, Popup, Source, Layer, AttributionControl, FullscreenControl, GeolocateControl, NavigationControl, ScaleControl, useControl, MapProvider, useMap, and every published type. The framework-neutral half of upstream (the Mapbox engine, proxy transform, map ref, and six utils) is reused byte-for-byte and validated by upstream's own specs run against both source trees. | <Source> delivers its generated id to child layers through context rather than cloneElement, so the id reaches any descendant <Layer> rather than only direct children. It still overrides an explicitly set source, as cloneElement did; Map, Marker, Popup and GeolocateControl take their ref as an ordinary prop; Octane has no forwardRef. `<Map ref={mapRef} />` is unchanged; Effect cleanups run on the passive drain after root.unmount() rather than inside it, so the map's WebGL context and worker pool are released one drain later; Marker picks between its own element and Mapbox's default pin from what its children actually rendered, because a compiled children block cannot be inspected the way React.Children.forEach inspects descriptors. Children that render something, render nothing, or first render after mount all match upstream; a child that stays truthy while rendering nothing forever gets the default pin here and an empty, invisible element upstream; react-map-gl/mapbox-legacy (mapbox-gl v1) and @vis.gl/react-maplibre are out of scope | Supported and tested: Map server-renders its container with the merged style and omits every child, because mapbox-gl is only imported inside an effect. Nothing in the tree reads a browser global on the server. hydrateRoot adopts that container rather than replacing it, and the map is created inside the server's own node once the library resolves. | 2026-08-06 |
| [`@octanejs/recharts`](#octanejsrecharts) | `recharts@3.9.2` | Broad runtime support across cartesian, polar, hierarchical, tooltip, legend, responsive-container, shape, and chart-state surfaces. `Brush` and `Treemap` remain intentionally unsupported. | Chart events coordinate through octane's native delegated events rather than React's synthetic layer | Untested; text measurement (`getStringSize`) returns 0×0 under SSR. | 2026-08-02 |
| [`@octanejs/redux`](#octanejsredux) | `react-redux@9.3.0` | The hooks + `Provider` surface of react-redux 9.3.0 (`useSelector`, `useDispatch`, `useStore`, and the custom-context factory variants) on octane's `useSyncExternalStore`; works with any Redux 5 / Redux Toolkit store. Upstream runtime-export completeness is pinned by test. | `connect()` (the legacy HOC surface) intentionally throws — the hooks API is the supported surface; Error messages are octane-branded; The root also exposes createReduxContextHook, useReduxContext, createSubscription, and useSyncExternalStoreWithSelector as Octane extension exports | No SSR-specific surface; no dedicated SSR tests. | 2026-08-02 |
| [`@octanejs/redux-toolkit`](#octanejsredux-toolkit) | `@reduxjs/toolkit@2.12.0` | Complete four-entry-point port: the framework-agnostic Toolkit and RTK Query core are re-exported verbatim; `/query/react` provides generated query, lazy-query, mutation, infinite-query, prefetch hooks and `ApiProvider`; `/react` provides the dynamic-middleware dispatch-hook integration. | The compatibility `/react` subpaths and `reactHooksModule` names are retained, but use octane and `@octanejs/redux` internally; `useDebugValue` is octane's no-op compatibility hook; observable query behavior is unchanged | Preloaded RTK Query state renders through the traditional @octanejs/redux Provider; effects and browser listeners remain client-only. Dedicated SSR and hydration tests are included. | 2026-08-02 |
| [`@octanejs/remix-router`](#octanejsremix-router) | `react-router@8.2.0` | All planned port phases are shipped and the pinned runtime export namespace is complete: the framework-agnostic router core, data/declarative/DOM/mutation/guard layers, static SSR, and cookie/session runtime are implemented on Octane. Framework-mode and RSC names remain throwing scope stubs. Selected vendored-core suites, local conformance, and nine exact shared-fixture scenarios provide bounded evidence rather than exhaustive React parity. | Refs are props (octane has no forwardRef) — Link's forwardRef becomes a `ref` prop; Error-boundary reset on location change / revalidation-idle happens in a layout effect one commit after upstream's render-phase derivation — same observable outcome; octane's flushSync inside an ambient flush degrades to a plain call drained at that flush's boundary (sync scroll/navigation notifies from within event handlers land at the flush boundary instead of nested) — consumer-invisible, conformance-pinned; Form's onSubmit is a NATIVE delegated submit listener (octane has no synthetic events): `event.submitter` is read directly off the SubmitEvent where React reads `event.nativeEvent.submitter` — same value, differential-verified; Block-children `<Routes>` collects `<Route>`s by registration (mount order) instead of upstream's element-children walk (source order) — a conditionally-mounted `<Route>` between static siblings registers after them, which only affects matchRoutes score TIES; conformance-pinned | Shipped: StaticRouter/StaticRouterProvider/createStaticHandler/createStaticRouter render through octane/server (remix-router-ssr vitest project compiles the whole graph in server mode; markup matches react-dom/server byte-for-byte after framework-marker stripping). Block-children <Routes> is CLIENT-only (the registration collector runs in layout effects) — use descriptor children or route objects for SSR. | 2026-08-02 |
| [`@octanejs/resizable-panels`](#octanejsresizable-panels) | `react-resizable-panels@4.12.2` | Group, Panel, Separator, persistence hooks, refs, imperative APIs, layout constraints, pointer and keyboard interaction, ARIA, cursor handling, and ResizeObserver behavior are implemented against react-resizable-panels 4.12.2. | useId(undefined) fallback cannot reproduce React's mocked ':r123:' seam; adapted upstream case asserts a non-empty Octane id and is recorded as react-resizable-panels-useId-fallback | Deterministic server rendering and live hydration adoption are covered by dedicated executable projects. | 2026-08-02 |
| [`@octanejs/rxjs`](#octanejsrxjs) | `@react-rxjs/core + @react-rxjs/utils@0.10.8 / 0.9.7` | Core bind/state/Subscribe APIs and the complete @react-rxjs/utils surface. | StateObservable values are not JSX nodes; render them through useStateObservable or bind; @react-rxjs/dom is omitted because octane batches updates without ReactDOM.unstable_batchedUpdates | useSyncExternalStore supplies the state snapshot during server rendering; browser-only ReactDOM batching helpers are intentionally absent. | 2026-08-02 |
| [`@octanejs/sanity-icons`](#octanejssanity-icons) | `@sanity/icons@5.2.1` | Complete @sanity/icons@5.2.1 surface: all generated per-icon subpaths, named and default exports, Icon, icons, IconMap, IconSymbol and IconComponent. | Refs are normal Octane ref props rather than React forwardRef wrappers; Event callbacks receive native DOM events rather than React synthetic events | Supported and tested against representative @sanity/icons static SVG markup. | 2026-08-24 |
| [`@octanejs/sanity-loader`](#octanejssanity-loader) | `@sanity/react-loader@2.2.1` | Query-store milestone: createQueryStore, loadQuery, setServerClient, useQuery, useLiveMode, useEncodeDataAttribute, create-data-attribute exports, browser conditions, and the server-only rsc entry. | Hooks use Octane hook slots and return Octane-compatible values rather than React hooks; The experimental upstream ./jsx wrapped-data element factory is deferred to a separate milestone; The ./rsc entry models a server-only Octane environment rather than React Server Component conditions | Supported through loadQuery/setServerClient and the server-only rsc entry; initial query state is SSR-tested. | 2026-08-24 |
| [`@octanejs/sanity-logos`](#octanejssanity-logos) | `@sanity/logos@2.2.5` | Complete @sanity/logos@2.2.5 runtime surface: SanityLogo, SanityMonogram, GroqLogo and GroqMonogram, including dark/scheme/custom-color variants. | Refs are normal Octane ref props rather than React forwardRef wrappers; Event callbacks receive native DOM events rather than React synthetic events | Supported and differential-tested against @sanity/logos@2.2.5 static SVG markup. | 2026-08-24 |
| [`@octanejs/select`](#octanejsselect) | `react-select@5.10.2` | All six JavaScript entry points and all 20 runtime exports. Public TypeScript contracts are consumer-compiled across every entry point. Framework-neutral declarations and every entry-point Props member are checked fail-closed; renderer-owned component, instance, event, node, and style contracts are explicitly tracked as the adaptations below. | Renderable callback and component contracts use OctaneNode instead of ReactNode; Event-bearing contracts use native DOM events instead of React synthetic events; Renderer-owned style contracts use Octane style objects instead of Emotion CSSObjectWithLabel | Default, styled, unstyled, asynchronous, creatable, state-managed, animated, nonce-bearing, static, string, and streaming server output is covered by executable React-oracle evidence. | 2026-08-03 |
| [`@octanejs/shadcn`](#octanejsshadcn) | `shadcn-ui/ui (radix base)@4baadbc6517070ae8f8feb2c97037adc2b305544 + shadcn@4.14.1` | Two primitive bases. RADIX base (default, reached at the bare subpaths): tiers 1-2 complete plus the first tier-3 composites — 40 component families. REACT ARIA base (@octanejs/shadcn/react-aria/<Family>): 33 families over @octanejs/aria/components, taken from upstream's aria-nova style and verified class-string identical to it; not ported are select and sonner (need input-group and next-themes), while hover-card, menubar and navigation-menu do not exist in upstream's aria base. Sources live at src/bases/<base>/ui/ with lib/hooks/styles shared. DISTRIBUTION is registry-first with per-family subpath exports; the monolithic root entry is removed. STYLING FLAVOR: the radix base is mid-migration from the pinned cn-* semantic-hook system to the default-Tailwind utilities-inlined flavor (user-directed); the react-aria base is uniformly the utilities-inlined aria-nova output. THE REGISTRY NOW COVERS ALL THREE BASES, using shadcn's own mechanism rather than a namespace: base and visual style compose into components.json's single `style` field, which the CLI substitutes into the registry URL (`{style}` and `{name}` are the only placeholders shadcn@4.14.1 substitutes, and it never parses the style string). Emitted as registry/styles/<style>/<name>.json for base-nova (default, @octanejs/base-ui), radix-nova and aria-nova, plus an un-styled copy of the default so a URL without {style} still resolves. Base-agnostic items (utils/types/theme/use-mobile) are emitted into every style tree because registryDependencies resolve through the same templated URL. `registry:serve` serves it locally — the port the playground's components.json always referenced but which nothing previously served. Verified end to end by installing with the real shadcn CLI: each style yields its own primitive. BASE UI base (@octanejs/shadcn/base-ui/<Family>): STARTED, 21 of 44 families and PARTIAL. `accordion` is transcribed from upstream and runs on the @octanejs/base-ui accordion primitive — the first primitive-backed family in this base. The rest are primitive-free: `alert` is transcribed from upstream's Base UI source and verified byte-identical to it; `aspect-ratio`, `card`, `empty`, `native-select`, `skeleton` and `spinner` are DERIVED from the react-aria base and are NOT yet verified against upstream, which each file's header records. Nothing primitive-backed is ported: Base UI's primitive API is structurally different from React Aria's, so it cannot be derived and needs transcribed upstream sources. The foundations now run on real Base UI primitives: `button` (Button), `input` (Field.Control), `label` (Field.Label) and `separator` (Separator), alongside plain-host `textarea` and `kbd` — Base UI ships no textarea or Keyboard primitive, so those match the radix base's shape rather than the aria base's. `separator` deliberately takes the ARIA base's class string, not the radix one: Base UI emits `aria-orientation`, so radix's `data-horizontal:` utilities would never match and the separator would render with no thickness. `button` omits the aria base's data-variant/data-size, which upstream's Base UI base also omits, and ships no LinkButton because Base UI has no Link primitive — which is why `pagination` remains unported. `alert-dialog` is transcribed from upstream and is the first portalled family here (Overlay->Backdrop, Content->Popup, Cancel->Close); it drops upstream's `cn-font-heading` on the title, matching the react-aria base, because this package ships the utilities-inlined flavor and nothing defines that semantic hook. The form controls (`checkbox`, `switch`, `radio-group`) adapt their conditional utilities rather than copying them: Base UI publishes bare `data-checked`/`data-unchecked` where radix publishes `data-state="checked"`, and every Root renders a `<span role=…>` that is never `:disabled`, so `disabled:` variants become `data-disabled:`. Both dialects are pinned by tests asserting the rendered DOM carries the attributes the class strings target. The overlays (`dialog`, `popover`, `tooltip`, plus `alert-dialog`) adapt positioning: Base UI inserts a Positioner layer (Portal > Positioner > Popup) and names its transform origin `--transform-origin`, not radix's `--radix-<part>-content-transform-origin`, so a copied radix class would reference a variable nothing sets and the popup would scale from the wrong corner. Tooltip also drops radix's `data-[state=delayed-open]` utilities, which have no Base UI counterpart. `PopoverAnchor` is absent because Base UI positions via the Positioner's `anchor` prop rather than an Anchor element — recorded in tests/cross-base.test.ts. | No `"use client"` directives anywhere: octane has no Server Components, so the RSC axis does not exist here; Refs are props (octane has no forwardRef) — upstream v4 already dropped forwardRef, so component shapes match; `asChild` composes element descriptors (createElement) rather than opaque compiled .tsrx children — the documented @octanejs/radix Slot contract. The same rule applies to the exported Portal wrappers (DialogPortal, AlertDialogPortal, DropdownMenuPortal, ContextMenuPortal, MenubarPortal): radix's Portal slots its child, so direct Portal children must be descriptors. The shipped *Content wrappers compose their Portal/Overlay/Content trees with createElement internally, so the ordinary authoring surface is unchanged — consumer children always flow through the props.children channel; Upstream's IconPlaceholder (the CLI-resolved `iconLibrary` axis) is resolved at port time to the default library, lucide, via @octanejs/lucide (XIcon, CheckIcon, CircleIcon, ChevronDownIcon, ChevronUpIcon, ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon, Loader2Icon); other icon libraries are a registry-emit concern; Events are native delegated DOM events: per-keystroke text handling on Input/Textarea is `onInput` (native `change` keeps its commit-on-blur meaning), menus open on native pointerdown/contextmenu, and component-level callbacks (`onValueChange`, `onCheckedChange`, `onPressedChange`, `onOpenChange`) are unchanged; ToggleGroup's variant/size/spacing/orientation inheritance uses octane's createContext/useContext with upstream's defaults and `context.value \|\| ownProp` precedence; SelectItem text portals into the trigger value node verbatim; multi-line-authored item text keeps its surrounding whitespace where React JSX would trim it (author item labels inline); Collapsible composes the radix binding's canonical Collapsible.Trigger/Collapsible.Content exports; the upstream CollapsibleTrigger/CollapsibleContent alias names are not exported by @octanejs/radix 0.1.12 (same components, different export alias); Accordion arrow-key navigation is collection-driven in the radix binding rather than RovingFocusGroup-wrapped; Home/End/Arrow focus movement between triggers is behaviorally equivalent and tested; FieldError renders falsy error-list entries as null instead of React's skipped false children — identical output; SidebarTrigger's click handling is the native delegated click event; behavior is otherwise identical to upstream. At this pin SidebarProvider does not mount a TooltipProvider, so consumers using SidebarMenuButton's tooltip prop must provide one (matches upstream); The packaged theme.css omits the upstream site-only tokens (--surface, --code-*, --selection*) and inlines concrete oklch values for --chart-1..5 (upstream references Tailwind palette variables, which require a Tailwind build this standalone file cannot assume); The Base UI base's derived components carry unverified class strings. This is tracked rather than assumed safe: the bases genuinely diverge (the radix base's Skeleton is `bg-accent` where react-aria's is `bg-muted`), so identity is verified per component. `badge` was deliberately NOT derived — the react-aria version takes `render` as a function while Base UI's takes an element, so deriving it would ship the wrong API | Tier 1 is fully server-rendered and tested (17 families through renderToString with no browser globals, including Slot-composed hosts), with hydration adoption pinned for representative shapes (plain host, Button-asChild anchor, nested Table) — zero mismatch, preserved node identity. Tier 2's portal-free components (Checkbox, RadioGroup, Switch, Slider, Tabs, Toggle, ToggleGroup, Accordion, Collapsible, AspectRatio, Progress) are server-rendered and tested. Field is SSR-safe (no portals/browser globals); Sidebar server-renders its static desktop branch (useIsMobile is false on the server; the mobile Sheet branch and tooltip portals are client-only). Portal-backed overlays/menus/Select are excluded until the radix binding supports overlay SSR; ScrollArea awaits verification of its viewport style injection on the server. | 2026-08-02 |
| [`@octanejs/solana-kit`](#octanejssolana-kit) | `@solana/react@7.0.0` | Octane-native client provider/store hooks, a validated private Wallet Standard adapter, explicit-action transaction orchestration, and a TanStack Query-backed request hook. Applications import framework-neutral operations directly from @solana/kit@7.0.0. | @solana/react/swr is excluded because Octane has no SWR binding; Wallet APIs are deliberately structural and narrower because upstream selected-wallet exports leak React and @wallet-standard/react public types; useSubscriptionQuery and useTrackedDataQuery are deferred pending streamed-query lifecycle characterization; Upstream sign-in/message/transaction hooks are represented by a generation-safe explicit transaction executor rather than hidden React runtime code; ClientProvider accepts only a resolved client; thenables throw at mount rather than suspending | Client state is server-readable. Wallet discovery is inert during SSR and activates only when a browser registry is explicitly attached after hydration. | 2026-07-29 |
| [`@octanejs/sonner`](#octanejssonner) | `sonner@2.0.7` | Complete against the published `sonner@2.0.7` public surface: `Toaster`, the callable `toast` API and all methods, `useSonner`, promise lifecycle, multiple toaster targeting, stacked layout, themes, styling, focus management, timers, and swipe dismissal. | Action callbacks receive native DOM `MouseEvent`s rather than React synthetic events; `Toaster` accepts its ref as a normal prop instead of using `forwardRef`; The document-visibility hook is guarded during SSR; upstream 2.0.7 reads `document.hidden` during render | Supported and tested: `Toaster` server-renders without browser globals, hydrates by adopting the server host, and can show the first client-created toast without replacing it. | 2026-08-02 |
| [`@octanejs/spring`](#octanejsspring) | `@react-spring/web@10.1.2` | Stable React Spring web target at the package root and Parallax through the ./parallax subpath. The port provides spring values, controllers, interpolation, Octane hooks and render-prop components, animated DOM hosts, browser observers, SSR-safe initial rendering, and Parallax scrolling. | React renderables and refs are represented by Octane renderables and refs-as-props; The all-renderer react-spring meta-package is intentionally not mapped | Initial and immediate values render on the server; browser observers and frame work start after client commit. | 2026-08-02 |
| [`@octanejs/stick-to-bottom`](#octanejsstick-to-bottom) | `use-stick-to-bottom@1.1.6` | Public runtime surface at use-stick-to-bottom 1.1.6: useStickToBottom, StickToBottom, StickToBottom.Content, useStickToBottomContext, and related types. | Consumers import from @octanejs/stick-to-bottom instead of use-stick-to-bottom; Ref objects are structural { current } / callback refs rather than React.RefObject; The plain TypeScript useStickToBottom hook forwards compiler-injected slots; a symbol in the options position is treated as empty options | Scroll/resize listeners attach in ref callbacks. Initial isAtBottom follows options.initial. Overflow auto is applied in a layout/effect. | 2026-08-20 |
| [`@octanejs/streamdown`](#octanejsstreamdown) | `streamdown@2.5.0` | Complete Streamdown 2.5.0 root runtime and public type surface, plus the official code 1.1.1, math 1.0.2, Mermaid 1.0.2, and CJK 1.0.3 plugins exposed through ./code, ./math, ./mermaid, and ./cjk. | Components, hooks, contexts, lazy boundaries, portals, element inspection, and the HAST JSX runtime target Octane; callbacks receive native DOM events instead of React synthetic events; The four official plugins are consolidated as subpath exports of @octanejs/streamdown instead of separate packages; Animation progress is isolated per streaming block instead of sharing upstream 2.5.0's sibling progress, so new sibling text receives its own duration and delay; Code-block background arbitrary-value classes have balanced parentheses instead of the malformed class strings published by upstream 2.5.0; Built-in icon size props set SVG width and height; upstream 2.5.0 leaves the size attribute inert and renders the default 16x16 dimensions | Static and streaming Markdown, custom components, code blocks, math markup, and hydration are covered by dedicated server and hydration tests. Browser-only controls and deferred Mermaid rendering remain inert until mounted. | 2026-08-02 |
| [`@octanejs/styled-components`](#octanejsstyled-components) | `styled-components@6.4.3` | Full v6 web API, ported from the upstream 6.4.3 sources: `styled` with every HTML/SVG tag shortcut, `.attrs`/`.withConfig` chaining, `css`, `keyframes`, `createGlobalStyle`, `createTheme`, `ThemeProvider`/`ThemeContext`/`ThemeConsumer`/`useTheme`/`withTheme`, `StyleSheetManager`/`StyleSheetContext`/`StyleSheetConsumer` (targets, namespaces, vendor prefixing, stylis plugins, `shouldForwardProp`), `ServerStyleSheet`, `isStyledComponent`, `version`, and `__PRIVATE__`. Component selectors, folding (`styled(Styled)`), transient `$` props, `as`/`forwardedAs`, and the grouped CSSOM sheet engine (with upstream `data-styled` rehydration) all behave as upstream. The React Native surface and the RSC-only `stylisPluginRSC` are not ported. | `ref` is a plain prop (octane has no `forwardRef`); it always attaches to the rendered element and is never subject to `shouldForwardProp` filtering; SSR is automatic: server-side inserts flow through octane's css channel, so `renderToString`/streaming return the styles as `<style data-octane="sc.<componentId>.<name>">` chunks in `RenderResult.css` with per-request isolation, and client boot adopts those chunks without duplicate injection. `ServerStyleSheet` ships as a working compat wrapper, but `interleaveWithNodeStream` throws — octane streaming already interleaves styles; `defaultProps` on a styled component is resolved by the factory at render time (octane call sites do not apply component `defaultProps`); folding via `styled(Styled)` deep-merges as upstream; Polymorphic `as`/`forwardedAs` typing is pragmatic: component targets infer props from their function signature, host tags use a permissive prop bag (octane has no `JSX.IntrinsicElements` map to introspect); The babel `css` prop transform is not supported; The dev-only dynamic-creation warning uses a per-displayName creation-count heuristic instead of upstream's React-dispatcher probe; Unnamed stylis plugins actually throw the documented error 15 (upstream 6.4.3 constructs the error but forgets to throw it); Interpolation-position styled components are recognized by an octane brand symbol rather than React's forward-ref `$$typeof` (octane styled components are plain functions) | Supported and tested: zero-config collection into `RenderResult.css` via octane's `injectStyle` channel (styled rules, keyframes, and globals, with content-derived immutable chunk ids that make streaming dedup sound), repeat-render and dynamic-global request isolation through a stateless server output backend, hydration adoption of server chunks (removed after adoption, no duplicate rules), and the `ServerStyleSheet` compat surface. | 2026-08-02 |
| [`@octanejs/stylex`](#octanejsstylex) | `@stylexjs/stylex@0.19.0` | Full compile-time integration: re-exports the StyleX runtime API (`create`, `props`, `attrs`, `keyframes`, `defineVars`, `createTheme`) and registers as an import source; the `/vite` plugin runs the StyleX compiler over octane's compiled output and emits one static atomic stylesheet (`virtual:stylex.css`) with zero StyleX runtime in the bundle. | The `sx` JSX prop is not supported — spread `{...stylex.props(...)}` instead; The compiler runs over octane's compiled output rather than source, so StyleX's own PostCSS source-scanning setup is unused | Works under SSR — the stylesheet is static and server markup carries the final class names; no dedicated SSR test files. | 2026-07-09 |
| [`@octanejs/swr`](#octanejsswr) | `swr@2.4.2` | Mapped port of SWR 2.4.2: root useSWR/config/cache/mutate/preload, infinite, immutable, remote mutation, subscription, _internal, and the published react-server condition branches. The harness executes the pinned pristine React suite plus selected adapted Octane cases, repo-authored adapted type probes, and differential/export oracles. Provenance remains recorded-unverified until the exhaustive adapted crosswalk lands. | The binding exposes window.__SWR_DEVTOOLS_OCTANE__ and deliberately does not claim React's window.__SWR_DEVTOOLS_REACT__ global; React-only devtools that require that identity are incompatible; SWR 2.4.2 behavior is pinned exactly, including the absence of automatic request abortion on consumer unmount | Supported and tested: browser-global-free server condition exports, deterministic fallback output, Octane streaming/hydration architecture gates, and pinned fallback/preload revalidation semantics. |  |
| [`@octanejs/syntax-highlighter`](#octanejssyntax-highlighter) | `react-syntax-highlighter@16.1.1` | Complete against react-syntax-highlighter 16.1.1: default, Light, Prism, async and async-light components; static registration and language lists; custom renderers and tags; all pinned Highlight.js and Prism languages and styles; and all ESM/CJS deep-import aliases. | PreTag and CodeTag accept native tag names or Octane function components. React class components require a function adapter because React instance identity is renderer-owned; In .tsrx, source text must use the explicit children={source} prop. Nested component children compile to an opaque renderer block that a text-inspecting component cannot unwrap | Synchronous variants emit highlighted server HTML without DOM globals. Async variants emit the same deterministic plain-code fallback and hydrate by adopting the existing pre, code, and token nodes before live updates. | 2026-08-03 |
| [`@octanejs/tanstack-ai`](#octanejstanstack-ai) | `@tanstack/ai-react@0.17.0` | Ports the @tanstack/ai-react 0.17.0 hook surface (useChat, useRealtimeChat, useGeneration, useGenerateImage/Audio/Speech/Video, useTranscription, useSummarize, useAudioRecorder, useMcpAppBridge) while reusing @tanstack/ai 0.41.0 and @tanstack/ai-client 0.21.0 unchanged and mirroring all 30 @tanstack/ai-client convenience re-exports from the upstream index. | The `./mcp-apps` subpath and its `MCPAppResource` component are not ported: they render `AppRenderer` from the React-only `@mcp-ui/client`, which has no Octane equivalent. The framework-agnostic `useMcpAppBridge` hook is ported and available on the main entry; Octane uses native events: text/file/recorder inputs drive updates via `onInput`; there is no synthetic `onChange` layer; Octane has no StrictMode double-invoke and always provides `useId`, so no random-id fallback is needed; The TanStack AI Devtools bridge is tagged `framework: 'octane'` (upstream `@tanstack/ai-react` sends `'react'`), so the devtools identify this binding correctly; Realtime reconnects and token refreshes use the latest `getToken` and adapter supplied to the hook; upstream @tanstack/ai-react 0.17.0 captures the first render's callbacks; The declared realtime `onStatusChange` callback is invoked alongside the hook's state update; upstream @tanstack/ai-react 0.17.0 currently drops the external callback; Changing `useChat`'s connection or fetcher updates the active ChatClient in place and preserves conversation state; upstream @tanstack/ai-react 0.17.0 captures the initial transport; One upstream `useChat` test case ("auto-resume on mount / when the browser comes back online") is omitted: it targets `ChatClient.prototype.maybeAutoResume`, an API absent from the pinned (and latest published) `@tanstack/ai-client@0.21.0` and never invoked by `useChat`. It is untestable in this binding until that dependency ships the method | Supported and tested: useChat renders its initial message snapshot through octane/server without a DOM. | 2026-08-09 |
| [`@octanejs/tanstack-db`](#octanejstanstack-db) | `@tanstack/db@0.7.0` | Re-exports `@tanstack/db@0.7.0` unchanged and ports the React live-query binding surface of `@tanstack/react-db@0.1.96` (`useLiveQuery`, `useLiveInfiniteQuery`, `useLiveSuspenseQuery`, `useLiveQueryEffect`, `usePacedMutations`) onto Octane hooks. `useLiveQuery`/`useLiveSuspenseQuery` are driven by db's shared `createLiveQueryObserver`; `useLiveInfiniteQuery` by the coordinated `createLiveQueryWindowController`. | `useLiveSuspenseQuery` consumes the preload promise through Octane's `use(thenable)` instead of throwing it, although Octane supports both forms. Because Octane keys `use()` by dynamic call-order index (not compiler slot), this binding calls `use()` unconditionally — exactly once per render, handing it an already-resolved thenable on the ready/stale paths — so a sibling `use()` or a second `useLiveSuspenseQuery` in the same component keeps a stable thenable index. Observable behavior (fallback then data) matches; `useLiveQuery`/`useLiveInfiniteQuery` subscribe wrappers defer an initial `onStoreChange` to a microtask so an already-ready collection (or a synchronous subscribe-time window growth) is reflected in the first committed snapshot. Octane's `useSyncExternalStore` re-checks the store snapshot before, not after, the subscribe call (React re-checks after), so this nudge stands in for React's post-subscribe reconciliation. Pinned by the `eager-onstorechange` test; `useLiveInfiniteQuery` rejects a pre-created collection that lacks an `orderBy` synchronously during render (detected via `getWindow()` returning a window object), so the error is observable to the caller, rather than letting `setWindow()` throw later inside a passive subscribe effect that Octane swallows; StrictMode double-invocation is not applicable: Octane has no development double-invoke of component setup/cleanup | Not yet exercised: no server-render tests are included for the live-query hooks. | 2026-08-13 |
| [`@octanejs/tanstack-devtools`](#octanejstanstack-devtools) | `@tanstack/react-devtools@0.10.7` | Surface-present for the pinned adapter's runtime entrypoint, with additive framework-neutral core re-exports. A same-fixture differential covers mount, config synchronization, plugin/title/trigger portals, and teardown. Upstream has no runtime suite; its test:types source compile is recorded as present type evidence with required pristine/adapted type lanes. Provenance is verified; core-version drift and Octane-specific type names/core re-exports stay as explicit divergences. | Public adapter types use Octane-prefixed names: `TanStackDevtoolsOctanePlugin` and `TanStackDevtoolsOctaneInit` (upstream: `TanStackDevtoolsReactPlugin` / `TanStackDevtoolsReactInit`); `ref` is the normal React-19-style ref prop and events are native (no synthetic layer), consistent with the rest of the Octane bindings; The main entry also re-exports the framework-agnostic `@tanstack/devtools` core surface (`TanStackDevtoolsCore`, container-id constants, and plugin authoring types) so consumers do not need a direct dependency on `@tanstack/devtools` for typing plugins; Plugin/title/trigger content is rendered through a tiny `DevtoolsPortal` component (a createPortal VALUE), because Octane renders a returned portal at any position rather than only as a direct JSX child | Supported and tested: the component renders its absolutely-positioned anchor element through octane/server without a DOM; the core is constructed but never mounted server-side (mount is a client-only effect). | 2026-08-03 |
| [`@octanejs/tanstack-form`](#octanejstanstack-form) | `@tanstack/react-form@1.33.2` | Ports the complete @tanstack/react-form 1.33.2 adapter surface (`useForm`, `useField`, form and field groups, hook contexts and component composition) while re-exporting @tanstack/form-core 1.33.2 unchanged and using @octanejs/tanstack-store for subscriptions. | Octane uses native events: text controls call `field.handleChange` from `onInput`; TanStack Form's `onChange` validator and listener option names remain unchanged; Octane has no StrictMode double-invoke and always provides `useId`, so the adapter omits StrictMode scenarios and the legacy random-UUID fallback; Component registration accepts Octane function components; class components are not supported by Octane | Supported and tested: fields and form subscriptions render their initial snapshots through octane/server without a DOM. | 2026-08-09 |
| [`@octanejs/tanstack-hotkeys`](#octanejstanstack-hotkeys) | `@tanstack/react-hotkeys@0.10.0` | Surface-present for all 22 `@tanstack/react-hotkeys@0.10.0` adapter exports plus the byte-identical `@tanstack/hotkeys@0.8.0` core re-export. The pinned 41-case upstream runtime suite runs pristine and adapted as verified vitest-full lanes; type suites compile upstream source with tsc and the Octane surface with tsrx-tsc. | `target` refs are plain `{ current }` objects (Octane has no `React.RefObject`); the `isRef` guard and behavior are otherwise identical | Supported: every hook registers listeners in effects and resolves `document` lazily, so server rendering produces no registrations and no browser access (matching upstream's `typeof document` guards). | 2026-08-03 |
| [`@octanejs/tanstack-pacer`](#octanejstanstack-pacer) | `@tanstack/react-pacer@0.22.1` | Surface-present for all 15 runtime/type entrypoints from `@tanstack/react-pacer@0.22.1`, plus the byte-identical `@tanstack/pacer@0.21.1` core re-export. Repo-authored adapted-octane and differential lanes cover a representative debounce/throttle/batching/teardown lifecycle; upstream has no runtime suite and insufficient type evidence, so provenance remains `recorded-unverified` with nearly every export still `surface-present-unverified`. | Upstream types spelled with `React.Dispatch<React.SetStateAction<T>>` use structurally identical local aliases (Octane state setters have the same shape) | Supported: instances are created lazily in `useState` initializers, cleanup runs in effects, and no browser globals are touched during render, so server rendering produces the initial (non-pending) state exactly like upstream. | 2026-08-03 |
| [`@octanejs/tanstack-query`](#octanejstanstack-query) | `@tanstack/react-query@5.101.3` | Complete: 58/58 runtime exports plus the full TypeScript surface; the export surface is byte-identical to upstream in both directions (locked by test), and `@tanstack/query-core` is re-exported verbatim. | Suspense integrates via octane's `use(thenable)` rather than throwing a promise (observable behavior matches) | `HydrationBoundary` is fully ported (including streaming `promise`/`dehydratedAt` re-hydration), and initial query data is covered by a DOM-free Octane server-render test; dedicated streaming server entries remain open. | 2026-08-02 |
| [`@octanejs/tanstack-router`](#octanejstanstack-router) | `@tanstack/react-router@1.170.18` | Octane's TanStack Router binding: typed route factories and hooks, the full Match pipeline and lifecycle, file routes with TSRX-aware generator integration, full Link navigation/preloading/masking behavior, blocking, Await/deferred hydration, scroll restoration, lazy routes, not-found handling, document/head assets, and client/server SSR entries. | Refs are props — `createLink`'s `forwardRef` becomes a `ref` prop; Link callbacks receive native DOM events rather than React synthetic events; Router devtools are distributed separately | Full-document buffered and readable-stream SSR through `./ssr/server`, client hydration through `./ssr/client`, route-owned head/scripts, CSP nonce propagation, per-route SSR modes, and native Octane stream injection; covered by Octane-only framework-contract tests in ordinary shards (not a React SSR oracle). | 2026-08-02 |
| [`@octanejs/tanstack-router-ssr-query`](#octanejstanstack-router-ssr-query) | `@tanstack/react-router-ssr-query@1.167.1` | Surface-present for the pinned adapter's only runtime entrypoint (`Options` and `setupRouterSsrQueryIntegration`). The metadata-only `./package.json` subpath is intentionally omitted. A representative differential covers provider-backed SSR, existing-wrapper preservation, setup mutations, and the wrapping control; upstream has no runtime suite, and type evidence is the upstream source compile plus the adapted Octane compile, so verification remains recorded-unverified. | none known | Supported — this package IS the SSR integration (dehydrates query state into the router stream and wraps the app in the query provider). | 2026-08-03 |
| [`@octanejs/tanstack-store`](#octanejstanstack-store) | `@tanstack/react-store@0.11.0` | Re-exports `@tanstack/store@0.11.0` unchanged and implements the stable React binding surface (`useSelector`, `useAtom`, `useCreateAtom`, `useCreateStore`, `createStoreContext`, and deprecated `useStore`) on Octane hooks. | The upstream experimental `_useStore` hook is intentionally omitted; use `useSelector` with `store.actions` or `store.setState` instead | Supported: selectors, writable atoms, and store context read their current snapshots during server rendering; the adapter has no browser-only initialization. | 2026-08-09 |
| [`@octanejs/tanstack-table`](#octanejstanstack-table) | `@tanstack/react-table@9.0.0-beta.58` | Complete port of the v9 adapter: the framework-agnostic `@tanstack/table-core` (constructTable + every tree-shakeable feature and row model) is reused verbatim, and the adapter — `useTable`, `Subscribe`, `flexRender`/`FlexRender`, `createTableHook`, `createTableHookContexts` — is transcribed onto octane hooks. Table state lives in TanStack Store atoms via the `coreReactivityFeature` bindings, and `useSelector` drives re-renders from the selected slice. Every store primitive (hooks, `createAtom`, `batch`, `shallow`, and the atom/store types) is imported from @octanejs/tanstack-store, which re-exports all of @tanstack/store — the binding takes no direct dependency on the store core, so there is only one path to it and atom identity cannot be split across duplicate copies. | `flexRender`'s class-component and `react.memo`/`forwardRef` exotic-component branches are dropped — octane has no class components or forwardRef, and octane's `memo()` returns a plain function, so `typeof === 'function'` covers every component; Upstream's `useLegacyTable` entry (the v8-compat `get*RowModel` shim, its marker factories, and the `Legacy*` type aliases) is NOT ported. It exists to migrate existing React v8 codebases; octane has none, so octane code targets the v9 `useTable` API directly | No SSR-specific surface; table-core is pure computation. | 2026-08-02 |
| [`@octanejs/tanstack-virtual`](#octanejstanstack-virtual) | `@tanstack/react-virtual@3.14.5` | Complete 1:1 port: the framework-agnostic `@tanstack/virtual-core` (Virtualizer + observers + windowing math) is reused verbatim; the React adapter (`useVirtualizer`, `useWindowVirtualizer`, incl. `useFlushSync` and the experimental `directDomUpdates` surface) is transcribed onto octane hooks, preserving upstream's force-update + flushSync-on-sync-scroll wiring and layout-effect lifecycle. | octane's `flushSync` called while a flush is already on the stack degrades to a plain call drained by the ambient flush (re-entrancy guard) — sync scroll notifies dispatched from inside a discrete-event flush land at that flush's boundary instead of nested; consumer-invisible, pinned by a conformance test | SSR-safe: `useIsomorphicLayoutEffect` degrades to `useEffect` without `document`; the first paint windows from `initialRect`/`initialOffset` exactly as upstream. No dedicated SSR tests. | 2026-08-02 |
| [`@octanejs/tauri`](#octanejstauri) | `@tauri-apps/api@2.11.1` | Octane hooks over the framework-neutral Tauri IPC surface: useInvoke (suspending command), useInvokeState (pending/success/error with refetch), and useTauriEvent (event subscription with lifecycle-safe teardown). The rest of @tauri-apps/api — window, webview, menu, tray, path, dpi, image, and the plugin packages — is already framework-neutral and is imported directly rather than re-exported here. | There is no React binding upstream; @tauri-apps/api ships promise and callback APIs, so this package is a new hook layer rather than a port; Hook call-site slots are forwarded through Octane's compiler binding ABI; useInvoke integrates with Octane's use() rather than React's use() or a thrown-promise implementation detail; Command arguments given as a plain record are compared by value for the default refetch key; array and binary payloads are compared by identity. The command name is always part of the key, so explicit deps extend it rather than replacing it; useInvokeState returns to pending on refetch and does not implement stale-while-revalidate; a caching query layer belongs to @octanejs/tanstack-query; A failed useTauriEvent subscription throws by default so a missing capability is loud, and is then recovered by the enclosing boundary's reset(); passing onError reports it instead, keeping the component mounted so a changed event or enabled flag retries; Channel-based streaming has no hook yet: construct Channel directly and keep it stable with useMemo | Server rendering performs no IPC. useInvokeState renders its pending state and issues the command on the client after hydration; useTauriEvent subscribes only on the client. useInvoke is client-oriented: without a Tauri host it rejects with TauriUnavailableError so the boundary reports rather than hangs. | 2026-07-27 |
| [`@octanejs/testing-library`](#octanejstesting-library) | `@testing-library/react@16.3.2` | `render`/`rerender`/`cleanup`/`renderHook` + `act` over the verbatim `@testing-library/dom` (every query, `screen`, `within`, `waitFor`, `fireEvent`, `prettyDOM`, `configure`), with commit timing wired to octane's scheduler via the dom-library's `eventWrapper`/`asyncWrapper` config. | `fireEvent` dispatches real native events — no React remappings (`fireEvent.change` fires an explicit native `change`, not text typing or checkbox click activation) and no enter/leave/focus double-dispatch; Not ported: the `ReactStrictMode` wrapper, `legacyRoot`, and the `onCaughtError`/`onRecoverableError` options | `hydrate: true` adopts octane SSR output via `hydrateRoot`. | 2026-08-02 |
| [`@octanejs/textarea-autosize`](#octanejstextarea-autosize) | `react-textarea-autosize@8.5.9` | Complete against the published react-textarea-autosize 8.5.9 default component and named TextareaAutosizeProps and TextareaHeightChangeMeta types, including native textarea props, row clamps, measurement caching, height callbacks, refs, environmental listeners, form reset, SSR, and browser sizing. | onChange and onChangeCapture receive the native InputEvent rather than a React SyntheticEvent; target and currentTarget are the textarea during dispatch; Programmatic value assignment does not synthesize a public change callback; dispatch a native input event when that behavior is required | Server rendering emits one plain textarea without accessing browser measurement globals; Octane hydration adopts the existing host and preserves pre-hydration uncontrolled edits. | 2026-08-03 |
| [`@octanejs/thinking-orbs`](#octanejsthinking-orbs) | `thinking-orbs@0.2.0` | ThinkingOrb component, resolvePreset, MODE_DRAWS, and public types — nine animation states, two tuned size presets, auto/dark/light theme, reduced-motion static frame. | none known | Canvas is client-only; server render emits the canvas element without animation. | 2026-08-07 |
| [`@octanejs/three`](#octanejsthree) | `@react-three/fiber@9.6.1 (2a528745)` | Technical-preview Milestones 0–10 surface: renderer configuration and the DOM Canvas boundary, compiler ABI and renderer-local Three intrinsic types, catalogue and both extend forms, primitive/args construction, Three prop application, attachment, ordered placement/recreation, retained visibility, lifecycle/ref delivery, ownership-aware disposal, promise-returning HTMLCanvasElement and OffscreenCanvas roots, Octane act/flushSync scheduling, callback-aware unmountComponentAtNode, callable root state, scene/camera/raycaster and resize/DPR/viewport configuration, shadows/colors, one shared frame loop, controlled WebXR loop handoff, context-restore invalidation, compatible/reconstructing HMR, global effects, useStore/useThree/useFrame/useGraph and managed-instance helpers, the ray/pointer event system with DOM sources and custom managers, a keyed useLoader cache with preload/clear and GLTF graph augmentation, retained Suspense/Activity behavior, client Three-to-DOM pending/error projection, same-renderer createPortal targets with state/event enclaves and physical Three event bubbling, client-only Canvas shell streaming and production Vite/Rsbuild hydration adoption with the matching raw Rspack graph split, the explicit-target low-level DOMRegion boundary, a deterministic testing harness, an asynchronously acknowledged structured-clone transport proof, a checked public API/subpath matrix, Three r156/current compatibility lanes, a packed external consumer, real WebGL failure/recovery coverage, and semantic-checksummed renderer and shipped-size benchmarks. | `octane-renderer-ownership`: Octane owns execution, hooks, scheduling, Suspense, refs, and effects instead of React Reconciler; `component-props-root-api`: Programmatic roots render an Octane component plus props rather than a React element descriptor; `order-based-callable-selector`: Dynamic callable store selectors remain order-based outside compiler-visible hook calls; `build-graph-named-only`: buildGraph publishes named mesh and material entries only; `pierced-prop-reset-target`: Removed pierced props reset the original nested target rather than a root leaf key; `reconstructed-intersection-rewrite`: Reconstruction rewrites nested captured and hovered intersections to the replacement; `hidden-activity-raycast`: Hidden retained Activity subtrees are excluded from recursive raycasts; `root-scoped-portal-targets`: Portal target handles are root-scoped and cross-root placement is rejected before mutation; `synchronous-root-teardown`: Root teardown and callback delivery are synchronous instead of delayed by 500ms; `octane-dom-region`: DOMRegion is an Octane-specific explicit-target Three-to-DOM primitive | Three scene modules are client-only and Canvas.children is omitted from the server graph. Canvas streams its DOM shell and native fallback, then production Vite and Rsbuild hydration adopt those nodes and create one Three root on the client; raw Rspack proves the equivalent client/server graph split without claiming an application SSR lifecycle. DOMRegion and its reverse-DOM content remain inside the omitted client-only Three scene. | 2026-07-17 |
| [`@octanejs/tiptap`](#octanejstiptap) | `@tiptap/react@3.28.0` | Complete @tiptap/react 3.28.0 adapter surface across the root and ./menus entries: @tiptap/core re-exports, editor hooks and contexts, the EditorContent portal bridge, compound Tiptap API, ReactRenderer, custom NodeView/MarkView renderers and helpers, BubbleMenu, and FloatingMenu. | Subscriptions use Octane's native useSyncExternalStore implementation, so the published binding does not depend on React or use-sync-external-store; EditorConsumer is a render-prop compatibility component because Octane contexts do not expose React's .Consumer property; Renderer components are Octane component bodies and refs are ordinary props; the React-prefixed public names are retained for TipTap source compatibility without a React dependency; NodeViewWrapper consumes its as prop after selecting the host tag; @tiptap/react 3.28.0 also forwards that prop as an invalid DOM attribute; BubbleMenu and FloatingMenu handlers receive native browser events rather than React synthetic events; ReactMarkView tears down its portal when ProseMirror destroys the mark view, closing a renderer leak present in @tiptap/react 3.28.0 | Covered across the complete surface: hooks use null server snapshots and suppress editor construction without a DOM, static NodeView/MarkView helpers render without a DOM renderer, detached menu targets are client-only, and hydration adopts deferred server shells before mounting live custom views and menus. | 2026-08-02 |
| [`@octanejs/to-print`](#octanejsto-print) | `react-to-print@3.3.0` | Public runtime surface at react-to-print 3.3.0: useReactToPrint and its option/content/fn types. Print pipeline utilities are ported unchanged aside from Octane ref and event types. | Consumers import from @octanejs/to-print instead of react-to-print; contentRef is a structural { current } ref object rather than React.RefObject; The print callback accepts a native Event or a content getter; React.UIEvent is not used; The plain TypeScript useReactToPrint hook forwards compiler-injected slots; a symbol in the options position is treated as empty options | The hook is client-only: it constructs an iframe and calls window.print (or a custom print function). Calling it during SSR has no DOM target. | 2026-08-20 |
| [`@octanejs/transition-group`](#octanejstransition-group) | `react-transition-group@4.4.5` | Transition, CSSTransition, TransitionGroup, SwitchTransition, ReplaceTransition, config, and their documented subpath exports. | Octane does not implement ReactDOM.findDOMNode; DOM-aware callbacks and CSSTransition require nodeRef; TransitionGroup collections must be supplied as inspectable descriptor values, normally with children={items.map(...)}; compiler-generated opaque children blocks cannot be enumerated; The complete pinned upstream suite runs unchanged as the pristine Jest oracle; adapted Octane lanes cover the public export surface, DOM transition behavior, switch and replacement sequencing, keyed groups, nodeRef semantics, mount-on-enter sequencing, and server rendering, and are not yet a one-for-one port of every upstream case | Transition state and wrapper markup render on the server; DOM class mutation begins only after client mount and requires nodeRef. | 2026-08-09 |
| [`@octanejs/usehooks-ts`](#octanejsusehooks-ts) | `usehooks-ts@3.1.1` | First host-safe cohort: useBoolean, useCounter, useToggle, useMap, useStep, useDebounceCallback, useDebounceValue, useInterval, useTimeout, useIsMounted, and useUnmount. | Only the listed pure, timing, and lifecycle hooks are exported; browser storage/media hooks and DOM observer/direct-element hooks are deliberately absent; Public setter types are structurally equivalent to React Dispatch/SetStateAction without importing React types | Supported for the listed cohort. Effects and timers do not run during server rendering; hydration activates lifecycle and timing work without requiring browser reads during render. | 2026-08-02 |
| [`@octanejs/valtio`](#octanejsvaltio) | `valtio@2.3.2` | The framework-agnostic `valtio/vanilla` core and `valtio/vanilla/utils` are re-exported verbatim; `useSnapshot` and the `useProxy` utility are ported to Octane. | React DevTools affected-path debug labels are omitted because Octane's `useDebugValue` is currently a no-op | The server snapshot path uses `snapshot(proxyObject)`; no dedicated SSR rendering test is included yet. | 2026-08-02 |
| [`@octanejs/vaul`](#octanejsvaul) | `vaul@1.1.2` | Drawer, Root, NestedRoot, Portal, Overlay, Content, Handle, public props, and style.css. | React DOM prop types are preserved publicly and normalized at Octane render boundaries | Closed drawer roots and triggers render without browser globals; portaled content remains absent while closed. | 2026-08-02 |
| [`@octanejs/visx`](#octanejsvisx) | `@visx/visx@4.0.0 + master@485c035` | Complete current Visx 4.x web runtime surface: the exact 35-namespace aggregate, all 40 feature entry points, and the eight public a11y/react, a11y/server, axis/react, scale/react, shape/react, theme/react, tooltip/floating, and voronoi/react subpaths. Released-only packages chord, delaunay, react-spring, sankey, and stats remain directly importable exactly as upstream specifies. | Interaction callbacks receive native DOM events through Octane's delegated event system instead of React synthetic events; All React class controllers and class-instance refs are replaced by native functional TSRX hooks; Brush intentionally omits upstream's legacy innerRef instance handle; Deterministic text metrics and annotation bounds, pure SplitLinePath SVG sampling, and collision-aware estimated wordcloud rectangles replace browser-only measurement/canvas paths so fixed-size output is identical during SSR and first hydration. Font-specific wrapping, browser-specific path length rounding, and pixel-exact d3-cloud packing can differ; The react-spring entry point uses a deterministic requestAnimationFrame numeric interpolator rather than spring-physics timing, and Zoom uses native wheel/pointer/touch listeners rather than @use-gesture/react at runtime. Their public Visx props and exports are retained; Zoom imports framework-neutral @use-gesture/core types only; Props upstream types as React.ReactNode are octane renderables (octane's OctaneNode = unknown): octane elements are nominal, so ReactNode-typed props would reject them. Render-prop signatures keep their parameters and return octane renderables | Fixed-dimension primitives, wrapped XYChart series, annotations, text, and wordclouds emit complete deterministic SVG on the server. Real hydrateRoot adoption preserves the same SVG/definition/axis/text/series/annotation/wordcloud nodes without warnings, replacement, or post-effect markup changes; generated IDs, measurement fallbacks, portals, and responsive initial sizes are covered. | 2026-08-02 |
| [`@octanejs/wagmi`](#octanejswagmi) | `wagmi@3.7.4` | WagmiProvider and createConfig over @wagmi/core 3.6.4, with config, connection, connect, disconnect, switch-connection, switch-chain, connectors, connections, chains, balance, contract read/simulate/write, transaction send/wait, and message-signing hooks. | The binding targets Wagmi v3 names. Deprecated v2 useAccount/useSwitchAccount aliases and hooks outside the documented representative inventory are not exported; Privileged mutation hooks force retry:false, require a current live connector, cancel before dispatch when the displayed wallet context changed, and quarantine a late success as ActionContextChangedError when account, chain, or connector changed after dispatch; RainbowKit 2.2.x declares Wagmi v2 peers. Its defining provider/custom-button/modal contracts can be implemented over this v3 surface, proven by the deterministic disconnected-to-connecting-to-connected gate, but the downstream binding must document that peer-range divergence; The connectors subpath exposes the dependency-free injected and deterministic mock connectors. Vendor connectors and their optional SDKs remain direct application dependencies; EIP-1193 event validation, duplicate coalescing, and connector-generation invalidation are delegated unchanged to @wagmi/core 3.6.4. This binding does not add a second provider-event layer or claim independent normalization behavior | WagmiProvider supports ssr:true and initialState through @wagmi/core hydrate. parseHydratedState accepts only a versioned, 16 KiB-bounded public-state hint and rejects malformed or privileged material; a hydrated connection is never authority for signing or submission. | 2026-08-02 |
| [`@octanejs/waypoint`](#octanejswaypoint) | `react-waypoint@6.0.0` | Waypoint component and position constants at react-waypoint 6.0.0, with vertical/horizontal geometry, offsets, ancestor selection, rapid-crossing callbacks, refs, SSR, and hydration behavior. | Public node and prop types use Octane structural types and do not import React; The upstream class lifecycle is expressed with Octane hooks and refs-as-props; A custom child must be supplied through the children prop so it remains an inspectable descriptor; nested TSRX children compile to an opaque render block | Supported. The marker renders on the server and measurement/listeners begin after client mount. | 2026-08-24 |
| [`@octanejs/window`](#octanejswindow) | `react-window@2.3.0` | Provisional complete exact port of the react-window 2.3.0 root surface: List, Grid, getScrollbarSize, useDynamicRowHeight, four imperative-ref hooks, and all eight public types. The byte-locked pristine React suite and generated Octane adaptation each execute all 14 upstream files and all 117 cases; shared differential, SSR, hydration, and assertion-level public type lanes are required by the React parity manifest. Final Chromium/Firefox browser and executable CommonJS package-condition evidence remain pending shared infrastructure PRs #548 and #550. | Octane reserves the second raw function-component invocation argument for its internal block ABI; public props and rendered behavior match, so instrumentation should not assert React's undocumented undefined second argument; Keyed state and DOM identity are preserved, but sibling effect-log order and equal-prop rerender counts may differ after reordering because Octane schedules moved blocks and memoizes unchanged children differently | Supported and tested — defaultHeight/defaultWidth produce deterministic bounded List and Grid markup without browser globals, and hydration adopts the server nodes before live scrolling and measurement. | 2026-08-03 |
| [`@octanejs/wouter`](#octanejswouter) | `wouter@3.10.0` | Wouter 3.10.0 main router surface plus browser, hash, and memory location subpaths, ported to Octane with manual trailing hook-slot forwarding. | Link accepts ref as an ordinary Octane prop; forwardRef is not used; Switch inspects explicit element descriptors, while nested TSRX children are opaque and must be supplied as descriptor arrays or createElement results; Octane useSyncExternalStore replaces the upstream shim and requires forwarded compiler hook slots; The React Native use-sync-external-store shim and Wouter's separate Preact package are not exported | Router ssrPath, ssrSearch, and redirect context behavior is ported and covered by tests/ssr.test.ts. | 2026-08-20 |
| [`@octanejs/xstate`](#octanejsxstate) | `@xstate/react@6.1.0` | Complete @xstate/react 6.1.0 export surface — `useActor`, `useActorRef`, `useSelector`, `createActorContext`, `shallowEqual`, and the deprecated `useMachine` alias — ported onto Octane hooks. The framework-agnostic `xstate` actor core is reused unchanged as a peer dependency and is not re-exported, exactly as upstream. Upstream's two npm-only dependencies are replaced by in-repo ports: `use-sync-external-store/shim/with-selector` by a local port of React's selector shim, and `use-isomorphic-layout-effect` by a slot-forwarding equivalent. | `useSyncExternalStore` does not re-read `getSnapshot` at commit when the rendered value was unchanged. Octane's synchronous renderer closes the concurrent-interleaving window React guards there, so a store that mutates without notifying between render and commit is not re-caught. Any actor that notifies — which xstate always does — is unaffected; During server rendering `getServerSnapshot` is optional and falls back to `getSnapshot`, where React throws. `useSelector` and `useActor` always supply one, so this is only reachable through a hand-rolled actor-like object; Upstream's suite runs every `useActor`, `useActorRef`, and `useSelector` case twice, once under `StrictMode`. Octane has no StrictMode double-invoke, so the non-strict render, effect, and observer counts are the ported expectations; the strict pass is not applicable; `stopRootWithRehydration` is retained verbatim even though its motivating case (React Strict Effects double-invoking the start/stop effect) cannot occur on Octane, because it also governs unmount-then-remount, which stays observable | Supported: `useSelector` and `useActor` read their actor snapshot through `getServerSnapshot` during server rendering and the first hydration read, so server markup matches the initial actor snapshot. Effects never run on the server, so actors are not started there. | 2026-08-15 |
| [`@octanejs/xstate-store`](#octanejsxstate-store) | `@xstate/store-react@2.0.0` | Complete @xstate/store-react 2.0.0 export surface — `useSelector`, `useStore`, `useAtom`, `useAtomState`, and `createStoreHook` — ported onto Octane hooks, plus the full `@xstate/store@4.2.3` core re-exported unchanged (`createStore`, `createAtom`, `fromStore`, `shallowEqual`, and every type), exactly as upstream re-exports it. | Upstream calls hooks inside `if` branches in `useSelector` and `useAtom`, which React tolerates only because the branch is stable per call site. Octane keys hooks by call site rather than call order, so the shape is legal here; if a call site does flip branches, Octane keeps independent hook cells per branch and unsubscribes the abandoned one instead of corrupting hook order; `useSyncExternalStore` does not re-read `getSnapshot` at commit when the rendered value was unchanged. Octane's synchronous renderer closes the concurrent-interleaving window React guards there; any store that notifies is unaffected; During server rendering `getServerSnapshot` is optional and falls back to `getSnapshot`, where React throws. Every hook here supplies one | Supported: selectors, stores, and atoms read their current snapshot during server rendering through `getServerSnapshot`, and the binding has no browser-only initialization. | 2026-08-15 |
| [`@octanejs/xyflow`](#octanejsxyflow) | `@xyflow/react@12.11.2` | ReactFlow, ReactFlowProvider, Handle, hooks (useReactFlow, useNodes, useEdges, …), change helpers, and node/edge utilities from @xyflow/react@12.11.2. | Octane components are functions rather than forwardRef objects (ReactFlow, ReactFlowProvider, Handle) | Store/provider render on server; canvas interactions are client-driven like upstream. | 2026-08-07 |
| [`@octanejs/zag`](#octanejszag) | `@zag-js/react@1.42.0` | Complete port of the @zag-js/react@1.42.0 public adapter surface: useMachine, normalizeProps, Portal, the @zag-js/core mergeProps re-export, and the framework useSyncExternalStore re-export. The framework-agnostic @zag-js/core, @zag-js/store, @zag-js/types, and @zag-js/utils packages are reused unchanged. | normalizeProps rewrites React-style text-entry onChange to native onInput for input (non-checkbox/radio) and textarea hosts; select and checkbox/radio keep native onChange. Upstream normalizeProps is an identity transform and has no suite coverage for this export; Portal container refs use Octane's structural `{ current: HTMLElement \| null }` ref shape rather than React.RefObject; runtime behavior is unchanged; Compiled Octane children are portalled as one lazy children block so their component scope is preserved; ordinary value children retain upstream's per-child portal behavior; React StrictMode double-invoke suite cases stay pristine-only; Octane does not double-invoke effects, so those identities are not adapted one-for-one | Supported and tested: useMachine exposes its initial state and bindable context during server rendering, effects remain deferred, and Portal renders children in place without browser globals. | 2026-08-09 |
| [`@octanejs/zustand`](#octanejszustand) | `zustand@5.0.14` | Complete 1:1 port: the framework-agnostic vanilla store is reused verbatim; `create`/`useStore`, `shallow`/`useShallow`, the traditional equality-fn variants, and all middleware (persist, devtools, subscribeWithSelector, combine, redux). | Unstable selectors (a new reference every render) settle after a bounded number of re-renders instead of hitting React's `useSyncExternalStore` warning loop — still prefer `useShallow` | No SSR-specific surface; no dedicated SSR tests. | 2026-08-02 |

## @octanejs/alien-signals

[`packages/alien-signals`](../packages/alien-signals) `0.0.16` — ports `react-alien-signals@0.3.0`. Status data: [`packages/alien-signals/status.json`](../packages/alien-signals/status.json).

Complete react-alien-signals hook and helper surface over the unchanged alien-signals@1.0.4 core, with Octane-native subscriptions and lifecycle ownership.

Known divergences:

- `useSignalValue` accepts any readable signal, including computed signals, correcting the upstream declaration to match its documented behavior.
- `useSignalScope` starts its scope after client commit and returns a cancellation-safe controller, avoiding render-phase effects.

SSR / hydration: Supported and hydration-tested. Reads use the same server snapshot; effects and scopes begin only after client commit and stop on unmount.

Scope/evidence last checked: 2026-07-30.

- Pinned to alien-signals@1.0.4, which has no prerequisite framework binding.
- Verified with public types, real core behavior, signal replacement, computed memoization, effect/scope cleanup, SSR, hydration adoption, and the central playground.

## @octanejs/animejs

[`packages/animejs`](../packages/animejs) `0.0.20` — ports `animejs@4.5.0`. Status data: [`packages/animejs/status.json`](../packages/animejs/status.json).

Anime.js is re-exported unchanged; `useAnimeScope` binds scoped DOM animation setup, refresh, dependency recreation, and cleanup to Octane, and `@octanejs/animejs/adapters/three` exposes Anime.js's official Three adapter.

Known divergences:

- `useAnimeScope` is an Octane-native lifecycle helper; it is not an upstream Anime.js API.
- Only the root and `adapters/three` entry points are re-exported; other Anime.js subpaths are explicit gaps whose APIs remain available from the supported root where upstream exposes them there.
- The Three adapter mutates raw objects while `@octanejs/three` retains frame-loop ownership; demand and never loops require explicit invalidation or advancement.

SSR / hydration: Supported. The hook returns inert refs during server rendering and creates no Anime.js scope until its client effect runs.

Scope/evidence last checked: 2026-07-30.

- Verified with real Anime.js scopes, dependency-driven cleanup, SSR rendering, the official adapter against an @octanejs/three-owned mesh, and a DOM plus demand-loop Three playground journey.

## @octanejs/apollo-client

[`packages/apollo-client`](../packages/apollo-client) `0.1.45` — ports `@apollo/client@4.2.6`. Status data: [`packages/apollo-client/status.json`](../packages/apollo-client/status.json).

Complete published client adapter surface: all 18 @apollo/client/react runtime exports and their Apollo 4.2.6 TypeScript declarations, framework-neutral root/testing exports, an Octane MockedProvider, and the Octane-native /react/ssr prerenderStatic entry.

Known divergences:

- Suspense unwraps stable Apollo promises through Octane use() instead of React's use() or a thrown-promise fallback.
- The React class-based MockedProvider is an equivalent Octane function component.
- React Server Components and Apollo's React Compiler-generated entry are intentionally not exposed.

SSR / hydration: Dedicated Node-mode tests cover multi-pass useQuery, nested query waterfalls, per-request cache isolation, ssr:false/no-cache, render limits, and scoped CSS; client hydration verifies cache restoration, in-place adoption, and no duplicate fetch. Streaming cache patches remain open.

Scope/evidence last checked: 2026-08-02.

See also: [`docs/apollo-client-port-plan.md`](apollo-client-port-plan.md)

## @octanejs/aria

[`packages/aria`](../packages/aria) `0.0.44` — ports `react-aria@3.50.0`. Status data: [`packages/aria/status.json`](../packages/aria/status.json).

The `@octanejs/aria/components` entry point matches the complete named public surface of `react-aria-components@1.19.0`: 280 runtime exports and 313 type exports, checked in both directions with no missing or extra names. This includes calendar/date/time, color, drag-and-drop, DropZone/FileTrigger, toast, data hooks, and virtualized layout APIs in addition to the previously ported primitives, overlays, collections, Tree, and Table. The root behavior-hook and `/stately` entries remain curated React Aria 3.50.0 / React Stately 3.48.0 surfaces rather than separate full-export claims.

Known divergences:

- `native-input-event-wiring`: Text-input DOM wiring uses Octane's native `onInput` per keystroke instead of React's synthetic `onChange`; public value-level callbacks are unchanged.
- `ref-as-prop`: React `forwardRef` wrappers become Octane ref-as-prop components.
- React Server Components are not part of the Octane binding.
- `valid-hoisted-identifiers`: The i18n server serializer keeps hoisted-string identifiers valid past 26 entries instead of emitting invalid JavaScript identifiers.
- `server-rtl-direction`: The SSR locale direction derives from the injected locale via `isRTL` rather than being hard-coded to `ltr`.

SSR / hydration: Dedicated Node-mode coverage verifies SSRProvider, hydration-safe labelled relationships, server snapshots, and injected LTR/RTL locales; real Vite-compiled Octane server markup is hydrated in place and remains interactive. The newly completed advanced component families have client behavior and type/export coverage but do not yet extend the package's existing SSR evidence.

Scope/evidence last checked: 2026-08-18.

- `pnpm --filter @octanejs/aria exports:check` compares the installed pinned React Aria Components declarations with the Octane components barrel in both directions.
- The Aria client project passes 45 files / 370 tests, including calendar selection, localized date segments, native color input, file/drop-zone wiring, list-data mutation, toast ordering, virtualized layout geometry, and real drag-and-drop hook composition.

See also: [`packages/aria/UPSTREAM.md`](../packages/aria/UPSTREAM.md), [`docs/aria-migration-plan.md`](aria-migration-plan.md)

## @octanejs/auto-animate

[`packages/auto-animate`](../packages/auto-animate) `0.0.6` — ports `@formkit/auto-animate@0.10.0`. Status data: [`packages/auto-animate/status.json`](../packages/auto-animate/status.json).

Vanilla autoAnimate core is reused from @formkit/auto-animate@0.10.0. The React useAutoAnimate hook is ported at ./react. Vue, Preact, Solid, Angular, Nuxt, Marko, and Qwik entry points are explicit gaps.

Known divergences:

- Consumers import from @octanejs/auto-animate and @octanejs/auto-animate/react rather than @formkit/auto-animate and @formkit/auto-animate/react.
- useAutoAnimate treats a compiler-injected symbol in the options position as omitted options.
- Vue, Preact, Solid, Angular, Nuxt, Marko, and Qwik bindings are not ported.

SSR / hydration: The vanilla core is DOM-only; the hook attaches in a ref callback and destroys the controller on unmount. No server DOM mutations.

Scope/evidence last checked: 2026-08-20.

## @octanejs/base-ui

[`packages/base-ui`](../packages/base-ui) `0.1.48` — ports `@base-ui/react@1.6.0`. Status data: [`packages/base-ui/status.json`](../packages/base-ui/status.json).

Alpha, in progress: 35 of 43 upstream subpaths. The implemented surface has a complete byte-exact upstream inventory, 98 same-fixture React/Octane differential cases, and 49 Accordion, Collapsible, and Tabs adapted cases. This is bounded evidence and remains recorded-unverified because eight public subpaths and most of the canonical runtime/type suite are not yet adapted. Menu covers all 20 upstream parts, Toast all 11 parts, Collapsible all 3 parts, Accordion all 5 parts, and Tabs 4 of 5 parts (Indicator unported); their detailed gaps and evidence are recorded in UPSTREAM.md and audit/react-parity.json.

Known divergences:

- `native-event-semantics`: Host handlers receive native DOM events rather than React synthetic events; text edits use native `input`, form-facing NumberField commits use native `change`, and propagation reads `cancelBubble`.
- `ref-as-prop-class-composition`: React `forwardRef` wrappers become ref-as-prop, and class values use Octane's composition rules.
- `unported-internal-hover`: The internal standalone floating-ui-react `useHover` combiner is not republished because no ported Base UI component consumes it.
- `number-field-interaction-gaps`: `NumberField.ScrubArea` and hold-to-repeat stepping remain unported; steppers respond to single presses only.

SSR / hydration: Dedicated Node-mode tests cover server snapshots, accessible separators, edge-aligned slider visibility, and closed dialogs; hydration adopts Vite-compiled Octane server markup, transitions to the client snapshot, and preserves interaction. Open overlays and remaining components are not yet covered.

Scope/evidence last checked: 2026-08-01.

See also: [`docs/base-ui-migration-plan.md`](base-ui-migration-plan.md)

## @octanejs/better-auth

[`packages/better-auth`](../packages/better-auth) `0.0.2` — ports `better-auth@1.6.29`. Status data: [`packages/better-auth/status.json`](../packages/better-auth/status.json).

The public framework-agnostic Better Auth client is reused unchanged. `createAuthClient` converts the built-in session atom and plugin-provided atoms into Octane hooks while preserving endpoint actions, `$fetch`, `$store`, `$ERROR_CODES`, `$Infer`, and plugin inference. The upstream-compatible `useStore` helper is also included.

Known divergences:

- React-framework server helpers such as `better-auth/tanstack-start` are not re-exported; use Better Auth's standard Fetch API handler or an Octane-specific server integration.

SSR / hydration: `useStore` supplies the current Nanostore value as the server snapshot. Better Auth's session atom does not start browser refresh or network activity while rendering on the server.

Scope/evidence last checked: 2026-08-17.

## @octanejs/calendar

[`packages/calendar`](../packages/calendar) `0.0.6` — ports `react-calendar@6.0.1`. Status data: [`packages/calendar/status.json`](../packages/calendar/status.json).

Public react-calendar 6.0.1 runtime and type surface: default and named Calendar, CenturyView, DecadeView, MonthView, YearView, Navigation, CalendarProps, and all types exported by the upstream root. The three framework-neutral shared suites run without weakened assertions; representative Calendar and tile cases are adapted to Octane.

Known divergences:

- Component refs are ordinary Octane props. Calendar ref exposes the upstream imperative handle; inputRef remains the DOM wrapper ref.
- Callbacks receive native MouseEvent objects, which persist without React's synthetic event.persist() method.
- Renderable public types use OctaneNode instead of React.ReactNode.

SSR / hydration: Supported. Pass locale explicitly when server and browser locale defaults may differ.

Scope/evidence last checked: 2026-08-20.

## @octanejs/cmdk

[`packages/cmdk`](../packages/cmdk) `0.1.33` — ports `cmdk@1.1.1`. Status data: [`packages/cmdk/status.json`](../packages/cmdk/status.json).

Complete against the published `cmdk@1.1.1` public surface: `Command` (the root itself) and the `CommandRoot` named export, `Command.Input`, `Command.List`, `Command.Item`, `Command.Group`, `Command.Separator`, `Command.Dialog`, `Command.Empty`, `Command.Loading`, the flat `CommandX` aliases, `useCommandState`, and `defaultFilter` — with the DOM-authoritative store and item/group registration, `useValue` text-content inference, `onInput`-driven search, score filtering plus item and group DOM sorting, keyboard navigation (arrows/Home/End/vim/Enter), controlled `value`/`onValueChange`/`loop`/`shouldFilter`/custom `filter`/`forceMount`, the `--cmdk-list-height` ResizeObserver, and a Radix-backed `Command.Dialog`. `asChild` is the one unsupported prop (see divergences).

Known divergences:

- No forwardRef: components take `ref` as a normal prop; multi-ref uses octane's `ref={[a, b]}` instead of composeRefs.
- `Command.Input` drives search from the native `onInput` event; the public `onValueChange(search)` API is unchanged (no synthetic `onChange`).
- Item value is inferred from the provided `value` prop or the rendered `textContent`; cmdk's string-child inspection is dropped because octane's compiled children are opaque. An item that has never been scored therefore renders once so the inference can read its text — treating unscored as score zero deadlocks it. Consumer-visible mid-search arrivals match upstream.
- Score ranking is expressed as CSS `order` inside a flex container, not by relocating DOM nodes. Upstream's sort() is DOM-authoritative: it appendChild's matching items into the list sizer. Octane fences every component's DOM with comment markers and tracks the range between them, and a template construct like `@for` or `@if` wraps each item in a SECOND, outer range — so relocating an item carries it out of every range at once, and the loop later clears an empty range while the real node is orphaned in the list forever. Carrying the flanking markers along only repairs the innermost range, so it breaks again at each new nesting construct. Ranking declaratively removes the class of bug: no node moves, no range is violated, and clearing the search restores true source order because the styles are simply dropped. The cost is that the list sizer and each group's item container are flex columns WHILE a filter is active, so a consumer relying on physical DOM order (`:nth-child` styling, drag handles) or on a custom container `display` diverges from upstream. Selection, arrow-key navigation and alt+arrow group navigation all read the ranked order, not DOM order, so what is selected always matches what is on screen. Every valid item is ranked rather than only the matches: an unranked flex child keeps the initial `order` of 0, which sorts it AHEAD of every match, so a force-mounted non-match would jump to the top of its container. Ranking everything puts zero-scoring items last, which is where upstream's append-in-score-order leaves them too. Ranks land on the child the container actually lays out, resolved at any nesting depth, because `order` applies to a flex CHILD — upstream resolves a single wrapper level, which its appendChild model tolerates but this one does not. Ungrouped items and group hosts share the sizer's rank space, so the former are numbered densely and the latter continue past them, matching upstream's order of appending items before groups.
- `aria-activedescendant` is wired on the initial auto-select and after every filter; upstream queues that work from inside its own layout-effect flush and its batcher discards it, so upstream only sets the attribute after a directly user-driven selection. The runtimes agree on which item is selected.
- Ids are `radix-` prefixed to match upstream, which takes them from `@radix-ui/react-id`.
- Group reordering resolves each group element by its registered value rather than upstream's `[cmdk-group=""][data-value="<groupId>"]` selector. That selector can never match — `data-value` holds the group's heading text, never its id — so upstream's group sort is effectively dead code; the port makes groups genuinely reorder by their best item score.
- Re-registering an item value during an active search re-derives the whole filter aggregate (match count and matching groups), not just that item's score. Upstream only re-sorts, leaving `filtered.count`/`filtered.groups` describing the previous values — so an item that starts matching renders while `Command.Empty` still shows "no results" (and its group can stay hidden). Upstream's own item-registration path already re-derives the aggregate the same way, so the omission reads as an oversight rather than intent.
- Force-mounted items are counted so `Command.Empty` can see them. Upstream skips registration entirely for a `forceMount` item, so it never reaches `filtered.count` — with a search that matches nothing, upstream renders the force-mounted item and "no results" on top of each other. The port tracks the live force-mounted count separately (`filtered.count` keeps its upstream meaning for `useCommandState`) and Empty consults both.
- Removing the selected force-mounted item moves the selection on. Because upstream never registers a `forceMount` item it has no teardown for one either, so the selected value keeps pointing at a node that is gone: nothing renders `aria-selected`, `aria-activedescendant` dangles at a removed id, and Enter does nothing until the user arrows away. The port re-selects from the force-mount teardown, the same way the plain item teardown does.
- Every registration path releases the value it registered. Items, force-mounted items and groups all register through the same `useValue`, so remount cycles stay quiet and the dev-only duplicate-value report stays honest.
- Registration teardowns hop a microtask before scheduling their follow-up work. Octane runs a removed child's effect cleanups during the PARENT's render, so scheduling straight from a teardown lands its state update mid-render and the runtime reports "Cannot update a component (`CommandRoot`) while rendering a different component" — advice a teardown cannot act on, since it does not choose when it runs. The queued work is unchanged and still runs before paint; only the teardown paths defer, because every other caller schedules from a layout effect where the synchronous update is load-bearing. React has no equivalent problem: it runs cleanups in the commit phase.
- `Command.Empty` renders nothing during SSR. Items register in layout effects, which never run on the server, so the match count is unavoidably 0 there and upstream ships "no results" above a fully-populated list on every server-rendered page — permanently so for readers without JavaScript. The port supplies a server snapshot of "not empty" instead, and the empty state appears on the client once the count is real.
- An item leaving a group is removed from that group's member set. Upstream deletes the item from `ids`/`allItems` but never from `allGroups`, so a group accumulates dead item ids for the lifetime of the Command — unbounded growth in a menu whose results churn, plus wasted work in every filter pass.
- `Command.Dialog` additionally forwards `defaultOpen` and `modal` to the underlying Radix `Dialog.Root`. Upstream cmdk forwards only `open`/`onOpenChange`, so it has no uncontrolled open state and is always modal.
- Duplicate item values are reported in development. Selection is keyed by value, so two items sharing one both render `aria-selected="true"` while only the first responds to Enter — an invalid single-select listbox. The runtime cannot pick a winner (cmdk requires unique values), so the port warns instead of failing silently; upstream neither warns nor resolves it.
- The layout-effect batcher reports a throwing queued callback through `console.error` (as octane reports effect exceptions) instead of rethrowing out of the flush. Upstream's batcher has no such isolation, so a throwing `onValueChange` reached from that flush rethrows there.
- `asChild` is not supported: cmdk's SlottableWithNestedChildren clones a child element and re-parents the component's own content into it, which has no faithful equivalent over octane's opaque compiled children. Components always render their own host element.
- `Command.Dialog` builds on @octanejs/radix's Dialog (composed via createElement descriptors, since radix's Portal iterates children) instead of @radix-ui/react-dialog.
- The vendored scorer gained explicit parameter type annotations for strict typecheck and repo-style formatting; the algorithm and score constants are unchanged from cmdk@1.1.1.

SSR / hydration: Supported and tested: the menu server-renders all items in source order without browser globals (the DOM-authoritative filter/selection is post-hydration work), and no empty state — items cannot register on the server, so `Command.Empty` renders nothing there rather than claiming "no results" over a full list. `hydrateRoot` adopts the server nodes without a mismatch, then activates — values infer from textContent, the first item selects, and typing filters live.

Scope/evidence last checked: 2026-08-03.

- Bounded unit, behavioral (jsdom), hydration, SSR, and differential evidence is available. The canonical upstream Playwright suite is vendored and inventoried but has not been adapted case by case, so the binding remains recorded-unverified.
- `--cmdk-list-height` is written only where ResizeObserver exists (browsers); it is skipped during SSR and in jsdom, where the property is simply never set.

See also: [`docs/cmdk-port-plan.md`](cmdk-port-plan.md)

## @octanejs/colorful

[`packages/colorful`](../packages/colorful) `0.0.16` — ports `react-colorful@5.8.0`. Status data: [`packages/colorful/status.json`](../packages/colorful/status.json).

Complete against the published react-colorful 5.8.0 root runtime and type surface: all 14 picker variants, HexColorInput, setNonce, six public color types, controlled updates, mouse/touch/keyboard input, commit callbacks, ARIA state, and automatic closest-root styling.

Known divergences:

- React synthetic event attribute types are represented by Octane native DOM event attributes; observable DOM events and callback values retain the upstream contract.

SSR / hydration: All pickers and HexColorInput render deterministically without browser globals, hydrate by adopting existing nodes, install styles only on the client, and become interactive after hydration.

Scope/evidence last checked: 2026-08-03.

## @octanejs/content-loader

[`packages/content-loader`](../packages/content-loader) `0.0.6` — ports `react-content-loader@7.1.2`. Status data: [`packages/content-loader/status.json`](../packages/content-loader/status.json).

Web runtime at react-content-loader 7.1.2: default ContentLoader, Facebook, Instagram, Code, List, and BulletList presets, and IContentLoaderProps. ./native is an explicit gap.

Known divergences:

- Consumers import from @octanejs/content-loader instead of react-content-loader.
- The React Native ./native entry is not published because Octane has no React Native renderer.
- React test-renderer and shallow-renderer observations are asserted through mounted SVG DOM without changing their numeric expectations.
- useId values use Octane's opaque identifier format.
- Octane serializes SVG/CSS url() functions with quotes while React's test renderer reports the unquoted form; uniqueKey/baseUrl relationships are unchanged.
- Octane inserts empty comment holes between children; snapshots compare the public SVG tree after stripping those markers.
- rtl=false uses an empty style object instead of null so the style spread typechecks.
- IContentLoaderProps.style is an object map rather than Octane's string-or-object SVG style union, matching React SVGAttributes.
- Git package.json at the pin SHA advertises 6.2.1; npm published 7.1.2 from that SHA.

SSR / hydration: Supported. uniqueKey pins clip and gradient identifiers; otherwise useId remains opaque and request-local.

Scope/evidence last checked: 2026-08-20.

## @octanejs/day-picker

[`packages/day-picker`](../packages/day-picker) `0.0.16` — ports `react-day-picker@10.0.1`. Status data: [`packages/day-picker/status.json`](../packages/day-picker/status.json).

DayPicker, public components, hooks, date classes, helpers, labels, formatters, locales, styles, and public types.

Known divergences:

- React DOM prop types are preserved publicly and normalized at Octane render boundaries.

SSR / hydration: Calendar markup and accessibility attributes render without browser globals.

Scope/evidence last checked: 2026-08-02.

## @octanejs/devtools

[`packages/devtools`](../packages/devtools) `0.0.38` — ports `octane@workspace`. Status data: [`packages/devtools/status.json`](../packages/devtools/status.json).

Octane-native DevTools plugin (not an upstream port): renders live runtime diagnostics into a TanStack Devtools host via @tanstack/devtools-event-client. P1 ships the Components tree + state inspector.

SSR / hydration: The plugin renders no anchor of its own; it is a client-only panel plugged into @octanejs/tanstack-devtools. Include it only in dev.

Scope/evidence last checked: 2026-07-24.

- Reads the dev-only globalThis.__OCTANE_DEVTOOLS__ hook (present only in profile/devtools builds).

## @octanejs/dexie

[`packages/dexie`](../packages/dexie) `0.1.43` — ports `dexie-react-hooks@4.4.0`. Status data: [`packages/dexie/status.json`](../packages/dexie/status.json).

Port of the public dexie-react-hooks surface: useObservable, useLiveQuery, useSuspendingObservable, useSuspendingLiveQuery, usePermissions, and useDocument, with Dexie's framework-neutral API re-exported from the package root.

Known divergences:

- Suspending hooks integrate with Octane's use() rather than React's use() or thrown-promise implementation details.
- Hook call-site slots are forwarded through Octane's compiler binding ABI.
- useDocument requires consumers to install and import y-dexie and yjs before using the hook; those integrations remain optional.

SSR / hydration: Supported for non-suspending live queries: SSR returns the configured default without opening IndexedDB, and hydration adopts the server host before replacing the default with live data. Suspending live queries remain client-oriented and do not claim server data loading.

Scope/evidence last checked: 2026-08-02.

## @octanejs/dnd-kit

[`packages/dnd-kit`](../packages/dnd-kit) `0.1.45` — ports `@dnd-kit/react@0.5.0`. Status data: [`packages/dnd-kit/status.json`](../packages/dnd-kit/status.json).

Complete modern dnd-kit React-adapter surface: DragDropProvider, DragOverlay, useDraggable/useDroppable, manager/monitor/operation hooks, PointerSensor/KeyboardSensor re-exports, the public signal-hook utilities, useSortable, and all four upstream entry points.

Known divergences:

- DragOverlay distinguishes octane compiled children blocks from function render props; ordinary typed usage is behaviorally equivalent.
- useSortable retains the upstream keyboard plugin by default but omits OptimisticSortingPlugin because moving one host element before application state commits can split an Octane keyed DOM range; explicit plugin arrays remain authoritative.

SSR / hydration: Static SSR and hydration are covered; DOM plugins initialize only after client refs register.

Scope/evidence last checked: 2026-08-03.

- Targets the modern @dnd-kit/react API. The legacy @dnd-kit/core 6.x API is intentionally out of scope.
- The canonical React adapter source is vendored and checksum-verified. Upstream ships no adapter test suite at this pin; one bounded jsdom differential is available, while real pointer geometry and browser lifecycle coverage remain open, so parity is recorded-unverified.

## @octanejs/draggable

[`packages/draggable`](../packages/draggable) `0.0.16` — ports `react-draggable@4.7.1`. Status data: [`packages/draggable/status.json`](../packages/draggable/status.json).

Complete against the published react-draggable 4.7.1 root runtime and type surface: default Draggable, named DraggableCore, controlled and uncontrolled positioning, bounds, grid, axis, offsets, mouse and touch gestures, and all eight public types.

Known divergences:

- React component instance, lifecycle, React.Component assignability, findDOMNode fallback, and instance refs are unavailable; use the structural nodeRef prop with an Octane host ref.
- React-specific node and synthetic-event types are represented by OctaneNode and native mouse/touch events while retaining the observable callback and data contract.

SSR / hydration: Draggable and DraggableCore render deterministically without browser globals, adopt their existing HTML or SVG child during hydration, and become interactive after hydration.

Scope/evidence last checked: 2026-08-03.

## @octanejs/drei

[`packages/drei`](../packages/drei) `0.0.16` — ports `@react-three/drei@10.7.7`. Status data: [`packages/drei/status.json`](../packages/drei/status.json).

Complete port of the pinned @react-three/drei 10.7.7 public web API (commit b8b99fd4ca1dfb8d821335671320512daa6efea4): 379 source exports and 217 runtime exports are accounted for by the executable crosswalk, with 299 parity assertions across 105 test files.

Known divergences:

- View: inline Canvas views are ported. Calling View from an Octane DOM root fails with the universal renderer-boundary diagnostic, and View.Port is a callable no-op. Octane components are statically renderer-owned, so one component cannot switch between DOM and Three renderers or transport authored Three children between independent roots as React Drei does with tunnel-rat.

SSR / hydration: Browser-dependent helpers remain client-only; server-safe behavior is verified per export.

Scope/evidence last checked: 2026-08-02.

See also: [`packages/drei/README.md`](../packages/drei/README.md), [`packages/drei/UPSTREAM.md`](../packages/drei/UPSTREAM.md)

## @octanejs/dropzone

[`packages/dropzone`](../packages/dropzone) `0.0.16` — ports `react-dropzone@20.0.0`. Status data: [`packages/dropzone/status.json`](../packages/dropzone/status.json).

Exact mapped port of the react-dropzone 20.0.0 root runtime and type namespace at canonical commit 01fc05c5996bf615caf812627f7491375e647c7d. The binding preserves the default Dropzone component, useDropzone, ErrorCode, all public types, root package conditions, and ./package.json export. Runtime coverage executes 218 pristine canonical React cases plus 109 adapted, differential, SSR, hydration, browser, and evidence cases.

Known divergences:

- Consumers import from @octanejs/dropzone and author TSRX instead of importing react-dropzone and authoring React JSX; option names and observable file-acquisition behavior remain mapped to the pinned upstream contract.
- The package points its types/import/require conditions at authored Octane source under repository policy; packed-consumer checks prove equivalent ESM, CommonJS, TypeScript, package-json, and public-namespace resolution without React runtime leakage.

SSR / hydration: Supported and tested — server rendering and hydration preserve the hidden input and getter-provided root contract without browser-global access during render.

Scope/evidence last checked: 2026-08-02.

## @octanejs/electron

[`packages/electron`](../packages/electron) `0.0.28` — ports `electron@43.2.0`. Status data: [`packages/electron/status.json`](../packages/electron/status.json).

Process-split Electron bindings: ./main registers ipcMain handlers, ./main/native re-exports main-only Electron APIs (Menu, Tray, session, protocol, BrowserWindow, …), ./preload exposes Electron IPC and desktop helpers via contextBridge, and the renderer entry provides Octane hooks (useInvoke, useInvokeState, useIpcEvent, useNativeTheme, useWindowState) plus promise helpers for app/window/dialog/shell/clipboard/screen. Menu/Tray/session/protocol stay intentional main-only under contextIsolation.

Known divergences:

- There is no React binding upstream; Electron is framework-agnostic, so this package mirrors the React Electron process layout rather than porting a React library.
- Renderer code uses window.__OCTANE_ELECTRON__ because contextIsolation forbids importing electron in the page.
- Menu, Tray, session, and protocol are re-exported from @octanejs/electron/main/native for main-process consumers and are intentionally not bridged into the renderer.
- Hook call-site slots are forwarded through Octane's compiler binding ABI.
- useInvoke integrates with Octane's use() rather than React's use().
- useInvokeState returns to pending on refetch and does not implement stale-while-revalidate.
- Built-in desktop helpers use octane:* IPC channels; apps may allowlist additional channels in preload.

SSR / hydration: Server rendering performs no IPC. useInvokeState renders pending and issues the command on the client after hydration; useIpcEvent and reactive desktop hooks subscribe only on the client. useInvoke without a host rejects with ElectronUnavailableError.

Scope/evidence last checked: 2026-08-02.

## @octanejs/email

[`packages/email`](../packages/email) `0.0.1` — ports `react-email@6.9.2`. Status data: [`packages/email/status.json`](../packages/email/status.json).

Email component surface: Body, Button, CodeBlock, CodeInline, Column, Container, Font, Head, Heading, Hr, Html, Img, Link, Markdown, Preview, Row, Section, Tailwind, Text, Prism themes, the pixel-based Tailwind preset, and an Octane-native static render helper.

Known divergences:

- render accepts an Octane component plus props rather than a pre-created React node, matching octane/server's entry-point API.
- Preview accepts its inspectable preview copy through the text prop; natural .tsrx children are opaque render blocks.
- Markdown accepts its source through a string children prop; JSX children compile to children blocks and are rejected rather than invoked as render props.
- Refs are ordinary Octane ref props rather than forwardRef components.
- Head uses Octane's metadata-hoisting channel; render reconstructs the consumer-visible document head around hoisted tags.
- Tailwind transforms fully rendered static HTML rather than cloning a React element tree, allowing natural .tsrx children and nested compiled components.

SSR / hydration: Supported and tested through renderToStaticMarkup: output has the React Email XHTML Transitional doctype and no hydration markers.

Scope/evidence last checked: 2026-08-10.

- Ported from upstream commit ffe605819782b31d7f946e30f938b1b63e6b239c under the MIT license.
- Bounded React parity currently runs one shared welcome-email differential render lane against @react-email/components@1.0.12. Pristine upstream suites, exhaustive classifications, and verified provenance remain open.
- The two primary Prism themes, vscDarkPlus and xonokai, are included; upstream's full generated theme catalog is not yet copied.
- Export/preview tooling and editor serialization are published as separate Octane packages.

## @octanejs/email-cli

[`packages/email-cli`](../packages/email-cli) `0.0.1` — ports `react-email@6.9.2`. Status data: [`packages/email-cli/status.json`](../packages/email-cli/status.json).

Octane-native `export` and `dev` commands: recursive .tsrx template discovery, static HTML export, nested output paths, static assets, development template index and previews, Vite live reload, and compile/render error pages.

Known divergences:

- The preview application is a lightweight Octane/Vite server rather than upstream's bundled React/Next application.
- The executable is named octane-email to avoid colliding with upstream's email binary.

SSR / hydration: Templates compile with the Octane Vite plugin in SSR mode and render through @octanejs/email.

Scope/evidence last checked: 2026-08-10.

- Ported from the workflow contract of React Email commit ffe605819782b31d7f946e30f938b1b63e6b239c under the MIT license.
- The React-specific generated .react-email Next application is intentionally replaced by native Octane tooling.

## @octanejs/embla-carousel

[`packages/embla-carousel`](../packages/embla-carousel) `0.0.16` — ports `embla-carousel-react@8.6.0`. Status data: [`packages/embla-carousel/status.json`](../packages/embla-carousel/status.json).

Complete package-root adapter: default useEmblaCarousel hook, its viewport-ref and tuple types, and globalOptions; the framework-neutral Embla core and reactive equality utilities are reused unchanged.

SSR / hydration: The hook constructs no carousel without DOM globals; client attachment initializes the core.

Scope/evidence last checked: 2026-08-02.

- The live React differential covers adapter lifecycle. A required Chromium lane verifies real layout, scrolling, selection updates, and destroy cleanup.

## @octanejs/floating-ui

[`packages/floating-ui`](../packages/floating-ui) `0.1.49` — ports `@floating-ui/react@0.27.19`. Status data: [`packages/floating-ui/status.json`](../packages/floating-ui/status.json).

Complete @floating-ui/react 0.27.19 export surface: positioning (`useFloating`, ref-aware `arrow`, and the framework-neutral middleware re-exports), floating tree and list primitives, every interaction hook, portals/overlays/focus management/arrows/composites, transitions, both delay-group APIs, and the deprecated `inner`/`useInnerOffset` pair. Runtime parity is executable and bounded: 272 adapted assertions pass compatibly, 29 remain executable expected-failure negative controls, and 6 upstream-declared skips are non-evidence.

Known divergences:

- `ref-as-prop`: React forwardRef component APIs become Octane ref-as-prop APIs.
- Twenty-nine upstream assertions remain executable expected-failure controls across ref/focus/effect scheduling, dynamic-child registration, iframe realms, render counts, React-only context fixtures, and list registration; audit/expected-failures.json names every case.
- The combined Octane entry point cannot preserve every @floating-ui/react-dom-only type narrowing; the one-for-one adapted type program records those diagnostics explicitly.

SSR / hydration: No dedicated SSR/hydration lane; the supported claims are client positioning and interactions.

Scope/evidence last checked: 2026-08-26.

## @octanejs/formisch

[`packages/formisch`](../packages/formisch) `0.0.5` — ports `@formisch/react@1.0.0-rc.0`. Status data: [`packages/formisch/status.json`](../packages/formisch/status.json).

Ports the Formisch React adapter surface while vendoring its React-selected core and modular methods into one React-free Octane package.

Known divergences:

- Octane native text controls use `onInput`; selects, checkboxes, and radios use native `onChange`.
- React synthetic event and renderable types are replaced with native DOM events and OctaneNode.
- React StrictMode-specific delayed signal cleanup is omitted in favor of Octane lifecycle cleanup.

SSR / hydration: Supported and tested: sequential requests stay isolated, hydration adopts existing form controls, and native input updates activate after hydration.

Scope/evidence last checked: 2026-07-30.

- Valibot remains an external peer dependency.
- Byte-exact core, methods, React adapter, and upstream test sources are pinned under upstream/ and documented in UPSTREAM.md.
- All 549 upstream runtime cases execute in pristine and adapted lanes; all eight type artifacts execute in pristine tsc and adapted tsrx-tsc lanes with assertion inventories and negative controls.
- Differential coverage compares a representative programmatic field update with the real @formisch/react adapter.
- The React StrictMode effect-replay case is retained as an explicit Octane divergence because Octane does not implement StrictMode double invocation.

## @octanejs/gsap

[`packages/gsap`](../packages/gsap) `0.0.19` — ports `@gsap/react@2.1.2`. Status data: [`packages/gsap/status.json`](../packages/gsap/status.json).

Full useGSAP hook contract: callback, dependency-array and config signatures; scoped contexts; contextSafe; revertOnUpdate; register; and headless.

Known divergences:

- The adapter imports Octane hooks and uses compiler-selected manual hook slots instead of React hooks.
- GSAP remains an external peer dependency and is not redistributed by this MIT-licensed adapter.

SSR / hydration: Server rendering creates stable context helpers without running GSAP effects. Client hydration activates the standard lifecycle.

Scope/evidence last checked: 2026-08-02.

## @octanejs/hook-form

[`packages/hook-form`](../packages/hook-form) `0.1.47` — ports `react-hook-form@7.81.0`. Status data: [`packages/hook-form/status.json`](../packages/hook-form/status.json).

Complete port of react-hook-form 7.81.0 (tag commit 46b217e034dd92f7aa3cb3a478815556b416b299). The automated parity check runs all 1,193 original tests against the pinned React package as a pristine baseline; the Octane port separately runs byte-locked, unfiltered DOM and server suites with exact collected/executed inventories containing 1,187 entries representing 1,178 unique file/full-name identities. The nine duplicate entries are repeated titles within the DOM inventory; the server inventory is disjoint. Coverage includes `useForm`, `useController`, `useFieldArray`, `useFormState`, `useWatch`, `useFormContext`/`FormProvider`, schema resolvers, and all validation modes.

Known divergences:

- `register()` returns `onInput` (octane's native per-keystroke event) instead of React's synthetic `onChange`; mode names and `register` option keys keep the upstream spelling.
- The structured parity ledger records native no-op input delivery, microtask batching, duplicate resolver notification, async act flush, reset render-count, and eager `Object.is` bailout differences with executable case identities, consumer impact, and migration guidance; the suite contains no skipped or expected-failure cases.

SSR / hydration: Supported and tested — the upstream `*.server.test.tsx` suite runs via `octane/server` with byte-identical markup.

Scope/evidence last checked: 2026-08-01.

See also: [`docs/octanejs-hook-form-plan.md`](octanejs-hook-form-plan.md)

## @octanejs/html-react-parser

[`packages/html-react-parser`](../packages/html-react-parser) `0.0.6` — ports `html-react-parser@6.1.7`. Status data: [`packages/html-react-parser/status.json`](../packages/html-react-parser/status.json).

Public runtime surface at html-react-parser 6.1.7: default parse, attributesToProps, domToReact, htmlToDOM, HTMLReactParserOptions, and re-exported domhandler node classes. library defaults to Octane createElement/cloneElement/isValidElement.

Known divergences:

- Consumers import from @octanejs/html-react-parser instead of html-react-parser.
- Default element library is Octane, not React.
- PRESERVE_CUSTOM_ATTRIBUTES is hardcoded true because Octane matches React 16+ DOM attributes while octane.version is 0.x.
- Public types use ElementDescriptor/OctaneNode instead of React JSX.Element/ReactNode.
- Octane serializes style objects through CSSOM, so custom-element style attribute spelling can differ from React snapshots while the parsed style object stays identical.

SSR / hydration: Parsing is string-to-element-tree and is SSR-safe. Rendering the tree uses Octane server renderToStaticMarkup.

Scope/evidence last checked: 2026-08-20.

## @octanejs/i18next

[`packages/i18next`](../packages/i18next) `0.1.45` — ports `react-i18next@17.0.9`. Status data: [`packages/i18next/status.json`](../packages/i18next/status.json).

Complete runtime port of react-i18next 17.0.9: useTranslation, I18nextProvider/context, Trans/TransWithoutContext, IcuTrans/IcuTransWithoutContext, Translation, the withTranslation/withSSR HOCs, useSSR, namespace reporting, initialization/default helpers, and the root ICU helper exports over the unchanged i18next core.

Known divergences:

- Trans children that must be inspected are passed in prop position (`children={<>…</>}`) or through `defaults` + `components`; natural .tsrx block children are opaque compiled render bodies and fall back with a development warning.
- Suspense uses octane's `use(thenable)` instead of throwing a Promise.
- withTranslation's `withRef` option uses octane's ref-as-prop model; class components are unsupported.
- The React/Babel-specific `icu.macro` subpath is not shipped; the runtime IcuTrans APIs are fully supported.

SSR / hydration: Preloaded renderToString output and namespace collection are covered; useSSR, withSSR, getInitialProps, and composeInitialProps are ported. A dedicated hydration differential is still open.

Scope/evidence last checked: 2026-08-02.

## @octanejs/image-crop

[`packages/image-crop`](../packages/image-crop) `0.0.6` — ports `react-image-crop@11.1.2`. Status data: [`packages/image-crop/status.json`](../packages/image-crop/status.json).

ReactCrop, default and Component aliases, crop types, aspect/centering/conversion/containment/nudge utilities, browser canvas/image helpers, pointer and keyboard crop interactions, selection addons, circular masks, rule-of-thirds overlays, and stylesheet compatibility exports.

Known divergences:

- Event callbacks receive native DOM PointerEvent objects because Octane has no synthetic event layer.
- The upstream Sass source compatibility path resolves to the precompiled CSS artifact.

SSR / hydration: ReactCrop renders its static wrapper, media child, mask, and selection markup without reading browser globals during render; crop interaction remains client-only.

Scope/evidence last checked: 2026-08-20.

## @octanejs/inertia

[`packages/inertia`](../packages/inertia) `0.0.19` — ports `@inertiajs/react@3.6.1`. Status data: [`packages/inertia/status.json`](../packages/inertia/status.json).

Octane Inertia 3.6.1 adapter foundation: framework-neutral router, HTTP client, progress, and server exports reuse @inertiajs/core unchanged; page, remember, poll, prefetch, form-state, router-submit, direct-HTTP, precognition, and layout-property hooks are ported to Octane.

Known divergences:

- React, ReactDOM, StrictMode, forwardRef, and synthetic events are not runtime dependencies; the Octane adapter uses Octane roots, refs-as-props, and native events.

SSR / hydration: The framework-neutral Inertia server entry is exposed. Hook initialization is request-local and covered in the server runtime; Octane page rendering and hydration are completed by the adapter SSR unit.

Scope/evidence last checked: 2026-07-30.

## @octanejs/ink

[`packages/ink`](../packages/ink) `0.0.13` — ports `ink@7.1.1`. Status data: [`packages/ink/status.json`](../packages/ink/status.json).

Complete against Ink 7.1.1's published exports: terminal render roots, Yoga-backed Box and Text primitives, Static/Transform/Newline/Spacer, application and stream hooks, input/paste/focus/cursor/animation/window-size/metrics hooks, measurement helpers, DOM element types, and Kitty keyboard protocol helpers.

Known divergences:

- Octane programmatic roots accept a component and props separately instead of a pre-created React element.
- The concurrent render option remains accepted for source compatibility, but scheduling is owned by Octane rather than React Concurrent Mode.
- Components are authored as .ink.tsrx and require @octanejs/ink's renderer configuration and JSX intrinsics.

SSR / hydration: Ink is a native terminal renderer. renderToString uses the same Octane universal host driver and Yoga/ANSI renderer without a terminal session.

Scope/evidence last checked: 2026-08-10.

## @octanejs/input-otp

[`packages/input-otp`](../packages/input-otp) `0.0.16` — ports `input-otp@1.5.0`. Status data: [`packages/input-otp/status.json`](../packages/input-otp/status.json).

Complete against input-otp@1.5.0: OTPInput, OTPInputContext, the three exported regexp patterns, public props and slot types including nonce, controlled and uncontrolled values, one-input accessibility and mobile-autofill markup, default spellcheck off, translation opt-out, render/context projection, keyboard selection and deletion, paste transformation, completion callbacks, overflow-aware password-manager displacement, SSR, and hydration.

Known divergences:

- Octane's native per-edit `input` event drives the hidden text input internally; the public callback remains the source-compatible `onChange(newValue)`.
- Refs are ordinary Octane ref props rather than React `forwardRef`; consumer ref behavior is unchanged.

SSR / hydration: Supported and tested — rendering is deterministic and browser-global-free; hydration adopts the server input and cleanup removes owned listeners, observers, timers, and styles.

Scope/evidence last checked: 2026-08-20.

## @octanejs/intersection-observer

[`packages/intersection-observer`](../packages/intersection-observer) `0.0.16` — ports `react-intersection-observer@10.1.0`. Status data: [`packages/intersection-observer/status.json`](../packages/intersection-observer/status.json).

Public runtime surface at react-intersection-observer 10.1.0: useInView, useOnInView, InView, observe, defaultFallbackInView, and test utilities. Pinned upstream unit and browser suites plus one-for-one adapted runtime/type probes are registered with react-parity:check.

Known divergences:

- Public node and prop types use Octane structural types and do not import React.
- InView is implemented as a function component while preserving the upstream render-prop and wrapper behavior.
- In TSRX, an InView render function must be supplied through the children prop; nested children compile to an opaque render block.
- Unsupported false fallback (`fallbackInView={false}` / `defaultFallbackInView(false)`) does not emit `onChange(false)` on mount under Octane (`intersection-observer-initial-false-onchange`): treat the default hidden state as authoritative rather than waiting for that callback.
- Unsupported IntersectionObserver without a fallback surfaces as a passive-effect `console.error` under Octane rather than a synchronous mount throw (`intersection-observer-unsupported-mount-error-surface`); wrap with an error boundary/`tryBlock` or supply `fallbackInView`/`defaultFallbackInView` instead of try/catch around render.
- `@octanejs/intersection-observer/test-utils` does not auto-register Vitest/Jest beforeEach/afterEach (`intersection-observer-test-utils-manual-setup`); call `setupIntersectionMocking`/`resetIntersectionMocking` in the test setup file.

SSR / hydration: Supported. Observation begins in an effect; initialInView controls deterministic server output.

Scope/evidence last checked: 2026-07-30.

## @octanejs/jotai

[`packages/jotai`](../packages/jotai) `0.1.47` — ports `jotai@2.20.2`. Status data: [`packages/jotai/status.json`](../packages/jotai/status.json).

Complete 1:1 port: the framework-agnostic vanilla core (`jotai/vanilla`, `/vanilla/utils`, `/vanilla/internals`) is reused verbatim; the React layer (`Provider`, `useStore`, `useAtom`, `useAtomValue`, `useSetAtom`) and `react/utils` (`useResetAtom`, `useReducerAtom`, `useAtomCallback`, `useHydrateAtoms`) are ported onto octane hooks, preserving upstream's useReducer force-update + effect-subscription implementation, async atoms via octane's `use()`.

SSR / hydration: No SSR-specific surface; `useHydrateAtoms` is ported and usable for hydration seeding; no dedicated SSR tests.

Scope/evidence last checked: 2026-08-02.

## @octanejs/lexical

[`packages/lexical`](../packages/lexical) `0.1.49` — ports `@lexical/react@0.46.0`. Status data: [`packages/lexical/status.json`](../packages/lexical/status.json).

The 35 legacy `@lexical/react` modules represented by this port cover composer + contexts, the editable surface, plain/rich text, the plugin/menu set, and the `useLexical*` hooks. The 0.46.0 extension subsystem, collaboration plugin, and tree view remain excluded as itemized in UPSTREAM.md.

Known divergences:

- Positioning uses `@floating-ui/dom` instead of `@floating-ui/react`.
- The class-based `LexicalErrorBoundary` becomes an Octane error boundary; `forwardRef` becomes ref-as-prop.

SSR / hydration: No dedicated SSR/hydration tests.

Scope/evidence last checked: 2026-08-02.

- The manifest registers two bounded runtime differential cases; the pinned upstream runtime suite has not been vendored or adapted exhaustively, and the React package has no separate executable type-test suite.
- Positioning uses `@floating-ui/dom`; LexicalErrorBoundary uses an Octane boundary; refs are ordinary props. These adaptations are outside the registered equality cases and are not claimed as verified divergences.
- Excluded public entry points and every pinned upstream test artifact are dispositioned in UPSTREAM.md.

## @octanejs/livestore

[`packages/livestore`](../packages/livestore) `0.0.20` — ports `@livestore/react@0.4.0`. Status data: [`packages/livestore/status.json`](../packages/livestore/status.json).

Ports the complete stable renderer surface (registry provider/access, Suspense store loading and augmentation, reactive queries, client documents, and sync status) plus the exported experimental LiveList over LiveStore's unchanged 0.4.0 framework-neutral packages.

Known divergences:

- ReactApi and withReactApi retain their historical upstream names but attach Octane hooks.
- The public query error label identifies octane; LiveStore framework-toolkit 0.4.0 still records its internal refresh-reason renderer tag as react.
- React Strict Mode double invocation is not emulated.

SSR / hydration: Supported at the binding boundary: server rendering reads existing synchronous state without running passive subscriptions or browser-only store work; client Suspense and hydration are covered separately.

Scope/evidence last checked: 2026-08-02.

See also: [`docs/livestore-port.md`](livestore-port.md), [`packages/livestore/UPSTREAM.md`](../packages/livestore/UPSTREAM.md)

## @octanejs/lucide

[`packages/lucide`](../packages/lucide) `0.1.45` — ports `lucide-react@1.24.0`. Status data: [`packages/lucide/status.json`](../packages/lucide/status.json).

Complete against the published `lucide-react@1.24.0` runtime surface: every canonical icon and alias, the `icons` namespace, `Icon`, `createLucideIcon`, `LucideProvider`, `useLucideContext`, `DynamicIcon`, `iconNames`, `dynamicIconImports`, and per-icon subpath imports.

Known divergences:

- Icon refs are normal Octane `ref` props rather than React `forwardRef` components.
- Event callbacks receive native DOM events rather than React synthetic events.

SSR / hydration: Supported and tested: icons and provider defaults render through `octane/server`, and client hydration adopts the server-rendered SVG element.

Scope/evidence last checked: 2026-08-02.

- Generated wrappers consume official framework-neutral `@lucide/icons@1.24.0` data, so SVG geometry is not copied or maintained by the port.
- Generation checks pin the React export, alias, and dynamic-name surfaces and reject stale generated files.
- The manifest registers two bounded runtime differential cases; the pinned upstream runtime suite remains unvendored and unadapted one-for-one, and the React package has no separate executable type-test suite.
- Every pinned upstream test artifact and public entry-point family is dispositioned in UPSTREAM.md.

See also: [`docs/lucide-port-plan.md`](lucide-port-plan.md)

## @octanejs/mantine-hooks

[`packages/mantine-hooks`](../packages/mantine-hooks) `0.1.31` — ports `@mantine/hooks@9.5.0`. Status data: [`packages/mantine-hooks/status.json`](../packages/mantine-hooks/status.json).

Complete @mantine/hooks 9.5.0 runtime export surface: state, timing, storage, viewport, input, focus, pointer, observer, hotkey, scrolling, collapse, drag, splitter, mask, and utility hooks.

Known divergences:

- Hooks use Octane's compiler-injected hook slots and runtime lifecycle instead of React's dispatcher.
- DOM subscriptions receive native browser events.
- React is retained only as a source-compatibility type vocabulary for refs, events, actions, and CSS properties; it is not loaded at runtime.

SSR / hydration: Dedicated Node-mode coverage verifies deterministic state-hook output and guarded media-query initial values without a browser. DOM-only effects remain inert during server rendering.

Scope/evidence last checked: 2026-08-02.

## @octanejs/markdown

[`packages/markdown`](../packages/markdown) `0.0.16` — ports `react-markdown@10.1.0`. Status data: [`packages/markdown/status.json`](../packages/markdown/status.json).

Complete react-markdown 10.1.0 root runtime and public type surface: Markdown, MarkdownAsync, MarkdownHooks, defaultUrlTransform, and all six exported type families.

Known divergences:

- Rendered elements, component mappings, hooks, and public renderable types target Octane instead of React.
- React 19 may emit automatic image preload hints during server rendering; Octane preserves the Markdown image output without that renderer-specific hint.
- React's synchronous renderer throws when MarkdownAsync suspends; Octane's MarkdownAsync returns an awaitable ElementDescriptor.

SSR / hydration: Synchronous and awaited asynchronous Markdown are deterministic and browser-global-free; hydration adoption and updates are covered for default output, plugins, filtering, URLs, and component mappings. MarkdownHooks preserves its fallback and resolves on the client.

Scope/evidence last checked: 2026-08-02.

- The vendored upstream test.jsx executes unchanged: all 87 leaf tests retain their original fixtures, assertions, and interactions. Every source-line identity has an integrity-locked adapted-test crosswalk entry.
- Upstream source provenance and the MIT license are retained in UPSTREAM.md and LICENSE.

## @octanejs/mdx

[`packages/mdx`](../packages/mdx) `0.1.47` — ports `@mdx-js/mdx@3.1.1`. Status data: [`packages/mdx/status.json`](../packages/mdx/status.json).

The full compile-don't-interpret pipeline: `.mdx`/`.md` → `@mdx-js/mdx` (reused verbatim) → octane compiler, via the `octaneMdx()` Vite plugin plus the `./compile` and `./server` entries; compiler warnings propagate through direct and Vite compile surfaces with authored `.mdx` ranges; `@mdx-js/react`'s provider layer (`MDXProvider`/`useMDXComponents`) is ported onto octane context. The octane website runs on it.

Known divergences:

- `useMDXComponents` drops upstream's `useMemo` referential-stability wrapper so the call is valid in both server and client runtimes (same observable mapping).

SSR / hydration: Full SSR + hydration coverage — server-compiled documents render via `renderToString` and hydrate byte-for-byte (`ssr.test.ts`, `hydration.test.ts`).

Scope/evidence last checked: 2026-07-17.

See also: [`docs/mdx-migration-plan.md`](mdx-migration-plan.md)

## @octanejs/mobx

[`packages/mobx`](../packages/mobx) `0.1.31` — ports `mobx-react-lite@4.1.1`. Status data: [`packages/mobx/status.json`](../packages/mobx/status.json).

The framework-independent MobX core is re-exported verbatim. The function-component binding includes observer, Observer, useObserver, useLocalObservable, enableStaticRendering, isUsingStaticRendering, and the deprecated useStaticRendering alias.

Known divergences:

- React class components and the legacy mobx-react Provider/inject APIs are not included.
- forwardRef compatibility options are omitted because Octane uses refs as props.
- React-specific batching, prop-types validation, React DevTools integration, and useDebugValue output are omitted.

SSR / hydration: enableStaticRendering(true) renders observed components without creating a Reaction or retaining observable subscriptions.

Scope/evidence last checked: 2026-08-02.

## @octanejs/monaco-editor

[`packages/monaco-editor`](../packages/monaco-editor) `0.0.18` — ports `@monaco-editor/react@4.7.0`. Status data: [`packages/monaco-editor/status.json`](../packages/monaco-editor/status.json).

Editor (default), DiffEditor, loader, useMonaco, and the complete upstream 4.7.0 prop and callback type surface, including controlled values, model paths, languages, themes, options, view-state restoration, validation, and model ownership.

Known divergences:

- Components are compiled Octane `.tsrx` modules and accept OctaneNode for loading content; they do not depend on React.
- MonacoContainer uses Octane ref as an ordinary prop instead of upstream private _ref.
- Model disposal is ownership-aware: binding-owned models are tracked in a WeakSet with lease counts in a WeakMap, so externally created or shared models are not disposed by the wrong owner; superseded owned path models are cleaned up on unmount.
- View state is stored in a WeakMap keyed by model identity rather than upstream path-string Map.
- CSS style modules use plain records instead of React CSSProperties.

SSR / hydration: Editor and DiffEditor render a deterministic loading shell without touching browser globals; live Monaco construction begins in a client effect. Hydration adopts server DOM (section, slot nodes) and reaches a ready editor without mismatch warnings.

Scope/evidence last checked: 2026-08-10.

- Pinned to @monaco-editor/react 4.7.0 (audit/upstream.lock.json pin eb120e66), @monaco-editor/loader 1.7.0, monaco-editor 0.55.1 oracle, and React 19.2.7 for differential/typetest lanes.
- Adapted upstream shell tests live in tests/upstream/*; harness negative-controls guard adapted inventory titles.
- SSR (tests/ssr), hydration (tests/hydration), and Chromium browser harness (tests/browser) exercise framework and worker integration beyond upstream coverage.

## @octanejs/motion

[`packages/motion`](../packages/motion) `0.1.49` — ports `motion@12.42.2`. Status data: [`packages/motion/status.json`](../packages/motion/status.json).

Core surface: `motion.<tag>` (animate, gestures, variants with propagation/stagger, drag, layout basics), `AnimatePresence`, `MotionConfig`, live `useReducedMotion`, reduced-motion enforcement, `LayoutGroup` layoutId namespaces, `LazyMotion` with `domAnimation`/`domMax`, the `m` proxy and complete `./react-m` named host entry, plus the motion-value hooks (`useMotionValue`, `useScroll`, `useTransform`, `useSpring`, `useAnimate`, `useMotionValueEvent`); motion-dom's animation engine and gesture primitives are reused verbatim.

Known divergences:

- Exit animations run via cleanup-before-detach instead of React's deferred-deletion machinery.
- `layout`/`layoutId` use single-element FLIP, not the full projection tree.
- An `initial` target without an `animate` target does not materialize inline initial styles; set the starting style explicitly or provide an animation target.

SSR / hydration: No SSR-specific surface; no dedicated SSR tests.

Scope/evidence last checked: 2026-08-02.

- Not yet ported: nested/shared layout projection (incl. child scale correction and shared layout during drag), drag momentum + elastic physics, the `useTransform` output-map form, and `when: 'beforeChildren' | 'afterChildren'` sequencing.

## @octanejs/nuqs

[`packages/nuqs`](../packages/nuqs) `0.1.39` — ports `nuqs@2.9.1`. Status data: [`packages/nuqs/status.json`](../packages/nuqs/status.json).

Full vendored port: the framework-agnostic core (`parsers`/`parseAs*`/`createParser`, `createSerializer`, `createLoader`, `createStandardSchemaV1`, the throttle/debounce update queues, sync emitter and URL encoding) is vendored verbatim from nuqs 2.9.1; the React layer (`useQueryState`, `useQueryStates`, the `useSyncExternalStores` helper and the adapter context) is ported onto octane's hooks — same `useState`/`useEffect`/`useSyncExternalStore` implementation shape as upstream, so re-render and URL-reconciliation behaviour matches nuqs on React. Adapters ported: `@octanejs/nuqs/adapters/react` (`NuqsAdapter`, `enableHistorySync`), `/adapters/custom` (`unstable_createAdapterProvider`), `/adapters/testing` (`NuqsTestingAdapter`, `withNuqsTestingAdapter`). Server surface (`@octanejs/nuqs/server`) exposes `createLoader`/`createSerializer`/parsers/`createStandardSchemaV1`.

Known divergences:

- Router-specific React adapters are not shipped; use the standalone or custom adapter.
- createSearchParamsCache is unavailable because Octane does not implement React.cache.
- TransitionStartFunction is declared locally instead of importing React types.
- NuqsTestingAdapter resets the shared update queue once per mount instead of every render.

SSR / hydration: The react-free server entry has a dedicated Node lane for parsing and serialising search params. Client hydration remains outside the supported evidence claim.

Scope/evidence last checked: 2026-08-02.

## @octanejs/opentui

[`packages/opentui`](../packages/opentui) `0.0.5` — ports `@opentui/react@0.5.8`. Status data: [`packages/opentui/status.json`](../packages/opentui/status.json).

Technical-preview OpenTUI 0.5.8 renderer: renderer-local TSRX intrinsics for the complete built-in catalogue and text modifiers, custom `extend()` renderables, component-plus-props roots, OpenTUI prop/style/event application, refs and retained visibility, same-renderer `RootRenderable` portals, terminal error fallback, `act`/`flushSync`, all public hooks, `TimeToFirstDraw`, the core slot/plugin registry adapted to universal renderables, and an FFI-backed test utility. Native behavioral coverage exercises terminal frames, state and prop updates, host identity, keyboard and resize hooks, multi-argument select callbacks, subscription cleanup, portals, slots, errors, and teardown under Bun.

Known divergences:

- Octane owns reconciliation, components, hooks, context, scheduling, errors, refs, and effects instead of embedding React Reconciler.
- Components are authored in `.opentui.tsrx`; the package does not export React `createElement` or accept React element trees. Programmatic roots render an Octane component plus props.
- Refs are ordinary Octane props and may be composed with `ref={[a, b]}`; there is no `forwardRef` layer.
- Slot plugins return universal renderables and plugin errors use source `octane` instead of `react`. `createReactSlotRegistry` and the upstream `React*` type names remain migration aliases for the canonical Octane-named API.
- React DevTools and OpenTUI's React runtime-plugin bundling subpaths are not ported. Applications configure the Octane compiler with `opentuiRenderers`.
- Portal targets are explicitly limited to borrowed `RootRenderable` instances from the same `CliRenderer` context and are never destroyed by the binding.

SSR / hydration: Unsupported. OpenTUI is a native terminal renderer; `.opentui.tsrx` modules are rejected from server graphs and have no HTML hydration contract.

Scope/evidence last checked: 2026-08-25.

- OpenTUI 0.5.8 requires Bun 1.3+ or Node.js 26.4+ with `--experimental-ffi`. The package's native integration suite runs as an always-executed Bun lane; the repository's Node Vitest project owns the framework-neutral configuration and prop coverage.
- The port reuses `@opentui/core@0.5.8` unchanged and preserves OpenTUI callback names and multi-argument callback shapes, including select and tab-select `onChange(index, option)` and `onSelect(index, option)`.

## @octanejs/pdf

[`packages/pdf`](../packages/pdf) `0.0.16` — ports `react-pdf@10.4.1`. Status data: [`packages/pdf/status.json`](../packages/pdf/status.json).

Complete against the documented react-pdf 10.4.1 root contract: Document, Page, Thumbnail, Outline, all three context hooks, PasswordResponses, pdfjs, all ten root types, both documented layer styles, and the unchanged PDF.js worker import.

Known divergences:

- React nodes, refs, DOM events, and CSS property types are represented by Octane nodes, refs-as-props, native DOM events, and Octane class/style values while preserving observable behavior.
- The permissive upstream ./* export exposes React implementation and source artifacts; these are pinned framework-private evidence rather than supported Octane entry points. Root imports and the two documented CSS paths are exact public support.

SSR / hydration: Document renders deterministic loading, no-data, and error shells without browser globals or workers. The browser build adopts the server shell before starting PDF.js and uses the modern worker-backed build; Node resolves the legacy PDF.js build.

Scope/evidence last checked: 2026-08-04.

## @octanejs/phosphor-icons

[`packages/phosphor-icons`](../packages/phosphor-icons) `0.0.30` — ports `@phosphor-icons/react@2.1.10`. Status data: [`packages/phosphor-icons/status.json`](../packages/phosphor-icons/status.json).

All 1,512 canonical icons from @phosphor-icons/core@2.1.1, including the upstream deprecated Icon-suffixed aliases, six weights, IconContext, IconBase, root exports, and per-icon imports.

Known divergences:

- Icon refs are normal Octane ref props rather than React forwardRef components.
- Event callbacks receive native DOM events rather than React synthetic events.
- The React package's SSR namespace is unnecessary because Octane icons use the same components on client and server.

SSR / hydration: Supported and tested against @phosphor-icons/react/ssr for every weight; hydration adopts and updates server-rendered SVG hosts.

Scope/evidence last checked: 2026-08-02.

- Generated modules embed only their own official @phosphor-icons/core SVG geometry, preserving per-icon tree shaking.
- Generation checks pin core metadata, six canonical assets per icon, and the React oracle version.

## @octanejs/popper

[`packages/popper`](../packages/popper) `0.0.16` — ports `react-popper@2.3.0`. Status data: [`packages/popper/status.json`](../packages/popper/status.json).

Complete against the published react-popper 2.3.0 root runtime and type surface: Manager, Reference, Popper, usePopper, render-function refs and styles, explicit and virtual references, arrows, hide data, lifecycle actions, Popper modifiers, and all public types.

Known divergences:

- React component classes are Octane function components; React node, ref, and CSS property types are represented by OctaneNode and native structural equivalents while preserving observable render-function values.
- Development misuse warnings are emitted directly through console.error instead of React Popper's warning helper.

SSR / hydration: Manager, Reference, and Popper render deterministic initial markup without browser globals, adopt server nodes during hydration, then create and clean up the Popper instance after client refs attach.

Scope/evidence last checked: 2026-08-03.

## @octanejs/portabletext

[`packages/portabletext`](../packages/portabletext) `0.1.0` — ports `@portabletext/react@8.0.1`. Status data: [`packages/portabletext/status.json`](../packages/portabletext/status.json).

Complete runtime surface: PortableText, defaultComponents, mergeComponents, toPlainText, PortableTextBlock and ListNestMode, plus renderer component and TypeGen helper types.

Known divergences:

- Renderer callbacks return OctaneNode rather than ReactNode.
- Custom component refs and events use Octane's normal ref prop and native DOM events.
- PortableTextReactComponents and ReactPortableTextList are compatibility aliases; Octane-named equivalents are preferred.

SSR / hydration: Supported and differential-tested against @portabletext/react@8.0.1 static markup.

Scope/evidence last checked: 2026-08-24.

- Portable Text parsing, mark-tree construction and list nesting remain in the official framework-neutral toolkit.
- The port contains no browser globals or DOM-specific rendering logic.

See also: [`docs/sanity-react-port-research.md`](sanity-react-port-research.md)

## @octanejs/radix

[`packages/radix`](../packages/radix) `0.1.49` — ports `radix-ui@1.6.4`. Status data: [`packages/radix/status.json`](../packages/radix/status.json).

Surface-present against the unified `radix-ui@1.6.4` component exports. Sixteen repo-authored differential cases compare representative primitives and interactions against the real package; the complete 38-file canonical upstream suite is preserved but not adapted, so the binding remains recorded-unverified.

Known divergences:

- `Slot`/`asChild` compose element descriptors (prop-position JSX, `createElement`, `.map()` returns), not children-position JSX.
- `forwardRef` becomes octane's ref-as-prop.

SSR / hydration: SSR/hydration coverage for the overlay/portal components is still open (tracked in the migration plan).

Scope/evidence last checked: 2026-08-03.

See also: [`docs/radix-migration-plan.md`](radix-migration-plan.md)

## @octanejs/rainbowkit

[`packages/rainbowkit`](../packages/rainbowkit) `0.0.30` — ports `@rainbow-me/rainbowkit@2.2.11`. Status data: [`packages/rainbowkit/status.json`](../packages/rainbowkit/status.json).

Octane-native RainbowKitProvider, ConnectButton and ConnectButton.Custom, WalletButton, connect/account/chain modal hooks, connector selection, account/chain actions, native accessible dialogs, and light/dark/midnight themes.

Known divergences:

- IMPORTANT: upstream RainbowKit 2.2.11 declares wagmi ^2.9.0. This adapter intentionally consumes @octanejs/wagmi v3 and is not drop-in dependency or peer-range parity.
- The React DOM and vanilla-extract implementation is replaced by native Octane TSRX, DOM events, focus/scroll containment, and CSS custom properties.
- The wallet list merges optional configured descriptors with the enclosing Wagmi v3 connector list, deduplicated by canonical connector uid with explicit id/name fallback. Unavailable configured entries remain visible with a reason. RainbowKit wallet factories, vendor SDKs, and WalletConnect project configuration remain application-owned.
- Authentication, recent transactions, ENS/avatar resolution, localization, cool mode, account avatars/balances, chain icons, and pixel-identical upstream themes are unsupported and their upstream props are not accepted.
- rainbowTheme is an explicitly documented Octane-only purple/rounded preset; it is not an upstream RainbowKit export.

SSR / hydration: The provider and controls emit deterministic disconnected markup without browser wallet access. Connector discovery and live Wagmi state become authoritative after hydration; no hydrated UI state authorizes wallet actions.

Scope/evidence last checked: 2026-08-02.

## @octanejs/react-error-boundary

[`packages/react-error-boundary`](../packages/react-error-boundary) `0.1.31` — ports `react-error-boundary@6.1.2`. Status data: [`packages/react-error-boundary/status.json`](../packages/react-error-boundary/status.json).

Complete against the published react-error-boundary 6.1.2 function/type surface adapted to Octane: ErrorBoundary, ErrorBoundaryContext, getErrorMessage, fallback variants, onError/onReset callbacks, resetKeys, useErrorBoundary (including error), withErrorBoundary, OnErrorCallback, and UseErrorBoundaryApi.

Known divergences:

- Component stack information is currently an empty string because Octane does not expose a public component-stack formatter.
- Event-handler and asynchronous errors must be passed to useErrorBoundary().showBoundary(), matching upstream's explicit forwarding requirement.
- Server rendering that must match upstream error propagation uses the explicit @octanejs/react-error-boundary/server entry.

SSR / hydration: The explicit server entry renders children without a boundary so descendant errors propagate, matching react-error-boundary 6.1.2.

Scope/evidence last checked: 2026-08-02.

## @octanejs/react-map-gl

[`packages/react-map-gl`](../packages/react-map-gl) `0.0.22` — ports `@vis.gl/react-mapbox@8.1.2 (b1e46fcf)`. Status data: [`packages/react-map-gl/status.json`](../packages/react-map-gl/status.json).

Complete against the pinned @vis.gl/react-mapbox 8.1.2 public surface — the package react-map-gl/mapbox re-exports: Map (and default), Marker, Popup, Source, Layer, AttributionControl, FullscreenControl, GeolocateControl, NavigationControl, ScaleControl, useControl, MapProvider, useMap, and every published type. The framework-neutral half of upstream (the Mapbox engine, proxy transform, map ref, and six utils) is reused byte-for-byte and validated by upstream's own specs run against both source trees.

Known divergences:

- <Source> delivers its generated id to child layers through context rather than cloneElement, so the id reaches any descendant <Layer> rather than only direct children. It still overrides an explicitly set source, as cloneElement did.
- Map, Marker, Popup and GeolocateControl take their ref as an ordinary prop; Octane has no forwardRef. `<Map ref={mapRef} />` is unchanged.
- Effect cleanups run on the passive drain after root.unmount() rather than inside it, so the map's WebGL context and worker pool are released one drain later.
- Marker picks between its own element and Mapbox's default pin from what its children actually rendered, because a compiled children block cannot be inspected the way React.Children.forEach inspects descriptors. Children that render something, render nothing, or first render after mount all match upstream; a child that stays truthy while rendering nothing forever gets the default pin here and an empty, invisible element upstream.
- react-map-gl/mapbox-legacy (mapbox-gl v1) and @vis.gl/react-maplibre are out of scope.

SSR / hydration: Supported and tested: Map server-renders its container with the merged style and omits every child, because mapbox-gl is only imported inside an effect. Nothing in the tree reads a browser global on the server. hydrateRoot adopts that container rather than replacing it, and the map is created inside the server's own node once the library resolves.

Scope/evidence last checked: 2026-08-06.

- mapbox-gl is an optional peer, never vendored: from v2 it ships under the Mapbox Terms of Service and bills per map load. The pinned oracle is mapbox-gl@3.9.0, the release upstream develops against.
- Upstream's five framework-neutral util specs run byte-exact against both upstream's source and the reused modules; both lanes passing is what backs the verbatim-reuse claim.
- Upstream's seven component specs need a live Mapbox token and real WebGL under puppeteer, so they are ported against a port-authored double. A differential lane runs six fixtures through the published @vis.gl/react-mapbox 8.1.2 on React with that same double — map shell and overlays, Source/Layer add-update-remove, in-place popup option edits with control add/remove, reaching the map by id from outside it to fly the camera, useControl called straight from a consumer module, and a marker choosing between the default pin and a custom element — which is what licenses it as evidence.
- Not covered: real WebGL, tile loading, pointer interaction, reuseMaps/recycle, external gl contexts, and RTL text plugin loading. A token-gated real-map lane is open work.

See also: [`docs/react-map-gl-port-plan.md`](react-map-gl-port-plan.md), [`packages/react-map-gl/UPSTREAM.md`](../packages/react-map-gl/UPSTREAM.md)

## @octanejs/recharts

[`packages/recharts`](../packages/recharts) `0.1.47` — ports `recharts@3.9.2`. Status data: [`packages/recharts/status.json`](../packages/recharts/status.json).

Broad runtime support across cartesian, polar, hierarchical, tooltip, legend, responsive-container, shape, and chart-state surfaces. `Brush` and `Treemap` remain intentionally unsupported.

Known divergences:

- Chart events coordinate through octane's native delegated events rather than React's synthetic layer.

SSR / hydration: Untested; text measurement (`getStringSize`) returns 0×0 under SSR.

Scope/evidence last checked: 2026-08-02.

- Known gaps: `Brush` and `Treemap`; SSR text measurement still reports zero dimensions.

See also: [`docs/recharts-port-plan.md`](recharts-port-plan.md)

## @octanejs/redux

[`packages/redux`](../packages/redux) `0.1.47` — ports `react-redux@9.3.0`. Status data: [`packages/redux/status.json`](../packages/redux/status.json).

The hooks + `Provider` surface of react-redux 9.3.0 (`useSelector`, `useDispatch`, `useStore`, and the custom-context factory variants) on octane's `useSyncExternalStore`; works with any Redux 5 / Redux Toolkit store. Upstream runtime-export completeness is pinned by test.

Known divergences:

- `connect()` (the legacy HOC surface) intentionally throws — the hooks API is the supported surface.
- Error messages are octane-branded.
- The root also exposes createReduxContextHook, useReduxContext, createSubscription, and useSyncExternalStoreWithSelector as Octane extension exports.

SSR / hydration: No SSR-specific surface; no dedicated SSR tests.

Scope/evidence last checked: 2026-08-02.

- The pinned upstream runtime and type suites are inventoried but not vendored or adapted one-for-one. A required same-fixture counter differential and classified local conformance suite provide bounded evidence only.

## @octanejs/redux-toolkit

[`packages/redux-toolkit`](../packages/redux-toolkit) `0.1.45` — ports `@reduxjs/toolkit@2.12.0`. Status data: [`packages/redux-toolkit/status.json`](../packages/redux-toolkit/status.json).

Complete four-entry-point port: the framework-agnostic Toolkit and RTK Query core are re-exported verbatim; `/query/react` provides generated query, lazy-query, mutation, infinite-query, prefetch hooks and `ApiProvider`; `/react` provides the dynamic-middleware dispatch-hook integration.

Known divergences:

- The compatibility `/react` subpaths and `reactHooksModule` names are retained, but use octane and `@octanejs/redux` internally.
- `useDebugValue` is octane's no-op compatibility hook; observable query behavior is unchanged.

SSR / hydration: Preloaded RTK Query state renders through the traditional @octanejs/redux Provider; effects and browser listeners remain client-only. Dedicated SSR and hydration tests are included.

Scope/evidence last checked: 2026-08-02.

- The pinned upstream runtime and type suites are inventoried but not vendored or adapted one-for-one. Three required same-fixture RTK Query differential cases and classified local suites provide bounded evidence only.

## @octanejs/remix-router

[`packages/remix-router`](../packages/remix-router) `0.1.46` — ports `react-router@8.2.0`. Status data: [`packages/remix-router/status.json`](../packages/remix-router/status.json).

All planned port phases are shipped and the pinned runtime export namespace is complete: the framework-agnostic router core, data/declarative/DOM/mutation/guard layers, static SSR, and cookie/session runtime are implemented on Octane. Framework-mode and RSC names remain throwing scope stubs. Selected vendored-core suites, local conformance, and nine exact shared-fixture scenarios provide bounded evidence rather than exhaustive React parity.

Known divergences:

- Refs are props (octane has no forwardRef) — Link's forwardRef becomes a `ref` prop.
- Error-boundary reset on location change / revalidation-idle happens in a layout effect one commit after upstream's render-phase derivation — same observable outcome.
- octane's flushSync inside an ambient flush degrades to a plain call drained at that flush's boundary (sync scroll/navigation notifies from within event handlers land at the flush boundary instead of nested) — consumer-invisible, conformance-pinned.
- Form's onSubmit is a NATIVE delegated submit listener (octane has no synthetic events): `event.submitter` is read directly off the SubmitEvent where React reads `event.nativeEvent.submitter` — same value, differential-verified.
- Block-children `<Routes>` collects `<Route>`s by registration (mount order) instead of upstream's element-children walk (source order) — a conditionally-mounted `<Route>` between static siblings registers after them, which only affects matchRoutes score TIES; conformance-pinned.

SSR / hydration: Shipped: StaticRouter/StaticRouterProvider/createStaticHandler/createStaticRouter render through octane/server (remix-router-ssr vitest project compiles the whole graph in server mode; markup matches react-dom/server byte-for-byte after framework-marker stripping). Block-children <Routes> is CLIENT-only (the registration collector runs in layout effects) — use descriptor children or route objects for SSR.

Scope/evidence last checked: 2026-08-02.

- Pinned runtime export completeness: tests/conformance/parity.test.ts pins EXPECTED_MISSING at []. Framework mode (needs @react-router/dev) and RSC are permanently out of scope — those names are throwing stubs with scope-policy messages. The cookie/session server runtime is vendored (adds the `cookie-es` dependency, as upstream). React Router 8 removes react-router-dom, makes middleware unconditional, and removes hasErrorBoundary plus the v8 future flags.
- The complete pinned upstream runtime suite is inventoried but not vendored or executed one-for-one. The required nine-case client differential, five-case SSR differential, and all local tests are explicitly classified.

See also: [`docs/remix-router-port-plan.md`](remix-router-port-plan.md)

## @octanejs/resizable-panels

[`packages/resizable-panels`](../packages/resizable-panels) `0.0.8` — ports `react-resizable-panels@4.12.2`. Status data: [`packages/resizable-panels/status.json`](../packages/resizable-panels/status.json).

Group, Panel, Separator, persistence hooks, refs, imperative APIs, layout constraints, pointer and keyboard interaction, ARIA, cursor handling, and ResizeObserver behavior are implemented against react-resizable-panels 4.12.2.

Known divergences:

- useId(undefined) fallback cannot reproduce React's mocked ':r123:' seam; adapted upstream case asserts a non-empty Octane id and is recorded as react-resizable-panels-useId-fallback.

SSR / hydration: Deterministic server rendering and live hydration adoption are covered by dedicated executable projects.

Scope/evidence last checked: 2026-08-02.

## @octanejs/rxjs

[`packages/rxjs`](../packages/rxjs) `0.1.29` — ports `@react-rxjs/core + @react-rxjs/utils@0.10.8 / 0.9.7`. Status data: [`packages/rxjs/status.json`](../packages/rxjs/status.json).

Core bind/state/Subscribe APIs and the complete @react-rxjs/utils surface.

Known divergences:

- StateObservable values are not JSX nodes; render them through useStateObservable or bind.
- @react-rxjs/dom is omitted because octane batches updates without ReactDOM.unstable_batchedUpdates.

SSR / hydration: useSyncExternalStore supplies the state snapshot during server rendering; browser-only ReactDOM batching helpers are intentionally absent.

Scope/evidence last checked: 2026-08-02.

## @octanejs/sanity-icons

[`packages/sanity-icons`](../packages/sanity-icons) `0.1.0` — ports `@sanity/icons@5.2.1`. Status data: [`packages/sanity-icons/status.json`](../packages/sanity-icons/status.json).

Complete @sanity/icons@5.2.1 surface: all generated per-icon subpaths, named and default exports, Icon, icons, IconMap, IconSymbol and IconComponent.

Known divergences:

- Refs are normal Octane ref props rather than React forwardRef wrappers.
- Event callbacks receive native DOM events rather than React synthetic events.

SSR / hydration: Supported and tested against representative @sanity/icons static SVG markup.

Scope/evidence last checked: 2026-08-24.

- The generator renders the official React package to deterministic SVG shells and preserves upstream subpaths.
- The root icons map keeps per-icon lazy imports so root consumers do not eagerly load every glyph.

See also: [`docs/sanity-react-port-research.md`](sanity-react-port-research.md)

## @octanejs/sanity-loader

[`packages/sanity-loader`](../packages/sanity-loader) `0.1.0` — ports `@sanity/react-loader@2.2.1`. Status data: [`packages/sanity-loader/status.json`](../packages/sanity-loader/status.json).

Query-store milestone: createQueryStore, loadQuery, setServerClient, useQuery, useLiveMode, useEncodeDataAttribute, create-data-attribute exports, browser conditions, and the server-only rsc entry.

Known divergences:

- Hooks use Octane hook slots and return Octane-compatible values rather than React hooks.
- The experimental upstream ./jsx wrapped-data element factory is deferred to a separate milestone.
- The ./rsc entry models a server-only Octane environment rather than React Server Component conditions.

SSR / hydration: Supported through loadQuery/setServerClient and the server-only rsc entry; initial query state is SSR-tested.

Scope/evidence last checked: 2026-08-24.

- Querying, Live Mode, cache, and Content Source Map logic remain in @sanity/core-loader.
- The browser export condition prevents loadQuery and setServerClient from entering browser workflows.

See also: [`docs/sanity-react-port-research.md`](sanity-react-port-research.md)

## @octanejs/sanity-logos

[`packages/sanity-logos`](../packages/sanity-logos) `0.1.0` — ports `@sanity/logos@2.2.5`. Status data: [`packages/sanity-logos/status.json`](../packages/sanity-logos/status.json).

Complete @sanity/logos@2.2.5 runtime surface: SanityLogo, SanityMonogram, GroqLogo and GroqMonogram, including dark/scheme/custom-color variants.

Known divergences:

- Refs are normal Octane ref props rather than React forwardRef wrappers.
- Event callbacks receive native DOM events rather than React synthetic events.

SSR / hydration: Supported and differential-tested against @sanity/logos@2.2.5 static SVG markup.

Scope/evidence last checked: 2026-08-24.

- Generated SVG data is derived from the pinned official React package.
- Custom monogram colors are escaped before insertion into generated SVG markup.

See also: [`docs/sanity-react-port-research.md`](sanity-react-port-research.md)

## @octanejs/select

[`packages/select`](../packages/select) `0.1.1` — ports `react-select@5.10.2`. Status data: [`packages/select/status.json`](../packages/select/status.json).

All six JavaScript entry points and all 20 runtime exports. Public TypeScript contracts are consumer-compiled across every entry point. Framework-neutral declarations and every entry-point Props member are checked fail-closed; renderer-owned component, instance, event, node, and style contracts are explicitly tracked as the adaptations below.

Known divergences:

- Renderable callback and component contracts use OctaneNode instead of ReactNode.
- Event-bearing contracts use native DOM events instead of React synthetic events.
- Renderer-owned style contracts use Octane style objects instead of Emotion CSSObjectWithLabel.

SSR / hydration: Default, styled, unstyled, asynchronous, creatable, state-managed, animated, nonce-bearing, static, string, and streaming server output is covered by executable React-oracle evidence.

Scope/evidence last checked: 2026-08-03.

## @octanejs/shadcn

[`packages/shadcn`](../packages/shadcn) `0.0.35` — ports `shadcn-ui/ui (radix base)@4baadbc6517070ae8f8feb2c97037adc2b305544 + shadcn@4.14.1`. Status data: [`packages/shadcn/status.json`](../packages/shadcn/status.json).

Two primitive bases. RADIX base (default, reached at the bare subpaths): tiers 1-2 complete plus the first tier-3 composites — 40 component families. REACT ARIA base (@octanejs/shadcn/react-aria/<Family>): 33 families over @octanejs/aria/components, taken from upstream's aria-nova style and verified class-string identical to it; not ported are select and sonner (need input-group and next-themes), while hover-card, menubar and navigation-menu do not exist in upstream's aria base. Sources live at src/bases/<base>/ui/ with lib/hooks/styles shared. DISTRIBUTION is registry-first with per-family subpath exports; the monolithic root entry is removed. STYLING FLAVOR: the radix base is mid-migration from the pinned cn-* semantic-hook system to the default-Tailwind utilities-inlined flavor (user-directed); the react-aria base is uniformly the utilities-inlined aria-nova output. THE REGISTRY NOW COVERS ALL THREE BASES, using shadcn's own mechanism rather than a namespace: base and visual style compose into components.json's single `style` field, which the CLI substitutes into the registry URL (`{style}` and `{name}` are the only placeholders shadcn@4.14.1 substitutes, and it never parses the style string). Emitted as registry/styles/<style>/<name>.json for base-nova (default, @octanejs/base-ui), radix-nova and aria-nova, plus an un-styled copy of the default so a URL without {style} still resolves. Base-agnostic items (utils/types/theme/use-mobile) are emitted into every style tree because registryDependencies resolve through the same templated URL. `registry:serve` serves it locally — the port the playground's components.json always referenced but which nothing previously served. Verified end to end by installing with the real shadcn CLI: each style yields its own primitive. BASE UI base (@octanejs/shadcn/base-ui/<Family>): STARTED, 21 of 44 families and PARTIAL. `accordion` is transcribed from upstream and runs on the @octanejs/base-ui accordion primitive — the first primitive-backed family in this base. The rest are primitive-free: `alert` is transcribed from upstream's Base UI source and verified byte-identical to it; `aspect-ratio`, `card`, `empty`, `native-select`, `skeleton` and `spinner` are DERIVED from the react-aria base and are NOT yet verified against upstream, which each file's header records. Nothing primitive-backed is ported: Base UI's primitive API is structurally different from React Aria's, so it cannot be derived and needs transcribed upstream sources. The foundations now run on real Base UI primitives: `button` (Button), `input` (Field.Control), `label` (Field.Label) and `separator` (Separator), alongside plain-host `textarea` and `kbd` — Base UI ships no textarea or Keyboard primitive, so those match the radix base's shape rather than the aria base's. `separator` deliberately takes the ARIA base's class string, not the radix one: Base UI emits `aria-orientation`, so radix's `data-horizontal:` utilities would never match and the separator would render with no thickness. `button` omits the aria base's data-variant/data-size, which upstream's Base UI base also omits, and ships no LinkButton because Base UI has no Link primitive — which is why `pagination` remains unported. `alert-dialog` is transcribed from upstream and is the first portalled family here (Overlay->Backdrop, Content->Popup, Cancel->Close); it drops upstream's `cn-font-heading` on the title, matching the react-aria base, because this package ships the utilities-inlined flavor and nothing defines that semantic hook. The form controls (`checkbox`, `switch`, `radio-group`) adapt their conditional utilities rather than copying them: Base UI publishes bare `data-checked`/`data-unchecked` where radix publishes `data-state="checked"`, and every Root renders a `<span role=…>` that is never `:disabled`, so `disabled:` variants become `data-disabled:`. Both dialects are pinned by tests asserting the rendered DOM carries the attributes the class strings target. The overlays (`dialog`, `popover`, `tooltip`, plus `alert-dialog`) adapt positioning: Base UI inserts a Positioner layer (Portal > Positioner > Popup) and names its transform origin `--transform-origin`, not radix's `--radix-<part>-content-transform-origin`, so a copied radix class would reference a variable nothing sets and the popup would scale from the wrong corner. Tooltip also drops radix's `data-[state=delayed-open]` utilities, which have no Base UI counterpart. `PopoverAnchor` is absent because Base UI positions via the Positioner's `anchor` prop rather than an Anchor element — recorded in tests/cross-base.test.ts.

Known divergences:

- No `"use client"` directives anywhere: octane has no Server Components, so the RSC axis does not exist here.
- Refs are props (octane has no forwardRef) — upstream v4 already dropped forwardRef, so component shapes match.
- `asChild` composes element descriptors (createElement) rather than opaque compiled .tsrx children — the documented @octanejs/radix Slot contract. The same rule applies to the exported Portal wrappers (DialogPortal, AlertDialogPortal, DropdownMenuPortal, ContextMenuPortal, MenubarPortal): radix's Portal slots its child, so direct Portal children must be descriptors. The shipped *Content wrappers compose their Portal/Overlay/Content trees with createElement internally, so the ordinary authoring surface is unchanged — consumer children always flow through the props.children channel.
- Upstream's IconPlaceholder (the CLI-resolved `iconLibrary` axis) is resolved at port time to the default library, lucide, via @octanejs/lucide (XIcon, CheckIcon, CircleIcon, ChevronDownIcon, ChevronUpIcon, ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon, Loader2Icon); other icon libraries are a registry-emit concern.
- Events are native delegated DOM events: per-keystroke text handling on Input/Textarea is `onInput` (native `change` keeps its commit-on-blur meaning), menus open on native pointerdown/contextmenu, and component-level callbacks (`onValueChange`, `onCheckedChange`, `onPressedChange`, `onOpenChange`) are unchanged.
- ToggleGroup's variant/size/spacing/orientation inheritance uses octane's createContext/useContext with upstream's defaults and `context.value || ownProp` precedence.
- SelectItem text portals into the trigger value node verbatim; multi-line-authored item text keeps its surrounding whitespace where React JSX would trim it (author item labels inline).
- Collapsible composes the radix binding's canonical Collapsible.Trigger/Collapsible.Content exports; the upstream CollapsibleTrigger/CollapsibleContent alias names are not exported by @octanejs/radix 0.1.12 (same components, different export alias).
- Accordion arrow-key navigation is collection-driven in the radix binding rather than RovingFocusGroup-wrapped; Home/End/Arrow focus movement between triggers is behaviorally equivalent and tested.
- FieldError renders falsy error-list entries as null instead of React's skipped false children — identical output.
- SidebarTrigger's click handling is the native delegated click event; behavior is otherwise identical to upstream. At this pin SidebarProvider does not mount a TooltipProvider, so consumers using SidebarMenuButton's tooltip prop must provide one (matches upstream).
- The packaged theme.css omits the upstream site-only tokens (--surface, --code-*, --selection*) and inlines concrete oklch values for --chart-1..5 (upstream references Tailwind palette variables, which require a Tailwind build this standalone file cannot assume).
- The Base UI base's derived components carry unverified class strings. This is tracked rather than assumed safe: the bases genuinely diverge (the radix base's Skeleton is `bg-accent` where react-aria's is `bg-muted`), so identity is verified per component. `badge` was deliberately NOT derived — the react-aria version takes `render` as a function while Base UI's takes an element, so deriving it would ship the wrong API.

SSR / hydration: Tier 1 is fully server-rendered and tested (17 families through renderToString with no browser globals, including Slot-composed hosts), with hydration adoption pinned for representative shapes (plain host, Button-asChild anchor, nested Table) — zero mismatch, preserved node identity. Tier 2's portal-free components (Checkbox, RadioGroup, Switch, Slider, Tabs, Toggle, ToggleGroup, Accordion, Collapsible, AspectRatio, Progress) are server-rendered and tested. Field is SSR-safe (no portals/browser globals); Sidebar server-renders its static desktop branch (useIsMobile is false on the server; the mobile Sheet branch and tooltip portals are client-only). Portal-backed overlays/menus/Select are excluded until the radix binding supports overlay SSR; ScrollArea awaits verification of its viewport style injection on the server.

Scope/evidence last checked: 2026-08-02.

- Differential parity: dialog, dropdown-menu and tabs run against references vendored byte-identical from the pinned upstream sources (upstream fidelity); button and badge run against hand-authored references carrying the same maintainer-supplied class strings the port ships (runtime equivalence between octane and React, not upstream fidelity). Portal'd content is excluded from the byte compare — overlay/menu content parity is covered behaviorally.
- Distribution is hybrid per the port plan: this package publishes importable source now via the package entry, and a generated shadcn-CLI-compatible registry (packages/shadcn/registry, with a freshness check) awaits website hosting + the CLI e2e (Phase 4 remainder).
- Sibling bindings are pinned to published versions (maintainer policy from the cmdk review): @octanejs/radix@0.1.12, @octanejs/lucide@0.1.8.
- Upstream-fidelity notes (parity, not divergence): progress.tsx at the pin does not forward `value` to the primitive (the root stays data-state=indeterminate; the indicator transform carries the value) — ported byte-for-byte and contract-tested; an unvalued Slider renders two thumbs from upstream's [min, max] seed while the primitive state defaults to [min], identical to upstream React; SheetPortal/SheetOverlay are internal because upstream defines but does not export them; the data-slot attribute upstream passes to Portal parts is accepted and dropped by the Portal primitives, as in upstream React.
- Observation for the radix binding (not this package): with delayDuration=0, re-opening a Tooltip after a close logs the dev-only 'Cannot update a component (Root) while rendering a different component (Presence)' warning from @octanejs/radix 0.1.12 — behavior and DOM contract are unaffected; worth an upstream radix-binding fix.
- Migrated (utilities-inlined) components style with any Tailwind v4 build directly; the remaining cn-*-hooked components still require a shadcn style sheet (e.g. style-nova) until their flavors are supplied.
- Type checking: the package's .tsrx sources are checked by `tsrx-tsc` via `pnpm --dir packages/shadcn typecheck` (plain tsgo cannot parse .tsrx). Diagnostics are gated to src/; dependency sources are reported but not gated, since octane bindings ship raw sources a consumer's program must include and skipLibCheck does not cover.
- React Aria base LIMITATION: the families whose children are a stateful render prop (checkbox, switch, radio-group, breadcrumb) do not re-render that child when selection changes, so the tick, thumb and dot stay in their initial state. The cause is octane's handling of a call-returned closure in a children position — an inline arrow in the same position updates correctly — not these sources. Tracked for a root-cause fix in packages/octane.
- Upstream-fidelity notes for the react-aria base (parity, not divergence): upstream applies `style` (AspectRatio) and `onLoad`/`onError` (AvatarImage) BEFORE spreading `{...props}`, so a caller value of the same name replaces the component's own — losing the --ratio variable, or leaving the image stuck out of its error state so the fallback never shows. React behaves identically; both are pinned by contract tests in tests/react-aria-smoke.test.ts rather than silently diverged from.
- RAC collections (Tabs, Breadcrumbs, ListBox, Table, Menu) walk their children as element DESCRIPTORS, so a consumer authoring them from a `@{ … }` body gets an EMPTY collection, silently. Author collection-backed families with `return <jsx>`. The hooks-tier CollectionBuilder throws a descriptive error for this; the RAC tier should too.
- Consumers importing by subpath rather than installing through the registry must add the package sources to their Tailwind content scan (`@source`), or components render unstyled — Tailwind never sees the class strings.

See also: [`docs/shadcn-port-plan.md`](shadcn-port-plan.md)

## @octanejs/solana-kit

[`packages/solana-kit`](../packages/solana-kit) `0.0.19` — ports `@solana/react@7.0.0`. Status data: [`packages/solana-kit/status.json`](../packages/solana-kit/status.json).

Octane-native client provider/store hooks, a validated private Wallet Standard adapter, explicit-action transaction orchestration, and a TanStack Query-backed request hook. Applications import framework-neutral operations directly from @solana/kit@7.0.0.

Known divergences:

- @solana/react/swr is excluded because Octane has no SWR binding.
- Wallet APIs are deliberately structural and narrower because upstream selected-wallet exports leak React and @wallet-standard/react public types.
- useSubscriptionQuery and useTrackedDataQuery are deferred pending streamed-query lifecycle characterization.
- Upstream sign-in/message/transaction hooks are represented by a generation-safe explicit transaction executor rather than hidden React runtime code.
- ClientProvider accepts only a resolved client; thenables throw at mount rather than suspending.

SSR / hydration: Client state is server-readable. Wallet discovery is inert during SSR and activates only when a browser registry is explicitly attached after hydration.

Scope/evidence last checked: 2026-07-29.

- The complete @solana/* runtime family is resolved at exactly 7.0.0 through @solana/kit and @solana/react.
- Host requirements: BigInt, fetch, WebSocket, Web Crypto/Ed25519, and Wallet Standard discovery.
- Signing/submission never auto-retry; pre-dispatch context changes cancel and post-dispatch changes quarantine results as indeterminate.

## @octanejs/sonner

[`packages/sonner`](../packages/sonner) `0.1.45` — ports `sonner@2.0.7`. Status data: [`packages/sonner/status.json`](../packages/sonner/status.json).

Complete against the published `sonner@2.0.7` public surface: `Toaster`, the callable `toast` API and all methods, `useSonner`, promise lifecycle, multiple toaster targeting, stacked layout, themes, styling, focus management, timers, and swipe dismissal.

Known divergences:

- Action callbacks receive native DOM `MouseEvent`s rather than React synthetic events.
- `Toaster` accepts its ref as a normal prop instead of using `forwardRef`.
- The document-visibility hook is guarded during SSR; upstream 2.0.7 reads `document.hidden` during render.

SSR / hydration: Supported and tested: `Toaster` server-renders without browser globals, hydrates by adopting the server host, and can show the first client-created toast without replacing it.

Scope/evidence last checked: 2026-08-02.

- Bounded React parity runs the vendored Playwright suite unchanged against published sonner@2.0.7 plus one exact same-fixture differential lifecycle case. Renderer-divergence authentication stays in ordinary package shards and is not counted as React-parity evidence.

See also: [`docs/sonner-port-plan.md`](sonner-port-plan.md)

## @octanejs/spring

[`packages/spring`](../packages/spring) `0.0.16` — ports `@react-spring/web@10.1.2`. Status data: [`packages/spring/status.json`](../packages/spring/status.json).

Stable React Spring web target at the package root and Parallax through the ./parallax subpath. The port provides spring values, controllers, interpolation, Octane hooks and render-prop components, animated DOM hosts, browser observers, SSR-safe initial rendering, and Parallax scrolling.

Known divergences:

- React renderables and refs are represented by Octane renderables and refs-as-props.
- The all-renderer react-spring meta-package is intentionally not mapped.

SSR / hydration: Initial and immediate values render on the server; browser observers and frame work start after client commit.

Scope/evidence last checked: 2026-08-02.

- All 26 pinned upstream test files have machine-checked adapted or reused dispositions.
- Development and production playground journeys cover animation, interruption, keyed transitions, reduced motion, Parallax, and route-away cleanup.
- Renderer targets for native, Three, Konva, and Zdog are outside this binding.

## @octanejs/stick-to-bottom

[`packages/stick-to-bottom`](../packages/stick-to-bottom) `0.0.6` — ports `use-stick-to-bottom@1.1.6`. Status data: [`packages/stick-to-bottom/status.json`](../packages/stick-to-bottom/status.json).

Public runtime surface at use-stick-to-bottom 1.1.6: useStickToBottom, StickToBottom, StickToBottom.Content, useStickToBottomContext, and related types.

Known divergences:

- Consumers import from @octanejs/stick-to-bottom instead of use-stick-to-bottom.
- Ref objects are structural { current } / callback refs rather than React.RefObject.
- The plain TypeScript useStickToBottom hook forwards compiler-injected slots; a symbol in the options position is treated as empty options.

SSR / hydration: Scroll/resize listeners attach in ref callbacks. Initial isAtBottom follows options.initial. Overflow auto is applied in a layout/effect.

Scope/evidence last checked: 2026-08-20.

## @octanejs/streamdown

[`packages/streamdown`](../packages/streamdown) `0.1.29` — ports `streamdown@2.5.0`. Status data: [`packages/streamdown/status.json`](../packages/streamdown/status.json).

Complete Streamdown 2.5.0 root runtime and public type surface, plus the official code 1.1.1, math 1.0.2, Mermaid 1.0.2, and CJK 1.0.3 plugins exposed through ./code, ./math, ./mermaid, and ./cjk.

Known divergences:

- Components, hooks, contexts, lazy boundaries, portals, element inspection, and the HAST JSX runtime target Octane; callbacks receive native DOM events instead of React synthetic events.
- The four official plugins are consolidated as subpath exports of @octanejs/streamdown instead of separate packages.
- Animation progress is isolated per streaming block instead of sharing upstream 2.5.0's sibling progress, so new sibling text receives its own duration and delay.
- Code-block background arbitrary-value classes have balanced parentheses instead of the malformed class strings published by upstream 2.5.0.
- Built-in icon size props set SVG width and height; upstream 2.5.0 leaves the size attribute inert and renders the default 16x16 dimensions.

SSR / hydration: Static and streaming Markdown, custom components, code blocks, math markup, and hydration are covered by dedicated server and hydration tests. Browser-only controls and deferred Mermaid rendering remain inert until mounted.

Scope/evidence last checked: 2026-08-02.

- The HAST adapter delegates to Octane createElement while preserving hast-util-to-jsx-runtime key, component, node, and Fragment semantics.
- Upstream source provenance and the Apache-2.0 license are retained in UPSTREAM.md and LICENSE.
- Bounded React parity inventories the pinned repository suite, runs eight exact same-fixture differential scenarios under the react-parity job, and keeps native-event plus consolidated-plugin contracts as ordinary package tests. Structured differential divergences cover independent animation timing and controls-surface class/icon corrections.

## @octanejs/styled-components

[`packages/styled-components`](../packages/styled-components) `0.1.42` — ports `styled-components@6.4.3`. Status data: [`packages/styled-components/status.json`](../packages/styled-components/status.json).

Full v6 web API, ported from the upstream 6.4.3 sources: `styled` with every HTML/SVG tag shortcut, `.attrs`/`.withConfig` chaining, `css`, `keyframes`, `createGlobalStyle`, `createTheme`, `ThemeProvider`/`ThemeContext`/`ThemeConsumer`/`useTheme`/`withTheme`, `StyleSheetManager`/`StyleSheetContext`/`StyleSheetConsumer` (targets, namespaces, vendor prefixing, stylis plugins, `shouldForwardProp`), `ServerStyleSheet`, `isStyledComponent`, `version`, and `__PRIVATE__`. Component selectors, folding (`styled(Styled)`), transient `$` props, `as`/`forwardedAs`, and the grouped CSSOM sheet engine (with upstream `data-styled` rehydration) all behave as upstream. The React Native surface and the RSC-only `stylisPluginRSC` are not ported.

Known divergences:

- `ref` is a plain prop (octane has no `forwardRef`); it always attaches to the rendered element and is never subject to `shouldForwardProp` filtering.
- SSR is automatic: server-side inserts flow through octane's css channel, so `renderToString`/streaming return the styles as `<style data-octane="sc.<componentId>.<name>">` chunks in `RenderResult.css` with per-request isolation, and client boot adopts those chunks without duplicate injection. `ServerStyleSheet` ships as a working compat wrapper, but `interleaveWithNodeStream` throws — octane streaming already interleaves styles.
- `defaultProps` on a styled component is resolved by the factory at render time (octane call sites do not apply component `defaultProps`); folding via `styled(Styled)` deep-merges as upstream.
- Polymorphic `as`/`forwardedAs` typing is pragmatic: component targets infer props from their function signature, host tags use a permissive prop bag (octane has no `JSX.IntrinsicElements` map to introspect).
- The babel `css` prop transform is not supported.
- The dev-only dynamic-creation warning uses a per-displayName creation-count heuristic instead of upstream's React-dispatcher probe.
- Unnamed stylis plugins actually throw the documented error 15 (upstream 6.4.3 constructs the error but forgets to throw it).
- Interpolation-position styled components are recognized by an octane brand symbol rather than React's forward-ref `$$typeof` (octane styled components are plain functions).

SSR / hydration: Supported and tested: zero-config collection into `RenderResult.css` via octane's `injectStyle` channel (styled rules, keyframes, and globals, with content-derived immutable chunk ids that make streaming dedup sound), repeat-render and dynamic-global request isolation through a stateless server output backend, hydration adoption of server chunks (removed after adoption, no duplicate rules), and the `ServerStyleSheet` compat surface.

Scope/evidence last checked: 2026-08-02.

- Bounded React parity records the pinned repository runtime and type suites as present, runs six exact same-fixture differential scenarios under the react-parity job, and keeps factory/SSR/distribution/type-contract adaptations as ordinary package tests until pristine and one-for-one adapted lanes land.

## @octanejs/stylex

[`packages/stylex`](../packages/stylex) `0.1.49` — ports `@stylexjs/stylex@0.19.0`. Status data: [`packages/stylex/status.json`](../packages/stylex/status.json).

Full compile-time integration: re-exports the StyleX runtime API (`create`, `props`, `attrs`, `keyframes`, `defineVars`, `createTheme`) and registers as an import source; the `/vite` plugin runs the StyleX compiler over octane's compiled output and emits one static atomic stylesheet (`virtual:stylex.css`) with zero StyleX runtime in the bundle.

Known divergences:

- The `sx` JSX prop is not supported — spread `{...stylex.props(...)}` instead.
- The compiler runs over octane's compiled output rather than source, so StyleX's own PostCSS source-scanning setup is unused.

SSR / hydration: Works under SSR — the stylesheet is static and server markup carries the final class names; no dedicated SSR test files.

Scope/evidence last checked: 2026-07-09.

## @octanejs/swr

[`packages/swr`](../packages/swr) `0.0.16` — ports `swr@2.4.2`. Status data: [`packages/swr/status.json`](../packages/swr/status.json).

Mapped port of SWR 2.4.2: root useSWR/config/cache/mutate/preload, infinite, immutable, remote mutation, subscription, _internal, and the published react-server condition branches. The harness executes the pinned pristine React suite plus selected adapted Octane cases, repo-authored adapted type probes, and differential/export oracles. Provenance remains recorded-unverified until the exhaustive adapted crosswalk lands.

Known divergences:

- The binding exposes window.__SWR_DEVTOOLS_OCTANE__ and deliberately does not claim React's window.__SWR_DEVTOOLS_REACT__ global; React-only devtools that require that identity are incompatible.
- SWR 2.4.2 behavior is pinned exactly, including the absence of automatic request abortion on consumer unmount.

SSR / hydration: Supported and tested: browser-global-free server condition exports, deterministic fallback output, Octane streaming/hydration architecture gates, and pinned fallback/preload revalidation semantics.

Scope/evidence last checked: .

## @octanejs/syntax-highlighter

[`packages/syntax-highlighter`](../packages/syntax-highlighter) `0.0.16` — ports `react-syntax-highlighter@16.1.1`. Status data: [`packages/syntax-highlighter/status.json`](../packages/syntax-highlighter/status.json).

Complete against react-syntax-highlighter 16.1.1: default, Light, Prism, async and async-light components; static registration and language lists; custom renderers and tags; all pinned Highlight.js and Prism languages and styles; and all ESM/CJS deep-import aliases.

Known divergences:

- PreTag and CodeTag accept native tag names or Octane function components. React class components require a function adapter because React instance identity is renderer-owned.
- In .tsrx, source text must use the explicit children={source} prop. Nested component children compile to an opaque renderer block that a text-inspecting component cannot unwrap.

SSR / hydration: Synchronous variants emit highlighted server HTML without DOM globals. Async variants emit the same deterministic plain-code fallback and hydrate by adopting the existing pre, code, and token nodes before live updates.

Scope/evidence last checked: 2026-08-03.

See also: [`packages/syntax-highlighter/README.md`](../packages/syntax-highlighter/README.md), [`packages/syntax-highlighter/UPSTREAM.md`](../packages/syntax-highlighter/UPSTREAM.md)

## @octanejs/tanstack-ai

[`packages/tanstack-ai`](../packages/tanstack-ai) `0.0.44` — ports `@tanstack/ai-react@0.17.0`. Status data: [`packages/tanstack-ai/status.json`](../packages/tanstack-ai/status.json).

Ports the @tanstack/ai-react 0.17.0 hook surface (useChat, useRealtimeChat, useGeneration, useGenerateImage/Audio/Speech/Video, useTranscription, useSummarize, useAudioRecorder, useMcpAppBridge) while reusing @tanstack/ai 0.41.0 and @tanstack/ai-client 0.21.0 unchanged and mirroring all 30 @tanstack/ai-client convenience re-exports from the upstream index.

Known divergences:

- The `./mcp-apps` subpath and its `MCPAppResource` component are not ported: they render `AppRenderer` from the React-only `@mcp-ui/client`, which has no Octane equivalent. The framework-agnostic `useMcpAppBridge` hook is ported and available on the main entry.
- Octane uses native events: text/file/recorder inputs drive updates via `onInput`; there is no synthetic `onChange` layer.
- Octane has no StrictMode double-invoke and always provides `useId`, so no random-id fallback is needed.
- The TanStack AI Devtools bridge is tagged `framework: 'octane'` (upstream `@tanstack/ai-react` sends `'react'`), so the devtools identify this binding correctly.
- Realtime reconnects and token refreshes use the latest `getToken` and adapter supplied to the hook; upstream @tanstack/ai-react 0.17.0 captures the first render's callbacks.
- The declared realtime `onStatusChange` callback is invoked alongside the hook's state update; upstream @tanstack/ai-react 0.17.0 currently drops the external callback.
- Changing `useChat`'s connection or fetcher updates the active ChatClient in place and preserves conversation state; upstream @tanstack/ai-react 0.17.0 captures the initial transport.
- One upstream `useChat` test case ("auto-resume on mount / when the browser comes back online") is omitted: it targets `ChatClient.prototype.maybeAutoResume`, an API absent from the pinned (and latest published) `@tanstack/ai-client@0.21.0` and never invoked by `useChat`. It is untestable in this binding until that dependency ships the method.

SSR / hydration: Supported and tested: useChat renders its initial message snapshot through octane/server without a DOM.

Scope/evidence last checked: 2026-08-09.

- Hook modules are authored as TSRX with checked declaration companions; no ported hook renders JSX or references React types in its public signature.
- 145 tanstack-ai runtime tests plus 1 SSR test pass, reusing the upstream behavioral tests with no skipped, todo, or expected-failure cases.
- Differential coverage runs one exact shared chat fixture through this binding and real @tanstack/ai-react@0.17.0, comparing streamed output after each step; output is byte-equal.
- The bounded React parity manifest pins the official release tag and commit, inventories the upstream repository suite, and executes the required differential lane. Adaptation, SSR, and type contracts remain ordinary package evidence. Provenance remains recorded-unverified until pristine / adapted upstream lanes are registered.

## @octanejs/tanstack-db

[`packages/tanstack-db`](../packages/tanstack-db) `0.0.13` — ports `@tanstack/db@0.7.0`. Status data: [`packages/tanstack-db/status.json`](../packages/tanstack-db/status.json).

Re-exports `@tanstack/db@0.7.0` unchanged and ports the React live-query binding surface of `@tanstack/react-db@0.1.96` (`useLiveQuery`, `useLiveInfiniteQuery`, `useLiveSuspenseQuery`, `useLiveQueryEffect`, `usePacedMutations`) onto Octane hooks. `useLiveQuery`/`useLiveSuspenseQuery` are driven by db's shared `createLiveQueryObserver`; `useLiveInfiniteQuery` by the coordinated `createLiveQueryWindowController`.

Known divergences:

- `useLiveSuspenseQuery` consumes the preload promise through Octane's `use(thenable)` instead of throwing it, although Octane supports both forms. Because Octane keys `use()` by dynamic call-order index (not compiler slot), this binding calls `use()` unconditionally — exactly once per render, handing it an already-resolved thenable on the ready/stale paths — so a sibling `use()` or a second `useLiveSuspenseQuery` in the same component keeps a stable thenable index. Observable behavior (fallback then data) matches.
- `useLiveQuery`/`useLiveInfiniteQuery` subscribe wrappers defer an initial `onStoreChange` to a microtask so an already-ready collection (or a synchronous subscribe-time window growth) is reflected in the first committed snapshot. Octane's `useSyncExternalStore` re-checks the store snapshot before, not after, the subscribe call (React re-checks after), so this nudge stands in for React's post-subscribe reconciliation. Pinned by the `eager-onstorechange` test.
- `useLiveInfiniteQuery` rejects a pre-created collection that lacks an `orderBy` synchronously during render (detected via `getWindow()` returning a window object), so the error is observable to the caller, rather than letting `setWindow()` throw later inside a passive subscribe effect that Octane swallows.
- StrictMode double-invocation is not applicable: Octane has no development double-invoke of component setup/cleanup.

SSR / hydration: Not yet exercised: no server-render tests are included for the live-query hooks.

Scope/evidence last checked: 2026-08-13.

- Adapter source is vendored byte-exact under `upstream/react-db/src`, pinned by `audit/upstream.lock.json` (each file verifies offline against its upstream git blob sha; `.prettierignore`d, excluded from published `files`) so an upstream bump is a reviewable diff. See `UPSTREAM.md` for the pin, export crosswalk, and upstream-suite disposition.
- Bounded evidence: the shared `@tanstack/db` live-query conformance suite runs against the Octane adapter driver with zero known gaps and zero universal expected-fails (after the 0.7.0 order-only-move fix, db #1669), plus local coverage for suspense (incl. an async fallback), coordinated infinite-query windows, effect hooks, paced mutations, and eager onStoreChange; type tests cover the `useLiveQuery` overload families.
- Open toward full `verified`: no executable React-differential lane and no one-for-one adaptation of the upstream `@tanstack/react-db` runtime/type suites (which the npm artifact does not ship) yet; consistent with the recorded-unverified posture of the other bindings.
- The `@tanstack/db` expression evaluator and comparison utilities are vendored under `tests/db-fixtures/db-internal/` (pinned to 0.7.0, logic unchanged from 0.6.17) so the infinite-query tests can interpret the where/cursor IR db generates internally; these are test-only and not shipped.

## @octanejs/tanstack-devtools

[`packages/tanstack-devtools`](../packages/tanstack-devtools) `0.0.44` — ports `@tanstack/react-devtools@0.10.7`. Status data: [`packages/tanstack-devtools/status.json`](../packages/tanstack-devtools/status.json).

Surface-present for the pinned adapter's runtime entrypoint, with additive framework-neutral core re-exports. A same-fixture differential covers mount, config synchronization, plugin/title/trigger portals, and teardown. Upstream has no runtime suite; its test:types source compile is recorded as present type evidence with required pristine/adapted type lanes. Provenance is verified; core-version drift and Octane-specific type names/core re-exports stay as explicit divergences.

Known divergences:

- Public adapter types use Octane-prefixed names: `TanStackDevtoolsOctanePlugin` and `TanStackDevtoolsOctaneInit` (upstream: `TanStackDevtoolsReactPlugin` / `TanStackDevtoolsReactInit`).
- `ref` is the normal React-19-style ref prop and events are native (no synthetic layer), consistent with the rest of the Octane bindings.
- The main entry also re-exports the framework-agnostic `@tanstack/devtools` core surface (`TanStackDevtoolsCore`, container-id constants, and plugin authoring types) so consumers do not need a direct dependency on `@tanstack/devtools` for typing plugins.
- Plugin/title/trigger content is rendered through a tiny `DevtoolsPortal` component (a createPortal VALUE), because Octane renders a returned portal at any position rather than only as a direct JSX child.

SSR / hydration: Supported and tested: the component renders its absolutely-positioned anchor element through octane/server without a DOM; the core is constructed but never mounted server-side (mount is a client-only effect).

Scope/evidence last checked: 2026-08-03.

- The component module is authored as TSRX with a checked declaration companion (`devtools.tsrx.d.ts`).
- Upstream `@tanstack/react-devtools` ships no runtime test suite (`test:lib` allows no tests). Runtime evidence is a repo-authored same-fixture differential plus package/SSR coverage.
- Upstream `test:types` compiles the complete adapter source; required pristine (tsc + React types) and adapted (tsrx-tsc) type lanes execute that evidence one-for-one.

## @octanejs/tanstack-form

[`packages/tanstack-form`](../packages/tanstack-form) `0.0.44` — ports `@tanstack/react-form@1.33.2`. Status data: [`packages/tanstack-form/status.json`](../packages/tanstack-form/status.json).

Ports the complete @tanstack/react-form 1.33.2 adapter surface (`useForm`, `useField`, form and field groups, hook contexts and component composition) while re-exporting @tanstack/form-core 1.33.2 unchanged and using @octanejs/tanstack-store for subscriptions.

Known divergences:

- Octane uses native events: text controls call `field.handleChange` from `onInput`; TanStack Form's `onChange` validator and listener option names remain unchanged.
- Octane has no StrictMode double-invoke and always provides `useId`, so the adapter omits StrictMode scenarios and the legacy random-UUID fallback.
- Component registration accepts Octane function components; class components are not supported by Octane.

SSR / hydration: Supported and tested: fields and form subscriptions render their initial snapshots through octane/server without a DOM.

Scope/evidence last checked: 2026-08-09.

- Renderer-bearing adapter modules are authored as TSRX and ship checked declaration emits with inline renderer aliases, Octane-prefixed public adapter types, and source-owned recursive contracts.
- The complete package suite has 87 executable behavioral tests with no skipped, todo, or expected-failure cases; upstream compile-time tests cover hook, field, group, and component-composition inference.
- Differential coverage compiles one shared form through this adapter and real @tanstack/react-form@1.33.2, comparing values, validation, array mutations, and reset output after every interaction.
- The bounded React parity manifest pins the official release tag and commit, classifies every local runtime test, and executes required adapted-upstream and differential lanes. The adapted-types lane is optional package type-contract evidence only. Provenance remains recorded-unverified because pristine repository-suite lanes are still open follow-up work.

## @octanejs/tanstack-hotkeys

[`packages/tanstack-hotkeys`](../packages/tanstack-hotkeys) `0.0.39` — ports `@tanstack/react-hotkeys@0.10.0`. Status data: [`packages/tanstack-hotkeys/status.json`](../packages/tanstack-hotkeys/status.json).

Surface-present for all 22 `@tanstack/react-hotkeys@0.10.0` adapter exports plus the byte-identical `@tanstack/hotkeys@0.8.0` core re-export. The pinned 41-case upstream runtime suite runs pristine and adapted as verified vitest-full lanes; type suites compile upstream source with tsc and the Octane surface with tsrx-tsc.

Known divergences:

- `target` refs are plain `{ current }` objects (Octane has no `React.RefObject`); the `isRef` guard and behavior are otherwise identical.

SSR / hydration: Supported: every hook registers listeners in effects and resolves `document` lazily, so server rendering produces no registrations and no browser access (matching upstream's `typeof document` guards).

Scope/evidence last checked: 2026-08-03.

- Created for the tanstack-com benchmark's octane flavor (Phase 2c); exercised by that app's ApplicationStarter hotkeys surface.
- Upstream `React`-prefixed type names (`ReactHotkeyRecorder`, `ReactHotkeySequenceRecorder`) are kept verbatim so ports only change the import specifier.

## @octanejs/tanstack-pacer

[`packages/tanstack-pacer`](../packages/tanstack-pacer) `0.0.39` — ports `@tanstack/react-pacer@0.22.1`. Status data: [`packages/tanstack-pacer/status.json`](../packages/tanstack-pacer/status.json).

Surface-present for all 15 runtime/type entrypoints from `@tanstack/react-pacer@0.22.1`, plus the byte-identical `@tanstack/pacer@0.21.1` core re-export. Repo-authored adapted-octane and differential lanes cover a representative debounce/throttle/batching/teardown lifecycle; upstream has no runtime suite and insufficient type evidence, so provenance remains `recorded-unverified` with nearly every export still `surface-present-unverified`.

Known divergences:

- Upstream types spelled with `React.Dispatch<React.SetStateAction<T>>` use structurally identical local aliases (Octane state setters have the same shape).

SSR / hydration: Supported: instances are created lazily in `useState` initializers, cleanup runs in effects, and no browser globals are touched during render, so server rendering produces the initial (non-pending) state exactly like upstream.

Scope/evidence last checked: 2026-08-03.

- Created for the tanstack-com benchmark's octane flavor (Phase 2c); `useDebouncedValue` and `useAsyncDebouncer` are exercised by that app's application-builder and DeployDialog surfaces.
- Upstream `React`-prefixed type names (`ReactDebouncer`, `ReactThrottler`, ...) are kept verbatim so ports only change the import specifier.

## @octanejs/tanstack-query

[`packages/tanstack-query`](../packages/tanstack-query) `0.1.49` — ports `@tanstack/react-query@5.101.3`. Status data: [`packages/tanstack-query/status.json`](../packages/tanstack-query/status.json).

Complete: 58/58 runtime exports plus the full TypeScript surface; the export surface is byte-identical to upstream in both directions (locked by test), and `@tanstack/query-core` is re-exported verbatim.

Known divergences:

- Suspense integrates via octane's `use(thenable)` rather than throwing a promise (observable behavior matches).

SSR / hydration: `HydrationBoundary` is fully ported (including streaming `promise`/`dehydratedAt` re-hydration), and initial query data is covered by a DOM-free Octane server-render test; dedicated streaming server entries remain open.

Scope/evidence last checked: 2026-08-02.

See also: [`docs/tanstack-parity-audit.md`](tanstack-parity-audit.md)

## @octanejs/tanstack-router

[`packages/tanstack-router`](../packages/tanstack-router) `0.1.49` — ports `@tanstack/react-router@1.170.18`. Status data: [`packages/tanstack-router/status.json`](../packages/tanstack-router/status.json).

Octane's TanStack Router binding: typed route factories and hooks, the full Match pipeline and lifecycle, file routes with TSRX-aware generator integration, full Link navigation/preloading/masking behavior, blocking, Await/deferred hydration, scroll restoration, lazy routes, not-found handling, document/head assets, and client/server SSR entries.

Known divergences:

- Refs are props — `createLink`'s `forwardRef` becomes a `ref` prop.
- Link callbacks receive native DOM events rather than React synthetic events.
- Router devtools are distributed separately.

SSR / hydration: Full-document buffered and readable-stream SSR through `./ssr/server`, client hydration through `./ssr/client`, route-owned head/scripts, CSP nonce propagation, per-route SSR modes, and native Octane stream injection; covered by Octane-only framework-contract tests in ordinary shards (not a React SSR oracle).

Scope/evidence last checked: 2026-08-02.

- The framework-neutral runtime dependency is `@tanstack/router-core@1.171.15`.
- The TSRX-aware generator plugin is exported from `@octanejs/tanstack-router/generator-plugin` for `@octanejs/tanstack-start`'s package-owned generator.
- React parity provenance is still recorded-unverified until pristine-upstream and one-for-one adapted suite lanes are fetched from the pinned tag; differential harness evidence is landed separately.

See also: [`docs/tanstack-parity-audit.md`](tanstack-parity-audit.md)

## @octanejs/tanstack-router-ssr-query

[`packages/tanstack-router-ssr-query`](../packages/tanstack-router-ssr-query) `0.0.39` — ports `@tanstack/react-router-ssr-query@1.167.1`. Status data: [`packages/tanstack-router-ssr-query/status.json`](../packages/tanstack-router-ssr-query/status.json).

Surface-present for the pinned adapter's only runtime entrypoint (`Options` and `setupRouterSsrQueryIntegration`). The metadata-only `./package.json` subpath is intentionally omitted. A representative differential covers provider-backed SSR, existing-wrapper preservation, setup mutations, and the wrapping control; upstream has no runtime suite, and type evidence is the upstream source compile plus the adapted Octane compile, so verification remains recorded-unverified.

SSR / hydration: Supported — this package IS the SSR integration (dehydrates query state into the router stream and wraps the app in the query provider).

Scope/evidence last checked: 2026-08-03.

- Created for the tanstack-com benchmark's octane flavor (Phase 2c); exercised end-to-end by that app's SSR + hydration.

## @octanejs/tanstack-store

[`packages/tanstack-store`](../packages/tanstack-store) `0.0.44` — ports `@tanstack/react-store@0.11.0`. Status data: [`packages/tanstack-store/status.json`](../packages/tanstack-store/status.json).

Re-exports `@tanstack/store@0.11.0` unchanged and implements the stable React binding surface (`useSelector`, `useAtom`, `useCreateAtom`, `useCreateStore`, `createStoreContext`, and deprecated `useStore`) on Octane hooks.

Known divergences:

- The upstream experimental `_useStore` hook is intentionally omitted; use `useSelector` with `store.actions` or `store.setState` instead.

SSR / hydration: Supported: selectors, writable atoms, and store context read their current snapshots during server rendering; the adapter has no browser-only initialization.

Scope/evidence last checked: 2026-08-09.

- Adapted upstream suite runs the pinned repository index.test.tsx one-for-one against the Octane binding, with OCTANE DIVERGENCE cases for the omitted experimental _useStore export.
- Differential coverage runs one shared fixture through this adapter and real @tanstack/react-store@0.11.0, covering selectors, comparator bailouts, atom writes, component-created atoms and stores, actions, and context.
- Behavioral conformance coverage additionally checks source replacement, independent call sites, nested provider resolution, subscription cleanup, deprecated useStore, and server output; type tests cover all overload families.

## @octanejs/tanstack-table

[`packages/tanstack-table`](../packages/tanstack-table) `0.1.47` — ports `@tanstack/react-table@9.0.0-beta.58`. Status data: [`packages/tanstack-table/status.json`](../packages/tanstack-table/status.json).

Complete port of the v9 adapter: the framework-agnostic `@tanstack/table-core` (constructTable + every tree-shakeable feature and row model) is reused verbatim, and the adapter — `useTable`, `Subscribe`, `flexRender`/`FlexRender`, `createTableHook`, `createTableHookContexts` — is transcribed onto octane hooks. Table state lives in TanStack Store atoms via the `coreReactivityFeature` bindings, and `useSelector` drives re-renders from the selected slice. Every store primitive (hooks, `createAtom`, `batch`, `shallow`, and the atom/store types) is imported from @octanejs/tanstack-store, which re-exports all of @tanstack/store — the binding takes no direct dependency on the store core, so there is only one path to it and atom identity cannot be split across duplicate copies.

Known divergences:

- `flexRender`'s class-component and `react.memo`/`forwardRef` exotic-component branches are dropped — octane has no class components or forwardRef, and octane's `memo()` returns a plain function, so `typeof === 'function'` covers every component.
- Upstream's `useLegacyTable` entry (the v8-compat `get*RowModel` shim, its marker factories, and the `Legacy*` type aliases) is NOT ported. It exists to migrate existing React v8 codebases; octane has none, so octane code targets the v9 `useTable` API directly.

SSR / hydration: No SSR-specific surface; table-core is pure computation.

Scope/evidence last checked: 2026-08-02.

- `useTable` and `useAppTable` end in an OPTIONAL `selector` parameter, so both split the compiler-injected trailing hook slot off their rest args (see src/internal.ts) — otherwise `useTable(options)` would read the slot symbol as the selector.
- Column sizing/resizing and pinning/ordering drag interactions are untested-by-interaction (the differential rig has no mousemove driver); their state APIs are table-core computation reused verbatim.

## @octanejs/tanstack-virtual

[`packages/tanstack-virtual`](../packages/tanstack-virtual) `0.1.47` — ports `@tanstack/react-virtual@3.14.5`. Status data: [`packages/tanstack-virtual/status.json`](../packages/tanstack-virtual/status.json).

Complete 1:1 port: the framework-agnostic `@tanstack/virtual-core` (Virtualizer + observers + windowing math) is reused verbatim; the React adapter (`useVirtualizer`, `useWindowVirtualizer`, incl. `useFlushSync` and the experimental `directDomUpdates` surface) is transcribed onto octane hooks, preserving upstream's force-update + flushSync-on-sync-scroll wiring and layout-effect lifecycle.

Known divergences:

- octane's `flushSync` called while a flush is already on the stack degrades to a plain call drained by the ambient flush (re-entrancy guard) — sync scroll notifies dispatched from inside a discrete-event flush land at that flush's boundary instead of nested; consumer-invisible, pinned by a conformance test.

SSR / hydration: SSR-safe: `useIsomorphicLayoutEffect` degrades to `useEffect` without `document`; the first paint windows from `initialRect`/`initialOffset` exactly as upstream. No dedicated SSR tests.

Scope/evidence last checked: 2026-08-02.

- Smooth scrolling (`behavior: 'smooth'`) and the default ResizeObserver measurement path are untestable in jsdom (no layout); their code is verbatim upstream/virtual-core. Tests drive rects via the public `initialRect`/`observeElementRect`/`measureElement` options, mirroring upstream's own harness.

## @octanejs/tauri

[`packages/tauri`](../packages/tauri) `0.0.33` — ports `@tauri-apps/api@2.11.1`. Status data: [`packages/tauri/status.json`](../packages/tauri/status.json).

Octane hooks over the framework-neutral Tauri IPC surface: useInvoke (suspending command), useInvokeState (pending/success/error with refetch), and useTauriEvent (event subscription with lifecycle-safe teardown). The rest of @tauri-apps/api — window, webview, menu, tray, path, dpi, image, and the plugin packages — is already framework-neutral and is imported directly rather than re-exported here.

Known divergences:

- There is no React binding upstream; @tauri-apps/api ships promise and callback APIs, so this package is a new hook layer rather than a port.
- Hook call-site slots are forwarded through Octane's compiler binding ABI.
- useInvoke integrates with Octane's use() rather than React's use() or a thrown-promise implementation detail.
- Command arguments given as a plain record are compared by value for the default refetch key; array and binary payloads are compared by identity. The command name is always part of the key, so explicit deps extend it rather than replacing it.
- useInvokeState returns to pending on refetch and does not implement stale-while-revalidate; a caching query layer belongs to @octanejs/tanstack-query.
- A failed useTauriEvent subscription throws by default so a missing capability is loud, and is then recovered by the enclosing boundary's reset(); passing onError reports it instead, keeping the component mounted so a changed event or enabled flag retries.
- Channel-based streaming has no hook yet: construct Channel directly and keep it stable with useMemo.

SSR / hydration: Server rendering performs no IPC. useInvokeState renders its pending state and issues the command on the client after hydration; useTauriEvent subscribes only on the client. useInvoke is client-oriented: without a Tauri host it rejects with TauriUnavailableError so the boundary reports rather than hangs.

Scope/evidence last checked: 2026-07-27.

## @octanejs/testing-library

[`packages/testing-library`](../packages/testing-library) `0.1.47` — ports `@testing-library/react@16.3.2`. Status data: [`packages/testing-library/status.json`](../packages/testing-library/status.json).

`render`/`rerender`/`cleanup`/`renderHook` + `act` over the verbatim `@testing-library/dom` (every query, `screen`, `within`, `waitFor`, `fireEvent`, `prettyDOM`, `configure`), with commit timing wired to octane's scheduler via the dom-library's `eventWrapper`/`asyncWrapper` config.

Known divergences:

- `fireEvent` dispatches real native events — no React remappings (`fireEvent.change` fires an explicit native `change`, not text typing or checkbox click activation) and no enter/leave/focus double-dispatch.
- Not ported: the `ReactStrictMode` wrapper, `legacyRoot`, and the `onCaughtError`/`onRecoverableError` options.

SSR / hydration: `hydrate: true` adopts octane SSR output via `hydrateRoot`.

Scope/evidence last checked: 2026-08-02.

- The reused framework-agnostic core is `@testing-library/dom@10.4.1`; the ported layer is audited against React Testing Library 16.3.2.
- `@testing-library/user-event` drives native text input/commit and checkbox click → input → change sequences without an Octane adapter.

See also: [`docs/testing-library-migration-plan.md`](testing-library-migration-plan.md)

## @octanejs/textarea-autosize

[`packages/textarea-autosize`](../packages/textarea-autosize) `0.0.16` — ports `react-textarea-autosize@8.5.9`. Status data: [`packages/textarea-autosize/status.json`](../packages/textarea-autosize/status.json).

Complete against the published react-textarea-autosize 8.5.9 default component and named TextareaAutosizeProps and TextareaHeightChangeMeta types, including native textarea props, row clamps, measurement caching, height callbacks, refs, environmental listeners, form reset, SSR, and browser sizing.

Known divergences:

- onChange and onChangeCapture receive the native InputEvent rather than a React SyntheticEvent; target and currentTarget are the textarea during dispatch.
- Programmatic value assignment does not synthesize a public change callback; dispatch a native input event when that behavior is required.

SSR / hydration: Server rendering emits one plain textarea without accessing browser measurement globals; Octane hydration adopts the existing host and preserves pre-hydration uncontrolled edits.

Scope/evidence last checked: 2026-08-03.

See also: [`packages/textarea-autosize/README.md`](../packages/textarea-autosize/README.md), [`packages/textarea-autosize/UPSTREAM.md`](../packages/textarea-autosize/UPSTREAM.md)

## @octanejs/thinking-orbs

[`packages/thinking-orbs`](../packages/thinking-orbs) `0.1.0` — ports `thinking-orbs@0.2.0`. Status data: [`packages/thinking-orbs/status.json`](../packages/thinking-orbs/status.json).

ThinkingOrb component, resolvePreset, MODE_DRAWS, and public types — nine animation states, two tuned size presets, auto/dark/light theme, reduced-motion static frame.

SSR / hydration: Canvas is client-only; server render emits the canvas element without animation.

Scope/evidence last checked: 2026-08-07.

- Below the standard 10M npm downloads admission cutoff; explicit portfolio approval required.

## @octanejs/three

[`packages/three`](../packages/three) `0.1.43` — ports `@react-three/fiber@9.6.1 (2a528745)`. Status data: [`packages/three/status.json`](../packages/three/status.json).

Technical-preview Milestones 0–10 surface: renderer configuration and the DOM Canvas boundary, compiler ABI and renderer-local Three intrinsic types, catalogue and both extend forms, primitive/args construction, Three prop application, attachment, ordered placement/recreation, retained visibility, lifecycle/ref delivery, ownership-aware disposal, promise-returning HTMLCanvasElement and OffscreenCanvas roots, Octane act/flushSync scheduling, callback-aware unmountComponentAtNode, callable root state, scene/camera/raycaster and resize/DPR/viewport configuration, shadows/colors, one shared frame loop, controlled WebXR loop handoff, context-restore invalidation, compatible/reconstructing HMR, global effects, useStore/useThree/useFrame/useGraph and managed-instance helpers, the ray/pointer event system with DOM sources and custom managers, a keyed useLoader cache with preload/clear and GLTF graph augmentation, retained Suspense/Activity behavior, client Three-to-DOM pending/error projection, same-renderer createPortal targets with state/event enclaves and physical Three event bubbling, client-only Canvas shell streaming and production Vite/Rsbuild hydration adoption with the matching raw Rspack graph split, the explicit-target low-level DOMRegion boundary, a deterministic testing harness, an asynchronously acknowledged structured-clone transport proof, a checked public API/subpath matrix, Three r156/current compatibility lanes, a packed external consumer, real WebGL failure/recovery coverage, and semantic-checksummed renderer and shipped-size benchmarks.

Known divergences:

- `octane-renderer-ownership`: Octane owns execution, hooks, scheduling, Suspense, refs, and effects instead of React Reconciler.
- `component-props-root-api`: Programmatic roots render an Octane component plus props rather than a React element descriptor.
- `order-based-callable-selector`: Dynamic callable store selectors remain order-based outside compiler-visible hook calls.
- `build-graph-named-only`: buildGraph publishes named mesh and material entries only.
- `pierced-prop-reset-target`: Removed pierced props reset the original nested target rather than a root leaf key.
- `reconstructed-intersection-rewrite`: Reconstruction rewrites nested captured and hovered intersections to the replacement.
- `hidden-activity-raycast`: Hidden retained Activity subtrees are excluded from recursive raycasts.
- `root-scoped-portal-targets`: Portal target handles are root-scoped and cross-root placement is rejected before mutation.
- `synchronous-root-teardown`: Root teardown and callback delivery are synchronous instead of delayed by 500ms.
- `octane-dom-region`: DOMRegion is an Octane-specific explicit-target Three-to-DOM primitive.

SSR / hydration: Three scene modules are client-only and Canvas.children is omitted from the server graph. Canvas streams its DOM shell and native fallback, then production Vite and Rsbuild hydration adopt those nodes and create one Three root on the client; raw Rspack proves the equivalent client/server graph split without claiming an application SSR lifecycle. DOMRegion and its reverse-DOM content remain inside the omitted client-only Three scene.

Scope/evidence last checked: 2026-07-17.

- The exact behavioral/differential oracle remains three@0.172.0; separate minimum-r156 and current-release lanes validate the advertised three >=0.156.0 peer range with an optional @types/three pair from the matching Three release line.
- The checked-in crosswalk classifies 90 upstream public exports and 157 executable upstream tests with zero unclassified or missing evidence paths; the public export/subpath type matrix and packed external consumer validate the published surface.
- Milestone 9 proves asynchronous acknowledgement, cloned values and handles, rejection/fault semantics, teardown, event scopes, and stale message rejection through a real MessageChannel without sharing a host driver or function props.
- Milestone 10 adds real WebGL creation-failure and context-loss/restoration evidence plus semantic-checksummed Octane/R3F/plain-Three renderer and bundle-size baselines with committed ratio guards; the 100-sample production stability run measures 1,000-mesh mount at 0.98x and retained updates at 1.03x R3F after compiler-leaf and direct-host transaction specialization.
- Milestone 8 proves the low-level DOMRegion reverse boundary without claiming Drei Html or WebXR DOM Overlay compatibility.
- React Native/Expo, R3F 10 WebGPU/TSL APIs, and Drei are outside this package's current compatibility target.

See also: [`docs/three-port-plan.md`](three-port-plan.md), [`packages/three/UPSTREAM.md`](../packages/three/UPSTREAM.md)

## @octanejs/tiptap

[`packages/tiptap`](../packages/tiptap) `0.0.44` — ports `@tiptap/react@3.28.0`. Status data: [`packages/tiptap/status.json`](../packages/tiptap/status.json).

Complete @tiptap/react 3.28.0 adapter surface across the root and ./menus entries: @tiptap/core re-exports, editor hooks and contexts, the EditorContent portal bridge, compound Tiptap API, ReactRenderer, custom NodeView/MarkView renderers and helpers, BubbleMenu, and FloatingMenu.

Known divergences:

- Subscriptions use Octane's native useSyncExternalStore implementation, so the published binding does not depend on React or use-sync-external-store.
- EditorConsumer is a render-prop compatibility component because Octane contexts do not expose React's .Consumer property.
- Renderer components are Octane component bodies and refs are ordinary props; the React-prefixed public names are retained for TipTap source compatibility without a React dependency.
- NodeViewWrapper consumes its as prop after selecting the host tag; @tiptap/react 3.28.0 also forwards that prop as an invalid DOM attribute.
- BubbleMenu and FloatingMenu handlers receive native browser events rather than React synthetic events.
- ReactMarkView tears down its portal when ProseMirror destroys the mark view, closing a renderer leak present in @tiptap/react 3.28.0.

SSR / hydration: Covered across the complete surface: hooks use null server snapshots and suppress editor construction without a DOM, static NodeView/MarkView helpers render without a DOM renderer, detached menu targets are client-only, and hydration adopts deferred server shells before mounting live custom views and menus.

Scope/evidence last checked: 2026-08-02.

- Pinned to the @tiptap/react, @tiptap/core, and @tiptap/pm 3.28.0 release family.
- EditorContent owns one external-store portal registry so custom views preserve context, event ownership, and lifecycle beneath the editor host.
- Package-boundary tests lock the root and ./menus runtime exports plus their client directives to @tiptap/react 3.28.0.
- Behavioral tests use real TipTap editors for lifecycle, custom views, and menu plugins; shared-fixture differential tests compare editor and custom-view behavior with @tiptap/react.
- A real Chromium harness covers caret-preserving input, selection, NodeView dragging, and BubbleMenu/FloatingMenu visibility and positioning.

## @octanejs/to-print

[`packages/to-print`](../packages/to-print) `0.0.6` — ports `react-to-print@3.3.0`. Status data: [`packages/to-print/status.json`](../packages/to-print/status.json).

Public runtime surface at react-to-print 3.3.0: useReactToPrint and its option/content/fn types. Print pipeline utilities are ported unchanged aside from Octane ref and event types.

Known divergences:

- Consumers import from @octanejs/to-print instead of react-to-print.
- contentRef is a structural { current } ref object rather than React.RefObject.
- The print callback accepts a native Event or a content getter; React.UIEvent is not used.
- The plain TypeScript useReactToPrint hook forwards compiler-injected slots; a symbol in the options position is treated as empty options.

SSR / hydration: The hook is client-only: it constructs an iframe and calls window.print (or a custom print function). Calling it during SSR has no DOM target.

Scope/evidence last checked: 2026-08-20.

## @octanejs/transition-group

[`packages/transition-group`](../packages/transition-group) `0.0.16` — ports `react-transition-group@4.4.5`. Status data: [`packages/transition-group/status.json`](../packages/transition-group/status.json).

Transition, CSSTransition, TransitionGroup, SwitchTransition, ReplaceTransition, config, and their documented subpath exports.

Known divergences:

- Octane does not implement ReactDOM.findDOMNode; DOM-aware callbacks and CSSTransition require nodeRef.
- TransitionGroup collections must be supplied as inspectable descriptor values, normally with children={items.map(...)}; compiler-generated opaque children blocks cannot be enumerated.
- The complete pinned upstream suite runs unchanged as the pristine Jest oracle; adapted Octane lanes cover the public export surface, DOM transition behavior, switch and replacement sequencing, keyed groups, nodeRef semantics, mount-on-enter sequencing, and server rendering, and are not yet a one-for-one port of every upstream case.

SSR / hydration: Transition state and wrapper markup render on the server; DOM class mutation begins only after client mount and requires nodeRef.

Scope/evidence last checked: 2026-08-09.

## @octanejs/usehooks-ts

[`packages/usehooks-ts`](../packages/usehooks-ts) `0.0.31` — ports `usehooks-ts@3.1.1`. Status data: [`packages/usehooks-ts/status.json`](../packages/usehooks-ts/status.json).

First host-safe cohort: useBoolean, useCounter, useToggle, useMap, useStep, useDebounceCallback, useDebounceValue, useInterval, useTimeout, useIsMounted, and useUnmount.

Known divergences:

- Only the listed pure, timing, and lifecycle hooks are exported; browser storage/media hooks and DOM observer/direct-element hooks are deliberately absent.
- Public setter types are structurally equivalent to React Dispatch/SetStateAction without importing React types.

SSR / hydration: Supported for the listed cohort. Effects and timers do not run during server rendering; hydration activates lifecycle and timing work without requiring browser reads during render.

Scope/evidence last checked: 2026-08-02.

- Audited against the exact usehooks-ts 3.1.1 npm tarball (SHA-1 0bb7f38f36f8219ee4509cc5e944ae610fb97656).
- Storage/media are deferred: initializeWithValue:false exists upstream, but this first cohort does not claim deterministic Octane SSR/hydration parity without dedicated host-event evidence.
- Deferred browser/DOM exports: useClickAnyWhere, useCopyToClipboard, useCountdown, useDarkMode, useDocumentTitle, useEventCallback, useEventListener, useHover, useIntersectionObserver, useIsClient, useIsomorphicLayoutEffect, useLocalStorage, useMediaQuery, useOnClickOutside, useReadLocalStorage, useResizeObserver, useScreen, useScript, useScrollLock, useSessionStorage, useTernaryDarkMode, and useWindowSize.

## @octanejs/valtio

[`packages/valtio`](../packages/valtio) `0.1.33` — ports `valtio@2.3.2`. Status data: [`packages/valtio/status.json`](../packages/valtio/status.json).

The framework-agnostic `valtio/vanilla` core and `valtio/vanilla/utils` are re-exported verbatim; `useSnapshot` and the `useProxy` utility are ported to Octane.

Known divergences:

- React DevTools affected-path debug labels are omitted because Octane's `useDebugValue` is currently a no-op.

SSR / hydration: The server snapshot path uses `snapshot(proxyObject)`; no dedicated SSR rendering test is included yet.

Scope/evidence last checked: 2026-08-02.

## @octanejs/vaul

[`packages/vaul`](../packages/vaul) `0.0.16` — ports `vaul@1.1.2`. Status data: [`packages/vaul/status.json`](../packages/vaul/status.json).

Drawer, Root, NestedRoot, Portal, Overlay, Content, Handle, public props, and style.css.

Known divergences:

- React DOM prop types are preserved publicly and normalized at Octane render boundaries.

SSR / hydration: Closed drawer roots and triggers render without browser globals; portaled content remains absent while closed.

Scope/evidence last checked: 2026-08-02.

## @octanejs/visx

[`packages/visx`](../packages/visx) `0.1.44` — ports `@visx/visx@4.0.0 + master@485c035`. Status data: [`packages/visx/status.json`](../packages/visx/status.json).

Complete current Visx 4.x web runtime surface: the exact 35-namespace aggregate, all 40 feature entry points, and the eight public a11y/react, a11y/server, axis/react, scale/react, shape/react, theme/react, tooltip/floating, and voronoi/react subpaths. Released-only packages chord, delaunay, react-spring, sankey, and stats remain directly importable exactly as upstream specifies.

Known divergences:

- Interaction callbacks receive native DOM events through Octane's delegated event system instead of React synthetic events.
- All React class controllers and class-instance refs are replaced by native functional TSRX hooks; Brush intentionally omits upstream's legacy innerRef instance handle.
- Deterministic text metrics and annotation bounds, pure SplitLinePath SVG sampling, and collision-aware estimated wordcloud rectangles replace browser-only measurement/canvas paths so fixed-size output is identical during SSR and first hydration. Font-specific wrapping, browser-specific path length rounding, and pixel-exact d3-cloud packing can differ.
- The react-spring entry point uses a deterministic requestAnimationFrame numeric interpolator rather than spring-physics timing, and Zoom uses native wheel/pointer/touch listeners rather than @use-gesture/react at runtime. Their public Visx props and exports are retained; Zoom imports framework-neutral @use-gesture/core types only.
- Props upstream types as React.ReactNode are octane renderables (octane's OctaneNode = unknown): octane elements are nominal, so ReactNode-typed props would reject them. Render-prop signatures keep their parameters and return octane renderables.

SSR / hydration: Fixed-dimension primitives, wrapped XYChart series, annotations, text, and wordclouds emit complete deterministic SVG on the server. Real hydrateRoot adoption preserves the same SVG/definition/axis/text/series/annotation/wordcloud nodes without warnings, replacement, or post-effect markup changes; generated IDs, measurement fallbacks, portals, and responsive initial sizes are covered.

Scope/evidence last checked: 2026-08-02.

- The released v4.0.0 tag is the differential runtime oracle; current master commit 485c035 adds a11y, chart, kernel, theme, and the nested subpaths before their next registry publication.
- All 258 React-owned component and hook modules ship as TSRX and pass both client and server compiler gates; framework-neutral D3/math/data modules remain TypeScript.
- @visx/demo is a non-importable Next.js documentation/gallery application and @visx/registry is private registry tooling; both are excluded.
- @visx/vendor is upstream dual-module D3 packaging infrastructure; this ESM-first port imports the pinned D3 modules directly and does not expose vendor subpaths.

## @octanejs/wagmi

[`packages/wagmi`](../packages/wagmi) `0.0.30` — ports `wagmi@3.7.4`. Status data: [`packages/wagmi/status.json`](../packages/wagmi/status.json).

WagmiProvider and createConfig over @wagmi/core 3.6.4, with config, connection, connect, disconnect, switch-connection, switch-chain, connectors, connections, chains, balance, contract read/simulate/write, transaction send/wait, and message-signing hooks.

Known divergences:

- The binding targets Wagmi v3 names. Deprecated v2 useAccount/useSwitchAccount aliases and hooks outside the documented representative inventory are not exported.
- Privileged mutation hooks force retry:false, require a current live connector, cancel before dispatch when the displayed wallet context changed, and quarantine a late success as ActionContextChangedError when account, chain, or connector changed after dispatch.
- RainbowKit 2.2.x declares Wagmi v2 peers. Its defining provider/custom-button/modal contracts can be implemented over this v3 surface, proven by the deterministic disconnected-to-connecting-to-connected gate, but the downstream binding must document that peer-range divergence.
- The connectors subpath exposes the dependency-free injected and deterministic mock connectors. Vendor connectors and their optional SDKs remain direct application dependencies.
- EIP-1193 event validation, duplicate coalescing, and connector-generation invalidation are delegated unchanged to @wagmi/core 3.6.4. This binding does not add a second provider-event layer or claim independent normalization behavior.

SSR / hydration: WagmiProvider supports ssr:true and initialState through @wagmi/core hydrate. parseHydratedState accepts only a versioned, 16 KiB-bounded public-state hint and rejects malformed or privileged material; a hydrated connection is never authority for signing or submission.

Scope/evidence last checked: 2026-08-02.

## @octanejs/waypoint

[`packages/waypoint`](../packages/waypoint) `0.0.5` — ports `react-waypoint@6.0.0`. Status data: [`packages/waypoint/status.json`](../packages/waypoint/status.json).

Waypoint component and position constants at react-waypoint 6.0.0, with vertical/horizontal geometry, offsets, ancestor selection, rapid-crossing callbacks, refs, SSR, and hydration behavior.

Known divergences:

- Public node and prop types use Octane structural types and do not import React.
- The upstream class lifecycle is expressed with Octane hooks and refs-as-props.
- A custom child must be supplied through the children prop so it remains an inspectable descriptor; nested TSRX children compile to an opaque render block.

SSR / hydration: Supported. The marker renders on the server and measurement/listeners begin after client mount.

Scope/evidence last checked: 2026-08-24.

## @octanejs/window

[`packages/window`](../packages/window) `0.0.16` — ports `react-window@2.3.0`. Status data: [`packages/window/status.json`](../packages/window/status.json).

Provisional complete exact port of the react-window 2.3.0 root surface: List, Grid, getScrollbarSize, useDynamicRowHeight, four imperative-ref hooks, and all eight public types. The byte-locked pristine React suite and generated Octane adaptation each execute all 14 upstream files and all 117 cases; shared differential, SSR, hydration, and assertion-level public type lanes are required by the React parity manifest. Final Chromium/Firefox browser and executable CommonJS package-condition evidence remain pending shared infrastructure PRs #548 and #550.

Known divergences:

- Octane reserves the second raw function-component invocation argument for its internal block ABI; public props and rendered behavior match, so instrumentation should not assert React's undocumented undefined second argument.
- Keyed state and DOM identity are preserved, but sibling effect-log order and equal-prop rerender counts may differ after reordering because Octane schedules moved blocks and memoizes unchanged children differently.

SSR / hydration: Supported and tested — defaultHeight/defaultWidth produce deterministic bounded List and Grid markup without browser globals, and hydration adopts the server nodes before live scrolling and measurement.

Scope/evidence last checked: 2026-08-03.

- Targets react-window v2.3.0 only. Legacy v1 FixedSizeList, VariableSizeList, FixedSizeGrid, and VariableSizeGrid names are not part of the pinned upstream package and are intentionally absent.
- Browser U5 evidence is blocked on draft PR #548; executable require() parity is blocked on draft PR #550. This binding must remain draft and provisional until those shared runners merge and the branch consumes them.

## @octanejs/wouter

[`packages/wouter`](../packages/wouter) `0.0.6` — ports `wouter@3.10.0`. Status data: [`packages/wouter/status.json`](../packages/wouter/status.json).

Wouter 3.10.0 main router surface plus browser, hash, and memory location subpaths, ported to Octane with manual trailing hook-slot forwarding.

Known divergences:

- Link accepts ref as an ordinary Octane prop; forwardRef is not used.
- Switch inspects explicit element descriptors, while nested TSRX children are opaque and must be supplied as descriptor arrays or createElement results.
- Octane useSyncExternalStore replaces the upstream shim and requires forwarded compiler hook slots.
- The React Native use-sync-external-store shim and Wouter's separate Preact package are not exported.

SSR / hydration: Router ssrPath, ssrSearch, and redirect context behavior is ported and covered by tests/ssr.test.ts.

Scope/evidence last checked: 2026-08-20.

## @octanejs/xstate

[`packages/xstate`](../packages/xstate) `0.0.8` — ports `@xstate/react@6.1.0`. Status data: [`packages/xstate/status.json`](../packages/xstate/status.json).

Complete @xstate/react 6.1.0 export surface — `useActor`, `useActorRef`, `useSelector`, `createActorContext`, `shallowEqual`, and the deprecated `useMachine` alias — ported onto Octane hooks. The framework-agnostic `xstate` actor core is reused unchanged as a peer dependency and is not re-exported, exactly as upstream. Upstream's two npm-only dependencies are replaced by in-repo ports: `use-sync-external-store/shim/with-selector` by a local port of React's selector shim, and `use-isomorphic-layout-effect` by a slot-forwarding equivalent.

Known divergences:

- `useSyncExternalStore` does not re-read `getSnapshot` at commit when the rendered value was unchanged. Octane's synchronous renderer closes the concurrent-interleaving window React guards there, so a store that mutates without notifying between render and commit is not re-caught. Any actor that notifies — which xstate always does — is unaffected.
- During server rendering `getServerSnapshot` is optional and falls back to `getSnapshot`, where React throws. `useSelector` and `useActor` always supply one, so this is only reachable through a hand-rolled actor-like object.
- Upstream's suite runs every `useActor`, `useActorRef`, and `useSelector` case twice, once under `StrictMode`. Octane has no StrictMode double-invoke, so the non-strict render, effect, and observer counts are the ported expectations; the strict pass is not applicable.
- `stopRootWithRehydration` is retained verbatim even though its motivating case (React Strict Effects double-invoking the start/stop effect) cannot occur on Octane, because it also governs unmount-then-remount, which stays observable.

SSR / hydration: Supported: `useSelector` and `useActor` read their actor snapshot through `getServerSnapshot` during server rendering and the first hydration read, so server markup matches the initial actor snapshot. Effects never run on the server, so actors are not started there.

Scope/evidence last checked: 2026-08-15.

## @octanejs/xstate-store

[`packages/xstate-store`](../packages/xstate-store) `0.0.8` — ports `@xstate/store-react@2.0.0`. Status data: [`packages/xstate-store/status.json`](../packages/xstate-store/status.json).

Complete @xstate/store-react 2.0.0 export surface — `useSelector`, `useStore`, `useAtom`, `useAtomState`, and `createStoreHook` — ported onto Octane hooks, plus the full `@xstate/store@4.2.3` core re-exported unchanged (`createStore`, `createAtom`, `fromStore`, `shallowEqual`, and every type), exactly as upstream re-exports it.

Known divergences:

- Upstream calls hooks inside `if` branches in `useSelector` and `useAtom`, which React tolerates only because the branch is stable per call site. Octane keys hooks by call site rather than call order, so the shape is legal here; if a call site does flip branches, Octane keeps independent hook cells per branch and unsubscribes the abandoned one instead of corrupting hook order.
- `useSyncExternalStore` does not re-read `getSnapshot` at commit when the rendered value was unchanged. Octane's synchronous renderer closes the concurrent-interleaving window React guards there; any store that notifies is unaffected.
- During server rendering `getServerSnapshot` is optional and falls back to `getSnapshot`, where React throws. Every hook here supplies one.

SSR / hydration: Supported: selectors, stores, and atoms read their current snapshot during server rendering through `getServerSnapshot`, and the binding has no browser-only initialization.

Scope/evidence last checked: 2026-08-15.

## @octanejs/xyflow

[`packages/xyflow`](../packages/xyflow) `0.1.1` — ports `@xyflow/react@12.11.2`. Status data: [`packages/xyflow/status.json`](../packages/xyflow/status.json).

ReactFlow, ReactFlowProvider, Handle, hooks (useReactFlow, useNodes, useEdges, …), change helpers, and node/edge utilities from @xyflow/react@12.11.2.

Known divergences:

- Octane components are functions rather than forwardRef objects (ReactFlow, ReactFlowProvider, Handle).

SSR / hydration: Store/provider render on server; canvas interactions are client-driven like upstream.

Scope/evidence last checked: 2026-08-07.

- Mechanical source port with hook-slot forwarding via subSlot in plain .ts hooks.
- Conformance and differential parity tests pass for initial flow mount.

## @octanejs/zag

[`packages/zag`](../packages/zag) `0.0.16` — ports `@zag-js/react@1.42.0`. Status data: [`packages/zag/status.json`](../packages/zag/status.json).

Complete port of the @zag-js/react@1.42.0 public adapter surface: useMachine, normalizeProps, Portal, the @zag-js/core mergeProps re-export, and the framework useSyncExternalStore re-export. The framework-agnostic @zag-js/core, @zag-js/store, @zag-js/types, and @zag-js/utils packages are reused unchanged.

Known divergences:

- normalizeProps rewrites React-style text-entry onChange to native onInput for input (non-checkbox/radio) and textarea hosts; select and checkbox/radio keep native onChange. Upstream normalizeProps is an identity transform and has no suite coverage for this export.
- Portal container refs use Octane's structural `{ current: HTMLElement | null }` ref shape rather than React.RefObject; runtime behavior is unchanged.
- Compiled Octane children are portalled as one lazy children block so their component scope is preserved; ordinary value children retain upstream's per-child portal behavior.
- React StrictMode double-invoke suite cases stay pristine-only; Octane does not double-invoke effects, so those identities are not adapted one-for-one.

SSR / hydration: Supported and tested: useMachine exposes its initial state and bindable context during server rendering, effects remain deferred, and Portal renders children in place without browser globals.

Scope/evidence last checked: 2026-08-09.

- Ported from chakra-ui/zag commit df65e4c87c75a1c84eb6eb08a8e30dac0e1bb77f, the source commit for @zag-js/react@1.42.0.
- Vendored upstream adapter source and Vitest suite under packages/zag/upstream with pristine and one-for-one adapted lanes; the differential machine-trace case remains supplementary evidence.
- Published dependencies and source contain no React or react-dom imports.

See also: [`packages/zag/UPSTREAM.md`](../packages/zag/UPSTREAM.md)

## @octanejs/zustand

[`packages/zustand`](../packages/zustand) `0.1.49` — ports `zustand@5.0.14`. Status data: [`packages/zustand/status.json`](../packages/zustand/status.json).

Complete 1:1 port: the framework-agnostic vanilla store is reused verbatim; `create`/`useStore`, `shallow`/`useShallow`, the traditional equality-fn variants, and all middleware (persist, devtools, subscribeWithSelector, combine, redux).

Known divergences:

- Unstable selectors (a new reference every render) settle after a bounded number of re-renders instead of hitting React's `useSyncExternalStore` warning loop — still prefer `useShallow`.

SSR / hydration: No SSR-specific surface; no dedicated SSR tests.

Scope/evidence last checked: 2026-08-02.

- 2026-07-20: `UseBoundStore` type export added (was module-local; upstream zustand/react exports it — gap found by the tanstack-com port).
