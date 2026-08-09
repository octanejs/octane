# @octanejs/\* bindings status (generated)

<!-- GENERATED FILE — do not edit. Edit packages/<name>/status.json and
     regenerate with `pnpm bindings:status`. -->

The central status table for the 59 `@octanejs/*` framework bindings.
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
| [`@octanejs/animejs`](#octanejsanimejs) | `animejs@4.5.0` | Anime.js is re-exported unchanged; `useAnimeScope` binds scoped DOM animation setup, refresh, dependency recreation, and cleanup to Octane, and `@octanejs/animejs/adapters/three` exposes Anime.js's official Three adapter. | `useAnimeScope` is an Octane-native lifecycle helper; it is not an upstream Anime.js API; Only the root and `adapters/three` entry points are re-exported; other Anime.js subpaths are explicit gaps whose APIs remain available from the supported root where upstream exposes them there; The Three adapter mutates raw objects while `@octanejs/three` retains frame-loop ownership; demand and never loops require explicit invalidation or advancement | Supported. The hook returns inert refs during server rendering and creates no Anime.js scope until its client effect runs. | 2026-07-30 |
| [`@octanejs/apollo-client`](#octanejsapollo-client) | `@apollo/client@4.2.6` | Complete published client adapter surface: all 18 @apollo/client/react runtime exports and their Apollo 4.2.6 TypeScript declarations, framework-neutral root/testing exports, an Octane MockedProvider, and the Octane-native /react/ssr prerenderStatic entry. | Suspense unwraps stable Apollo promises through Octane use() instead of React's use() or a thrown-promise fallback; The React class-based MockedProvider is an equivalent Octane function component; React Server Components and Apollo's React Compiler-generated entry are intentionally not exposed | Dedicated Node-mode tests cover multi-pass useQuery, nested query waterfalls, per-request cache isolation, ssr:false/no-cache, render limits, and scoped CSS; client hydration verifies cache restoration, in-place adoption, and no duplicate fetch. Streaming cache patches remain open. | 2026-07-25 |
| [`@octanejs/aria`](#octanejsaria) | `react-aria@3.50.0` | Phases 0-5 + the Tree/Table follow-up complete. Phases 0-1: the utils foundation, SSR utilities, the complete interactions area (usePress, useHover, focus/keyboard family, useLongPress, useMove, Pressable/PressResponder), the focus area (FocusScope with containment/restore/focus managers, FocusRing, useFocusRing, useHasTabbableChild), the i18n area (I18nProvider, locale/collator/formatter/filter hooks), form validation (useFormValidation + stately useFormValidationState), and the leaf hooks: useButton/useToggleButton(+Group), useLabel/useField, useCheckbox(+Group/+Item), useRadio/useRadioGroup, useSwitch, useTextField, useSearchField, useProgressBar, useMeter, useSeparator, useLink, useDisclosure, useToolbar, VisuallyHidden. Phase 2 adds the collections + selection tier: the stately collections engine (CollectionBuilder/Item/Section/useCollection) and selection core (Selection/SelectionManager/useMultipleSelectionState), the stately state hooks (useListState/useSingleSelectListState, useTreeState, useMenuTriggerState/useSubmenuTriggerState, useOverlayTriggerState, useSelectState, useComboBoxState, useTabListState, useNumberFieldState, useSliderState), the aria selection area (useSelectableCollection/-Item/-List, useTypeSelect, ListKeyboardDelegate, DOMLayoutDelegate), and the aria hooks useListBox/useOption/useListBoxSection, useMenu/useMenuItem/useMenuSection/useMenuTrigger/useSubmenuTrigger, useTab/useTabList/useTabPanel, useSlider/useSliderThumb, useNumberField, useGridList(+Item/+Section/+SelectionCheckbox), useTag/useTagGroup, useBreadcrumbs/useBreadcrumbItem — plus the matching react-stately state hooks under `@octanejs/aria/stately`. Phase 3 adds the overlays hooks tier: the stately `useTooltipTriggerState` and the whole aria overlays area (usePreventScroll, ariaHideOutside, DismissButton, PortalProvider, useOverlay, useOverlayTrigger, useOverlayPosition + calculatePosition, Overlay/useOverlayFocusContain, useModal/ModalProvider/OverlayProvider/OverlayContainer, useModalOverlay, usePopover), plus the consumers useDialog, useTooltip/useTooltipTrigger, useSelect/useHiddenSelect/HiddenSelect, and useComboBox. Differential-verified byte-identical against the real react-aria (interactions + button/toggle/checkbox/switch/radio/textfield/progress + tabs + listbox + select + combobox fixtures); dialog/tooltip/overlay focus-trap/dismiss/scroll-lock paths are covered by behavioral tests (the differential rig shares one document, so focus/portal/positioning aren't rig-driveable). Autocomplete (useAutocomplete/useSearchAutocomplete) is deferred — useComboBox does not depend on it in 3.50.0. Phase 4 adds the react-aria-components foundation under `@octanejs/aria/components`: the collections engine re-hosted on a detached real-DOM store (BaseCollection/CollectionBuilder/createLeafComponent/createBranchComponent/Hidden/useCachedChildren + Collection/Section), the RAC plumbing (Provider, useContextProps, slotted contexts, useRenderProps/composeRenderProps with data-* state attributes), and the non-collection components: Button, ToggleButton(+Group), Checkbox(+Group/Field/Button), Switch(+Field/Button), RadioGroup(+Radio/Field/Button), TextField, SearchField, NumberField, Form, Label/Input/TextArea/FieldError, Group, Toolbar, Separator, Header, Heading, Link, ProgressBar, Meter, Slider(+Output/Track/Thumb/Fill), Disclosure(+Group/Panel), DialogTrigger/Dialog, Modal/ModalOverlay, Popover, TooltipTrigger/Tooltip, OverlayArrow, Text, Keyboard, SelectionIndicator, SharedElementTransition. Phase-4 differentials drive the REAL components on both sides byte-identical (Button hover+mid-press, ToggleButton, Checkbox, TextField typing, Disclosure expand/collapse). Phase 5 adds the RAC collection components over that engine: Autocomplete (full — aria useAutocomplete + stately useAutocompleteState now ported), ListBox(+Item/Section/LoadMoreItem), Menu(+MenuTrigger/SubmenuTrigger/MenuItem/MenuSection), Select(+SelectValue), ComboBox(+ComboBoxValue), Tabs(+TabList/Tab/TabPanels/TabPanel), TagGroup(+TagList/Tag), GridList(+Item/Section/Header/LoadMoreItem), Breadcrumbs(+Breadcrumb), and the DragAndDrop context layer (DropIndicator/contexts/DragAndDropHooks type; components' dnd branches are inert — the dnd engine and useDragAndDrop() itself arrive in a later phase, the stub throws). Phase-5 differentials drive the REAL react-aria-components byte-identical (ListBox selection + keyed reverse, Tabs switch, TagGroup multi-select, GridList row selection, Breadcrumbs, ComboBox typing); Menu/Select open-state (portal'd) carries behavioral coverage incl. keyboard-driven submenus. The Tree/Table follow-up adds the remaining collection verticals: stately grid (GridCollection/useGridState) + the full stately table area (TableCollection/useTableState/column-resize state/UNSTABLE_useTreeGridState), the aria tree hooks (useTree/useTreeItem) and the full aria table hook area (useTable family, TableKeyboardDelegate, useTableColumnResize, grid hooks it rides on), RAC Tree(+TreeItem/TreeItemContent/TreeSection/TreeHeader/TreeLoadMoreItem) and RAC Table(+TableHeader/TableBody/Column/Row/Cell/ColumnResizer/ResizableTableContainer/TableFooter/TableLoadMoreItem). Tree structure states and the interactive Table (sort cycling, row selection) are differential-verified byte-identical vs the real react-aria-components; chevron-driven Tree interaction carries behavioral coverage (the rig's virtual clicks cannot faithfully reproduce the focus-effect interplay on the React side). TableLayout lands with the Virtualizer; date/color families and the drag-and-drop engine are not started — see the migration plan. | Text-input DOM wiring uses octane's native `onInput` (per keystroke) instead of React's synthetic `onChange`; React Aria's public value-level `onChange(value)` callbacks are unchanged; `forwardRef` becomes octane's ref-as-prop; i18n server serializer: hoisted-string variable names stay valid identifiers past 26 entries (upstream's `common.size + 97` yields `{`, `\|`, … — a SyntaxError in the emitted inline script); useDefaultLocale, SSR branch: `direction` derives from the server-injected locale via `isRTL` (upstream hardcodes 'ltr' even for an injected RTL locale, disagreeing with its own getDefaultLocale) | Dedicated Node-mode coverage verifies SSRProvider, hydration-safe labelled relationships, server snapshots, and injected LTR/RTL locales; real Vite-compiled Octane server markup is hydrated in place and remains interactive. Overlay and collection SSR registration remain planned for Phase 8. | 2026-07-25 |
| [`@octanejs/base-ui`](#octanejsbase-ui) | `@base-ui/react@1.6.0` | Alpha, in progress: 34 of 43 upstream subpaths. The foundation, overlay infrastructure, hover/focus interaction layer, list-navigation/typeahead layer and popup viewport have landed, along with Dialog, AlertDialog, Popover, Tooltip, PreviewCard, the full form-control set, and the standalone Button/DirectionProvider/CSPProvider/useMediaQuery utilities — ported at full fidelity and differential-verified against the real `@base-ui/react`. Menu is COMPLETE at all 20 upstream parts — Root/Trigger/Portal/Positioner/Popup, the full item family (Item, LinkItem, CheckboxItem, RadioGroup/RadioItem and their indicators, Group/GroupLabel, Separator), Arrow, Backdrop, Viewport, and SubmenuRoot/SubmenuTrigger. Menubar and ContextMenu have landed too, so the whole menu family is complete. Toast is complete at all 11 parts, including the imperative toast manager, auto-dismiss timers with hover/focus pausing, and promise toasts; swipe-to-dismiss is covered too. Collapsible is complete at all 3 upstream parts (Root/Trigger/Panel), including upstream's <Activity> animation-resume suppression — octane's Activity has React's contract (hidden subtrees keep state and DOM while effects tear down and re-fire on reveal), so that path is ported rather than skipped and is the first component carrying a port of Base UI's OWN test file, under tests/upstream/ — 16 of its 35 upstream cases, being every case that does not require real layout measurement, CSS transition/keyframe sequencing, React.Activity, or find-in-page `beforematch`. Accordion is complete at all 5 upstream parts (Root/Item/Header/Trigger/Panel), built directly on Collapsible — each Item runs its own useCollapsibleRoot and provides CollapsibleRootContext, exactly as upstream does. It carries 18 tests: 15 ported from upstream's own suite plus 3 written to close a real gap — upstream only exercises single-vs-multiple toggling inside jsdom-skipped blocks, so removing the single-mode collapse branch passed every ported case. | Handlers receive native DOM events (no synthetic layer): visible text controls use per-edit `input`, while the NumberField form-facing number input intentionally observes native `change` commits. React's synthetic-only `event.isPropagationStopped()` (used by Menu's popup keyboard relay) becomes a native `event.cancelBubble` read; `forwardRef` becomes ref-as-prop; `className` composes via octane's `normalizeClass` (the render-prop string merge matches Base UI exactly); The vendored `floating-ui-react` surface is internal rather than republished, so its standalone `useHover` combiner is not ported — no Base UI component uses it; Tooltips outside a `Tooltip.Provider` still share the delay-group context's module-level default refs, so opening one closes another. Transcribed from Base UI rather than chosen; pinned by `tests/tooltip-delay-group.test.ts`; `NumberField.ScrubArea` and hold-to-repeat stepping remain unported; the steppers respond to single presses only | Dedicated Node-mode tests cover server snapshots, accessible separators, edge-aligned slider visibility, and closed dialogs; hydration adopts Vite-compiled Octane server markup, transitions to the client snapshot, and preserves interaction. Open overlays and remaining components are not yet covered. | 2026-08-01 |
| [`@octanejs/cmdk`](#octanejscmdk) | `cmdk@1.1.1` | Complete against the published `cmdk@1.1.1` public surface: `Command` (the root itself) and the `CommandRoot` named export, `Command.Input`, `Command.List`, `Command.Item`, `Command.Group`, `Command.Separator`, `Command.Dialog`, `Command.Empty`, `Command.Loading`, the flat `CommandX` aliases, `useCommandState`, and `defaultFilter` — with the DOM-authoritative store and item/group registration, `useValue` text-content inference, `onInput`-driven search, score filtering plus item and group DOM sorting, keyboard navigation (arrows/Home/End/vim/Enter), controlled `value`/`onValueChange`/`loop`/`shouldFilter`/custom `filter`/`forceMount`, the `--cmdk-list-height` ResizeObserver, and a Radix-backed `Command.Dialog`. `asChild` is the one unsupported prop (see divergences). | No forwardRef: components take `ref` as a normal prop; multi-ref uses octane's `ref={[a, b]}` instead of composeRefs; `Command.Input` drives search from the native `onInput` event; the public `onValueChange(search)` API is unchanged (no synthetic `onChange`); Item value is inferred from the provided `value` prop or the rendered `textContent`; cmdk's string-child inspection is dropped because octane's compiled children are opaque. An item that has never been scored therefore renders once so the inference can read its text — treating unscored as score zero deadlocks it (null render leaves no element, no element leaves no textContent, no textContent scores zero), which made items arriving during an active search permanently invisible; Score ranking is expressed as CSS `order` inside a flex container, not by relocating DOM nodes. Upstream's sort() is DOM-authoritative: it appendChild's matching items into the list sizer. Octane fences every component's DOM with comment markers and tracks the range between them, and a template construct like `@for` or `@if` wraps each item in a SECOND, outer range — so relocating an item carries it out of every range at once, and the loop later clears an empty range while the real node is orphaned in the list forever. Carrying the flanking markers along only repairs the innermost range, so it breaks again at each new nesting construct. Ranking declaratively removes the class of bug: no node moves, no range is violated, and clearing the search restores true source order because the styles are simply dropped. The cost is that the list sizer and each group's item container are flex columns WHILE a filter is active, so a consumer relying on physical DOM order (`:nth-child` styling, drag handles) or on a custom container `display` diverges from upstream. Selection, arrow-key navigation and alt+arrow group navigation all read the ranked order, not DOM order, so what is selected always matches what is on screen. Every valid item is ranked rather than only the matches: an unranked flex child keeps the initial `order` of 0, which sorts it AHEAD of every match, so a force-mounted non-match would jump to the top of its container. Ranking everything puts zero-scoring items last, which is where upstream's append-in-score-order leaves them too. Ranks land on the child the container actually lays out, resolved at any nesting depth, because `order` applies to a flex CHILD — upstream resolves a single wrapper level, which its appendChild model tolerates but this one does not. Ungrouped items and group hosts share the sizer's rank space, so the former are numbered densely and the latter continue past them, matching upstream's order of appending items before groups; `aria-activedescendant` is wired on the initial auto-select and after every filter; upstream queues that work from inside its own layout-effect flush and its batcher discards it, so upstream only sets the attribute after a directly user-driven selection. The runtimes agree on which item is selected; Ids are `radix-` prefixed to match upstream, which takes them from `@radix-ui/react-id`; Group reordering resolves each group element by its registered value rather than upstream's `[cmdk-group=""][data-value="<groupId>"]` selector. That selector can never match — `data-value` holds the group's heading text, never its id — so upstream's group sort is effectively dead code; the port makes groups genuinely reorder by their best item score; Re-registering an item value during an active search re-derives the whole filter aggregate (match count and matching groups), not just that item's score. Upstream only re-sorts, leaving `filtered.count`/`filtered.groups` describing the previous values — so an item that starts matching renders while `Command.Empty` still shows "no results" (and its group can stay hidden). Upstream's own item-registration path already re-derives the aggregate the same way, so the omission reads as an oversight rather than intent; Force-mounted items are counted so `Command.Empty` can see them. Upstream skips registration entirely for a `forceMount` item, so it never reaches `filtered.count` — with a search that matches nothing, upstream renders the force-mounted item and "no results" on top of each other. The port tracks the live force-mounted count separately (`filtered.count` keeps its upstream meaning for `useCommandState`) and Empty consults both; Removing the selected force-mounted item moves the selection on. Because upstream never registers a `forceMount` item it has no teardown for one either, so the selected value keeps pointing at a node that is gone: nothing renders `aria-selected`, `aria-activedescendant` dangles at a removed id, and Enter does nothing until the user arrows away. The port re-selects from the force-mount teardown, the same way the plain item teardown does; Every registration path releases the value it registered. Items, force-mounted items and groups all register through the same `useValue`, but upstream only releases on the plain item teardown — so a force-mounted item or a group that unmounts leaves its entry in `ids`/`filtered.items` for the Command's lifetime. In the port all three release symmetrically, which also keeps the dev-only duplicate-value report honest: re-showing a force-mounted item used to count its value again each time ("2 items share…", then "3…") and blame the author for code holding exactly one live item with that value; Registration teardowns hop a microtask before scheduling their follow-up work. Octane runs a removed child's effect cleanups during the PARENT's render, so scheduling straight from a teardown lands its state update mid-render and the runtime reports "Cannot update a component (`CommandRoot`) while rendering a different component" — advice a teardown cannot act on, since it does not choose when it runs. The queued work is unchanged and still runs before paint; only the teardown paths defer, because every other caller schedules from a layout effect where the synchronous update is load-bearing. React has no equivalent problem: it runs cleanups in the commit phase; `Command.Empty` renders nothing during SSR. Items register in layout effects, which never run on the server, so the match count is unavoidably 0 there and upstream ships "no results" above a fully-populated list on every server-rendered page — permanently so for readers without JavaScript. The port supplies a server snapshot of "not empty" instead, and the empty state appears on the client once the count is real; An item leaving a group is removed from that group's member set. Upstream deletes the item from `ids`/`allItems` but never from `allGroups`, so a group accumulates dead item ids for the lifetime of the Command — unbounded growth in a menu whose results churn, plus wasted work in every filter pass; `Command.Dialog` additionally forwards `defaultOpen` and `modal` to the underlying Radix `Dialog.Root`. Upstream cmdk forwards only `open`/`onOpenChange`, so it has no uncontrolled open state and is always modal; Duplicate item values are reported in development. Selection is keyed by value, so two items sharing one both render `aria-selected="true"` while only the first responds to Enter — an invalid single-select listbox. The runtime cannot pick a winner (cmdk requires unique values), so the port warns instead of failing silently; upstream neither warns nor resolves it; The layout-effect batcher isolates each queued callback: a callback that throws is reported through `console.error` (as octane reports effect exceptions) and the remaining queued callbacks still run, rather than one failure aborting the rest of the flush. Upstream has no such isolation, so a throwing callback there aborts the siblings queued behind it; `asChild` is not supported: cmdk's SlottableWithNestedChildren clones a child element and re-parents the component's own content into it, which has no faithful equivalent over octane's opaque compiled children. Components always render their own host element; `Command.Dialog` builds on @octanejs/radix's Dialog (composed via createElement descriptors, since radix's Portal iterates children) instead of @radix-ui/react-dialog; The vendored scorer gained explicit parameter type annotations for strict typecheck and repo-style formatting; the algorithm and score constants are unchanged from cmdk@1.1.1 | Supported and tested: the menu server-renders all items in source order without browser globals (the DOM-authoritative filter/selection is post-hydration work), and no empty state — items cannot register on the server, so `Command.Empty` renders nothing there rather than claiming "no results" over a full list. `hydrateRoot` adopts the server nodes without a mismatch, then activates — values infer from textContent, the first item selects, and typing filters live. | 2026-07-22 |
| [`@octanejs/devtools`](#octanejsdevtools) | `octane@workspace` | Octane-native DevTools plugin (not an upstream port): renders live runtime diagnostics into a TanStack Devtools host via @tanstack/devtools-event-client. P1 ships the Components tree + state inspector. | none known | The plugin renders no anchor of its own; it is a client-only panel plugged into @octanejs/tanstack-devtools. Include it only in dev. | 2026-07-24 |
| [`@octanejs/dexie`](#octanejsdexie) | `dexie-react-hooks@4.4.0` | Port of the public dexie-react-hooks surface: useObservable, useLiveQuery, useSuspendingObservable, useSuspendingLiveQuery, usePermissions, and useDocument, with Dexie's framework-neutral API re-exported from the package root. | Suspending hooks integrate with Octane's use() rather than React's use() or thrown-promise implementation details; Hook call-site slots are forwarded through Octane's compiler binding ABI; useDocument requires consumers to install and import y-dexie and yjs before using the hook; those integrations remain optional | Supported for non-suspending live queries: SSR returns the configured default without opening IndexedDB, and hydration adopts the server host before replacing the default with live data. Suspending live queries remain client-oriented and do not claim server data loading. | 2026-07-16 |
| [`@octanejs/dnd-kit`](#octanejsdnd-kit) | `@dnd-kit/react@0.5.0` | Complete modern dnd-kit React-adapter surface: DragDropProvider, DragOverlay, useDraggable/useDroppable, manager/monitor/operation hooks, PointerSensor/KeyboardSensor re-exports, the public signal-hook utilities, useSortable, and all four upstream entry points. | DragOverlay distinguishes octane compiled children blocks from function render props; ordinary typed usage is behaviorally equivalent; useSortable retains the upstream keyboard plugin by default but omits OptimisticSortingPlugin because moving one host element before application state commits can split an Octane keyed DOM range; explicit plugin arrays remain authoritative | Static SSR and hydration are covered; DOM plugins initialize only after client refs register. | 2026-07-15 |
| [`@octanejs/electron`](#octanejselectron) | `electron@43.2.0` | Process-split Electron bindings: ./main registers ipcMain handlers, ./main/native re-exports main-only Electron APIs (Menu, Tray, session, protocol, BrowserWindow, …), ./preload exposes Electron IPC and desktop helpers via contextBridge, and the renderer entry provides Octane hooks (useInvoke, useInvokeState, useIpcEvent, useNativeTheme, useWindowState) plus promise helpers for app/window/dialog/shell/clipboard/screen. Menu/Tray/session/protocol stay intentional main-only under contextIsolation. | There is no React binding upstream; Electron is framework-agnostic, so this package mirrors the React Electron process layout rather than porting a React library; Renderer code uses window.__OCTANE_ELECTRON__ because contextIsolation forbids importing electron in the page; Menu, Tray, session, and protocol are re-exported from @octanejs/electron/main/native for main-process consumers and are intentionally not bridged into the renderer; Hook call-site slots are forwarded through Octane's compiler binding ABI; useInvoke integrates with Octane's use() rather than React's use(); useInvokeState returns to pending on refetch and does not implement stale-while-revalidate; Built-in desktop helpers use octane:* IPC channels; apps may allowlist additional channels in preload | Server rendering performs no IPC. useInvokeState renders pending and issues the command on the client after hydration; useIpcEvent and reactive desktop hooks subscribe only on the client. useInvoke without a host rejects with ElectronUnavailableError. | 2026-08-02 |
| [`@octanejs/floating-ui`](#octanejsfloating-ui) | `@floating-ui/react@0.27.19` | Positioning (`useFloating`, ref-aware `arrow`, the `@floating-ui/dom` middleware re-exports, the floating tree), the full interaction-hook set (`useInteractions`, `useHover` + `safePolygon`, `useClick`, `useFocus`, `useDismiss`, `useRole`, `useClientPoint`, `useListNavigation`, `useTypeahead`), the component layer (`FloatingPortal`, `FloatingOverlay`, `FloatingFocusManager`, `FloatingArrow`, `FloatingList`, `Composite`), and transitions + `FloatingDelayGroup`. | `forwardRef` becomes octane's ref-as-prop | No dedicated SSR/hydration tests. | 2026-07-05 |
| [`@octanejs/gsap`](#octanejsgsap) | `@gsap/react@2.1.2` | Full useGSAP hook contract: callback, dependency-array and config signatures; scoped contexts; contextSafe; revertOnUpdate; register; and headless. | The adapter imports Octane hooks and uses compiler-selected manual hook slots instead of React hooks; GSAP remains an external peer dependency and is not redistributed by this MIT-licensed adapter | Server rendering creates stable context helpers without running GSAP effects. Client hydration activates the standard lifecycle. | 2026-08-02 |
| [`@octanejs/hook-form`](#octanejshook-form) | `react-hook-form@7.81.0` | Complete port of react-hook-form 7.81.0 (tag commit 46b217e034dd92f7aa3cb3a478815556b416b299). The automated parity check runs all 1,193 original tests against the pinned React package as a pristine baseline; the Octane port separately runs byte-locked, unfiltered DOM and server suites with exact collected/executed inventories containing 1,187 entries representing 1,178 unique file/full-name identities. The nine duplicate entries are repeated titles within the DOM inventory; the server inventory is disjoint. Coverage includes `useForm`, `useController`, `useFieldArray`, `useFormState`, `useWatch`, `useFormContext`/`FormProvider`, schema resolvers, and all validation modes. | `register()` returns `onInput` (octane's native per-keystroke event) instead of React's synthetic `onChange`; mode names and `register` option keys keep the upstream spelling; The structured parity ledger records native no-op input delivery, microtask batching, duplicate resolver notification, async act flush, reset render-count, and eager `Object.is` bailout differences with executable case identities, consumer impact, and migration guidance; the suite contains no skipped or expected-failure cases | Supported and tested — the upstream `*.server.test.tsx` suite runs via `octane/server` with byte-identical markup. | 2026-08-01 |
| [`@octanejs/i18next`](#octanejsi18next) | `react-i18next@17.0.9` | Complete runtime port of react-i18next 17.0.9: useTranslation, I18nextProvider/context, Trans/TransWithoutContext, IcuTrans/IcuTransWithoutContext, Translation, the withTranslation/withSSR HOCs, useSSR, namespace reporting, initialization/default helpers, and the root ICU helper exports over the unchanged i18next core. | Trans children that must be inspected are passed in prop position (`children={<>…</>}`) or through `defaults` + `components`; natural .tsrx block children are opaque compiled render bodies and fall back with a development warning; Suspense uses octane's `use(thenable)` instead of throwing a Promise; withTranslation's `withRef` option uses octane's ref-as-prop model; class components are unsupported; The React/Babel-specific `icu.macro` subpath is not shipped; the runtime IcuTrans APIs are fully supported | Preloaded renderToString output and namespace collection are covered; useSSR, withSSR, getInitialProps, and composeInitialProps are ported. A dedicated hydration differential is still open. | 2026-07-13 |
| [`@octanejs/inertia`](#octanejsinertia) | `@inertiajs/react@3.6.1` | Octane Inertia 3.6.1 adapter foundation: framework-neutral router, HTTP client, progress, and server exports reuse @inertiajs/core unchanged; page, remember, poll, prefetch, form-state, router-submit, direct-HTTP, precognition, and layout-property hooks are ported to Octane. | React, ReactDOM, StrictMode, forwardRef, and synthetic events are not runtime dependencies; the Octane adapter uses Octane roots, refs-as-props, and native events | The framework-neutral Inertia server entry is exposed. Hook initialization is request-local and covered in the server runtime; Octane page rendering and hydration are completed by the adapter SSR unit. | 2026-07-30 |
| [`@octanejs/jotai`](#octanejsjotai) | `jotai@2.20.2` | Complete 1:1 port: the framework-agnostic vanilla core (`jotai/vanilla`, `/vanilla/utils`, `/vanilla/internals`) is reused verbatim; the React layer (`Provider`, `useStore`, `useAtom`, `useAtomValue`, `useSetAtom`) and `react/utils` (`useResetAtom`, `useReducerAtom`, `useAtomCallback`, `useHydrateAtoms`) are ported onto octane hooks, preserving upstream's useReducer force-update + effect-subscription implementation, async atoms via octane's `use()`. | `jotai/babel/*` (React-specific compile-time plugins) is not shipped | No SSR-specific surface; `useHydrateAtoms` is ported and usable for hydration seeding; no dedicated SSR tests. | 2026-07-21 |
| [`@octanejs/lexical`](#octanejslexical) | `@lexical/react@0.46.0` | 35 of 39 `@lexical/react` modules ported: composer + contexts, the editable surface, plain/rich text, and the full plugin/menu set (history, lists + check-list, links, tables, markdown shortcuts, the typeahead/node-menu/context-menu family, draggable-block, character-limit, …) plus the `useLexical*` hooks. | Positioning uses `@floating-ui/dom` instead of `@floating-ui/react`; The class-based `LexicalErrorBoundary` becomes an octane error boundary; `forwardRef` becomes ref-as-prop | No dedicated SSR/hydration tests. | 2026-07-09 |
| [`@octanejs/livestore`](#octanejslivestore) | `@livestore/react@0.4.0` | Ports the complete stable renderer surface (registry provider/access, Suspense store loading and augmentation, reactive queries, client documents, and sync status) plus the exported experimental LiveList over LiveStore's unchanged 0.4.0 framework-neutral packages. | ReactApi and withReactApi retain their historical upstream names but attach Octane hooks; The public query error label identifies octane; LiveStore framework-toolkit 0.4.0 still records its internal refresh-reason renderer tag as react; React Strict Mode double invocation is not emulated | Supported at the binding boundary: server rendering reads existing synchronous state without running passive subscriptions or browser-only store work; client Suspense and hydration are covered separately. | 2026-08-02 |
| [`@octanejs/lucide`](#octanejslucide) | `lucide-react@1.24.0` | Complete against the published `lucide-react@1.24.0` runtime surface: every canonical icon and alias, the `icons` namespace, `Icon`, `createLucideIcon`, `LucideProvider`, `useLucideContext`, `DynamicIcon`, `iconNames`, `dynamicIconImports`, and per-icon subpath imports. | Icon refs are normal Octane `ref` props rather than React `forwardRef` components; Event callbacks receive native DOM events rather than React synthetic events | Supported and tested: icons and provider defaults render through `octane/server`, and client hydration adopts the server-rendered SVG element. | 2026-07-13 |
| [`@octanejs/mantine-hooks`](#octanejsmantine-hooks) | `@mantine/hooks@9.5.0` | Complete @mantine/hooks 9.5.0 runtime export surface: state, timing, storage, viewport, input, focus, pointer, observer, hotkey, scrolling, collapse, drag, splitter, mask, and utility hooks. | Hooks use Octane's compiler-injected hook slots and runtime lifecycle instead of React's dispatcher; DOM subscriptions receive native browser events; React is retained only as a source-compatibility type vocabulary for refs, events, actions, and CSS properties; it is not loaded at runtime | Dedicated Node-mode coverage verifies deterministic state-hook output and guarded media-query initial values without a browser. DOM-only effects remain inert during server rendering. | 2026-07-28 |
| [`@octanejs/mdx`](#octanejsmdx) | `@mdx-js/mdx@3.1.1` | The full compile-don't-interpret pipeline: `.mdx`/`.md` → `@mdx-js/mdx` (reused verbatim) → octane compiler, via the `octaneMdx()` Vite plugin plus the `./compile` and `./server` entries; compiler warnings propagate through direct and Vite compile surfaces with authored `.mdx` ranges; `@mdx-js/react`'s provider layer (`MDXProvider`/`useMDXComponents`) is ported onto octane context. The octane website runs on it. | `useMDXComponents` drops upstream's `useMemo` referential-stability wrapper so the call is valid in both server and client runtimes (same observable mapping) | Full SSR + hydration coverage — server-compiled documents render via `renderToString` and hydrate byte-for-byte (`ssr.test.ts`, `hydration.test.ts`). | 2026-07-17 |
| [`@octanejs/mobx`](#octanejsmobx) | `mobx-react-lite@4.1.1` | The framework-independent MobX core is re-exported verbatim. The function-component binding includes observer, Observer, useObserver, useLocalObservable, enableStaticRendering, isUsingStaticRendering, and the deprecated useStaticRendering alias. | React class components and the legacy mobx-react Provider/inject APIs are not included; forwardRef compatibility options are omitted because Octane uses refs as props; React-specific batching, prop-types validation, React DevTools integration, and useDebugValue output are omitted | enableStaticRendering(true) renders observed components without creating a Reaction or retaining observable subscriptions. | 2026-07-28 |
| [`@octanejs/motion`](#octanejsmotion) | `motion@12.42.2` | Core surface: `motion.<tag>` (animate, gestures, variants with propagation/stagger, drag, layout basics), `AnimatePresence`, `MotionConfig`, and the motion-value hooks (`useMotionValue`, `useScroll`, `useTransform`, `useSpring`, `useAnimate`, `useMotionValueEvent`); motion-dom's animation engine and gesture primitives are reused verbatim. | Exit animations run via cleanup-before-detach instead of React's deferred-deletion machinery; `layout`/`layoutId` use single-element FLIP, not the full projection tree | No SSR-specific surface; no dedicated SSR tests. | 2026-07-21 |
| [`@octanejs/nuqs`](#octanejsnuqs) | `nuqs@2.9.1` | Full vendored port: the framework-agnostic core (`parsers`/`parseAs*`/`createParser`, `createSerializer`, `createLoader`, `createStandardSchemaV1`, the throttle/debounce update queues, sync emitter and URL encoding) is vendored verbatim from nuqs 2.9.1; the React layer (`useQueryState`, `useQueryStates`, the `useSyncExternalStores` helper and the adapter context) is ported onto octane's hooks — same `useState`/`useEffect`/`useSyncExternalStore` implementation shape as upstream, so re-render and URL-reconciliation behaviour matches nuqs on React. Adapters ported: `@octanejs/nuqs/adapters/react` (`NuqsAdapter`, `enableHistorySync`), `/adapters/custom` (`unstable_createAdapterProvider`), `/adapters/testing` (`NuqsTestingAdapter`, `withNuqsTestingAdapter`). Server surface (`@octanejs/nuqs/server`) exposes `createLoader`/`createSerializer`/parsers/`createStandardSchemaV1`. | Framework adapters that bind other React routers are NOT shipped: `nuqs/adapters/next`, `/adapters/remix`, `/adapters/react-router` and `/adapters/tanstack-router` (they require octane ports of those routers). Use `/adapters/react`, or `/adapters/custom` to wire a router; `createSearchParamsCache` (from `nuqs/server`) is not ported: it is built on React Server Components' `React.cache()`, which octane does not implement. Use `createLoader` for request-scoped parsing; `TransitionStartFunction` is declared locally in `defs.ts` rather than imported from `@types/react`, so the package carries no react type dependency; `NuqsTestingAdapter` resets the shared update queue once per mount (ref-guarded) instead of on every render as upstream does; the reset still runs during the first render (before child hooks read the queue), but a re-render no longer re-aborts in-flight/debounced URL writes | The server entry (`@octanejs/nuqs/server`) is react-free and usable during SSR for parsing/serialising search params; the client hooks read `location.search` through `useSyncExternalStore` with an empty-search server snapshot (upstream parity). No dedicated SSR hydration tests yet. | 2026-07-20 |
| [`@octanejs/phosphor-icons`](#octanejsphosphor-icons) | `@phosphor-icons/react@2.1.10` | All 1,512 canonical icons from @phosphor-icons/core@2.1.1, including the upstream deprecated Icon-suffixed aliases, six weights, IconContext, IconBase, root exports, and per-icon imports. | Icon refs are normal Octane ref props rather than React forwardRef components; Event callbacks receive native DOM events rather than React synthetic events; The React package's SSR namespace is unnecessary because Octane icons use the same components on client and server | Supported and tested against @phosphor-icons/react/ssr for every weight; hydration adopts and updates server-rendered SVG hosts. | 2026-07-29 |
| [`@octanejs/radix`](#octanejsradix) | `radix-ui@1.6.4` | Complete against the unified `radix-ui@1.6.4` component surface — all primitives (incl. Dialog, the Menu/DropdownMenu/ContextMenu family, Popover, Tooltip, Select, NavigationMenu, Toast, Menubar, Slider, the form controls, and OneTimePasswordField/PasswordToggleField) plus the composition/state/overlay foundations — verified by a differential suite (same fixtures through octane and the real radix-ui, byte-identical DOM). | `Slot`/`asChild` compose element descriptors (prop-position JSX, `createElement`, `.map()` returns), not children-position JSX; `forwardRef` becomes octane's ref-as-prop | SSR/hydration coverage for the overlay/portal components is still open (tracked in the migration plan). | 2026-07-21 |
| [`@octanejs/rainbowkit`](#octanejsrainbowkit) | `@rainbow-me/rainbowkit@2.2.11` | Octane-native RainbowKitProvider, ConnectButton and ConnectButton.Custom, WalletButton, connect/account/chain modal hooks, connector selection, account/chain actions, native accessible dialogs, and light/dark/midnight themes. | IMPORTANT: upstream RainbowKit 2.2.11 declares wagmi ^2.9.0. This adapter intentionally consumes @octanejs/wagmi v3 and is not drop-in dependency or peer-range parity; The React DOM and vanilla-extract implementation is replaced by native Octane TSRX, DOM events, focus/scroll containment, and CSS custom properties; The wallet list merges optional configured descriptors with the enclosing Wagmi v3 connector list, deduplicated by canonical connector uid with explicit id/name fallback. Unavailable configured entries remain visible with a reason. RainbowKit wallet factories, vendor SDKs, and WalletConnect project configuration remain application-owned; Authentication, recent transactions, ENS/avatar resolution, localization, cool mode, account avatars/balances, chain icons, and pixel-identical upstream themes are unsupported and their upstream props are not accepted; rainbowTheme is an explicitly documented Octane-only purple/rounded preset; it is not an upstream RainbowKit export | The provider and controls emit deterministic disconnected markup without browser wallet access. Connector discovery and live Wagmi state become authoritative after hydration; no hydrated UI state authorizes wallet actions. | 2026-07-29 |
| [`@octanejs/react-error-boundary`](#octanejsreact-error-boundary) | `react-error-boundary@6.1.2` | Complete against the published react-error-boundary 6.1.2 function/type surface adapted to Octane: ErrorBoundary, ErrorBoundaryContext, getErrorMessage, fallback variants, onError/onReset callbacks, resetKeys, useErrorBoundary (including error), withErrorBoundary, OnErrorCallback, and UseErrorBoundaryApi. | Component stack information is currently an empty string because Octane does not expose a public component-stack formatter; Event-handler and asynchronous errors must be passed to useErrorBoundary().showBoundary(), matching upstream's explicit forwarding requirement; Server rendering that must match upstream error propagation uses the explicit @octanejs/react-error-boundary/server entry | The explicit server entry renders children without a boundary so descendant errors propagate, matching react-error-boundary 6.1.2. | 2026-07-29 |
| [`@octanejs/react-map-gl`](#octanejsreact-map-gl) | `@vis.gl/react-mapbox@8.1.2 (b1e46fcf)` | Complete against the pinned @vis.gl/react-mapbox 8.1.2 public surface — the package react-map-gl/mapbox re-exports: Map (and default), Marker, Popup, Source, Layer, AttributionControl, FullscreenControl, GeolocateControl, NavigationControl, ScaleControl, useControl, MapProvider, useMap, and every published type. The framework-neutral half of upstream (the Mapbox engine, proxy transform, map ref, and six utils) is reused byte-for-byte and validated by upstream's own specs run against both source trees. | <Source> delivers its generated id to child layers through context rather than cloneElement, so the id reaches any descendant <Layer> rather than only direct children. It still overrides an explicitly set source, as cloneElement did; Map, Marker, Popup and GeolocateControl take their ref as an ordinary prop; Octane has no forwardRef. `<Map ref={mapRef} />` is unchanged; Effect cleanups run on the passive drain after root.unmount() rather than inside it, so the map's WebGL context and worker pool are released one drain later; Marker picks between its own element and Mapbox's default pin from what its children actually rendered, because a compiled children block cannot be inspected the way React.Children.forEach inspects descriptors. Children that render something, render nothing, or first render after mount all match upstream; a child that stays truthy while rendering nothing forever gets the default pin here and an empty, invisible element upstream; react-map-gl/mapbox-legacy (mapbox-gl v1) and @vis.gl/react-maplibre are out of scope | Supported and tested: Map server-renders its container with the merged style and omits every child, because mapbox-gl is only imported inside an effect. Nothing in the tree reads a browser global on the server. hydrateRoot adopts that container rather than replacing it, and the map is created inside the server's own node once the library resolves. | 2026-08-06 |
| [`@octanejs/recharts`](#octanejsrecharts) | `recharts@3.9.2` | Broad runtime support across cartesian, polar, hierarchical, tooltip, legend, responsive-container, shape, and chart-state surfaces. `Brush` and `Treemap` remain intentionally unsupported. | Chart events coordinate through octane's native delegated events rather than React's synthetic layer | Untested; text measurement (`getStringSize`) returns 0×0 under SSR. | 2026-07-29 |
| [`@octanejs/redux`](#octanejsredux) | `react-redux@9.3.0` | The hooks + `Provider` surface of react-redux 9.3.0 (`useSelector`, `useDispatch`, `useStore`, and the custom-context factory variants) on octane's `useSyncExternalStore`; works with any Redux 5 / Redux Toolkit store. Export parity is pinned by test. | `connect()` (the legacy HOC surface) intentionally throws — the hooks API is the supported surface; Error messages are octane-branded | No SSR-specific surface; no dedicated SSR tests. | 2026-07-08 |
| [`@octanejs/redux-toolkit`](#octanejsredux-toolkit) | `@reduxjs/toolkit@2.12.0` | Complete four-entry-point port: the framework-agnostic Toolkit and RTK Query core are re-exported verbatim; `/query/react` provides generated query, lazy-query, mutation, infinite-query, prefetch hooks and `ApiProvider`; `/react` provides the dynamic-middleware dispatch-hook integration. | The compatibility `/react` subpaths and `reactHooksModule` names are retained, but use octane and `@octanejs/redux` internally; `useDebugValue` is octane's no-op compatibility hook; observable query behavior is unchanged | Preloaded RTK Query state renders through the traditional @octanejs/redux Provider; effects and browser listeners remain client-only. Dedicated SSR and hydration tests are included. | 2026-07-13 |
| [`@octanejs/remix-router`](#octanejsremix-router) | `react-router@8.2.0` | COMPLETE port (all phases shipped — full export parity, EXPECTED_MISSING is empty): the framework-agnostic router core (lib/router/* + framework-free helpers, ~12k lines) is vendored byte-close and validated by 161 ported upstream router tests plus four focused v8.2 regression pins; the data-mode React layer (createMemoryRouter, RouterProvider incl. the /dom flushSync variant, Outlet, Await, RenderErrorBoundary/errorElement, Link + useLinkClickHandler, and the full read-hook family) and the declarative layer (MemoryRouter, Routes/Route in BOTH children forms — descriptor children walked upstream-style, .tsrx block children via a registration collector — Navigate, createRoutesFromChildren/Elements, the UNSAFE_With*Props wrappers) and the DOM layer (createBrowserRouter/createHashRouter with __staticRouterHydrationData parsing, BrowserRouter/HashRouter/unstable_HistoryRouter, Link + NavLink incl. the isActive/isPending render props, useLinkClickHandler, useSearchParams) and the mutation layer (Form on octane's native delegated submit event, useSubmit incl. JSON encTypes, useFormAction with ?index resolution, useFetcher/useFetchers incl. fetcher.Form/load/submit/reset and shared keys), the guard/scroll layer (useBlocker, unstable_usePrompt, ScrollRestoration/UNSAFE_useScrollRestoration, useBeforeUnload, useViewTransitionState, unstable_useRoute/unstable_useRouterState), static SSR (StaticRouter, StaticRouterProvider, createStaticHandler/createStaticRouter rendering through octane/server — markup byte-identical to react-dom/server after marker stripping, hydration payload identical), and the vendored cookie/session server runtime (createCookie/createSession/createCookieSessionStorage/createMemorySessionStorage) are transcribed onto octane and differential-verified against real react-router. Framework-mode + RSC names (Meta/Links/Scripts, createRequestHandler, UNSAFE_ internals) exist as THROWING STUBS so parity is honest. | Refs are props (octane has no forwardRef) — Link's forwardRef becomes a `ref` prop; Error-boundary reset on location change / revalidation-idle happens in a layout effect one commit after upstream's render-phase derivation — same observable outcome; octane's flushSync inside an ambient flush degrades to a plain call drained at that flush's boundary (sync scroll/navigation notifies from within event handlers land at the flush boundary instead of nested) — consumer-invisible, conformance-pinned; Form's onSubmit is a NATIVE delegated submit listener (octane has no synthetic events): `event.submitter` is read directly off the SubmitEvent where React reads `event.nativeEvent.submitter` — same value, differential-verified; Block-children `<Routes>` collects `<Route>`s by registration (mount order) instead of upstream's element-children walk (source order) — a conditionally-mounted `<Route>` between static siblings registers after them, which only affects matchRoutes score TIES; conformance-pinned | Shipped: StaticRouter/StaticRouterProvider/createStaticHandler/createStaticRouter render through octane/server (remix-router-ssr vitest project compiles the whole graph in server mode; markup matches react-dom/server byte-for-byte after framework-marker stripping). Block-children <Routes> is CLIENT-only (the registration collector runs in layout effects) — use descriptor children or route objects for SSR. | 2026-07-13 |
| [`@octanejs/rxjs`](#octanejsrxjs) | `@react-rxjs/core + @react-rxjs/utils@0.10.8 / 0.9.7` | Core bind/state/Subscribe APIs and the complete @react-rxjs/utils surface. | StateObservable values are not JSX nodes; render them through useStateObservable or bind; @react-rxjs/dom is omitted because octane batches updates without ReactDOM.unstable_batchedUpdates | useSyncExternalStore supplies the state snapshot during server rendering; browser-only ReactDOM batching helpers are intentionally absent. | 2026-07-30 |
| [`@octanejs/shadcn`](#octanejsshadcn) | `shadcn-ui/ui (radix base)@4baadbc6517070ae8f8feb2c97037adc2b305544 + shadcn@4.14.1` | Two primitive bases. RADIX base (default, reached at the bare subpaths): tiers 1-2 complete plus the first tier-3 composites — 40 component families. REACT ARIA base (@octanejs/shadcn/react-aria/<Family>): 33 families over @octanejs/aria/components, taken from upstream's aria-nova style and verified class-string identical to it; not ported are select and sonner (need input-group and next-themes), while hover-card, menubar and navigation-menu do not exist in upstream's aria base. Sources live at src/bases/<base>/ui/ with lib/hooks/styles shared. DISTRIBUTION is registry-first with per-family subpath exports; the monolithic root entry is removed. STYLING FLAVOR: the radix base is mid-migration from the pinned cn-* semantic-hook system to the default-Tailwind utilities-inlined flavor (user-directed); the react-aria base is uniformly the utilities-inlined aria-nova output. THE REGISTRY NOW COVERS ALL THREE BASES, using shadcn's own mechanism rather than a namespace: base and visual style compose into components.json's single `style` field, which the CLI substitutes into the registry URL (`{style}` and `{name}` are the only placeholders shadcn@4.14.1 substitutes, and it never parses the style string). Emitted as registry/styles/<style>/<name>.json for base-nova (default, @octanejs/base-ui), radix-nova and aria-nova, plus an un-styled copy of the default so a URL without {style} still resolves. Base-agnostic items (utils/types/theme/use-mobile) are emitted into every style tree because registryDependencies resolve through the same templated URL. `registry:serve` serves it locally — the port the playground's components.json always referenced but which nothing previously served. Verified end to end by installing with the real shadcn CLI: each style yields its own primitive. BASE UI base (@octanejs/shadcn/base-ui/<Family>): STARTED, 21 of 44 families and PARTIAL. `accordion` is transcribed from upstream and runs on the @octanejs/base-ui accordion primitive — the first primitive-backed family in this base. The rest are primitive-free: `alert` is transcribed from upstream's Base UI source and verified byte-identical to it; `aspect-ratio`, `card`, `empty`, `native-select`, `skeleton` and `spinner` are DERIVED from the react-aria base and are NOT yet verified against upstream, which each file's header records. Nothing primitive-backed is ported: Base UI's primitive API is structurally different from React Aria's, so it cannot be derived and needs transcribed upstream sources. The foundations now run on real Base UI primitives: `button` (Button), `input` (Field.Control), `label` (Field.Label) and `separator` (Separator), alongside plain-host `textarea` and `kbd` — Base UI ships no textarea or Keyboard primitive, so those match the radix base's shape rather than the aria base's. `separator` deliberately takes the ARIA base's class string, not the radix one: Base UI emits `aria-orientation`, so radix's `data-horizontal:` utilities would never match and the separator would render with no thickness. `button` omits the aria base's data-variant/data-size, which upstream's Base UI base also omits, and ships no LinkButton because Base UI has no Link primitive — which is why `pagination` remains unported. `alert-dialog` is transcribed from upstream and is the first portalled family here (Overlay->Backdrop, Content->Popup, Cancel->Close); it drops upstream's `cn-font-heading` on the title, matching the react-aria base, because this package ships the utilities-inlined flavor and nothing defines that semantic hook. The form controls (`checkbox`, `switch`, `radio-group`) adapt their conditional utilities rather than copying them: Base UI publishes bare `data-checked`/`data-unchecked` where radix publishes `data-state="checked"`, and every Root renders a `<span role=…>` that is never `:disabled`, so `disabled:` variants become `data-disabled:`. Both dialects are pinned by tests asserting the rendered DOM carries the attributes the class strings target. The overlays (`dialog`, `popover`, `tooltip`, plus `alert-dialog`) adapt positioning: Base UI inserts a Positioner layer (Portal > Positioner > Popup) and names its transform origin `--transform-origin`, not radix's `--radix-<part>-content-transform-origin`, so a copied radix class would reference a variable nothing sets and the popup would scale from the wrong corner. Tooltip also drops radix's `data-[state=delayed-open]` utilities, which have no Base UI counterpart. `PopoverAnchor` is absent because Base UI positions via the Positioner's `anchor` prop rather than an Anchor element — recorded in tests/cross-base.test.ts. | No `"use client"` directives anywhere: octane has no Server Components, so the RSC axis does not exist here; Refs are props (octane has no forwardRef) — upstream v4 already dropped forwardRef, so component shapes match; `asChild` composes element descriptors (createElement) rather than opaque compiled .tsrx children — the documented @octanejs/radix Slot contract. The same rule applies to the exported Portal wrappers (DialogPortal, AlertDialogPortal, DropdownMenuPortal, ContextMenuPortal, MenubarPortal): radix's Portal slots its child, so direct Portal children must be descriptors. The shipped *Content wrappers compose their Portal/Overlay/Content trees with createElement internally, so the ordinary authoring surface is unchanged — consumer children always flow through the props.children channel; Upstream's IconPlaceholder (the CLI-resolved `iconLibrary` axis) is resolved at port time to the default library, lucide, via @octanejs/lucide (XIcon, CheckIcon, CircleIcon, ChevronDownIcon, ChevronUpIcon, ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon, Loader2Icon); other icon libraries are a registry-emit concern; Events are native delegated DOM events: per-keystroke text handling on Input/Textarea is `onInput` (native `change` keeps its commit-on-blur meaning), menus open on native pointerdown/contextmenu, and component-level callbacks (`onValueChange`, `onCheckedChange`, `onPressedChange`, `onOpenChange`) are unchanged; ToggleGroup's variant/size/spacing/orientation inheritance uses octane's createContext/useContext with upstream's defaults and `context.value \|\| ownProp` precedence; SelectItem text portals into the trigger value node verbatim; multi-line-authored item text keeps its surrounding whitespace where React JSX would trim it (author item labels inline); Collapsible composes the radix binding's canonical Collapsible.Trigger/Collapsible.Content exports; the upstream CollapsibleTrigger/CollapsibleContent alias names are not exported by @octanejs/radix 0.1.12 (same components, different export alias); Accordion arrow-key navigation is collection-driven in the radix binding rather than RovingFocusGroup-wrapped; Home/End/Arrow focus movement between triggers is behaviorally equivalent and tested; FieldError renders falsy error-list entries as null instead of React's skipped false children — identical output; SidebarTrigger's click handling is the native delegated click event; behavior is otherwise identical to upstream. At this pin SidebarProvider does not mount a TooltipProvider, so consumers using SidebarMenuButton's tooltip prop must provide one (matches upstream); The packaged theme.css omits the upstream site-only tokens (--surface, --code-*, --selection*) and inlines concrete oklch values for --chart-1..5 (upstream references Tailwind palette variables, which require a Tailwind build this standalone file cannot assume); The Base UI base's derived components carry unverified class strings. This is tracked rather than assumed safe: the bases genuinely diverge (the radix base's Skeleton is `bg-accent` where react-aria's is `bg-muted`), so identity is verified per component. `badge` was deliberately NOT derived — the react-aria version takes `render` as a function while Base UI's takes an element, so deriving it would ship the wrong API | Tier 1 is fully server-rendered and tested (17 families through renderToString with no browser globals, including Slot-composed hosts), with hydration adoption pinned for representative shapes (plain host, Button-asChild anchor, nested Table) — zero mismatch, preserved node identity. Tier 2's portal-free components (Checkbox, RadioGroup, Switch, Slider, Tabs, Toggle, ToggleGroup, Accordion, Collapsible, AspectRatio, Progress) are server-rendered and tested. Field is SSR-safe (no portals/browser globals); Sidebar server-renders its static desktop branch (useIsMobile is false on the server; the mobile Sheet branch and tooltip portals are client-only). Portal-backed overlays/menus/Select are excluded until the radix binding supports overlay SSR; ScrollArea awaits verification of its viewport style injection on the server. | 2026-08-02 |
| [`@octanejs/solana-react`](#octanejssolana-react) | `@solana/react@7.0.0` | Octane-native client provider/store hooks, a validated private Wallet Standard adapter, explicit-action transaction orchestration, and a TanStack Query-backed request hook. Applications import framework-neutral operations directly from @solana/kit@7.0.0. | @solana/react/swr is excluded because Octane has no SWR binding; Wallet APIs are deliberately structural and narrower because upstream selected-wallet exports leak React and @wallet-standard/react public types; useSubscriptionQuery and useTrackedDataQuery are deferred pending streamed-query lifecycle characterization; Upstream sign-in/message/transaction hooks are represented by a generation-safe explicit transaction executor rather than hidden React runtime code; ClientProvider accepts only a resolved client; thenables throw at mount rather than suspending | Client state is server-readable. Wallet discovery is inert during SSR and activates only when a browser registry is explicitly attached after hydration. | 2026-07-29 |
| [`@octanejs/sonner`](#octanejssonner) | `sonner@2.0.7` | Complete against the published `sonner@2.0.7` public surface: `Toaster`, the callable `toast` API and all methods, `useSonner`, promise lifecycle, multiple toaster targeting, stacked layout, themes, styling, focus management, timers, and swipe dismissal. | Action callbacks receive native DOM `MouseEvent`s rather than React synthetic events; `Toaster` accepts its ref as a normal prop instead of using `forwardRef`; The document-visibility hook is guarded during SSR; upstream 2.0.7 reads `document.hidden` during render | Supported and tested: `Toaster` server-renders without browser globals, hydrates by adopting the server host, and can show the first client-created toast without replacing it. | 2026-07-13 |
| [`@octanejs/streamdown`](#octanejsstreamdown) | `streamdown@2.5.0` | Complete Streamdown 2.5.0 root runtime and public type surface, plus the official code 1.1.1, math 1.0.2, Mermaid 1.0.2, and CJK 1.0.3 plugins exposed through ./code, ./math, ./mermaid, and ./cjk. | Components, hooks, contexts, lazy boundaries, portals, element inspection, and the HAST JSX runtime target Octane; callbacks receive native DOM events instead of React synthetic events; The four official plugins are consolidated as subpath exports of @octanejs/streamdown instead of separate packages | Static and streaming Markdown, custom components, code blocks, math markup, and hydration are covered by dedicated server and hydration tests. Browser-only controls and deferred Mermaid rendering remain inert until mounted. | 2026-07-30 |
| [`@octanejs/styled-components`](#octanejsstyled-components) | `styled-components@6.4.3` | Full v6 web API, ported from the upstream 6.4.3 sources: `styled` with every HTML/SVG tag shortcut, `.attrs`/`.withConfig` chaining, `css`, `keyframes`, `createGlobalStyle`, `createTheme`, `ThemeProvider`/`ThemeContext`/`ThemeConsumer`/`useTheme`/`withTheme`, `StyleSheetManager`/`StyleSheetContext`/`StyleSheetConsumer` (targets, namespaces, vendor prefixing, stylis plugins, `shouldForwardProp`), `ServerStyleSheet`, `isStyledComponent`, `version`, and `__PRIVATE__`. Component selectors, folding (`styled(Styled)`), transient `$` props, `as`/`forwardedAs`, and the grouped CSSOM sheet engine (with upstream `data-styled` rehydration) all behave as upstream. The React Native surface and the RSC-only `stylisPluginRSC` are not ported. | `ref` is a plain prop (octane has no `forwardRef`); it always attaches to the rendered element and is never subject to `shouldForwardProp` filtering; SSR is automatic: server-side inserts flow through octane's css channel, so `renderToString`/streaming return the styles as `<style data-octane="sc.<componentId>.<name>">` chunks in `RenderResult.css` with per-request isolation, and client boot adopts those chunks without duplicate injection. `ServerStyleSheet` ships as a working compat wrapper, but `interleaveWithNodeStream` throws — octane streaming already interleaves styles; `defaultProps` on a styled component is resolved by the factory at render time (octane call sites do not apply component `defaultProps`); folding via `styled(Styled)` deep-merges as upstream; Polymorphic `as`/`forwardedAs` typing is pragmatic: component targets infer props from their function signature, host tags use a permissive prop bag (octane has no `JSX.IntrinsicElements` map to introspect); The babel `css` prop transform is not supported; The dev-only dynamic-creation warning uses a per-displayName creation-count heuristic instead of upstream's React-dispatcher probe; Unnamed stylis plugins actually throw the documented error 15 (upstream 6.4.3 constructs the error but forgets to throw it); Interpolation-position styled components are recognized by an octane brand symbol rather than React's forward-ref `$$typeof` (octane styled components are plain functions) | Supported and tested: zero-config collection into `RenderResult.css` via octane's `injectStyle` channel (styled rules, keyframes, and globals, with content-derived immutable chunk ids that make streaming dedup sound), repeat-render and dynamic-global request isolation through a stateless server output backend, hydration adoption of server chunks (removed after adoption, no duplicate rules), and the `ServerStyleSheet` compat surface. | 2026-07-18 |
| [`@octanejs/stylex`](#octanejsstylex) | `@stylexjs/stylex@0.19.0` | Full compile-time integration: re-exports the StyleX runtime API (`create`, `props`, `attrs`, `keyframes`, `defineVars`, `createTheme`) and registers as an import source; the `/vite` plugin runs the StyleX compiler over octane's compiled output and emits one static atomic stylesheet (`virtual:stylex.css`) with zero StyleX runtime in the bundle. | The `sx` JSX prop is not supported — spread `{...stylex.props(...)}` instead; The compiler runs over octane's compiled output rather than source, so StyleX's own PostCSS source-scanning setup is unused | Works under SSR — the stylesheet is static and server markup carries the final class names; no dedicated SSR test files. | 2026-07-09 |
| [`@octanejs/tanstack-ai`](#octanejstanstack-ai) | `@tanstack/ai-react@0.17.0` | Ports the @tanstack/ai-react 0.17.0 hook surface (useChat, useRealtimeChat, useGeneration, useGenerateImage/Audio/Speech/Video, useTranscription, useSummarize, useAudioRecorder, useMcpAppBridge) while reusing @tanstack/ai 0.41.0 and @tanstack/ai-client 0.21.0 unchanged and mirroring all 30 @tanstack/ai-client convenience re-exports from the upstream index. | The `./mcp-apps` subpath and its `MCPAppResource` component are not ported: they render `AppRenderer` from the React-only `@mcp-ui/client`, which has no Octane equivalent. The framework-agnostic `useMcpAppBridge` hook is ported and available on the main entry; Octane uses native events: text/file/recorder inputs drive updates via `onInput`; there is no synthetic `onChange` layer; Octane has no StrictMode double-invoke and always provides `useId`, so no random-id fallback is needed; The TanStack AI Devtools bridge is tagged `framework: 'octane'` (upstream `@tanstack/ai-react` sends `'react'`), so the devtools identify this binding correctly; Realtime reconnects and token refreshes use the latest `getToken` and adapter supplied to the hook; upstream @tanstack/ai-react 0.17.0 captures the first render's callbacks; The declared realtime `onStatusChange` callback is invoked alongside the hook's state update; upstream @tanstack/ai-react 0.17.0 currently drops the external callback; Changing `useChat`'s connection or fetcher updates the active ChatClient in place and preserves conversation state; upstream @tanstack/ai-react 0.17.0 captures the initial transport; One upstream `useChat` test case ("auto-resume on mount / when the browser comes back online") is omitted: it targets `ChatClient.prototype.maybeAutoResume`, an API absent from the pinned (and latest published) `@tanstack/ai-client@0.21.0` and never invoked by `useChat`. It is untestable in this binding until that dependency ships the method | Supported and tested: useChat renders its initial message snapshot through octane/server without a DOM. | 2026-07-16 |
| [`@octanejs/tanstack-devtools`](#octanejstanstack-devtools) | `@tanstack/react-devtools@0.10.7` | Ports the @tanstack/react-devtools 0.10.7 public surface (the `TanStackDevtools` component plus its plugin/init types) onto Octane while reusing the framework-agnostic `@tanstack/devtools` 0.12.5 core (`TanStackDevtoolsCore`) unchanged. Plugin, title, and custom-trigger content authored as Octane elements is portaled into the containers the core creates. | Public adapter types use Octane-prefixed names: `TanStackDevtoolsOctanePlugin` and `TanStackDevtoolsOctaneInit` (upstream: `TanStackDevtoolsReactPlugin` / `TanStackDevtoolsReactInit`); `ref` is the normal React-19-style ref prop and events are native (no synthetic layer), consistent with the rest of the Octane bindings; The main entry also re-exports the framework-agnostic `@tanstack/devtools` core surface (`TanStackDevtoolsCore`, container-id constants, and plugin authoring types) so consumers do not need a direct dependency on `@tanstack/devtools` for typing plugins; Plugin/title/trigger content is rendered through a tiny `DevtoolsPortal` component (a createPortal VALUE), because Octane renders a returned portal at any position rather than only as a direct JSX child | Supported and tested: the component renders its absolutely-positioned anchor element through octane/server without a DOM; the core is constructed but never mounted server-side (mount is a client-only effect). | 2026-07-17 |
| [`@octanejs/tanstack-form`](#octanejstanstack-form) | `@tanstack/react-form@1.33.2` | Ports the complete @tanstack/react-form 1.33.2 adapter surface (`useForm`, `useField`, form and field groups, hook contexts and component composition) while re-exporting @tanstack/form-core 1.33.2 unchanged and using @octanejs/tanstack-store for subscriptions. | Octane uses native events: text controls call `field.handleChange` from `onInput`; TanStack Form's `onChange` validator and listener option names remain unchanged; Octane has no StrictMode double-invoke and always provides `useId`, so the adapter omits StrictMode scenarios and the legacy random-UUID fallback; Component registration accepts Octane function components; class components are not supported by Octane | Supported and tested: fields and form subscriptions render their initial snapshots through octane/server without a DOM. | 2026-07-15 |
| [`@octanejs/tanstack-hotkeys`](#octanejstanstack-hotkeys) | `@tanstack/react-hotkeys@0.10.0` | Complete: the full upstream hook surface (`useHotkey`, `useHotkeys`, `useHeldKeys`, `useHeldKeyCodes`, `useKeyHold`, `useHotkeySequence`, `useHotkeySequences`, `useHotkeyRecorder`, `useHotkeySequenceRecorder`, `useHotkeyRegistrations`) plus `HotkeysProvider`/`useHotkeysContext`/`useDefaultHotkeysOptions`, re-exporting the framework-agnostic `@tanstack/hotkeys@0.8.0` core unchanged; store subscriptions go through `@octanejs/tanstack-store`. | `target` refs are plain `{ current }` objects (Octane has no `React.RefObject`); the `isRef` guard and behavior are otherwise identical | Supported: every hook registers listeners in effects and resolves `document` lazily, so server rendering produces no registrations and no browser access (matching upstream's `typeof document` guards). | 2026-07-20 |
| [`@octanejs/tanstack-pacer`](#octanejstanstack-pacer) | `@tanstack/react-pacer@0.22.1` | Complete: every upstream hook family — debouncer (`useDebouncer`, `useDebouncedState`, `useDebouncedValue`, `useDebouncedCallback`), throttler, rate-limiter, queuer, batcher, and their async variants (async-debouncer, async-throttler, async-rate-limiter, async-queuer, async-batcher) — plus `PacerProvider`/`usePacerContext`/`useDefaultPacerOptions`, the per-instance `Subscribe` render-prop component, and the upstream subpath exports (`/debouncer`, `/async-retryer`, `/types`, `/utils`, ...), re-exporting the framework-agnostic `@tanstack/pacer@0.21.1` core unchanged. | Upstream types spelled with `React.Dispatch<React.SetStateAction<T>>` use structurally identical local aliases (Octane state setters have the same shape) | Supported: instances are created lazily in `useState` initializers, cleanup runs in effects, and no browser globals are touched during render, so server rendering produces the initial (non-pending) state exactly like upstream. | 2026-07-20 |
| [`@octanejs/tanstack-query`](#octanejstanstack-query) | `@tanstack/react-query@5.101.3` | Complete: 58/58 runtime exports plus the full TypeScript surface; the export surface is byte-identical to upstream in both directions (locked by test), and `@tanstack/query-core` is re-exported verbatim. | Suspense integrates via octane's `use(thenable)` rather than throwing a promise (observable behavior matches) | `HydrationBoundary` fully ported (incl. streaming `promise`/`dehydratedAt` re-hydration); the SSR/streaming server entries and server-render tests are still open. | 2026-07-21 |
| [`@octanejs/tanstack-router`](#octanejstanstack-router) | `@tanstack/react-router@1.170.18` | Octane's TanStack Router binding: typed route factories and hooks, the full Match pipeline and lifecycle, file routes with TSRX-aware generator integration, full Link navigation/preloading/masking behavior, blocking, Await/deferred hydration, scroll restoration, lazy routes, not-found handling, document/head assets, and client/server SSR entries. | Refs are props — `createLink`'s `forwardRef` becomes a `ref` prop; Link callbacks receive native DOM events rather than React synthetic events; Router devtools are distributed separately | Full-document buffered and readable-stream SSR through `./ssr/server`, client hydration through `./ssr/client`, route-owned head/scripts, CSP nonce propagation, per-route SSR modes, and native Octane stream injection; covered by retained upstream conformance tests. | 2026-07-21 |
| [`@octanejs/tanstack-router-ssr-query`](#octanejstanstack-router-ssr-query) | `@tanstack/react-router-ssr-query@1.167.1` | Complete: `setupRouterSsrQueryIntegration` (the package's only export) delegating to `@tanstack/router-ssr-query-core@1.169.1`, with the QueryClientProvider Wrap composition on Octane. | none known | Supported — this package IS the SSR integration (dehydrates query state into the router stream and wraps the app in the query provider). | 2026-07-20 |
| [`@octanejs/tanstack-store`](#octanejstanstack-store) | `@tanstack/react-store@0.11.0` | Re-exports `@tanstack/store@0.11.0` unchanged and implements the stable React binding surface (`useSelector`, `useAtom`, `useCreateAtom`, `useCreateStore`, `createStoreContext`, and deprecated `useStore`) on Octane hooks. | The upstream experimental `_useStore` hook is intentionally omitted; use `useSelector` with `store.actions` or `store.setState` instead | Supported: selectors, writable atoms, and store context read their current snapshots during server rendering; the adapter has no browser-only initialization. | 2026-07-15 |
| [`@octanejs/tanstack-table`](#octanejstanstack-table) | `@tanstack/react-table@9.0.0-beta.58` | Complete port of the v9 adapter: the framework-agnostic `@tanstack/table-core` (constructTable + every tree-shakeable feature and row model) is reused verbatim, and the adapter — `useTable`, `Subscribe`, `flexRender`/`FlexRender`, `createTableHook`, `createTableHookContexts` — is transcribed onto octane hooks. Table state lives in TanStack Store atoms via the `coreReactivityFeature` bindings, and `useSelector` drives re-renders from the selected slice. Every store primitive (hooks, `createAtom`, `batch`, `shallow`, and the atom/store types) is imported from @octanejs/tanstack-store, which re-exports all of @tanstack/store — the binding takes no direct dependency on the store core, so there is only one path to it and atom identity cannot be split across duplicate copies. | `flexRender`'s class-component and `react.memo`/`forwardRef` exotic-component branches are dropped — octane has no class components or forwardRef, and octane's `memo()` returns a plain function, so `typeof === 'function'` covers every component; Upstream's `useLegacyTable` entry (the v8-compat `get*RowModel` shim, its marker factories, and the `Legacy*` type aliases) is NOT ported. It exists to migrate existing React v8 codebases; octane has none, so octane code targets the v9 `useTable` API directly | No SSR-specific surface; table-core is pure computation. | 2026-07-26 |
| [`@octanejs/tanstack-virtual`](#octanejstanstack-virtual) | `@tanstack/react-virtual@3.14.5` | Complete 1:1 port: the framework-agnostic `@tanstack/virtual-core` (Virtualizer + observers + windowing math) is reused verbatim; the React adapter (`useVirtualizer`, `useWindowVirtualizer`, incl. `useFlushSync` and the experimental `directDomUpdates` surface) is transcribed onto octane hooks, preserving upstream's force-update + flushSync-on-sync-scroll wiring and layout-effect lifecycle. | octane's `flushSync` called while a flush is already on the stack degrades to a plain call drained by the ambient flush (re-entrancy guard) — sync scroll notifies dispatched from inside a discrete-event flush land at that flush's boundary instead of nested; consumer-invisible, pinned by a conformance test | SSR-safe: `useIsomorphicLayoutEffect` degrades to `useEffect` without `document`; the first paint windows from `initialRect`/`initialOffset` exactly as upstream. No dedicated SSR tests. | 2026-07-12 |
| [`@octanejs/tauri`](#octanejstauri) | `@tauri-apps/api@2.11.1` | Octane hooks over the framework-neutral Tauri IPC surface: useInvoke (suspending command), useInvokeState (pending/success/error with refetch), and useTauriEvent (event subscription with lifecycle-safe teardown). The rest of @tauri-apps/api — window, webview, menu, tray, path, dpi, image, and the plugin packages — is already framework-neutral and is imported directly rather than re-exported here. | There is no React binding upstream; @tauri-apps/api ships promise and callback APIs, so this package is a new hook layer rather than a port; Hook call-site slots are forwarded through Octane's compiler binding ABI; useInvoke integrates with Octane's use() rather than React's use() or a thrown-promise implementation detail; Command arguments given as a plain record are compared by value for the default refetch key; array and binary payloads are compared by identity. The command name is always part of the key, so explicit deps extend it rather than replacing it; useInvokeState returns to pending on refetch and does not implement stale-while-revalidate; a caching query layer belongs to @octanejs/tanstack-query; A failed useTauriEvent subscription throws by default so a missing capability is loud, and is then recovered by the enclosing boundary's reset(); passing onError reports it instead, keeping the component mounted so a changed event or enabled flag retries; Channel-based streaming has no hook yet: construct Channel directly and keep it stable with useMemo | Server rendering performs no IPC. useInvokeState renders its pending state and issues the command on the client after hydration; useTauriEvent subscribes only on the client. useInvoke is client-oriented: without a Tauri host it rejects with TauriUnavailableError so the boundary reports rather than hangs. | 2026-07-27 |
| [`@octanejs/testing-library`](#octanejstesting-library) | `@testing-library/react` (unpinned) | `render`/`rerender`/`cleanup`/`renderHook` + `act` over the verbatim `@testing-library/dom` (every query, `screen`, `within`, `waitFor`, `fireEvent`, `prettyDOM`, `configure`), with commit timing wired to octane's scheduler via the dom-library's `eventWrapper`/`asyncWrapper` config. | `fireEvent` dispatches real native events — no React remappings (`fireEvent.change` fires an explicit native `change`, not text typing or checkbox click activation) and no enter/leave/focus double-dispatch; Not ported: the `ReactStrictMode` wrapper, `legacyRoot`, and the `onCaughtError`/`onRecoverableError` options | `hydrate: true` adopts octane SSR output via `hydrateRoot`. | 2026-07-17 |
| [`@octanejs/three`](#octanejsthree) | `@react-three/fiber@9.6.1 (2a528745)` | Technical-preview Milestones 0–10 surface: renderer configuration and the DOM Canvas boundary, compiler ABI and renderer-local Three intrinsic types, catalogue and both extend forms, primitive/args construction, Three prop application, attachment, ordered placement/recreation, retained visibility, lifecycle/ref delivery, ownership-aware disposal, promise-returning HTMLCanvasElement and OffscreenCanvas roots, Octane act/flushSync scheduling, callback-aware unmountComponentAtNode, callable root state, scene/camera/raycaster and resize/DPR/viewport configuration, shadows/colors, one shared frame loop, controlled WebXR loop handoff, context-restore invalidation, compatible/reconstructing HMR, global effects, useStore/useThree/useFrame/useGraph and managed-instance helpers, the ray/pointer event system with DOM sources and custom managers, a keyed useLoader cache with preload/clear and GLTF graph augmentation, retained Suspense/Activity behavior, client Three-to-DOM pending/error projection, same-renderer createPortal targets with state/event enclaves and physical Three event bubbling, client-only Canvas shell streaming and production Vite/Rsbuild hydration adoption with the matching raw Rspack graph split, the explicit-target low-level DOMRegion boundary, a deterministic testing harness, an asynchronously acknowledged structured-clone transport proof, a checked public API/subpath matrix, Three r156/current compatibility lanes, a packed external consumer, real WebGL failure/recovery coverage, and semantic-checksummed renderer and shipped-size benchmarks. | Octane owns component execution, hooks, context, scheduling, Suspense, refs, and effects instead of embedding React Reconciler; The programmatic root renders an Octane component plus props rather than a React element descriptor; The upstream callable store selector remains order-based because dynamic function calls cannot receive compiler slots; compiler-visible useStore(selector) and useThree(selector) preserve Octane's conditional-hook semantics; buildGraph omits unnamed mesh and material entries, plus array-valued material entries, instead of publishing empty or undefined keys; Removing a pierced prop resets its original nested target; R3F 9.6.1 mistakenly writes that default to the leaf key on the root object; Reconstructing a captured or hovered object rewrites nested stored intersections to the replacement; R3F 9.6.1 updates only the outer hover identity and capture-map key, which leaves captured delivery pointing at the retired object; Hidden retained Activity subtrees are excluded from recursive raycasts; Three r172 ignores Object3D.visible during raycasting, so R3F 9.6.1 can otherwise pierce a hidden descendant through an interactive visible ancestor; Managed and externally leased portal targets are root-scoped and cross-root portal placement is rejected before mutation; this makes the universal target-handle lifetime explicit; Root teardown and unmountComponentAtNode callback delivery are synchronous; R3F 9.6.1 defers its registry teardown and callback by 500 milliseconds; DOMRegion is an Octane-specific explicit-target Three-to-DOM primitive, not R3F or Drei Html and not the WebXR DOM Overlay API; it intentionally defines no positioning, occlusion, styling, or layout contract | Three scene modules are client-only and Canvas.children is omitted from the server graph. Canvas streams its DOM shell and native fallback, then production Vite and Rsbuild hydration adopt those nodes and create one Three root on the client; raw Rspack proves the equivalent client/server graph split without claiming an application SSR lifecycle. DOMRegion and its reverse-DOM content remain inside the omitted client-only Three scene. | 2026-07-17 |
| [`@octanejs/tiptap`](#octanejstiptap) | `@tiptap/react@3.28.0` | Complete @tiptap/react 3.28.0 adapter surface across the root and ./menus entries: @tiptap/core re-exports, editor hooks and contexts, the EditorContent portal bridge, compound Tiptap API, ReactRenderer, custom NodeView/MarkView renderers and helpers, BubbleMenu, and FloatingMenu. | Subscriptions use Octane's native useSyncExternalStore implementation, so the published binding does not depend on React or use-sync-external-store; EditorConsumer is a render-prop compatibility component because Octane contexts do not expose React's .Consumer property; Renderer components are Octane component bodies and refs are ordinary props; the React-prefixed public names are retained for TipTap source compatibility without a React dependency; NodeViewWrapper consumes its as prop after selecting the host tag; @tiptap/react 3.28.0 also forwards that prop as an invalid DOM attribute; BubbleMenu and FloatingMenu handlers receive native browser events rather than React synthetic events; ReactMarkView tears down its portal when ProseMirror destroys the mark view, closing a renderer leak present in @tiptap/react 3.28.0 | Covered across the complete surface: hooks use null server snapshots and suppress editor construction without a DOM, static NodeView/MarkView helpers render without a DOM renderer, detached menu targets are client-only, and hydration adopts deferred server shells before mounting live custom views and menus. | 2026-07-17 |
| [`@octanejs/usehooks-ts`](#octanejsusehooks-ts) | `usehooks-ts@3.1.1` | First host-safe cohort: useBoolean, useCounter, useToggle, useMap, useStep, useDebounceCallback, useDebounceValue, useInterval, useTimeout, useIsMounted, and useUnmount. | Only the listed pure, timing, and lifecycle hooks are exported; browser storage/media hooks and DOM observer/direct-element hooks are deliberately absent; Public setter types are structurally equivalent to React Dispatch/SetStateAction without importing React types | Supported for the listed cohort. Effects and timers do not run during server rendering; hydration activates lifecycle and timing work without requiring browser reads during render. | 2026-07-29 |
| [`@octanejs/valtio`](#octanejsvaltio) | `valtio@2.3.2` | The framework-agnostic `valtio/vanilla` core and `valtio/vanilla/utils` are re-exported verbatim; `useSnapshot` and the `useProxy` utility are ported to Octane. | React DevTools affected-path debug labels are omitted because Octane's `useDebugValue` is currently a no-op | The server snapshot path uses `snapshot(proxyObject)`; no dedicated SSR rendering test is included yet. | 2026-07-27 |
| [`@octanejs/visx`](#octanejsvisx) | `@visx/visx@4.0.0 + master@485c035` | Complete current Visx 4.x web runtime surface: the exact 35-namespace aggregate, all 40 feature entry points, and the eight public a11y/react, a11y/server, axis/react, scale/react, shape/react, theme/react, tooltip/floating, and voronoi/react subpaths. Released-only packages chord, delaunay, react-spring, sankey, and stats remain directly importable exactly as upstream specifies. | Interaction callbacks receive native DOM events through Octane's delegated event system instead of React synthetic events; All React class controllers and class-instance refs are replaced by native functional TSRX hooks; Brush intentionally omits upstream's legacy innerRef instance handle; Deterministic text metrics and annotation bounds, pure SplitLinePath SVG sampling, and collision-aware estimated wordcloud rectangles replace browser-only measurement/canvas paths so fixed-size output is identical during SSR and first hydration. Font-specific wrapping, browser-specific path length rounding, and pixel-exact d3-cloud packing can differ; The react-spring entry point uses a deterministic requestAnimationFrame numeric interpolator rather than spring-physics timing, and Zoom uses native wheel/pointer/touch listeners rather than @use-gesture/react at runtime. Their public Visx props and exports are retained; Zoom imports framework-neutral @use-gesture/core types only; Props upstream types as React.ReactNode are octane renderables (octane's OctaneNode = unknown): octane elements are nominal, so ReactNode-typed props would reject them. Render-prop signatures keep their parameters and return octane renderables | Fixed-dimension primitives, wrapped XYChart series, annotations, text, and wordclouds emit complete deterministic SVG on the server. Real hydrateRoot adoption preserves the same SVG/definition/axis/text/series/annotation/wordcloud nodes without warnings, replacement, or post-effect markup changes; generated IDs, measurement fallbacks, portals, and responsive initial sizes are covered. | 2026-07-14 |
| [`@octanejs/wagmi`](#octanejswagmi) | `wagmi@3.7.4` | WagmiProvider and createConfig over @wagmi/core 3.6.4, with config, connection, connect, disconnect, switch-connection, switch-chain, connectors, connections, chains, balance, contract read/simulate/write, transaction send/wait, and message-signing hooks. | The binding targets Wagmi v3 names. Deprecated v2 useAccount/useSwitchAccount aliases and hooks outside the documented representative inventory are not exported; Privileged mutation hooks force retry:false, require a current live connector, cancel before dispatch when the displayed wallet context changed, and quarantine a late success as ActionContextChangedError when account, chain, or connector changed after dispatch; RainbowKit 2.2.x declares Wagmi v2 peers. Its defining provider/custom-button/modal contracts can be implemented over this v3 surface, proven by the deterministic disconnected-to-connecting-to-connected gate, but the downstream binding must document that peer-range divergence; The connectors subpath exposes the dependency-free injected and deterministic mock connectors. Vendor connectors and their optional SDKs remain direct application dependencies; EIP-1193 event validation, duplicate coalescing, and connector-generation invalidation are delegated unchanged to @wagmi/core 3.6.4. This binding does not add a second provider-event layer or claim independent normalization behavior | WagmiProvider supports ssr:true and initialState through @wagmi/core hydrate. parseHydratedState accepts only a versioned, 16 KiB-bounded public-state hint and rejects malformed or privileged material; a hydrated connection is never authority for signing or submission. | 2026-08-02 |
| [`@octanejs/zustand`](#octanejszustand) | `zustand@5.0.14` | Complete 1:1 port: the framework-agnostic vanilla store is reused verbatim; `create`/`useStore`, `shallow`/`useShallow`, the traditional equality-fn variants, and all middleware (persist, devtools, subscribeWithSelector, combine, redux). | Unstable selectors (a new reference every render) settle after a bounded number of re-renders instead of hitting React's `useSyncExternalStore` warning loop — still prefer `useShallow` | No SSR-specific surface; no dedicated SSR tests. | 2026-07-20 |

## @octanejs/animejs

[`packages/animejs`](../packages/animejs) `0.0.3` — ports `animejs@4.5.0`. Status data: [`packages/animejs/status.json`](../packages/animejs/status.json).

Anime.js is re-exported unchanged; `useAnimeScope` binds scoped DOM animation setup, refresh, dependency recreation, and cleanup to Octane, and `@octanejs/animejs/adapters/three` exposes Anime.js's official Three adapter.

Known divergences:

- `useAnimeScope` is an Octane-native lifecycle helper; it is not an upstream Anime.js API.
- Only the root and `adapters/three` entry points are re-exported; other Anime.js subpaths are explicit gaps whose APIs remain available from the supported root where upstream exposes them there.
- The Three adapter mutates raw objects while `@octanejs/three` retains frame-loop ownership; demand and never loops require explicit invalidation or advancement.

SSR / hydration: Supported. The hook returns inert refs during server rendering and creates no Anime.js scope until its client effect runs.

Scope/evidence last checked: 2026-07-30.

- Verified with real Anime.js scopes, dependency-driven cleanup, SSR rendering, the official adapter against an @octanejs/three-owned mesh, and a DOM plus demand-loop Three playground journey.

## @octanejs/apollo-client

[`packages/apollo-client`](../packages/apollo-client) `0.1.28` — ports `@apollo/client@4.2.6`. Status data: [`packages/apollo-client/status.json`](../packages/apollo-client/status.json).

Complete published client adapter surface: all 18 @apollo/client/react runtime exports and their Apollo 4.2.6 TypeScript declarations, framework-neutral root/testing exports, an Octane MockedProvider, and the Octane-native /react/ssr prerenderStatic entry.

Known divergences:

- Suspense unwraps stable Apollo promises through Octane use() instead of React's use() or a thrown-promise fallback.
- The React class-based MockedProvider is an equivalent Octane function component.
- React Server Components and Apollo's React Compiler-generated entry are intentionally not exposed.

SSR / hydration: Dedicated Node-mode tests cover multi-pass useQuery, nested query waterfalls, per-request cache isolation, ssr:false/no-cache, render limits, and scoped CSS; client hydration verifies cache restoration, in-place adoption, and no duplicate fetch. Streaming cache patches remain open.

Scope/evidence last checked: 2026-07-25.

See also: [`docs/apollo-client-port-plan.md`](apollo-client-port-plan.md)

## @octanejs/aria

[`packages/aria`](../packages/aria) `0.0.27` — ports `react-aria@3.50.0`. Status data: [`packages/aria/status.json`](../packages/aria/status.json).

Phases 0-5 + the Tree/Table follow-up complete. Phases 0-1: the utils foundation, SSR utilities, the complete interactions area (usePress, useHover, focus/keyboard family, useLongPress, useMove, Pressable/PressResponder), the focus area (FocusScope with containment/restore/focus managers, FocusRing, useFocusRing, useHasTabbableChild), the i18n area (I18nProvider, locale/collator/formatter/filter hooks), form validation (useFormValidation + stately useFormValidationState), and the leaf hooks: useButton/useToggleButton(+Group), useLabel/useField, useCheckbox(+Group/+Item), useRadio/useRadioGroup, useSwitch, useTextField, useSearchField, useProgressBar, useMeter, useSeparator, useLink, useDisclosure, useToolbar, VisuallyHidden. Phase 2 adds the collections + selection tier: the stately collections engine (CollectionBuilder/Item/Section/useCollection) and selection core (Selection/SelectionManager/useMultipleSelectionState), the stately state hooks (useListState/useSingleSelectListState, useTreeState, useMenuTriggerState/useSubmenuTriggerState, useOverlayTriggerState, useSelectState, useComboBoxState, useTabListState, useNumberFieldState, useSliderState), the aria selection area (useSelectableCollection/-Item/-List, useTypeSelect, ListKeyboardDelegate, DOMLayoutDelegate), and the aria hooks useListBox/useOption/useListBoxSection, useMenu/useMenuItem/useMenuSection/useMenuTrigger/useSubmenuTrigger, useTab/useTabList/useTabPanel, useSlider/useSliderThumb, useNumberField, useGridList(+Item/+Section/+SelectionCheckbox), useTag/useTagGroup, useBreadcrumbs/useBreadcrumbItem — plus the matching react-stately state hooks under `@octanejs/aria/stately`. Phase 3 adds the overlays hooks tier: the stately `useTooltipTriggerState` and the whole aria overlays area (usePreventScroll, ariaHideOutside, DismissButton, PortalProvider, useOverlay, useOverlayTrigger, useOverlayPosition + calculatePosition, Overlay/useOverlayFocusContain, useModal/ModalProvider/OverlayProvider/OverlayContainer, useModalOverlay, usePopover), plus the consumers useDialog, useTooltip/useTooltipTrigger, useSelect/useHiddenSelect/HiddenSelect, and useComboBox. Differential-verified byte-identical against the real react-aria (interactions + button/toggle/checkbox/switch/radio/textfield/progress + tabs + listbox + select + combobox fixtures); dialog/tooltip/overlay focus-trap/dismiss/scroll-lock paths are covered by behavioral tests (the differential rig shares one document, so focus/portal/positioning aren't rig-driveable). Autocomplete (useAutocomplete/useSearchAutocomplete) is deferred — useComboBox does not depend on it in 3.50.0. Phase 4 adds the react-aria-components foundation under `@octanejs/aria/components`: the collections engine re-hosted on a detached real-DOM store (BaseCollection/CollectionBuilder/createLeafComponent/createBranchComponent/Hidden/useCachedChildren + Collection/Section), the RAC plumbing (Provider, useContextProps, slotted contexts, useRenderProps/composeRenderProps with data-* state attributes), and the non-collection components: Button, ToggleButton(+Group), Checkbox(+Group/Field/Button), Switch(+Field/Button), RadioGroup(+Radio/Field/Button), TextField, SearchField, NumberField, Form, Label/Input/TextArea/FieldError, Group, Toolbar, Separator, Header, Heading, Link, ProgressBar, Meter, Slider(+Output/Track/Thumb/Fill), Disclosure(+Group/Panel), DialogTrigger/Dialog, Modal/ModalOverlay, Popover, TooltipTrigger/Tooltip, OverlayArrow, Text, Keyboard, SelectionIndicator, SharedElementTransition. Phase-4 differentials drive the REAL components on both sides byte-identical (Button hover+mid-press, ToggleButton, Checkbox, TextField typing, Disclosure expand/collapse). Phase 5 adds the RAC collection components over that engine: Autocomplete (full — aria useAutocomplete + stately useAutocompleteState now ported), ListBox(+Item/Section/LoadMoreItem), Menu(+MenuTrigger/SubmenuTrigger/MenuItem/MenuSection), Select(+SelectValue), ComboBox(+ComboBoxValue), Tabs(+TabList/Tab/TabPanels/TabPanel), TagGroup(+TagList/Tag), GridList(+Item/Section/Header/LoadMoreItem), Breadcrumbs(+Breadcrumb), and the DragAndDrop context layer (DropIndicator/contexts/DragAndDropHooks type; components' dnd branches are inert — the dnd engine and useDragAndDrop() itself arrive in a later phase, the stub throws). Phase-5 differentials drive the REAL react-aria-components byte-identical (ListBox selection + keyed reverse, Tabs switch, TagGroup multi-select, GridList row selection, Breadcrumbs, ComboBox typing); Menu/Select open-state (portal'd) carries behavioral coverage incl. keyboard-driven submenus. The Tree/Table follow-up adds the remaining collection verticals: stately grid (GridCollection/useGridState) + the full stately table area (TableCollection/useTableState/column-resize state/UNSTABLE_useTreeGridState), the aria tree hooks (useTree/useTreeItem) and the full aria table hook area (useTable family, TableKeyboardDelegate, useTableColumnResize, grid hooks it rides on), RAC Tree(+TreeItem/TreeItemContent/TreeSection/TreeHeader/TreeLoadMoreItem) and RAC Table(+TableHeader/TableBody/Column/Row/Cell/ColumnResizer/ResizableTableContainer/TableFooter/TableLoadMoreItem). Tree structure states and the interactive Table (sort cycling, row selection) are differential-verified byte-identical vs the real react-aria-components; chevron-driven Tree interaction carries behavioral coverage (the rig's virtual clicks cannot faithfully reproduce the focus-effect interplay on the React side). TableLayout lands with the Virtualizer; date/color families and the drag-and-drop engine are not started — see the migration plan.

Known divergences:

- Text-input DOM wiring uses octane's native `onInput` (per keystroke) instead of React's synthetic `onChange`; React Aria's public value-level `onChange(value)` callbacks are unchanged.
- `forwardRef` becomes octane's ref-as-prop.
- i18n server serializer: hoisted-string variable names stay valid identifiers past 26 entries (upstream's `common.size + 97` yields `{`, `|`, … — a SyntaxError in the emitted inline script).
- useDefaultLocale, SSR branch: `direction` derives from the server-injected locale via `isRTL` (upstream hardcodes 'ltr' even for an injected RTL locale, disagreeing with its own getDefaultLocale).

SSR / hydration: Dedicated Node-mode coverage verifies SSRProvider, hydration-safe labelled relationships, server snapshots, and injected LTR/RTL locales; real Vite-compiled Octane server markup is hydrated in place and remains interactive. Overlay and collection SSR registration remain planned for Phase 8.

Scope/evidence last checked: 2026-07-25.

See also: [`docs/aria-migration-plan.md`](aria-migration-plan.md)

## @octanejs/base-ui

[`packages/base-ui`](../packages/base-ui) `0.1.31` — ports `@base-ui/react@1.6.0`. Status data: [`packages/base-ui/status.json`](../packages/base-ui/status.json).

Alpha, in progress: 34 of 43 upstream subpaths. The foundation, overlay infrastructure, hover/focus interaction layer, list-navigation/typeahead layer and popup viewport have landed, along with Dialog, AlertDialog, Popover, Tooltip, PreviewCard, the full form-control set, and the standalone Button/DirectionProvider/CSPProvider/useMediaQuery utilities — ported at full fidelity and differential-verified against the real `@base-ui/react`. Menu is COMPLETE at all 20 upstream parts — Root/Trigger/Portal/Positioner/Popup, the full item family (Item, LinkItem, CheckboxItem, RadioGroup/RadioItem and their indicators, Group/GroupLabel, Separator), Arrow, Backdrop, Viewport, and SubmenuRoot/SubmenuTrigger. Menubar and ContextMenu have landed too, so the whole menu family is complete. Toast is complete at all 11 parts, including the imperative toast manager, auto-dismiss timers with hover/focus pausing, and promise toasts; swipe-to-dismiss is covered too. Collapsible is complete at all 3 upstream parts (Root/Trigger/Panel), including upstream's <Activity> animation-resume suppression — octane's Activity has React's contract (hidden subtrees keep state and DOM while effects tear down and re-fire on reveal), so that path is ported rather than skipped and is the first component carrying a port of Base UI's OWN test file, under tests/upstream/ — 16 of its 35 upstream cases, being every case that does not require real layout measurement, CSS transition/keyframe sequencing, React.Activity, or find-in-page `beforematch`. Accordion is complete at all 5 upstream parts (Root/Item/Header/Trigger/Panel), built directly on Collapsible — each Item runs its own useCollapsibleRoot and provides CollapsibleRootContext, exactly as upstream does. It carries 18 tests: 15 ported from upstream's own suite plus 3 written to close a real gap — upstream only exercises single-vs-multiple toggling inside jsdom-skipped blocks, so removing the single-mode collapse branch passed every ported case.

Known divergences:

- Handlers receive native DOM events (no synthetic layer): visible text controls use per-edit `input`, while the NumberField form-facing number input intentionally observes native `change` commits. React's synthetic-only `event.isPropagationStopped()` (used by Menu's popup keyboard relay) becomes a native `event.cancelBubble` read.
- `forwardRef` becomes ref-as-prop; `className` composes via octane's `normalizeClass` (the render-prop string merge matches Base UI exactly).
- The vendored `floating-ui-react` surface is internal rather than republished, so its standalone `useHover` combiner is not ported — no Base UI component uses it.
- Tooltips outside a `Tooltip.Provider` still share the delay-group context's module-level default refs, so opening one closes another. Transcribed from Base UI rather than chosen; pinned by `tests/tooltip-delay-group.test.ts`.
- `NumberField.ScrubArea` and hold-to-repeat stepping remain unported; the steppers respond to single presses only.

SSR / hydration: Dedicated Node-mode tests cover server snapshots, accessible separators, edge-aligned slider visibility, and closed dialogs; hydration adopts Vite-compiled Octane server markup, transitions to the client snapshot, and preserves interaction. Open overlays and remaining components are not yet covered.

Scope/evidence last checked: 2026-08-01.

See also: [`docs/base-ui-migration-plan.md`](base-ui-migration-plan.md)

## @octanejs/cmdk

[`packages/cmdk`](../packages/cmdk) `0.1.16` — ports `cmdk@1.1.1`. Status data: [`packages/cmdk/status.json`](../packages/cmdk/status.json).

Complete against the published `cmdk@1.1.1` public surface: `Command` (the root itself) and the `CommandRoot` named export, `Command.Input`, `Command.List`, `Command.Item`, `Command.Group`, `Command.Separator`, `Command.Dialog`, `Command.Empty`, `Command.Loading`, the flat `CommandX` aliases, `useCommandState`, and `defaultFilter` — with the DOM-authoritative store and item/group registration, `useValue` text-content inference, `onInput`-driven search, score filtering plus item and group DOM sorting, keyboard navigation (arrows/Home/End/vim/Enter), controlled `value`/`onValueChange`/`loop`/`shouldFilter`/custom `filter`/`forceMount`, the `--cmdk-list-height` ResizeObserver, and a Radix-backed `Command.Dialog`. `asChild` is the one unsupported prop (see divergences).

Known divergences:

- No forwardRef: components take `ref` as a normal prop; multi-ref uses octane's `ref={[a, b]}` instead of composeRefs.
- `Command.Input` drives search from the native `onInput` event; the public `onValueChange(search)` API is unchanged (no synthetic `onChange`).
- Item value is inferred from the provided `value` prop or the rendered `textContent`; cmdk's string-child inspection is dropped because octane's compiled children are opaque. An item that has never been scored therefore renders once so the inference can read its text — treating unscored as score zero deadlocks it (null render leaves no element, no element leaves no textContent, no textContent scores zero), which made items arriving during an active search permanently invisible.
- Score ranking is expressed as CSS `order` inside a flex container, not by relocating DOM nodes. Upstream's sort() is DOM-authoritative: it appendChild's matching items into the list sizer. Octane fences every component's DOM with comment markers and tracks the range between them, and a template construct like `@for` or `@if` wraps each item in a SECOND, outer range — so relocating an item carries it out of every range at once, and the loop later clears an empty range while the real node is orphaned in the list forever. Carrying the flanking markers along only repairs the innermost range, so it breaks again at each new nesting construct. Ranking declaratively removes the class of bug: no node moves, no range is violated, and clearing the search restores true source order because the styles are simply dropped. The cost is that the list sizer and each group's item container are flex columns WHILE a filter is active, so a consumer relying on physical DOM order (`:nth-child` styling, drag handles) or on a custom container `display` diverges from upstream. Selection, arrow-key navigation and alt+arrow group navigation all read the ranked order, not DOM order, so what is selected always matches what is on screen. Every valid item is ranked rather than only the matches: an unranked flex child keeps the initial `order` of 0, which sorts it AHEAD of every match, so a force-mounted non-match would jump to the top of its container. Ranking everything puts zero-scoring items last, which is where upstream's append-in-score-order leaves them too. Ranks land on the child the container actually lays out, resolved at any nesting depth, because `order` applies to a flex CHILD — upstream resolves a single wrapper level, which its appendChild model tolerates but this one does not. Ungrouped items and group hosts share the sizer's rank space, so the former are numbered densely and the latter continue past them, matching upstream's order of appending items before groups.
- `aria-activedescendant` is wired on the initial auto-select and after every filter; upstream queues that work from inside its own layout-effect flush and its batcher discards it, so upstream only sets the attribute after a directly user-driven selection. The runtimes agree on which item is selected.
- Ids are `radix-` prefixed to match upstream, which takes them from `@radix-ui/react-id`.
- Group reordering resolves each group element by its registered value rather than upstream's `[cmdk-group=""][data-value="<groupId>"]` selector. That selector can never match — `data-value` holds the group's heading text, never its id — so upstream's group sort is effectively dead code; the port makes groups genuinely reorder by their best item score.
- Re-registering an item value during an active search re-derives the whole filter aggregate (match count and matching groups), not just that item's score. Upstream only re-sorts, leaving `filtered.count`/`filtered.groups` describing the previous values — so an item that starts matching renders while `Command.Empty` still shows "no results" (and its group can stay hidden). Upstream's own item-registration path already re-derives the aggregate the same way, so the omission reads as an oversight rather than intent.
- Force-mounted items are counted so `Command.Empty` can see them. Upstream skips registration entirely for a `forceMount` item, so it never reaches `filtered.count` — with a search that matches nothing, upstream renders the force-mounted item and "no results" on top of each other. The port tracks the live force-mounted count separately (`filtered.count` keeps its upstream meaning for `useCommandState`) and Empty consults both.
- Removing the selected force-mounted item moves the selection on. Because upstream never registers a `forceMount` item it has no teardown for one either, so the selected value keeps pointing at a node that is gone: nothing renders `aria-selected`, `aria-activedescendant` dangles at a removed id, and Enter does nothing until the user arrows away. The port re-selects from the force-mount teardown, the same way the plain item teardown does.
- Every registration path releases the value it registered. Items, force-mounted items and groups all register through the same `useValue`, but upstream only releases on the plain item teardown — so a force-mounted item or a group that unmounts leaves its entry in `ids`/`filtered.items` for the Command's lifetime. In the port all three release symmetrically, which also keeps the dev-only duplicate-value report honest: re-showing a force-mounted item used to count its value again each time ("2 items share…", then "3…") and blame the author for code holding exactly one live item with that value.
- Registration teardowns hop a microtask before scheduling their follow-up work. Octane runs a removed child's effect cleanups during the PARENT's render, so scheduling straight from a teardown lands its state update mid-render and the runtime reports "Cannot update a component (`CommandRoot`) while rendering a different component" — advice a teardown cannot act on, since it does not choose when it runs. The queued work is unchanged and still runs before paint; only the teardown paths defer, because every other caller schedules from a layout effect where the synchronous update is load-bearing. React has no equivalent problem: it runs cleanups in the commit phase.
- `Command.Empty` renders nothing during SSR. Items register in layout effects, which never run on the server, so the match count is unavoidably 0 there and upstream ships "no results" above a fully-populated list on every server-rendered page — permanently so for readers without JavaScript. The port supplies a server snapshot of "not empty" instead, and the empty state appears on the client once the count is real.
- An item leaving a group is removed from that group's member set. Upstream deletes the item from `ids`/`allItems` but never from `allGroups`, so a group accumulates dead item ids for the lifetime of the Command — unbounded growth in a menu whose results churn, plus wasted work in every filter pass.
- `Command.Dialog` additionally forwards `defaultOpen` and `modal` to the underlying Radix `Dialog.Root`. Upstream cmdk forwards only `open`/`onOpenChange`, so it has no uncontrolled open state and is always modal.
- Duplicate item values are reported in development. Selection is keyed by value, so two items sharing one both render `aria-selected="true"` while only the first responds to Enter — an invalid single-select listbox. The runtime cannot pick a winner (cmdk requires unique values), so the port warns instead of failing silently; upstream neither warns nor resolves it.
- The layout-effect batcher isolates each queued callback: a callback that throws is reported through `console.error` (as octane reports effect exceptions) and the remaining queued callbacks still run, rather than one failure aborting the rest of the flush. Upstream has no such isolation, so a throwing callback there aborts the siblings queued behind it.
- `asChild` is not supported: cmdk's SlottableWithNestedChildren clones a child element and re-parents the component's own content into it, which has no faithful equivalent over octane's opaque compiled children. Components always render their own host element.
- `Command.Dialog` builds on @octanejs/radix's Dialog (composed via createElement descriptors, since radix's Portal iterates children) instead of @radix-ui/react-dialog.
- The vendored scorer gained explicit parameter type annotations for strict typecheck and repo-style formatting; the algorithm and score constants are unchanged from cmdk@1.1.1.

SSR / hydration: Supported and tested: the menu server-renders all items in source order without browser globals (the DOM-authoritative filter/selection is post-hydration work), and no empty state — items cannot register on the server, so `Command.Empty` renders nothing there rather than claiming "no results" over a full list. `hydrateRoot` adopts the server nodes without a mismatch, then activates — values infer from textContent, the first item selects, and typing filters live.

Scope/evidence last checked: 2026-07-22.

- Covered by unit, behavioral (jsdom), hydration, SSR and differential tests. The differential suite runs the same `.tsrx` fixture through both this port and the published `cmdk@1.1.1` on React, asserting byte-equal HTML across filtering, keyboard selection and the empty state, and documenting the group-ordering divergence.
- `--cmdk-list-height` is written only where ResizeObserver exists (browsers); it is skipped during SSR and in jsdom, where the property is simply never set.

See also: [`docs/cmdk-port-plan.md`](cmdk-port-plan.md)

## @octanejs/devtools

[`packages/devtools`](../packages/devtools) `0.0.21` — ports `octane@workspace`. Status data: [`packages/devtools/status.json`](../packages/devtools/status.json).

Octane-native DevTools plugin (not an upstream port): renders live runtime diagnostics into a TanStack Devtools host via @tanstack/devtools-event-client. P1 ships the Components tree + state inspector.

SSR / hydration: The plugin renders no anchor of its own; it is a client-only panel plugged into @octanejs/tanstack-devtools. Include it only in dev.

Scope/evidence last checked: 2026-07-24.

- Reads the dev-only globalThis.__OCTANE_DEVTOOLS__ hook (present only in profile/devtools builds).

## @octanejs/dexie

[`packages/dexie`](../packages/dexie) `0.1.26` — ports `dexie-react-hooks@4.4.0`. Status data: [`packages/dexie/status.json`](../packages/dexie/status.json).

Port of the public dexie-react-hooks surface: useObservable, useLiveQuery, useSuspendingObservable, useSuspendingLiveQuery, usePermissions, and useDocument, with Dexie's framework-neutral API re-exported from the package root.

Known divergences:

- Suspending hooks integrate with Octane's use() rather than React's use() or thrown-promise implementation details.
- Hook call-site slots are forwarded through Octane's compiler binding ABI.
- useDocument requires consumers to install and import y-dexie and yjs before using the hook; those integrations remain optional.

SSR / hydration: Supported for non-suspending live queries: SSR returns the configured default without opening IndexedDB, and hydration adopts the server host before replacing the default with live data. Suspending live queries remain client-oriented and do not claim server data loading.

Scope/evidence last checked: 2026-07-16.

## @octanejs/dnd-kit

[`packages/dnd-kit`](../packages/dnd-kit) `0.1.28` — ports `@dnd-kit/react@0.5.0`. Status data: [`packages/dnd-kit/status.json`](../packages/dnd-kit/status.json).

Complete modern dnd-kit React-adapter surface: DragDropProvider, DragOverlay, useDraggable/useDroppable, manager/monitor/operation hooks, PointerSensor/KeyboardSensor re-exports, the public signal-hook utilities, useSortable, and all four upstream entry points.

Known divergences:

- DragOverlay distinguishes octane compiled children blocks from function render props; ordinary typed usage is behaviorally equivalent.
- useSortable retains the upstream keyboard plugin by default but omits OptimisticSortingPlugin because moving one host element before application state commits can split an Octane keyed DOM range; explicit plugin arrays remain authoritative.

SSR / hydration: Static SSR and hydration are covered; DOM plugins initialize only after client refs register.

Scope/evidence last checked: 2026-07-15.

- Targets the modern @dnd-kit/react API. The legacy @dnd-kit/core 6.x API is intentionally out of scope.

## @octanejs/electron

[`packages/electron`](../packages/electron) `0.0.11` — ports `electron@43.2.0`. Status data: [`packages/electron/status.json`](../packages/electron/status.json).

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

## @octanejs/floating-ui

[`packages/floating-ui`](../packages/floating-ui) `0.1.32` — ports `@floating-ui/react@0.27.19`. Status data: [`packages/floating-ui/status.json`](../packages/floating-ui/status.json).

Positioning (`useFloating`, ref-aware `arrow`, the `@floating-ui/dom` middleware re-exports, the floating tree), the full interaction-hook set (`useInteractions`, `useHover` + `safePolygon`, `useClick`, `useFocus`, `useDismiss`, `useRole`, `useClientPoint`, `useListNavigation`, `useTypeahead`), the component layer (`FloatingPortal`, `FloatingOverlay`, `FloatingFocusManager`, `FloatingArrow`, `FloatingList`, `Composite`), and transitions + `FloatingDelayGroup`.

Known divergences:

- `forwardRef` becomes octane's ref-as-prop.

SSR / hydration: No dedicated SSR/hydration tests.

Scope/evidence last checked: 2026-07-05.

- Not yet ported: the `inner`/`useInnerOffset` middleware pair.

## @octanejs/gsap

[`packages/gsap`](../packages/gsap) `0.0.2` — ports `@gsap/react@2.1.2`. Status data: [`packages/gsap/status.json`](../packages/gsap/status.json).

Full useGSAP hook contract: callback, dependency-array and config signatures; scoped contexts; contextSafe; revertOnUpdate; register; and headless.

Known divergences:

- The adapter imports Octane hooks and uses compiler-selected manual hook slots instead of React hooks.
- GSAP remains an external peer dependency and is not redistributed by this MIT-licensed adapter.

SSR / hydration: Server rendering creates stable context helpers without running GSAP effects. Client hydration activates the standard lifecycle.

Scope/evidence last checked: 2026-08-02.

## @octanejs/hook-form

[`packages/hook-form`](../packages/hook-form) `0.1.30` — ports `react-hook-form@7.81.0`. Status data: [`packages/hook-form/status.json`](../packages/hook-form/status.json).

Complete port of react-hook-form 7.81.0 (tag commit 46b217e034dd92f7aa3cb3a478815556b416b299). The automated parity check runs all 1,193 original tests against the pinned React package as a pristine baseline; the Octane port separately runs byte-locked, unfiltered DOM and server suites with exact collected/executed inventories containing 1,187 entries representing 1,178 unique file/full-name identities. The nine duplicate entries are repeated titles within the DOM inventory; the server inventory is disjoint. Coverage includes `useForm`, `useController`, `useFieldArray`, `useFormState`, `useWatch`, `useFormContext`/`FormProvider`, schema resolvers, and all validation modes.

Known divergences:

- `register()` returns `onInput` (octane's native per-keystroke event) instead of React's synthetic `onChange`; mode names and `register` option keys keep the upstream spelling.
- The structured parity ledger records native no-op input delivery, microtask batching, duplicate resolver notification, async act flush, reset render-count, and eager `Object.is` bailout differences with executable case identities, consumer impact, and migration guidance; the suite contains no skipped or expected-failure cases.

SSR / hydration: Supported and tested — the upstream `*.server.test.tsx` suite runs via `octane/server` with byte-identical markup.

Scope/evidence last checked: 2026-08-01.

See also: [`docs/octanejs-hook-form-plan.md`](octanejs-hook-form-plan.md)

## @octanejs/i18next

[`packages/i18next`](../packages/i18next) `0.1.28` — ports `react-i18next@17.0.9`. Status data: [`packages/i18next/status.json`](../packages/i18next/status.json).

Complete runtime port of react-i18next 17.0.9: useTranslation, I18nextProvider/context, Trans/TransWithoutContext, IcuTrans/IcuTransWithoutContext, Translation, the withTranslation/withSSR HOCs, useSSR, namespace reporting, initialization/default helpers, and the root ICU helper exports over the unchanged i18next core.

Known divergences:

- Trans children that must be inspected are passed in prop position (`children={<>…</>}`) or through `defaults` + `components`; natural .tsrx block children are opaque compiled render bodies and fall back with a development warning.
- Suspense uses octane's `use(thenable)` instead of throwing a Promise.
- withTranslation's `withRef` option uses octane's ref-as-prop model; class components are unsupported.
- The React/Babel-specific `icu.macro` subpath is not shipped; the runtime IcuTrans APIs are fully supported.

SSR / hydration: Preloaded renderToString output and namespace collection are covered; useSSR, withSSR, getInitialProps, and composeInitialProps are ported. A dedicated hydration differential is still open.

Scope/evidence last checked: 2026-07-13.

## @octanejs/inertia

[`packages/inertia`](../packages/inertia) `0.0.2` — ports `@inertiajs/react@3.6.1`. Status data: [`packages/inertia/status.json`](../packages/inertia/status.json).

Octane Inertia 3.6.1 adapter foundation: framework-neutral router, HTTP client, progress, and server exports reuse @inertiajs/core unchanged; page, remember, poll, prefetch, form-state, router-submit, direct-HTTP, precognition, and layout-property hooks are ported to Octane.

Known divergences:

- React, ReactDOM, StrictMode, forwardRef, and synthetic events are not runtime dependencies; the Octane adapter uses Octane roots, refs-as-props, and native events.

SSR / hydration: The framework-neutral Inertia server entry is exposed. Hook initialization is request-local and covered in the server runtime; Octane page rendering and hydration are completed by the adapter SSR unit.

Scope/evidence last checked: 2026-07-30.

See also: [`docs/plans/2026-07-30-001-feat-inertia-binding-plan.md`](plans/2026-07-30-001-feat-inertia-binding-plan.md)

## @octanejs/jotai

[`packages/jotai`](../packages/jotai) `0.1.30` — ports `jotai@2.20.2`. Status data: [`packages/jotai/status.json`](../packages/jotai/status.json).

Complete 1:1 port: the framework-agnostic vanilla core (`jotai/vanilla`, `/vanilla/utils`, `/vanilla/internals`) is reused verbatim; the React layer (`Provider`, `useStore`, `useAtom`, `useAtomValue`, `useSetAtom`) and `react/utils` (`useResetAtom`, `useReducerAtom`, `useAtomCallback`, `useHydrateAtoms`) are ported onto octane hooks, preserving upstream's useReducer force-update + effect-subscription implementation, async atoms via octane's `use()`.

Known divergences:

- `jotai/babel/*` (React-specific compile-time plugins) is not shipped.

SSR / hydration: No SSR-specific surface; `useHydrateAtoms` is ported and usable for hydration seeding; no dedicated SSR tests.

Scope/evidence last checked: 2026-07-21.

## @octanejs/lexical

[`packages/lexical`](../packages/lexical) `0.1.32` — ports `@lexical/react@0.46.0`. Status data: [`packages/lexical/status.json`](../packages/lexical/status.json).

35 of 39 `@lexical/react` modules ported: composer + contexts, the editable surface, plain/rich text, and the full plugin/menu set (history, lists + check-list, links, tables, markdown shortcuts, the typeahead/node-menu/context-menu family, draggable-block, character-limit, …) plus the `useLexical*` hooks.

Known divergences:

- Positioning uses `@floating-ui/dom` instead of `@floating-ui/react`.
- The class-based `LexicalErrorBoundary` becomes an octane error boundary; `forwardRef` becomes ref-as-prop.

SSR / hydration: No dedicated SSR/hydration tests.

Scope/evidence last checked: 2026-07-09.

- Not ported (4 modules, with reasons): `LexicalCollaborationPlugin` (real-time Yjs collaboration needs a two-peer harness), `LexicalExtensionComposer`/`LexicalExtensionEditorComposer` (the newer extension API wraps a React-only subsystem), and `LexicalTreeView` (wraps the `@lexical/devtools-core` React component).

## @octanejs/livestore

[`packages/livestore`](../packages/livestore) `0.0.3` — ports `@livestore/react@0.4.0`. Status data: [`packages/livestore/status.json`](../packages/livestore/status.json).

Ports the complete stable renderer surface (registry provider/access, Suspense store loading and augmentation, reactive queries, client documents, and sync status) plus the exported experimental LiveList over LiveStore's unchanged 0.4.0 framework-neutral packages.

Known divergences:

- ReactApi and withReactApi retain their historical upstream names but attach Octane hooks.
- The public query error label identifies octane; LiveStore framework-toolkit 0.4.0 still records its internal refresh-reason renderer tag as react.
- React Strict Mode double invocation is not emulated.

SSR / hydration: Supported at the binding boundary: server rendering reads existing synchronous state without running passive subscriptions or browser-only store work; client Suspense and hydration are covered separately.

Scope/evidence last checked: 2026-08-02.

See also: [`docs/livestore-port.md`](livestore-port.md), [`packages/livestore/UPSTREAM.md`](../packages/livestore/UPSTREAM.md)

## @octanejs/lucide

[`packages/lucide`](../packages/lucide) `0.1.28` — ports `lucide-react@1.24.0`. Status data: [`packages/lucide/status.json`](../packages/lucide/status.json).

Complete against the published `lucide-react@1.24.0` runtime surface: every canonical icon and alias, the `icons` namespace, `Icon`, `createLucideIcon`, `LucideProvider`, `useLucideContext`, `DynamicIcon`, `iconNames`, `dynamicIconImports`, and per-icon subpath imports.

Known divergences:

- Icon refs are normal Octane `ref` props rather than React `forwardRef` components.
- Event callbacks receive native DOM events rather than React synthetic events.

SSR / hydration: Supported and tested: icons and provider defaults render through `octane/server`, and client hydration adopts the server-rendered SVG element.

Scope/evidence last checked: 2026-07-13.

- Generated wrappers consume official framework-neutral `@lucide/icons@1.24.0` data, so SVG geometry is not copied or maintained by the port.
- Generation checks pin the React export, alias, and dynamic-name surfaces and reject stale generated files.

See also: [`docs/lucide-port-plan.md`](lucide-port-plan.md)

## @octanejs/mantine-hooks

[`packages/mantine-hooks`](../packages/mantine-hooks) `0.1.14` — ports `@mantine/hooks@9.5.0`. Status data: [`packages/mantine-hooks/status.json`](../packages/mantine-hooks/status.json).

Complete @mantine/hooks 9.5.0 runtime export surface: state, timing, storage, viewport, input, focus, pointer, observer, hotkey, scrolling, collapse, drag, splitter, mask, and utility hooks.

Known divergences:

- Hooks use Octane's compiler-injected hook slots and runtime lifecycle instead of React's dispatcher.
- DOM subscriptions receive native browser events.
- React is retained only as a source-compatibility type vocabulary for refs, events, actions, and CSS properties; it is not loaded at runtime.

SSR / hydration: Dedicated Node-mode coverage verifies deterministic state-hook output and guarded media-query initial values without a browser. DOM-only effects remain inert during server rendering.

Scope/evidence last checked: 2026-07-28.

## @octanejs/mdx

[`packages/mdx`](../packages/mdx) `0.1.30` — ports `@mdx-js/mdx@3.1.1`. Status data: [`packages/mdx/status.json`](../packages/mdx/status.json).

The full compile-don't-interpret pipeline: `.mdx`/`.md` → `@mdx-js/mdx` (reused verbatim) → octane compiler, via the `octaneMdx()` Vite plugin plus the `./compile` and `./server` entries; compiler warnings propagate through direct and Vite compile surfaces with authored `.mdx` ranges; `@mdx-js/react`'s provider layer (`MDXProvider`/`useMDXComponents`) is ported onto octane context. The octane website runs on it.

Known divergences:

- `useMDXComponents` drops upstream's `useMemo` referential-stability wrapper so the call is valid in both server and client runtimes (same observable mapping).

SSR / hydration: Full SSR + hydration coverage — server-compiled documents render via `renderToString` and hydrate byte-for-byte (`ssr.test.ts`, `hydration.test.ts`).

Scope/evidence last checked: 2026-07-17.

See also: [`docs/mdx-migration-plan.md`](mdx-migration-plan.md)

## @octanejs/mobx

[`packages/mobx`](../packages/mobx) `0.1.14` — ports `mobx-react-lite@4.1.1`. Status data: [`packages/mobx/status.json`](../packages/mobx/status.json).

The framework-independent MobX core is re-exported verbatim. The function-component binding includes observer, Observer, useObserver, useLocalObservable, enableStaticRendering, isUsingStaticRendering, and the deprecated useStaticRendering alias.

Known divergences:

- React class components and the legacy mobx-react Provider/inject APIs are not included.
- forwardRef compatibility options are omitted because Octane uses refs as props.
- React-specific batching, prop-types validation, React DevTools integration, and useDebugValue output are omitted.

SSR / hydration: enableStaticRendering(true) renders observed components without creating a Reaction or retaining observable subscriptions.

Scope/evidence last checked: 2026-07-28.

## @octanejs/motion

[`packages/motion`](../packages/motion) `0.1.32` — ports `motion@12.42.2`. Status data: [`packages/motion/status.json`](../packages/motion/status.json).

Core surface: `motion.<tag>` (animate, gestures, variants with propagation/stagger, drag, layout basics), `AnimatePresence`, `MotionConfig`, and the motion-value hooks (`useMotionValue`, `useScroll`, `useTransform`, `useSpring`, `useAnimate`, `useMotionValueEvent`); motion-dom's animation engine and gesture primitives are reused verbatim.

Known divergences:

- Exit animations run via cleanup-before-detach instead of React's deferred-deletion machinery.
- `layout`/`layoutId` use single-element FLIP, not the full projection tree.

SSR / hydration: No SSR-specific surface; no dedicated SSR tests.

Scope/evidence last checked: 2026-07-21.

- Not yet ported: nested/shared layout projection (incl. child scale correction and shared layout during drag), drag momentum + elastic physics, reduced-motion enforcement, the `useTransform` output-map form, and `when: 'beforeChildren' | 'afterChildren'` sequencing.

## @octanejs/nuqs

[`packages/nuqs`](../packages/nuqs) `0.1.22` — ports `nuqs@2.9.1`. Status data: [`packages/nuqs/status.json`](../packages/nuqs/status.json).

Full vendored port: the framework-agnostic core (`parsers`/`parseAs*`/`createParser`, `createSerializer`, `createLoader`, `createStandardSchemaV1`, the throttle/debounce update queues, sync emitter and URL encoding) is vendored verbatim from nuqs 2.9.1; the React layer (`useQueryState`, `useQueryStates`, the `useSyncExternalStores` helper and the adapter context) is ported onto octane's hooks — same `useState`/`useEffect`/`useSyncExternalStore` implementation shape as upstream, so re-render and URL-reconciliation behaviour matches nuqs on React. Adapters ported: `@octanejs/nuqs/adapters/react` (`NuqsAdapter`, `enableHistorySync`), `/adapters/custom` (`unstable_createAdapterProvider`), `/adapters/testing` (`NuqsTestingAdapter`, `withNuqsTestingAdapter`). Server surface (`@octanejs/nuqs/server`) exposes `createLoader`/`createSerializer`/parsers/`createStandardSchemaV1`.

Known divergences:

- Framework adapters that bind other React routers are NOT shipped: `nuqs/adapters/next`, `/adapters/remix`, `/adapters/react-router` and `/adapters/tanstack-router` (they require octane ports of those routers). Use `/adapters/react`, or `/adapters/custom` to wire a router.
- `createSearchParamsCache` (from `nuqs/server`) is not ported: it is built on React Server Components' `React.cache()`, which octane does not implement. Use `createLoader` for request-scoped parsing.
- `TransitionStartFunction` is declared locally in `defs.ts` rather than imported from `@types/react`, so the package carries no react type dependency.
- `NuqsTestingAdapter` resets the shared update queue once per mount (ref-guarded) instead of on every render as upstream does; the reset still runs during the first render (before child hooks read the queue), but a re-render no longer re-aborts in-flight/debounced URL writes.

SSR / hydration: The server entry (`@octanejs/nuqs/server`) is react-free and usable during SSR for parsing/serialising search params; the client hooks read `location.search` through `useSyncExternalStore` with an empty-search server snapshot (upstream parity). No dedicated SSR hydration tests yet.

Scope/evidence last checked: 2026-07-20.

## @octanejs/phosphor-icons

[`packages/phosphor-icons`](../packages/phosphor-icons) `0.0.13` — ports `@phosphor-icons/react@2.1.10`. Status data: [`packages/phosphor-icons/status.json`](../packages/phosphor-icons/status.json).

All 1,512 canonical icons from @phosphor-icons/core@2.1.1, including the upstream deprecated Icon-suffixed aliases, six weights, IconContext, IconBase, root exports, and per-icon imports.

Known divergences:

- Icon refs are normal Octane ref props rather than React forwardRef components.
- Event callbacks receive native DOM events rather than React synthetic events.
- The React package's SSR namespace is unnecessary because Octane icons use the same components on client and server.

SSR / hydration: Supported and tested against @phosphor-icons/react/ssr for every weight; hydration adopts and updates server-rendered SVG hosts.

Scope/evidence last checked: 2026-07-29.

- Generated modules embed only their own official @phosphor-icons/core SVG geometry, preserving per-icon tree shaking.
- Generation checks pin core metadata, six canonical assets per icon, and the React oracle version.

## @octanejs/radix

[`packages/radix`](../packages/radix) `0.1.32` — ports `radix-ui@1.6.4`. Status data: [`packages/radix/status.json`](../packages/radix/status.json).

Complete against the unified `radix-ui@1.6.4` component surface — all primitives (incl. Dialog, the Menu/DropdownMenu/ContextMenu family, Popover, Tooltip, Select, NavigationMenu, Toast, Menubar, Slider, the form controls, and OneTimePasswordField/PasswordToggleField) plus the composition/state/overlay foundations — verified by a differential suite (same fixtures through octane and the real radix-ui, byte-identical DOM).

Known divergences:

- `Slot`/`asChild` compose element descriptors (prop-position JSX, `createElement`, `.map()` returns), not children-position JSX.
- `forwardRef` becomes octane's ref-as-prop.

SSR / hydration: SSR/hydration coverage for the overlay/portal components is still open (tracked in the migration plan).

Scope/evidence last checked: 2026-07-21.

See also: [`docs/radix-migration-plan.md`](radix-migration-plan.md)

## @octanejs/rainbowkit

[`packages/rainbowkit`](../packages/rainbowkit) `0.0.13` — ports `@rainbow-me/rainbowkit@2.2.11`. Status data: [`packages/rainbowkit/status.json`](../packages/rainbowkit/status.json).

Octane-native RainbowKitProvider, ConnectButton and ConnectButton.Custom, WalletButton, connect/account/chain modal hooks, connector selection, account/chain actions, native accessible dialogs, and light/dark/midnight themes.

Known divergences:

- IMPORTANT: upstream RainbowKit 2.2.11 declares wagmi ^2.9.0. This adapter intentionally consumes @octanejs/wagmi v3 and is not drop-in dependency or peer-range parity.
- The React DOM and vanilla-extract implementation is replaced by native Octane TSRX, DOM events, focus/scroll containment, and CSS custom properties.
- The wallet list merges optional configured descriptors with the enclosing Wagmi v3 connector list, deduplicated by canonical connector uid with explicit id/name fallback. Unavailable configured entries remain visible with a reason. RainbowKit wallet factories, vendor SDKs, and WalletConnect project configuration remain application-owned.
- Authentication, recent transactions, ENS/avatar resolution, localization, cool mode, account avatars/balances, chain icons, and pixel-identical upstream themes are unsupported and their upstream props are not accepted.
- rainbowTheme is an explicitly documented Octane-only purple/rounded preset; it is not an upstream RainbowKit export.

SSR / hydration: The provider and controls emit deterministic disconnected markup without browser wallet access. Connector discovery and live Wagmi state become authoritative after hydration; no hydrated UI state authorizes wallet actions.

Scope/evidence last checked: 2026-07-29.

## @octanejs/react-error-boundary

[`packages/react-error-boundary`](../packages/react-error-boundary) `0.1.14` — ports `react-error-boundary@6.1.2`. Status data: [`packages/react-error-boundary/status.json`](../packages/react-error-boundary/status.json).

Complete against the published react-error-boundary 6.1.2 function/type surface adapted to Octane: ErrorBoundary, ErrorBoundaryContext, getErrorMessage, fallback variants, onError/onReset callbacks, resetKeys, useErrorBoundary (including error), withErrorBoundary, OnErrorCallback, and UseErrorBoundaryApi.

Known divergences:

- Component stack information is currently an empty string because Octane does not expose a public component-stack formatter.
- Event-handler and asynchronous errors must be passed to useErrorBoundary().showBoundary(), matching upstream's explicit forwarding requirement.
- Server rendering that must match upstream error propagation uses the explicit @octanejs/react-error-boundary/server entry.

SSR / hydration: The explicit server entry renders children without a boundary so descendant errors propagate, matching react-error-boundary 6.1.2.

Scope/evidence last checked: 2026-07-29.

## @octanejs/react-map-gl

[`packages/react-map-gl`](../packages/react-map-gl) `0.0.5` — ports `@vis.gl/react-mapbox@8.1.2 (b1e46fcf)`. Status data: [`packages/react-map-gl/status.json`](../packages/react-map-gl/status.json).

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

[`packages/recharts`](../packages/recharts) `0.1.30` — ports `recharts@3.9.2`. Status data: [`packages/recharts/status.json`](../packages/recharts/status.json).

Broad runtime support across cartesian, polar, hierarchical, tooltip, legend, responsive-container, shape, and chart-state surfaces. `Brush` and `Treemap` remain intentionally unsupported.

Known divergences:

- Chart events coordinate through octane's native delegated events rather than React's synthetic layer.

SSR / hydration: Untested; text measurement (`getStringSize`) returns 0×0 under SSR.

Scope/evidence last checked: 2026-07-29.

- Known gaps: `Brush` and `Treemap`; SSR text measurement still reports zero dimensions.

See also: [`docs/recharts-port-plan.md`](recharts-port-plan.md)

## @octanejs/redux

[`packages/redux`](../packages/redux) `0.1.30` — ports `react-redux@9.3.0`. Status data: [`packages/redux/status.json`](../packages/redux/status.json).

The hooks + `Provider` surface of react-redux 9.3.0 (`useSelector`, `useDispatch`, `useStore`, and the custom-context factory variants) on octane's `useSyncExternalStore`; works with any Redux 5 / Redux Toolkit store. Export parity is pinned by test.

Known divergences:

- `connect()` (the legacy HOC surface) intentionally throws — the hooks API is the supported surface.
- Error messages are octane-branded.

SSR / hydration: No SSR-specific surface; no dedicated SSR tests.

Scope/evidence last checked: 2026-07-08.

## @octanejs/redux-toolkit

[`packages/redux-toolkit`](../packages/redux-toolkit) `0.1.28` — ports `@reduxjs/toolkit@2.12.0`. Status data: [`packages/redux-toolkit/status.json`](../packages/redux-toolkit/status.json).

Complete four-entry-point port: the framework-agnostic Toolkit and RTK Query core are re-exported verbatim; `/query/react` provides generated query, lazy-query, mutation, infinite-query, prefetch hooks and `ApiProvider`; `/react` provides the dynamic-middleware dispatch-hook integration.

Known divergences:

- The compatibility `/react` subpaths and `reactHooksModule` names are retained, but use octane and `@octanejs/redux` internally.
- `useDebugValue` is octane's no-op compatibility hook; observable query behavior is unchanged.

SSR / hydration: Preloaded RTK Query state renders through the traditional @octanejs/redux Provider; effects and browser listeners remain client-only. Dedicated SSR and hydration tests are included.

Scope/evidence last checked: 2026-07-13.

## @octanejs/remix-router

[`packages/remix-router`](../packages/remix-router) `0.1.29` — ports `react-router@8.2.0`. Status data: [`packages/remix-router/status.json`](../packages/remix-router/status.json).

COMPLETE port (all phases shipped — full export parity, EXPECTED_MISSING is empty): the framework-agnostic router core (lib/router/* + framework-free helpers, ~12k lines) is vendored byte-close and validated by 161 ported upstream router tests plus four focused v8.2 regression pins; the data-mode React layer (createMemoryRouter, RouterProvider incl. the /dom flushSync variant, Outlet, Await, RenderErrorBoundary/errorElement, Link + useLinkClickHandler, and the full read-hook family) and the declarative layer (MemoryRouter, Routes/Route in BOTH children forms — descriptor children walked upstream-style, .tsrx block children via a registration collector — Navigate, createRoutesFromChildren/Elements, the UNSAFE_With*Props wrappers) and the DOM layer (createBrowserRouter/createHashRouter with __staticRouterHydrationData parsing, BrowserRouter/HashRouter/unstable_HistoryRouter, Link + NavLink incl. the isActive/isPending render props, useLinkClickHandler, useSearchParams) and the mutation layer (Form on octane's native delegated submit event, useSubmit incl. JSON encTypes, useFormAction with ?index resolution, useFetcher/useFetchers incl. fetcher.Form/load/submit/reset and shared keys), the guard/scroll layer (useBlocker, unstable_usePrompt, ScrollRestoration/UNSAFE_useScrollRestoration, useBeforeUnload, useViewTransitionState, unstable_useRoute/unstable_useRouterState), static SSR (StaticRouter, StaticRouterProvider, createStaticHandler/createStaticRouter rendering through octane/server — markup byte-identical to react-dom/server after marker stripping, hydration payload identical), and the vendored cookie/session server runtime (createCookie/createSession/createCookieSessionStorage/createMemorySessionStorage) are transcribed onto octane and differential-verified against real react-router. Framework-mode + RSC names (Meta/Links/Scripts, createRequestHandler, UNSAFE_ internals) exist as THROWING STUBS so parity is honest.

Known divergences:

- Refs are props (octane has no forwardRef) — Link's forwardRef becomes a `ref` prop.
- Error-boundary reset on location change / revalidation-idle happens in a layout effect one commit after upstream's render-phase derivation — same observable outcome.
- octane's flushSync inside an ambient flush degrades to a plain call drained at that flush's boundary (sync scroll/navigation notifies from within event handlers land at the flush boundary instead of nested) — consumer-invisible, conformance-pinned.
- Form's onSubmit is a NATIVE delegated submit listener (octane has no synthetic events): `event.submitter` is read directly off the SubmitEvent where React reads `event.nativeEvent.submitter` — same value, differential-verified.
- Block-children `<Routes>` collects `<Route>`s by registration (mount order) instead of upstream's element-children walk (source order) — a conditionally-mounted `<Route>` between static siblings registers after them, which only affects matchRoutes score TIES; conformance-pinned.

SSR / hydration: Shipped: StaticRouter/StaticRouterProvider/createStaticHandler/createStaticRouter render through octane/server (remix-router-ssr vitest project compiles the whole graph in server mode; markup matches react-dom/server byte-for-byte after framework-marker stripping). Block-children <Routes> is CLIENT-only (the registration collector runs in layout effects) — use descriptor children or route objects for SSR.

Scope/evidence last checked: 2026-07-13.

- Full export parity: tests/conformance/parity.test.ts pins EXPECTED_MISSING at []. Framework mode (needs @react-router/dev) and RSC are permanently out of scope — those names are throwing stubs with scope-policy messages. The cookie/session server runtime is vendored (adds the `cookie-es` dependency, as upstream). React Router 8 removes react-router-dom, makes middleware unconditional, and removes hasErrorBoundary plus the v8 future flags.

See also: [`docs/remix-router-port-plan.md`](remix-router-port-plan.md)

## @octanejs/rxjs

[`packages/rxjs`](../packages/rxjs) `0.1.12` — ports `@react-rxjs/core + @react-rxjs/utils@0.10.8 / 0.9.7`. Status data: [`packages/rxjs/status.json`](../packages/rxjs/status.json).

Core bind/state/Subscribe APIs and the complete @react-rxjs/utils surface.

Known divergences:

- StateObservable values are not JSX nodes; render them through useStateObservable or bind.
- @react-rxjs/dom is omitted because octane batches updates without ReactDOM.unstable_batchedUpdates.

SSR / hydration: useSyncExternalStore supplies the state snapshot during server rendering; browser-only ReactDOM batching helpers are intentionally absent.

Scope/evidence last checked: 2026-07-30.

## @octanejs/shadcn

[`packages/shadcn`](../packages/shadcn) `0.0.18` — ports `shadcn-ui/ui (radix base)@4baadbc6517070ae8f8feb2c97037adc2b305544 + shadcn@4.14.1`. Status data: [`packages/shadcn/status.json`](../packages/shadcn/status.json).

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

## @octanejs/solana-react

[`packages/solana-react`](../packages/solana-react) `0.0.2` — ports `@solana/react@7.0.0`. Status data: [`packages/solana-react/status.json`](../packages/solana-react/status.json).

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

[`packages/sonner`](../packages/sonner) `0.1.28` — ports `sonner@2.0.7`. Status data: [`packages/sonner/status.json`](../packages/sonner/status.json).

Complete against the published `sonner@2.0.7` public surface: `Toaster`, the callable `toast` API and all methods, `useSonner`, promise lifecycle, multiple toaster targeting, stacked layout, themes, styling, focus management, timers, and swipe dismissal.

Known divergences:

- Action callbacks receive native DOM `MouseEvent`s rather than React synthetic events.
- `Toaster` accepts its ref as a normal prop instead of using `forwardRef`.
- The document-visibility hook is guarded during SSR; upstream 2.0.7 reads `document.hidden` during render.

SSR / hydration: Supported and tested: `Toaster` server-renders without browser globals, hydrates by adopting the server host, and can show the first client-created toast without replacing it.

Scope/evidence last checked: 2026-07-13.

See also: [`docs/sonner-port-plan.md`](sonner-port-plan.md)

## @octanejs/streamdown

[`packages/streamdown`](../packages/streamdown) `0.1.12` — ports `streamdown@2.5.0`. Status data: [`packages/streamdown/status.json`](../packages/streamdown/status.json).

Complete Streamdown 2.5.0 root runtime and public type surface, plus the official code 1.1.1, math 1.0.2, Mermaid 1.0.2, and CJK 1.0.3 plugins exposed through ./code, ./math, ./mermaid, and ./cjk.

Known divergences:

- Components, hooks, contexts, lazy boundaries, portals, element inspection, and the HAST JSX runtime target Octane; callbacks receive native DOM events instead of React synthetic events.
- The four official plugins are consolidated as subpath exports of @octanejs/streamdown instead of separate packages.

SSR / hydration: Static and streaming Markdown, custom components, code blocks, math markup, and hydration are covered by dedicated server and hydration tests. Browser-only controls and deferred Mermaid rendering remain inert until mounted.

Scope/evidence last checked: 2026-07-30.

- The HAST adapter delegates to Octane createElement while preserving hast-util-to-jsx-runtime key, component, node, and Fragment semantics.
- Upstream source provenance and the Apache-2.0 license are retained in UPSTREAM.md and LICENSE.

## @octanejs/styled-components

[`packages/styled-components`](../packages/styled-components) `0.1.25` — ports `styled-components@6.4.3`. Status data: [`packages/styled-components/status.json`](../packages/styled-components/status.json).

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

Scope/evidence last checked: 2026-07-18.

## @octanejs/stylex

[`packages/stylex`](../packages/stylex) `0.1.32` — ports `@stylexjs/stylex@0.19.0`. Status data: [`packages/stylex/status.json`](../packages/stylex/status.json).

Full compile-time integration: re-exports the StyleX runtime API (`create`, `props`, `attrs`, `keyframes`, `defineVars`, `createTheme`) and registers as an import source; the `/vite` plugin runs the StyleX compiler over octane's compiled output and emits one static atomic stylesheet (`virtual:stylex.css`) with zero StyleX runtime in the bundle.

Known divergences:

- The `sx` JSX prop is not supported — spread `{...stylex.props(...)}` instead.
- The compiler runs over octane's compiled output rather than source, so StyleX's own PostCSS source-scanning setup is unused.

SSR / hydration: Works under SSR — the stylesheet is static and server markup carries the final class names; no dedicated SSR test files.

Scope/evidence last checked: 2026-07-09.

## @octanejs/tanstack-ai

[`packages/tanstack-ai`](../packages/tanstack-ai) `0.0.27` — ports `@tanstack/ai-react@0.17.0`. Status data: [`packages/tanstack-ai/status.json`](../packages/tanstack-ai/status.json).

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

Scope/evidence last checked: 2026-07-16.

- Hook modules are authored as TSRX with checked declaration companions; no ported hook renders JSX or references React types in its public signature.
- 143 tanstack-ai tests plus 1 SSR test pass, reusing the upstream behavioral tests with no skipped, todo, or expected-failure cases.
- Differential coverage runs one shared chat fixture through this binding and real @tanstack/ai-react@0.17.0, comparing streamed output after each step; output is byte-equal.

## @octanejs/tanstack-devtools

[`packages/tanstack-devtools`](../packages/tanstack-devtools) `0.0.27` — ports `@tanstack/react-devtools@0.10.7`. Status data: [`packages/tanstack-devtools/status.json`](../packages/tanstack-devtools/status.json).

Ports the @tanstack/react-devtools 0.10.7 public surface (the `TanStackDevtools` component plus its plugin/init types) onto Octane while reusing the framework-agnostic `@tanstack/devtools` 0.12.5 core (`TanStackDevtoolsCore`) unchanged. Plugin, title, and custom-trigger content authored as Octane elements is portaled into the containers the core creates.

Known divergences:

- Public adapter types use Octane-prefixed names: `TanStackDevtoolsOctanePlugin` and `TanStackDevtoolsOctaneInit` (upstream: `TanStackDevtoolsReactPlugin` / `TanStackDevtoolsReactInit`).
- `ref` is the normal React-19-style ref prop and events are native (no synthetic layer), consistent with the rest of the Octane bindings.
- The main entry also re-exports the framework-agnostic `@tanstack/devtools` core surface (`TanStackDevtoolsCore`, container-id constants, and plugin authoring types) so consumers do not need a direct dependency on `@tanstack/devtools` for typing plugins.
- Plugin/title/trigger content is rendered through a tiny `DevtoolsPortal` component (a createPortal VALUE), because Octane renders a returned portal at any position rather than only as a direct JSX child.

SSR / hydration: Supported and tested: the component renders its absolutely-positioned anchor element through octane/server without a DOM; the core is constructed but never mounted server-side (mount is a client-only effect).

Scope/evidence last checked: 2026-07-17.

- The component module is authored as TSRX with a checked declaration companion (`devtools.tsrx.d.ts`).
- Upstream `@tanstack/react-devtools` ships no test suite (its `test:lib` runs `vitest --passWithNoTests`), so there is no upstream behavioral suite to port. Coverage is authored fresh: behavioral tests spy on the core to drive the plugin/title/trigger mapping and assert content is portaled into the core-provided containers, plus SSR and type tests.
- No differential rig: both this binding and the React binding drive the identical Solid `@tanstack/devtools` core UI, so there is no framework-authored output to compare beyond the portaled plugin content the behavioral tests already assert.

## @octanejs/tanstack-form

[`packages/tanstack-form`](../packages/tanstack-form) `0.0.27` — ports `@tanstack/react-form@1.33.2`. Status data: [`packages/tanstack-form/status.json`](../packages/tanstack-form/status.json).

Ports the complete @tanstack/react-form 1.33.2 adapter surface (`useForm`, `useField`, form and field groups, hook contexts and component composition) while re-exporting @tanstack/form-core 1.33.2 unchanged and using @octanejs/tanstack-store for subscriptions.

Known divergences:

- Octane uses native events: text controls call `field.handleChange` from `onInput`; TanStack Form's `onChange` validator and listener option names remain unchanged.
- Octane has no StrictMode double-invoke and always provides `useId`, so the adapter omits StrictMode scenarios and the legacy random-UUID fallback.
- Component registration accepts Octane function components; class components are not supported by Octane.

SSR / hydration: Supported and tested: fields and form subscriptions render their initial snapshots through octane/server without a DOM.

Scope/evidence last checked: 2026-07-15.

- Renderer-bearing adapter modules are authored as TSRX and ship checked declaration emits with inline renderer aliases, Octane-prefixed public adapter types, and source-owned recursive contracts.
- The ported React adapter suite has 82 executable behavioral tests with no skipped, todo, or expected-failure cases; upstream compile-time tests cover hook, field, group, and component-composition inference.
- Differential coverage compiles one shared form through this adapter and real @tanstack/react-form@1.33.2, comparing values, validation, array mutations, and reset output after every interaction.

## @octanejs/tanstack-hotkeys

[`packages/tanstack-hotkeys`](../packages/tanstack-hotkeys) `0.0.22` — ports `@tanstack/react-hotkeys@0.10.0`. Status data: [`packages/tanstack-hotkeys/status.json`](../packages/tanstack-hotkeys/status.json).

Complete: the full upstream hook surface (`useHotkey`, `useHotkeys`, `useHeldKeys`, `useHeldKeyCodes`, `useKeyHold`, `useHotkeySequence`, `useHotkeySequences`, `useHotkeyRecorder`, `useHotkeySequenceRecorder`, `useHotkeyRegistrations`) plus `HotkeysProvider`/`useHotkeysContext`/`useDefaultHotkeysOptions`, re-exporting the framework-agnostic `@tanstack/hotkeys@0.8.0` core unchanged; store subscriptions go through `@octanejs/tanstack-store`.

Known divergences:

- `target` refs are plain `{ current }` objects (Octane has no `React.RefObject`); the `isRef` guard and behavior are otherwise identical.

SSR / hydration: Supported: every hook registers listeners in effects and resolves `document` lazily, so server rendering produces no registrations and no browser access (matching upstream's `typeof document` guards).

Scope/evidence last checked: 2026-07-20.

- Created for the tanstack-com benchmark's octane flavor (Phase 2c); exercised by that app's ApplicationStarter hotkeys surface.
- Upstream `React`-prefixed type names (`ReactHotkeyRecorder`, `ReactHotkeySequenceRecorder`) are kept verbatim so ports only change the import specifier.

## @octanejs/tanstack-pacer

[`packages/tanstack-pacer`](../packages/tanstack-pacer) `0.0.22` — ports `@tanstack/react-pacer@0.22.1`. Status data: [`packages/tanstack-pacer/status.json`](../packages/tanstack-pacer/status.json).

Complete: every upstream hook family — debouncer (`useDebouncer`, `useDebouncedState`, `useDebouncedValue`, `useDebouncedCallback`), throttler, rate-limiter, queuer, batcher, and their async variants (async-debouncer, async-throttler, async-rate-limiter, async-queuer, async-batcher) — plus `PacerProvider`/`usePacerContext`/`useDefaultPacerOptions`, the per-instance `Subscribe` render-prop component, and the upstream subpath exports (`/debouncer`, `/async-retryer`, `/types`, `/utils`, ...), re-exporting the framework-agnostic `@tanstack/pacer@0.21.1` core unchanged.

Known divergences:

- Upstream types spelled with `React.Dispatch<React.SetStateAction<T>>` use structurally identical local aliases (Octane state setters have the same shape).

SSR / hydration: Supported: instances are created lazily in `useState` initializers, cleanup runs in effects, and no browser globals are touched during render, so server rendering produces the initial (non-pending) state exactly like upstream.

Scope/evidence last checked: 2026-07-20.

- Created for the tanstack-com benchmark's octane flavor (Phase 2c); `useDebouncedValue` and `useAsyncDebouncer` are exercised by that app's application-builder and DeployDialog surfaces.
- Upstream `React`-prefixed type names (`ReactDebouncer`, `ReactThrottler`, ...) are kept verbatim so ports only change the import specifier.

## @octanejs/tanstack-query

[`packages/tanstack-query`](../packages/tanstack-query) `0.1.32` — ports `@tanstack/react-query@5.101.3`. Status data: [`packages/tanstack-query/status.json`](../packages/tanstack-query/status.json).

Complete: 58/58 runtime exports plus the full TypeScript surface; the export surface is byte-identical to upstream in both directions (locked by test), and `@tanstack/query-core` is re-exported verbatim.

Known divergences:

- Suspense integrates via octane's `use(thenable)` rather than throwing a promise (observable behavior matches).

SSR / hydration: `HydrationBoundary` fully ported (incl. streaming `promise`/`dehydratedAt` re-hydration); the SSR/streaming server entries and server-render tests are still open.

Scope/evidence last checked: 2026-07-21.

See also: [`docs/tanstack-parity-audit.md`](tanstack-parity-audit.md)

## @octanejs/tanstack-router

[`packages/tanstack-router`](../packages/tanstack-router) `0.1.32` — ports `@tanstack/react-router@1.170.18`. Status data: [`packages/tanstack-router/status.json`](../packages/tanstack-router/status.json).

Octane's TanStack Router binding: typed route factories and hooks, the full Match pipeline and lifecycle, file routes with TSRX-aware generator integration, full Link navigation/preloading/masking behavior, blocking, Await/deferred hydration, scroll restoration, lazy routes, not-found handling, document/head assets, and client/server SSR entries.

Known divergences:

- Refs are props — `createLink`'s `forwardRef` becomes a `ref` prop.
- Link callbacks receive native DOM events rather than React synthetic events.
- Router devtools are distributed separately.

SSR / hydration: Full-document buffered and readable-stream SSR through `./ssr/server`, client hydration through `./ssr/client`, route-owned head/scripts, CSP nonce propagation, per-route SSR modes, and native Octane stream injection; covered by retained upstream conformance tests.

Scope/evidence last checked: 2026-07-21.

- The framework-neutral runtime dependency is `@tanstack/router-core@1.171.15`.
- The TSRX-aware generator plugin is exported from `@octanejs/tanstack-router/generator-plugin` for `@octanejs/tanstack-start`'s package-owned generator.

See also: [`docs/tanstack-parity-audit.md`](tanstack-parity-audit.md)

## @octanejs/tanstack-router-ssr-query

[`packages/tanstack-router-ssr-query`](../packages/tanstack-router-ssr-query) `0.0.22` — ports `@tanstack/react-router-ssr-query@1.167.1`. Status data: [`packages/tanstack-router-ssr-query/status.json`](../packages/tanstack-router-ssr-query/status.json).

Complete: `setupRouterSsrQueryIntegration` (the package's only export) delegating to `@tanstack/router-ssr-query-core@1.169.1`, with the QueryClientProvider Wrap composition on Octane.

SSR / hydration: Supported — this package IS the SSR integration (dehydrates query state into the router stream and wraps the app in the query provider).

Scope/evidence last checked: 2026-07-20.

- Created for the tanstack-com benchmark's octane flavor (Phase 2c); exercised end-to-end by that app's SSR + hydration.

## @octanejs/tanstack-store

[`packages/tanstack-store`](../packages/tanstack-store) `0.0.27` — ports `@tanstack/react-store@0.11.0`. Status data: [`packages/tanstack-store/status.json`](../packages/tanstack-store/status.json).

Re-exports `@tanstack/store@0.11.0` unchanged and implements the stable React binding surface (`useSelector`, `useAtom`, `useCreateAtom`, `useCreateStore`, `createStoreContext`, and deprecated `useStore`) on Octane hooks.

Known divergences:

- The upstream experimental `_useStore` hook is intentionally omitted; use `useSelector` with `store.actions` or `store.setState` instead.

SSR / hydration: Supported: selectors, writable atoms, and store context read their current snapshots during server rendering; the adapter has no browser-only initialization.

Scope/evidence last checked: 2026-07-15.

- Differential coverage runs one shared fixture through this adapter and real `@tanstack/react-store@0.11.0`, covering selectors, comparator bailouts, atom writes, component-created atoms and stores, actions, and context.
- Behavioral conformance coverage additionally checks source replacement, independent call sites, nested provider resolution, subscription cleanup, deprecated `useStore`, and server output; type tests cover all overload families.

## @octanejs/tanstack-table

[`packages/tanstack-table`](../packages/tanstack-table) `0.1.30` — ports `@tanstack/react-table@9.0.0-beta.58`. Status data: [`packages/tanstack-table/status.json`](../packages/tanstack-table/status.json).

Complete port of the v9 adapter: the framework-agnostic `@tanstack/table-core` (constructTable + every tree-shakeable feature and row model) is reused verbatim, and the adapter — `useTable`, `Subscribe`, `flexRender`/`FlexRender`, `createTableHook`, `createTableHookContexts` — is transcribed onto octane hooks. Table state lives in TanStack Store atoms via the `coreReactivityFeature` bindings, and `useSelector` drives re-renders from the selected slice. Every store primitive (hooks, `createAtom`, `batch`, `shallow`, and the atom/store types) is imported from @octanejs/tanstack-store, which re-exports all of @tanstack/store — the binding takes no direct dependency on the store core, so there is only one path to it and atom identity cannot be split across duplicate copies.

Known divergences:

- `flexRender`'s class-component and `react.memo`/`forwardRef` exotic-component branches are dropped — octane has no class components or forwardRef, and octane's `memo()` returns a plain function, so `typeof === 'function'` covers every component.
- Upstream's `useLegacyTable` entry (the v8-compat `get*RowModel` shim, its marker factories, and the `Legacy*` type aliases) is NOT ported. It exists to migrate existing React v8 codebases; octane has none, so octane code targets the v9 `useTable` API directly.

SSR / hydration: No SSR-specific surface; table-core is pure computation.

Scope/evidence last checked: 2026-07-26.

- `useTable` and `useAppTable` end in an OPTIONAL `selector` parameter, so both split the compiler-injected trailing hook slot off their rest args (see src/internal.ts) — otherwise `useTable(options)` would read the slot symbol as the selector.
- Column sizing/resizing and pinning/ordering drag interactions are untested-by-interaction (the differential rig has no mousemove driver); their state APIs are table-core computation reused verbatim.

## @octanejs/tanstack-virtual

[`packages/tanstack-virtual`](../packages/tanstack-virtual) `0.1.30` — ports `@tanstack/react-virtual@3.14.5`. Status data: [`packages/tanstack-virtual/status.json`](../packages/tanstack-virtual/status.json).

Complete 1:1 port: the framework-agnostic `@tanstack/virtual-core` (Virtualizer + observers + windowing math) is reused verbatim; the React adapter (`useVirtualizer`, `useWindowVirtualizer`, incl. `useFlushSync` and the experimental `directDomUpdates` surface) is transcribed onto octane hooks, preserving upstream's force-update + flushSync-on-sync-scroll wiring and layout-effect lifecycle.

Known divergences:

- octane's `flushSync` called while a flush is already on the stack degrades to a plain call drained by the ambient flush (re-entrancy guard) — sync scroll notifies dispatched from inside a discrete-event flush land at that flush's boundary instead of nested; consumer-invisible, pinned by a conformance test.

SSR / hydration: SSR-safe: `useIsomorphicLayoutEffect` degrades to `useEffect` without `document`; the first paint windows from `initialRect`/`initialOffset` exactly as upstream. No dedicated SSR tests.

Scope/evidence last checked: 2026-07-12.

- Smooth scrolling (`behavior: 'smooth'`) and the default ResizeObserver measurement path are untestable in jsdom (no layout); their code is verbatim upstream/virtual-core. Tests drive rects via the public `initialRect`/`observeElementRect`/`measureElement` options, mirroring upstream's own harness.

## @octanejs/tauri

[`packages/tauri`](../packages/tauri) `0.0.16` — ports `@tauri-apps/api@2.11.1`. Status data: [`packages/tauri/status.json`](../packages/tauri/status.json).

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

[`packages/testing-library`](../packages/testing-library) `0.1.30` — ports `@testing-library/react` (unpinned). Status data: [`packages/testing-library/status.json`](../packages/testing-library/status.json).

`render`/`rerender`/`cleanup`/`renderHook` + `act` over the verbatim `@testing-library/dom` (every query, `screen`, `within`, `waitFor`, `fireEvent`, `prettyDOM`, `configure`), with commit timing wired to octane's scheduler via the dom-library's `eventWrapper`/`asyncWrapper` config.

Known divergences:

- `fireEvent` dispatches real native events — no React remappings (`fireEvent.change` fires an explicit native `change`, not text typing or checkbox click activation) and no enter/leave/focus double-dispatch.
- Not ported: the `ReactStrictMode` wrapper, `legacyRoot`, and the `onCaughtError`/`onRecoverableError` options.

SSR / hydration: `hydrate: true` adopts octane SSR output via `hydrateRoot`.

Scope/evidence last checked: 2026-07-17.

- The reused framework-agnostic core is `@testing-library/dom@^10.4.1`; the ported react-testing-library layer tracks upstream behavior rather than a pinned release.
- `@testing-library/user-event` drives native text input/commit and checkbox click → input → change sequences without an Octane adapter.

See also: [`docs/testing-library-migration-plan.md`](testing-library-migration-plan.md)

## @octanejs/three

[`packages/three`](../packages/three) `0.1.26` — ports `@react-three/fiber@9.6.1 (2a528745)`. Status data: [`packages/three/status.json`](../packages/three/status.json).

Technical-preview Milestones 0–10 surface: renderer configuration and the DOM Canvas boundary, compiler ABI and renderer-local Three intrinsic types, catalogue and both extend forms, primitive/args construction, Three prop application, attachment, ordered placement/recreation, retained visibility, lifecycle/ref delivery, ownership-aware disposal, promise-returning HTMLCanvasElement and OffscreenCanvas roots, Octane act/flushSync scheduling, callback-aware unmountComponentAtNode, callable root state, scene/camera/raycaster and resize/DPR/viewport configuration, shadows/colors, one shared frame loop, controlled WebXR loop handoff, context-restore invalidation, compatible/reconstructing HMR, global effects, useStore/useThree/useFrame/useGraph and managed-instance helpers, the ray/pointer event system with DOM sources and custom managers, a keyed useLoader cache with preload/clear and GLTF graph augmentation, retained Suspense/Activity behavior, client Three-to-DOM pending/error projection, same-renderer createPortal targets with state/event enclaves and physical Three event bubbling, client-only Canvas shell streaming and production Vite/Rsbuild hydration adoption with the matching raw Rspack graph split, the explicit-target low-level DOMRegion boundary, a deterministic testing harness, an asynchronously acknowledged structured-clone transport proof, a checked public API/subpath matrix, Three r156/current compatibility lanes, a packed external consumer, real WebGL failure/recovery coverage, and semantic-checksummed renderer and shipped-size benchmarks.

Known divergences:

- Octane owns component execution, hooks, context, scheduling, Suspense, refs, and effects instead of embedding React Reconciler.
- The programmatic root renders an Octane component plus props rather than a React element descriptor.
- The upstream callable store selector remains order-based because dynamic function calls cannot receive compiler slots; compiler-visible useStore(selector) and useThree(selector) preserve Octane's conditional-hook semantics.
- buildGraph omits unnamed mesh and material entries, plus array-valued material entries, instead of publishing empty or undefined keys.
- Removing a pierced prop resets its original nested target; R3F 9.6.1 mistakenly writes that default to the leaf key on the root object.
- Reconstructing a captured or hovered object rewrites nested stored intersections to the replacement; R3F 9.6.1 updates only the outer hover identity and capture-map key, which leaves captured delivery pointing at the retired object.
- Hidden retained Activity subtrees are excluded from recursive raycasts; Three r172 ignores Object3D.visible during raycasting, so R3F 9.6.1 can otherwise pierce a hidden descendant through an interactive visible ancestor.
- Managed and externally leased portal targets are root-scoped and cross-root portal placement is rejected before mutation; this makes the universal target-handle lifetime explicit.
- Root teardown and unmountComponentAtNode callback delivery are synchronous; R3F 9.6.1 defers its registry teardown and callback by 500 milliseconds.
- DOMRegion is an Octane-specific explicit-target Three-to-DOM primitive, not R3F or Drei Html and not the WebXR DOM Overlay API; it intentionally defines no positioning, occlusion, styling, or layout contract.

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

[`packages/tiptap`](../packages/tiptap) `0.0.27` — ports `@tiptap/react@3.28.0`. Status data: [`packages/tiptap/status.json`](../packages/tiptap/status.json).

Complete @tiptap/react 3.28.0 adapter surface across the root and ./menus entries: @tiptap/core re-exports, editor hooks and contexts, the EditorContent portal bridge, compound Tiptap API, ReactRenderer, custom NodeView/MarkView renderers and helpers, BubbleMenu, and FloatingMenu.

Known divergences:

- Subscriptions use Octane's native useSyncExternalStore implementation, so the published binding does not depend on React or use-sync-external-store.
- EditorConsumer is a render-prop compatibility component because Octane contexts do not expose React's .Consumer property.
- Renderer components are Octane component bodies and refs are ordinary props; the React-prefixed public names are retained for TipTap source compatibility without a React dependency.
- NodeViewWrapper consumes its as prop after selecting the host tag; @tiptap/react 3.28.0 also forwards that prop as an invalid DOM attribute.
- BubbleMenu and FloatingMenu handlers receive native browser events rather than React synthetic events.
- ReactMarkView tears down its portal when ProseMirror destroys the mark view, closing a renderer leak present in @tiptap/react 3.28.0.

SSR / hydration: Covered across the complete surface: hooks use null server snapshots and suppress editor construction without a DOM, static NodeView/MarkView helpers render without a DOM renderer, detached menu targets are client-only, and hydration adopts deferred server shells before mounting live custom views and menus.

Scope/evidence last checked: 2026-07-17.

- Pinned to the @tiptap/react, @tiptap/core, and @tiptap/pm 3.28.0 release family.
- EditorContent owns one external-store portal registry so custom views preserve context, event ownership, and lifecycle beneath the editor host.
- Package-boundary tests lock the root and ./menus runtime exports plus their client directives to @tiptap/react 3.28.0.
- Behavioral tests use real TipTap editors for lifecycle, custom views, and menu plugins; shared-fixture differential tests compare editor and custom-view behavior with @tiptap/react.
- A real Chromium harness covers caret-preserving input, selection, NodeView dragging, and BubbleMenu/FloatingMenu visibility and positioning.

## @octanejs/usehooks-ts

[`packages/usehooks-ts`](../packages/usehooks-ts) `0.0.14` — ports `usehooks-ts@3.1.1`. Status data: [`packages/usehooks-ts/status.json`](../packages/usehooks-ts/status.json).

First host-safe cohort: useBoolean, useCounter, useToggle, useMap, useStep, useDebounceCallback, useDebounceValue, useInterval, useTimeout, useIsMounted, and useUnmount.

Known divergences:

- Only the listed pure, timing, and lifecycle hooks are exported; browser storage/media hooks and DOM observer/direct-element hooks are deliberately absent.
- Public setter types are structurally equivalent to React Dispatch/SetStateAction without importing React types.

SSR / hydration: Supported for the listed cohort. Effects and timers do not run during server rendering; hydration activates lifecycle and timing work without requiring browser reads during render.

Scope/evidence last checked: 2026-07-29.

- Audited against the exact usehooks-ts 3.1.1 npm tarball (SHA-1 0bb7f38f36f8219ee4509cc5e944ae610fb97656).
- Storage/media are deferred: initializeWithValue:false exists upstream, but this first cohort does not claim deterministic Octane SSR/hydration parity without dedicated host-event evidence.
- Deferred browser/DOM exports: useClickAnyWhere, useCopyToClipboard, useCountdown, useDarkMode, useDocumentTitle, useEventCallback, useEventListener, useHover, useIntersectionObserver, useIsClient, useIsomorphicLayoutEffect, useLocalStorage, useMediaQuery, useOnClickOutside, useReadLocalStorage, useResizeObserver, useScreen, useScript, useScrollLock, useSessionStorage, useTernaryDarkMode, and useWindowSize.

## @octanejs/valtio

[`packages/valtio`](../packages/valtio) `0.1.16` — ports `valtio@2.3.2`. Status data: [`packages/valtio/status.json`](../packages/valtio/status.json).

The framework-agnostic `valtio/vanilla` core and `valtio/vanilla/utils` are re-exported verbatim; `useSnapshot` and the `useProxy` utility are ported to Octane.

Known divergences:

- React DevTools affected-path debug labels are omitted because Octane's `useDebugValue` is currently a no-op.

SSR / hydration: The server snapshot path uses `snapshot(proxyObject)`; no dedicated SSR rendering test is included yet.

Scope/evidence last checked: 2026-07-27.

## @octanejs/visx

[`packages/visx`](../packages/visx) `0.1.27` — ports `@visx/visx@4.0.0 + master@485c035`. Status data: [`packages/visx/status.json`](../packages/visx/status.json).

Complete current Visx 4.x web runtime surface: the exact 35-namespace aggregate, all 40 feature entry points, and the eight public a11y/react, a11y/server, axis/react, scale/react, shape/react, theme/react, tooltip/floating, and voronoi/react subpaths. Released-only packages chord, delaunay, react-spring, sankey, and stats remain directly importable exactly as upstream specifies.

Known divergences:

- Interaction callbacks receive native DOM events through Octane's delegated event system instead of React synthetic events.
- All React class controllers and class-instance refs are replaced by native functional TSRX hooks; Brush intentionally omits upstream's legacy innerRef instance handle.
- Deterministic text metrics and annotation bounds, pure SplitLinePath SVG sampling, and collision-aware estimated wordcloud rectangles replace browser-only measurement/canvas paths so fixed-size output is identical during SSR and first hydration. Font-specific wrapping, browser-specific path length rounding, and pixel-exact d3-cloud packing can differ.
- The react-spring entry point uses a deterministic requestAnimationFrame numeric interpolator rather than spring-physics timing, and Zoom uses native wheel/pointer/touch listeners rather than @use-gesture/react at runtime. Their public Visx props and exports are retained; Zoom imports framework-neutral @use-gesture/core types only.
- Props upstream types as React.ReactNode are octane renderables (octane's OctaneNode = unknown): octane elements are nominal, so ReactNode-typed props would reject them. Render-prop signatures keep their parameters and return octane renderables.

SSR / hydration: Fixed-dimension primitives, wrapped XYChart series, annotations, text, and wordclouds emit complete deterministic SVG on the server. Real hydrateRoot adoption preserves the same SVG/definition/axis/text/series/annotation/wordcloud nodes without warnings, replacement, or post-effect markup changes; generated IDs, measurement fallbacks, portals, and responsive initial sizes are covered.

Scope/evidence last checked: 2026-07-14.

- The released v4.0.0 tag is the differential runtime oracle; current master commit 485c035 adds a11y, chart, kernel, theme, and the nested subpaths before their next registry publication.
- All 258 React-owned component and hook modules ship as TSRX and pass both client and server compiler gates; framework-neutral D3/math/data modules remain TypeScript.
- @visx/demo is a non-importable Next.js documentation/gallery application and @visx/registry is private registry tooling; both are excluded.
- @visx/vendor is upstream dual-module D3 packaging infrastructure; this ESM-first port imports the pinned D3 modules directly and does not expose vendor subpaths.

## @octanejs/wagmi

[`packages/wagmi`](../packages/wagmi) `0.0.13` — ports `wagmi@3.7.4`. Status data: [`packages/wagmi/status.json`](../packages/wagmi/status.json).

WagmiProvider and createConfig over @wagmi/core 3.6.4, with config, connection, connect, disconnect, switch-connection, switch-chain, connectors, connections, chains, balance, contract read/simulate/write, transaction send/wait, and message-signing hooks.

Known divergences:

- The binding targets Wagmi v3 names. Deprecated v2 useAccount/useSwitchAccount aliases and hooks outside the documented representative inventory are not exported.
- Privileged mutation hooks force retry:false, require a current live connector, cancel before dispatch when the displayed wallet context changed, and quarantine a late success as ActionContextChangedError when account, chain, or connector changed after dispatch.
- RainbowKit 2.2.x declares Wagmi v2 peers. Its defining provider/custom-button/modal contracts can be implemented over this v3 surface, proven by the deterministic disconnected-to-connecting-to-connected gate, but the downstream binding must document that peer-range divergence.
- The connectors subpath exposes the dependency-free injected and deterministic mock connectors. Vendor connectors and their optional SDKs remain direct application dependencies.
- EIP-1193 event validation, duplicate coalescing, and connector-generation invalidation are delegated unchanged to @wagmi/core 3.6.4. This binding does not add a second provider-event layer or claim independent normalization behavior.

SSR / hydration: WagmiProvider supports ssr:true and initialState through @wagmi/core hydrate. parseHydratedState accepts only a versioned, 16 KiB-bounded public-state hint and rejects malformed or privileged material; a hydrated connection is never authority for signing or submission.

Scope/evidence last checked: 2026-08-02.

## @octanejs/zustand

[`packages/zustand`](../packages/zustand) `0.1.32` — ports `zustand@5.0.14`. Status data: [`packages/zustand/status.json`](../packages/zustand/status.json).

Complete 1:1 port: the framework-agnostic vanilla store is reused verbatim; `create`/`useStore`, `shallow`/`useShallow`, the traditional equality-fn variants, and all middleware (persist, devtools, subscribeWithSelector, combine, redux).

Known divergences:

- Unstable selectors (a new reference every render) settle after a bounded number of re-renders instead of hitting React's `useSyncExternalStore` warning loop — still prefer `useShallow`.

SSR / hydration: No SSR-specific surface; no dedicated SSR tests.

Scope/evidence last checked: 2026-07-20.

- 2026-07-20: `UseBoundStore` type export added (was module-local; upstream zustand/react exports it — gap found by the tanstack-com port).
