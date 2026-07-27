# Base UI → octane migration plan (`@octanejs/base-ui`)

Faithful port of **Base UI** (`@base-ui/react`, base-ui.com) to the octane
renderer, mirroring the `@octanejs/radix` methodology. Ported from the pinned
`mui/base-ui` checkout at **`v1.6.0`** (the version installable from this
environment's npm), proven by **differential parity** against the real
`@base-ui/react`. Standing discipline (from the Radix port): **when a faithful
port can't reproduce React behavior, fix octane with a regression test + changeset; never
work around it in the binding.**

## Progress (reverse-chronological)

> **Phase 3f STAGE 3 — submenus (2026-07-27). Green: 129 base-ui tests (88 differential + 41
> behavior/namespace), typecheck + `format:check` clean.** `Menu` now covers **all 20 upstream
> parts**; the `menu` subpath is complete.
>
> Adds `MenuSubmenuRoot` (provides `MenuSubmenuRootContext`, which is what makes the nested
> `MenuRoot` resolve `parent` to `{ type: 'menu' }`, then renders a plain `MenuRoot`) and
> `MenuSubmenuTrigger`. The trigger is the first user of the `submenu-trigger` arm of `useMenuItem`'s
> `itemMetadata`, and opening a submenu activates the sibling-close / parent-close / item-hover
> relays `MenuPositioner` has carried inertly since stage 1. It holds TWO stores at once: it is an
> item of the parent menu (parent `CompositeList`, `itemProps`, `isActive`) and the trigger of its
> own.
>
> **A second rig limitation, and why it was NOT normalised away.** With a submenu open, its trigger
> is the only tabbable child of the parent popup (`tabIndex: open || highlighted ? 0 : -1`), so the
> parent focus manager focuses it and the trigger's `onFocus` sets the PARENT store's `activeIndex`
> → `data-highlighted`. Both runtimes share one `document.activeElement`, so only one can win — and
> unlike the focus-guard `tabindex`, this is derived STORE state, which no DOM-level normaliser can
> reconstruct. Confirmed it is the rig and not the port by mounting octane ALONE: the trigger is
> highlighted and is `document.activeElement`, exactly matching React. Normalising `data-highlighted`
> away would blind the roving-focus comparison stage 2 deliberately preserved, so instead the
> open-submenu case byte-compares the SUBMENU'S OWN PORTAL SUBTREE (`stepComparingSubtree`), where
> the whole stage-3 payload lives — nested `inline-end`/`start` placement, `data-nested`, the popup's
> aria wiring back to the trigger, the nested items — and the trigger's highlighted state is asserted
> octane-only.
>
> Escape semantics were probed rather than assumed: dispatched from INSIDE the tree it closes only
> the child (`closeParentOnEsc` defaults to false); dispatched on `document` it closes both, because
> that target is outside both floating elements and each menu dismisses independently. The
> single-level tests can use `document` precisely because there is only one menu.
>
> Not ported here: `Menubar` and `ContextMenu` (stage 4), which fill in the `menubar` /
> `context-menu` parent branches transcribed in stage 1.

> **Phase 3f STAGE 2 — the Menu item family (2026-07-27). Green: 121 base-ui tests (86 differential
> + 35 behavior/namespace), typecheck + `format:check` clean.** Subpath coverage unchanged at
> **29/43** (Menu was already counted); the `menu` subpath goes from 5 parts to 18 of upstream's 20.
>
> Adds ~1,700 loc to `packages/base-ui/src/menu.ts`: `utils/stateAttributesMapping` (`itemMapping`,
> deferred from stage 1 because it needs the checkbox data-attributes), `item/`
> (`useMenuItemCommonProps` + `useMenuItem` + `MenuItem`), `link-item/`, `checkbox-item/` +
> `checkbox-item-indicator/`, `radio-group/` + `radio-item/` + `radio-item-indicator/`, `group/` +
> `group-label/`, `arrow/`, `backdrop/` and `viewport/`. `Menu.Separator` re-exports the shared
> `Separator` exactly as upstream's `index.parts.ts` does.
>
> **This is where Phase 3e is finally exercised end-to-end.** Items register with the positioner's
> `CompositeList`, so `useListNavigation` can rove `data-highlighted` and the roving `tabindex`
> between them and `useTypeahead` can match their collected labels. Behavior tests pin arrow-key
> roving, Home/End, single-character typeahead, buffer ACCUMULATION (typing `b` then `a` searches
> `"ba"` and stays on Banana, where a non-accumulating implementation would jump to Apple), and the
> `TYPEAHEAD_RESET_MS` reset. **3e still needed no repairs.**
>
> The differential helper from stage 1 got stronger rather than staying a strip: it now UNDOES
> `disableFocusInside` by restoring each element's stashed `data-tabindex`, which is exactly what
> `enableFocusInside` does when focus returns. That keeps `tabindex` VALUES in the byte-compare —
> which matters now that items are present, since their tabindex is roving state
> (`open && highlighted ? 0 : -1`) rather than a constant, and blanket-stripping it would have
> hidden a real roving-focus divergence.
>
> Two upstream behaviors worth recording, both confirmed by probe rather than assumption: opening a
> menu highlights the first item immediately (there is no "nothing highlighted" state after open),
> and typeahead buffers across keystrokes within `TYPEAHEAD_RESET_MS` rather than matching each key
> independently.
>
> `React.memo` on `MenuRadioGroup` is dropped (octane memoizes renders itself; the wrapper carries
> no behavioral contract), as are `useControlled`'s `name`/`state` labels, which exist only for
> React dev warnings.
>
> **Upstream quirk transcribed, not repaired:** Base UI's MENU indicators gate their render on
> `item.checked` rather than the `mounted` flag `useTransitionStatus` returns — unlike
> `Checkbox.Indicator`/`Radio.Indicator`, which use `mounted`. Unchecking therefore drops the node
> on the same commit and the exit transition never runs, which makes the accompanying
> `useOpenChangeComplete` → `setMounted(false)` pair dead for that direction.
> `MenuCheckboxItemIndicator.tsx` L26 does not even destructure `mounted`. This was raised as a bug
> in review; repairing it would diverge from the real `@base-ui/react`, so it is transcribed as-is,
> documented at both call sites, and pinned by differential TOGGLE steps that drive check → uncheck
> → re-check on both runtimes.
>
> Not in this stage: `SubmenuRoot`/`SubmenuTrigger` (stage 3), `Menubar` and `ContextMenu`
> (stage 4).

> **Phase 3f STAGE 1 — Menu open/close + roving-focus path (2026-07-27). Green: 108 base-ui tests
> (81 differential + 27 behavior/namespace), typecheck + `format:check` clean.** Subpath coverage
> moves 28/43 → **29/43**.
>
> `packages/base-ui/src/menu.ts` (~1,750 loc) ports `store/MenuStore` + `store/MenuHandle`,
> `root/MenuRoot` + `MenuRootContext`, `trigger/`, `portal/`, `positioner/` and `popup/`, plus
> `utils/findRootOwnerId` and the `MenuOpenEventDetails` type. This is the first CONSUMER of the
> Phase 3e list-navigation infrastructure, which merged (#308) deliberately untested because a
> differential test needs a rendered component: `MenuRoot` wires `useListNavigation` +
> `useTypeahead` to the popup store, and `Menu.Positioner` wraps the popup in the `CompositeList`
> that feeds their element/label refs. **3e needed no repairs** — it works as ported.
>
> Supporting additions: `useOpenInteractionType` (the stateful `openMethod` + trigger-props pair;
> only `useOpenMethodTriggerProps` had been ported, because Popover keeps `openMethod` in its
> store), `DROPDOWN_COLLISION_AVOIDANCE` / `TYPEAHEAD_RESET_MS` / `PATIENT_CLICK_THRESHOLD` in
> `utils/constants` (Popover's local copy of the last one now imports it), and the `cancel-open` /
> `sibling-open` reasons.
>
> `MenubarContext` and `ContextMenuRootContext` land as CONTEXT-ONLY modules ahead of their
> components (stage 4). `Menu`'s `parent` union branches on them in ~a dozen places; having the
> contexts now let every branch be transcribed verbatim instead of stubbed and re-threaded later.
> Nothing provides them yet, so those branches are inert.
>
> Rig limitation found and documented: a `Menu.Popup` takes focus on open, and the differential rig
> mounts both runtimes into ONE jsdom document. Whichever popup is focused last makes the other
> runtime's portal see an outward `focusout`, and `FloatingPortal`'s non-modal tab management
> answers with `disableFocusInside(portalNode)` — stamping `tabindex="-1" data-tabindex="0"` on
> that portal's focus guards. Both runtimes run identical code; the asymmetry is one
> `document.activeElement` for two apps. `parity.test.ts` normalises the guards' tabindex away for
> the open-menu fixtures and byte-compares everything else. (Popover sidesteps the same issue by
> running a modal focus manager, which turns portal tab management off.)
>
> Not in this stage: `Menu.Item` and the rest of the item family, submenus, `Menubar`,
> `ContextMenu`, `Menu.Viewport`/`Arrow`/`Backdrop`/`Separator`, and `menu/utils/itemMapping`
> (which depends on `MenuCheckboxItemDataAttributes` and lands with `CheckboxItem` in stage 2).
> Item-level roving focus and typeahead matching are therefore untested until stage 2 — stage 1's
> behavior tests cover the layer below: arrow-key open from the trigger, Escape dismiss, click
> toggle, the ARIA contract, `aria-orientation` reaching the popup from `useListNavigation`, and
> focus entering the popup and returning to the trigger.

> **Phases 3a–3d COMPLETE (2026-07-26). Green: 89 base-ui tests (76 differential + 13 behavior),
> full monorepo suite green, typecheck + format clean.** Subpath coverage moved from 22/43 to
> **28/43**.
>
> - **Phase 3a — zero-dependency backlog.** `Button` (`useButton` + `useRenderElement`, including
>   `focusableWhenDisabled` and `nativeButton={false}`), `DirectionProvider` (over the existing
>   internal `DirectionContext`; octane stores the `TextDirection` string directly rather than
>   Base UI's `{ direction }` wrapper, so no `useMemo` is needed), `CSPProvider` + the new
>   `utils/CSPContext`, and `unstable-use-media-query` on octane's native `useSyncExternalStore`
>   instead of the `use-sync-external-store` shim. 11 differential fixtures.
> - **Phase 3b — hover + focus interaction layer (~2,400 lines).** Replaced BOTH `openOnHover`
>   stubs with the real system: `utils/floating/useHoverShared` (delay resolution + open-event
>   classification), `useHoverInteractionSharedState` (the per-popup mutable record: pointer type,
>   timers, and the pointer-events mutation that keeps the cursor's path to the popup clickable),
>   `safePolygon` (verbatim geometry), `useHoverReferenceInteraction` (trigger side),
>   `useHoverFloatingInteraction` (popup side), `useFocus` (open-while-focused + blocked-focus
>   bookkeeping), and `FloatingDelayGroup`/`useDelayGroup` (shared-delay tooltip groups). Added
>   `platform.os.mac` and the `isInteractiveElement` / `isTargetInsideEnabledTrigger` element
>   helpers. **Deliberate omission:** upstream's standalone `floating-ui-react` `useHover`
>   combiner — no Base UI component uses it, and this binding does not republish that surface.
> - **Faithfulness bug found and fixed by the hover tests.** `PopoverRoot` rendered
>   `PopoverInteractions` as a WRAPPER around the children (an earlier workaround for the octane
>   Provider children dialect-flip bug), so the wrapper's component type changed on every open and
>   tore down the whole subtree — including the trigger, whose element listeners and store
>   registration were then pointing at a detached node, which is exactly why hover-close never
>   fired. Base UI renders it as a headless SIBLING, and all four overlay Roots (Dialog, Popover,
>   Tooltip, PreviewCard) now do the same. The trigger also regained upstream's keyed-fragment
>   wrapper, plus keys on the focus guards (octane reconciles a returned array as a list, so
>   unkeyed siblings would shift the keyed trigger anyway).
> - **The underlying octane bug is fixed separately, so the workaround is gone entirely.** A
>   Provider's `children` may arrive as a compiled `.tsrx` children-block FUNCTION or as an element
>   DESCRIPTOR, and both claimed `scope.slots[0]` — a compiled body stores its binding bag there,
>   the descriptor path stores a `childSlot` record — so alternating between them had the incoming
>   dialect adopt the outgoing one's record (`TypeError: Cannot read properties of undefined
>   (reading 'items')`, subtree detached). Fixed in octane by
>   [#294](https://github.com/octanejs/octane/pull/294). The sibling shape this binding now uses is
>   dialect-stable (its Provider children are always an array), so these components do not depend on
>   that fix — it simply means no binding has to keep dodging the bug.
> - **Phase 3c — popup viewport (~700 lines).** `utils/usePopupViewport` (keeps a DOM clone of the
>   outgoing content mounted beside the incoming content so a trigger switch can animate),
>   `utils/usePopupAutoResize` (measure at `max-content` → pin previous size → animate to new),
>   `utils/getCssDimensions`, `utils/usePreviousValue`, `utils/FloatingPortalLite`. Then the two
>   missing parts on shipped components: **`Dialog.Viewport`** and **`Popover.Viewport`**. Parity
>   note: upstream's bare `data-current` JSX attribute serializes as `data-current="true"`, so the
>   port passes `true` rather than `''`.
> - **Phase 3d — Tooltip + PreviewCard (~3,000 lines).** `src/tooltip.ts` (Provider/Root/Trigger/
>   Portal/Positioner/Popup/Arrow/Viewport + store + handle), including the trigger's
>   nested-trigger hover arbitration and `trackCursorAxis` via the newly ported
>   `utils/floating/useClientPoint`. `src/preview-card.ts` (Root/Trigger/Portal/Positioner/Popup/
>   Backdrop/Arrow/Viewport + store + handle), whose distinctive piece is the inline-rect anchoring
>   that pins the card to the hovered line of a wrapping `<a>` (`utils/popups/inlineRect`).
> - **Rig note:** hover open/close, focus open and delay grouping are timing- and pointer-driven,
>   so none of them appear in a single innerHTML snapshot. They are covered by dedicated behavior
>   tests (`popover-hover.test.ts`, `tooltip.test.ts`, `preview-card.test.ts`) alongside the
>   differential fixtures for structure.

> **SSR foundation (2026-07-25).** `useIsHydrating` now uses Octane's actual
> server and client external-store snapshots and threads manual hook slots into
> both slider call sites. A dedicated Node-mode project verifies the hydration
> snapshot, accessible separators, hidden edge-aligned slider parts, and closed
> dialog rendering without a DOM. Client hydration adopts real Octane Base UI
> separator markup, transitions to the client snapshot, and remains interactive.
> Open-overlay and remaining component hydration are still follow-up work.

> **Phase 3 — ALERTDIALOG COMPLETE (2026-07). Green: 58 base-ui tests (54 differential + 4 behavior),
> full suite green.** `src/alert-dialog.ts` — a thin Dialog variant (the whole Dialog foundation
> already supported it): `AlertDialogRoot` = `useRenderDialogRoot(props, 'alert-dialog')` (forces
> `modal: true`, `disablePointerDismissal: true`, `role: 'alertdialog'`), and Trigger/Portal/Backdrop/
> Popup/Title/Description/Close are Dialog's parts reused verbatim via the `Dialog` namespace.
> `AlertDialogHandle extends DialogHandle` (enforces the alert-dialog invariants on its store).
> Exported `useRenderDialogRoot` from `dialog.ts`. **The open modal alert dialog is byte-identical to
> real Base UI** (only `role="alertdialog"` differs from Dialog) — differential + 2 behavior tests
> (trigger→open→Close, Escape-still-dismisses-though-outside-press-is-disabled).

> **Phase 3 — POPOVER COMPLETE: OPEN (anchored-positioner) path landed + differential-verified
> (2026-07). Green: 55 base-ui tests (53 differential + 2 Popover behavior), full monorepo suite 2289
> green.** Ported the anchored-positioning layer, reusing `@octanejs/floating-ui`'s positioning engine
> maximally: `utils/floating/useFloating.ts` (Base UI's Store-based `useFloating`, octane-adapted —
> swaps `@floating-ui/react-dom`'s `useFloating` for `@octanejs/floating-ui`'s `usePositionFloating`,
> keeping ALL the `FloatingRootStore` logic) + `utils/floating/useFloatingRootContext.ts` (internal
> fallback store) + `utils/useAnchorPositioning.ts` (~430; the offset/flip/shift/limitShift/size/arrow
> middleware config, reusing `@octanejs/floating-ui`'s re-exported `@floating-ui/dom` middleware + the
> ref-aware `arrow`; `@floating-ui/utils` helpers) + `utils/hideMiddleware.ts` +
> `utils/adaptiveOriginMiddleware.ts` + `utils/usePositioner.ts` + `utils/useAnchoredPopupScrollLock.ts`
> + `utils/getDisabledMountTransitionStyles.ts` + `utils/constants.ts` + `utils/closePart.ts`
> (ClosePartProvider/count/registration) + `utils/floating/useHoverFloatingInteraction.ts` (stub, popup
> side of hover). Then the 8 open-path parts in `src/popover.ts`: `PopoverPortal`, `PopoverPositioner`
> (useAnchorPositioning + usePositioner + FloatingNode + InternalBackdrop + trigger-change animation
> gate), `PopoverPopup` (FloatingFocusManager + closePart + useOpenChangeComplete), `PopoverArrow`,
> `PopoverBackdrop`, `PopoverTitle`, `PopoverDescription`, `PopoverClose`. **The open modal Popover is
> byte-identical to real Base UI** — including the `@floating-ui/dom`-computed positioner styles
> (`transform`, `--available-width/height`, `--anchor-*`, `--transform-origin`), the modal backdrop
> `clip-path` cutout, popup `role=dialog`+aria, arrow, and title/desc/close. **NO octane fix needed**
> — the positioning engine reuse just worked. **Two rig-blind-spot notes** (differential is final-HTML
> only, documented to not capture focus/effect-timing): (1) non-modal `FloatingPortal.disableFocusInside`
> stashes `tabindex→data-tabindex` on a focusout event React's jsdom mount sequences differently — so
> the differential fixture is `modal` (disables that path, like Dialog); (2) with a trigger, its
> `element`↔`[guard,element,guard]` shape-flip on open remounts the button, which the positioner
> observes as a transient "trigger change" (`data-instant`) — so the differential fixture is
> controlled-`open` WITHOUT a trigger (stable anchor). The trigger open→dismiss flow (Close + Escape)
> is covered by the `PopoverInteractive` behavior test instead. **Deferred:** the open-on-hover
> interaction (both stubs) remains off-by-default.

> **Phase 3 — POPOVER started: CLOSED path landed + differential-verified (2026-07). Green: 52
> base-ui tests, full suite 2277 green.** `src/popover.ts` — `PopoverStore` (extends the octane
> `ReactStore`; more state than Dialog: disabled/instantType/openChangeReason/stickIfOpen/openOnHover/
> closeDelay/hasViewport/focusManagerModal + hover/patient-click `setOpen`), `PopoverHandle`/
> `createPopoverHandle`, contexts, `PopoverInteractions` (useDismiss + usePopupInteractionProps),
> `PopoverRoot` (wraps a `FloatingTree` at top level), `PopoverTrigger` (useClick + trigger
> focus-guards + hover). Reuses the ENTIRE Dialog foundation. New: `utils/popups/useTriggerFocusGuards.ts`
> (ported — tab-out focus guards around an open trigger). **Deferred stubs:**
> `utils/floating/useHoverReferenceInteraction.ts` (returns `{}`; the ~1400-line hover/safePolygon
> open-on-hover feature is off by default) — click-to-open is fully functional. Uses the same
> stable-descriptor Provider-children workaround as Dialog. **Next: the OPEN path** — the Positioner
> (the big new surface: `useAnchorPositioning` ~755 + `usePositioner` + `adaptiveOrigin` anchor
> positioning via `@floating-ui/dom`) + Popup + Arrow + Backdrop + Title/Description/Close, then an
> open-popover differential (positions are jsdom-default but structure/styles must match) + focus/
> dismiss behavior tests.

> **Phase 3 — DIALOG COMPLETE (2026-07). Green: 51 base-ui tests (49 differential + 2 behavior),
> full monorepo suite 2276 green.** Ported Base UI's own `data-base-ui-*` floating focus/portal layer
> to `utils/floating/`: `tabbable.ts` (+ `composite.ts`, `activeElement`), `FocusGuard.ts`,
> `FloatingPortal.ts` (+ `PortalContext`/`useFloatingPortalNode`), `markOthers.ts`, `enqueueFocus.ts`,
> `FloatingFocusManager.ts` (~600 lines octane; store-connected; focus trap + return + markOthers
> inert), and element/event/nodes/platform additions (`isTypeableCombobox`/`getFloatingFocusElement`/
> `isVirtualClick`/`isVirtualPointerEvent`/`getNodeAncestors`; `platform.env.jsdom`/`os.android`).
> `dialog.ts` now imports the LOCAL FloatingPortal + FFM (fed the FloatingRootStore directly as
> `context`), so the **open modal Dialog** (Portal → InternalBackdrop + Backdrop + focus-guard + popup
> `role=dialog` + title/desc/close + focus-guard, all `data-base-ui-*` with `markOthers` inert
> siblings) is **byte-identical to real Base UI**. Two id fixes for parity: the portal-node id +
> `floatingId` use RAW `useId` (no `base-ui-` prefix, matching `@base-ui/utils/useId`), and the popup
> carries `style="--nested-dialogs: 0"`. Added dedicated behavior tests (non-differential —
> focus/close aren't in innerHTML): trigger opens, Close button + Escape dismiss.
> **octane bug found + worked around** (see below). **Also fixed a flaky pre-existing radix Toast
> timing test** (`duration: 50` racing `settle()`'s real timers under load → widened to 500/700).
> **Next: Popover** (reuses ALL of this — positioner + anchor positioning is the new surface), then
> Tooltip/PreviewCard/AlertDialog/Menu/Toast.
>
> **octane bug (Provider children shape-flip, UNFIXED — binding worked around):** a context Provider
> whose `children` prop ALTERNATES between a compiled render-body function and an element descriptor
> across renders crashes octane's reconciler ("Cannot read properties of undefined (reading 'items')")
> — `childrenAsBody` runs a function child directly in the Provider scope (owning `scope.slots`) but a
> descriptor child via `childSlot(scope, 0)`, colliding the slot namespaces. Safe octane fix is a
> shape-flip reset in `ProviderBody` (core teardown — deferred). Binding workaround: keep the
> Provider's children a STABLE descriptor shape both states (a no-DOM `DialogInteractions`/
> `DialogChildren` wrapper). Full detail in memory `octane-provider-children-shape-flip`.

> **Historical Phase 3 OPEN checkpoint (part 2, 2026-07) — all Dialog parts + a functional open
> dialog landed; byte parity was temporarily blocked on Base UI's FloatingPortal + FFM.** Built the
> real `DialogInteractions` (wires `useDismiss` + `useScrollLock` +
> `usePopupInteractionProps` + nested-dialog bookkeeping) and all remaining parts: `DialogPortal`
> (+ `DialogPortalContext`, `InternalBackdrop`, `inertValue`), `DialogBackdrop`, `DialogPopup`,
> `DialogTitle`, `DialogDescription`, `DialogClose`. A `defaultOpen` modal dialog now renders fully —
> portaled, backdrop + popup(`role=dialog`, aria-labelledby/describedby) + title/description/close +
> focus guards — and functionally focus-traps/dismisses. **KEY FINDING (corrects last turn's
> assumption): `@octanejs/floating-ui` emits `data-floating-ui-*` attributes (portal/focus-guard/
> inert) + a different FocusGuard style (`clip` vs `clip-path`) + role + container handling, whereas
> Base UI emits `data-base-ui-*`.** The repository subsequently ported the Base UI-specific portal
> and focus-manager behavior; the open Dialog differential now executes normally and passes with
> byte-identical markup.

> **Phase 3 OPEN path (part 1) — the store-connected dismiss/scroll layer landed (2026-07). base-ui
> typecheck + suite (48) green.** `utils/floating/useDismiss.ts` — the full store-based dismiss hook
> (Escape + outside-press close, with the complete intentional/sloppy press-type + touch + nested-tree
> logic; reads `store.useState`/`select`/`setOpen`/`context`; returns `{reference, floating, trigger}`
> prop bags; native events; slot-threaded). `utils/useScrollLock.ts` (the ref-counted `ScrollLocker`
> singleton + overlay/inset-scrollbar strategies, near-verbatim). New util deps: `mergeCleanups`,
> `floating/createAttribute` (`data-base-ui-${name}`), `floating/nodes` (`getNodeChildren`),
> `floating/element` additions (`isEventTargetWithin`/`isRootElement`/`contains` re-export),
> `floating/event` additions (`isReactEvent`), `platform` extended (`engine.webkit`,
> `screenReader.voiceOver`), `AnimationFrame.create()`. **Added `@floating-ui/utils` to base-ui deps**
> (Base UI imports the SAME package for `getComputedStyle`/`getParentNode`/`isElement`/`isHTMLElement`/
> `isLastTraversableNode`/`isShadowRoot`/`isOverflowElement`). **Next (OPEN path part 2):** the real
> `DialogInteractions` (wires useDismiss + useScrollLock), the FFM/FloatingPortal reuse-adapter (feed
> `@octanejs/floating-ui`'s `FloatingFocusManager`/`FloatingPortal` a store-derived context — the
> plan's "reuse with adapters" path), the Portal/Backdrop/Popup/Title/Description/Close parts, then an
> open-dialog differential + focus-trap/return-focus/dismiss tests.

> **Phase 3 — FIRST OVERLAY (closed Dialog) landed + differential-verified (2026-07). Green: 48
> differential tests, full monorepo suite 2175 green.** The Store-based popup foundation is now
> proven end-to-end. `src/dialog.ts` — the CLOSED-state path: `DialogStore` (extends the octane
> `ReactStore`; dialog-specific state/selectors + `setOpen`), `DialogHandle`/`createDialogHandle`,
> `DialogRootContext`/`IsDrawerContext`, `useDialogRoot` (uses the popups engine's `usePopupRootSync`
> + `useImplicitActiveTrigger` + `useOpenStateTransitions` + `useImperativeHandle` — NOT `useDismiss`),
> `useRenderDialogRoot` (renders `DialogInteractions` only when `open || mounted`), `DialogRoot`,
> and `DialogTrigger` (a `<button>` via `useRenderElement` + `useClick` + `useTriggerDataForwarding`
> + `useButton` + `useOpenMethodTriggerProps`). New floating pieces: `useClick.ts` (store-connected,
> ~130 lines), `element.ts`/`event.ts` additions (isTypeableElement/isMouseLikePointerType),
> `useEnhancedClickHandler.ts`, `useOpenInteractionType.ts`, `popupStateMapping.ts`
> (triggerOpenStateMapping). **`DialogInteractions` is STUBBED** (returns null) pending the
> `useDismiss`/`FloatingFocusManager`/`FloatingPortal` layer — it's only rendered when open, so the
> CLOSED differential is fully faithful (React also doesn't render it closed). **octane fix (bug #2 — children-block
> detection):** octane compiles a component's element/text children to a render function but passes a
> render-prop child (`{(x) => …}`) RAW — both are `typeof === 'function'`, so Base UI's
> `children`-as-payload-render-function API couldn't be distinguished. FIXED IN OCTANE: the compiler
> now tags compiled children-blocks (`markChildrenBlock`) and a new public `isChildrenBlock(value)`
> excludes them, so the binding writes `typeof children === 'function' && !isChildrenBlock(children)`
> to detect a genuine render-prop child (payload render functions now work). Regression:
> `packages/octane/tests/children-block.test.ts`; changeset `.changeset/is-children-block.md`. **Next: the OPEN path** — port `useDismiss` (~754), the store-based
> `FloatingFocusManager` (~991), `FloatingPortal` (~307), `useScrollLock`, the real
> `DialogInteractions`, and the Portal/Backdrop/Popup/Title/Description/Close/Viewport parts, then an
> open-dialog differential + focus-trap/return-focus/dismiss tests.

> **Phase 3 STARTED — the overlay foundation (part 1) landed (2026-07). base-ui typecheck green.**
> **Key architectural discovery:** Base UI **1.6.0 forked its vendored `floating-ui-react` to be
> Store-based.** The overlays no longer consume upstream-shaped `@floating-ui/react` hooks — they
> consume a reactive `FloatingRootStore` + store-connected `useDismiss`/`useClick`/`useFocus`/
> `useClientPoint` (which return `{reference, trigger, floating}` prop bags), plus a shared
> ~1231-line `utils/popups` store engine, all built on a `Store`/`ReactStore` system
> (`@base-ui/utils/store`). **This invalidates the plan's original assumption that
> `@octanejs/floating-ui` (an upstream-`@floating-ui/react` port) is the drop-in overlay substrate.**
> Decision (user-approved): **port Base UI's Store-based floating layer faithfully**, reusing from
> `@octanejs/floating-ui` only what is shape-compatible (`safePolygon` geometry; possibly
> `FloatingFocusManager`/`FloatingPortal`/`FloatingTree` with adapters). This makes Phase 3 a
> genuinely multi-turn effort: ~2500 lines of interlocking Store foundation must land before ANY
> overlay renders/tests.
>
> **Foundation part 2 landed (2026-07, all typecheck-green, not yet imported by a component):** the
> **popups store engine + floating tree**. `utils/popups/store.ts` (the `PopupStoreState` shape +
> `popupStoreSelectors` + `createInitialPopupStoreState` + `createPopupFloatingRootContext`, shared
> by every popup), `utils/popups/popupStoreUtils.ts` (the ~500-line engine — `usePopupStore`,
> `useTriggerRegistration`, `useTriggerDataForwarding`, `useImplicitActiveTrigger`,
> `useOpenStateTransitions`, `usePopupInteractionProps`, `usePopupRootSync`, `applyPopupOpenChange`,
> `setPopupOpenState`, `FOCUSABLE_POPUP_PROPS` — every hook slot-threaded; `ReactDOM.flushSync` →
> octane `flushSync`). `utils/floating/FloatingTree.ts` + `FloatingTreeStore.ts` (nested-popup tree:
> `useFloatingParentNodeId`/`useFloatingTree`/`useFloatingNodeId` + `FloatingNode`/`FloatingTree`
> components), `useSyncedFloatingRootContext.ts` (keeps a `FloatingRootStore` synced to a popup
> store). Small utils: `empty.ts` (EMPTY_OBJECT/ARRAY), `dom.ts` (isElement/isHTMLElement),
> `useOnFirstRender.ts`, `floating/constants.ts` (`FOCUSABLE_ATTRIBUTE`), `floating/event.ts`
> (`isClickLikeEvent`); `REASONS` gained the popup reasons (triggerHover/triggerFocus/outsidePress/
> closePress/focusOut/escapeKey/imperativeAction). **The store + popups-engine foundation — the
> hardest architectural part — is now complete.** What remains before Dialog: the store-connected
> floating interaction/focus/portal layer (`useDismiss` ~754, `FloatingFocusManager` ~991,
> `FloatingPortal` ~307, `useScrollLock`), then Dialog.
>
> **Landed earlier (foundation part 1, all typecheck-green):**
> - **Store system** (`utils/store/`): `Store.ts` (verbatim observer store), `createSelector.ts`
>   (verbatim runtime), `useStore.ts` (octane-adapted — a ref-cached selection over octane's real
>   `useSyncExternalStore`, the same trick as `@octanejs/zustand/traditional`, no concurrent-mode
>   shim), `ReactStore.ts` (octane-adapted — **every hook-bearing method threads an explicit slot**:
>   `useState(key, slot, …)`, `useSyncedValue(key, value, slot)`, `useControlledProp`,
>   `useContextCallback`, `useStateSetter`; `useIsoLayoutEffect` → octane `useLayoutEffect`; dev
>   warnings dropped).
> - **Floating store layer** (`utils/floating/`): `FloatingRootStore.ts` (the Store-based root
>   context, extends `ReactStore`), `getEmptyRootContext.ts`, `createEventEmitter.ts`, `event.ts`
>   (`isClickLikeEvent`), `types.ts` (FloatingRootContext/Context/Events/ElementProps subset); plus
>   `utils/popups/popupTriggerMap.ts` (`PopupTriggerMap`, verbatim).
>
> **Remaining Phase-3 foundation (next turns), by size:** the store-connected interaction hooks
> (`useDismiss` ~754, `useClick` ~226, `useFocus` ~250, `useClientPoint` ~260), `FloatingFocusManager`
> ~991, `FloatingPortal` ~307, `FloatingTree` ~95, and the `utils/popups` engine (`popupStoreUtils`
> ~512, `inlineRect` ~292, `useTriggerFocusGuards` ~95, `store.ts` ~224). **Then Dialog** (~1400:
> Root/Trigger/Portal/Backdrop/Popup/Title/Description/Close/Viewport + its Store/Handle +
> `useDialogRoot`/`DialogInteractions`) as the first testable overlay (differential mount +
> open/close + a dedicated focus-trap/return-focus/dismiss test). Then Popover/Tooltip/PreviewCard/
> AlertDialog/Menu(+Context/Menubar)/Toast.

> **Phase 2 COMPLETE — Slider DONE (2026-07). Green: 47 differential tests, full monorepo suite
> 2155 green.** `src/slider.ts` — the last Phase-2 giant, all 7 parts + 9 pure utils: `Slider.Root`
> (value/format state machine over `useControlled` + a sorted `values` array; `setValue` clones the
> event to expose `event.target.value` for form libs; wraps its `<div role="group">` in the
> composite `CompositeList` so thumbs self-register), `Slider.Control` (the full pointer/drag
> finger-tracking + thumb-collision engine — inert in jsdom but ported faithfully), `Slider.Track`,
> `Slider.Indicator` (centered/inset fill %), `Slider.Thumb` (a `<div>` + nested
> `<input type="range">`, `useCompositeListItem` registration, per-thumb aria-valuetext, the full
> arrow/Page/Home/End keyboard state machine via `getNewValue`/`handleInputChange`), `Slider.Value`
> (`<output>` with a multi-input `htmlFor` derived from the thumb map), `Slider.Label` (root-label
> id association via `useLabel`). New pure utils `utils/slider/{asc,replaceArrayItemAtIndex,
> getSliderValue,roundValueToStep,valueArrayToPercentages,getMidpoint,validateMinimumDistance,
> getPushedThumbValues,resolveThumbCollision}` (all ported verbatim); new helpers `useIsHydrating`
> (client → false), `resolveAriaLabelledBy`/`getDefaultLabelId`, `matchesFocusVisible` (jsdom-true),
> `createGenericEventDetails`, `REASONS.{trackPress,drag}`, `PAGE_UP`/`PAGE_DOWN`. **Key octane
> finding:** a controlled range input reflects its live value to the `value` ATTRIBUTE (verified vs
> React), so — unlike a controlled TEXT input (NumberField) — octane's native attribute write
> matches with NO freeze/property adaptation. With the default `center` alignment, thumb/indicator
> positions are pure math, so mount AND keyboard stepping (arrow keys re-render `aria-valuenow` +
> the `%` positions + the `<output>` text + the value attribute) are all byte-verified. Added a
> `keydown(selector, key)` helper to the shared differential rig (`_rig.ts`) to drive this. Pointer
> drag needs real layout → inert in jsdom, so not differential-covered (documented blind spot).
> **Phase 2 done: Field/Form + Checkbox/CheckboxGroup/Switch/Radio/RadioGroup + NumberField +
> Input + Slider. Next: Phase 3 (overlays on `@octanejs/floating-ui`).**

> **Phase 2 (in progress) — NumberField CORE DONE (2026-07). Green: 43 differential tests, full
> monorepo suite 2155 green.** `src/number-field.ts` — the first of the two Phase-2 giants. The
> value/format state machine ported faithfully: `NumberField.Root` (+ `NumberFieldRootContext`,
> `useControlled` value, `useForcedRerendering`, `setValue`/`incrementValue`/`getStepAmount`/
> `getAllowedNonNumericKeys` via `useStableCallback`, `formatNumber`-based `inputValue` state,
> and a hidden `<input type="number">` for form submission), `NumberField.Group` (`role="group"`),
> `NumberField.Input` (`<input type="text">` with the full onInput/onKeyDown/onBlur/onFocus/onPaste
> handler set: locale-aware numeral filtering, arrow/Home/End stepping, blur re-format, paste
> parse), and `NumberField.Increment`/`Decrement` (`useNumberFieldStepperButton` + `useButton`,
> `focusableWhenDisabled`, boundary-disabled at min/max). New utils: `utils/number/{parse,validate,
> constants,types}.ts` (parse/validate ported verbatim), `useForcedRerendering`, `addEventListener`,
> `platform`, and `REASONS` gained the number-field reason strings. **octane adaptations:** native
> events (no `.nativeEvent`); the text-input value adaptation applied to BOTH the visible input and
> the hidden number input (initial value → the `value` ATTRIBUTE; live value driven via the `.value`
> PROPERTY in a layout effect). The visible Field and NumberField text controls consume native
> `input` per edit. The visually hidden, form-facing number host deliberately retains native
> `change`: an explicit change commit updates the root and visible formatted field, pinned by
> `number-field.test.ts`. Its non-serialized `suppressNativeChangeWarning` hint records that local
> intent without changing event delivery. **Deferred (stubbed):** `usePressAndHold` auto-repeat (single-click
> stepping works; hold-to-repeat inert) + the ScrubArea. Increment/decrement value changes are
> invisible in `innerHTML` (React drives the value via the property too), so the differential gates
> the formatted-value render + the boundary-disabled state; value-change behavior is covered by the
> parse/validate ports and the handler logic.
> **Remaining Phase 2: usePressAndHold auto-repeat + ScrubArea (NumberField polish) + Slider
> (~2835 lines)** — the last large dedicated item.

> **Phase 2 (in progress) — CheckboxGroup DONE (2026-07). Green: 41 differential tests.**
> `src/checkbox-group.ts` — a `role="group"` whose child `<Checkbox.Root>`s derive `checked`
> from a shared value array; the previously-dormant parent-checkbox branches in `checkbox.ts`
> are now wired via `useCheckboxGroupParent` (a 3-state select-all parent: indeterminate when
> only some children are ticked). New utils: `areArraysEqual`, `useCheckboxGroupParent`.
> **Remaining Phase 2: NumberField (~2600 lines) + Slider (~2835 lines)** — each a mini-subsystem
> (value/format state machine + pointer scrub/drag) whose architecture is mapped; they are the
> two large dedicated items left.

> **Phase 2 (in progress) — the Field/Form validation SYSTEM + Input DONE (2026-07). Green:
> 39 differential tests vs real `@base-ui/react@1.6.0`, base-ui typecheck clean.** This is the
> densest Phase-2 subsystem (~1800 lines):
> - **Field** (`src/field.ts`): `Field.Root` (+ the real `FieldRootContext` via
>   `useFieldValidation` — the native-constraint + custom async validation state machine — and
>   `useFieldControlRegistration`), `Field.Control`, `Field.Label`, `Field.Description`,
>   `Field.Error` (transition-mounted), `Field.Validity` (render-prop), `Field.Item`. The real
>   `LabelableProvider` (`src/utils/field/`) drives the label↔control↔description id association
>   (`for` / `aria-labelledby` / `aria-describedby`) — verified byte-identical.
> - **Form** (`src/form.ts`): `<form noValidate>` + the real `FormContext` (field registry,
>   submit-time validation, first-invalid focus). **Input** (`src/input.ts`) = `<Field.Control/>`.
> - octane text-input adaptation: the initial value is the `value` ATTRIBUTE, a controlled value
>   is driven via the `.value` PROPERTY (mirrors the checkbox adaptation).
>
> **Binding bug fixed (my `useRenderElement` port, not octane):** the `enabled: false` path
> assigned `outProps = EMPTY_OBJECT` (shared module const) then mutated `outProps.ref`, poisoning
> `EMPTY_OBJECT.ref` with a stale composed-ref callback. A later component rendering with the
> DEFAULT (no-state) EMPTY_OBJECT then emitted `data-ref="<fn>"` via `getStateAttributesProps`.
> Surfaced by a differential test-ordering probe (RadioGroup's grouped Radio uses `enabled:false`
> → then Form failed). Fix: run the composed-refs hook for slot stability but only assign
> `outProps.ref` when enabled, returning EMPTY_OBJECT untouched.

> **Phase 2 (in progress) — Checkbox + Radio + RadioGroup DONE (2026-07). Green: 35 differential
> tests vs real `@base-ui/react@1.6.0`.** The boolean/choice-control family is complete
> (Switch, Checkbox, Radio, RadioGroup), all reusing the octane uncontrolled-input adaptation
> + the field-context infrastructure:
> - **Checkbox** (`src/checkbox.ts`): `Root` + transition-mounted `Indicator`; indeterminate
>   (`aria-checked="mixed"` + `input.indeterminate` property). Group/parent-checkbox branches
>   dormant until CheckboxGroup.
> - **Radio** (`src/radio.ts`) + **RadioGroup** (`src/radio-group.ts`): RadioGroup renders a
>   `role="radiogroup"` via **CompositeRoot** (reusing the Phase-1 roving-focus system), each
>   Radio a **CompositeItem** deriving `aria-checked` from the group value; the selected radio
>   holds the active tab stop (`data-composite-item-active`). New small utils: `serializeValue`,
>   `contains`, `FieldItemContext`, `getDefaultFormSubmitter`, `CheckboxGroupContext`/`RadioGroupContext`.
> - Click interactions verified byte-identical (toggle, selection-move).

> **Phase 2 (in progress) — Field/Form context infrastructure + Switch DONE (2026-07).
> Green: 29 differential tests vs real `@base-ui/react@1.6.0` (3 new Switch: uncontrolled
> toggle, default-checked, disabled — all with click interaction), base-ui typecheck clean.**
>
> - **Field/Form context infrastructure** (`src/utils/field/` + `src/utils/{owner,useValueChanged,noop}.ts`):
>   the context surfaces every form control threads through, ported with Base UI's DEFAULT
>   values so controls work standalone (inert validation): `FieldRootContext`
>   (+ `DEFAULT_FIELD_ROOT_CONTEXT`), `FormContext`, `LabelableContext`, `field/constants`
>   (`DEFAULT_FIELD_ROOT_STATE`/`fieldValidityMapping`/`FieldValidityData`), and the consumer
>   hooks `useRegisterFieldControl`, `useAriaLabelledBy`, `useLabelableId`, `useValueChanged`.
>   The full `Field.Root`/`Form` PROVIDERS (which override the defaults + run validation) land
>   later this phase; the controls are differential-tested standalone first.
> - **Switch** (`src/switch.ts`) — `Switch.Root` (`role="switch"` span + hidden checkbox input)
>   + `Switch.Thumb`. Reuses `useButton`/`useControlled`.
>
> **Reversal (2026-07-08):** octane now ships React-parity controlled components
> (`value`/`checked` reassertion on native events; still no synthetic `onChange` —
> `onInput`/native `change`/`click` drive updates). The adaptation below is obsolete —
> form controls pass real controlled props directly and the imperative
> property-setting machinery is being removed. Kept for the historical record.
>
> **octane uncontrolled-input adaptation (the Phase-2 crux, reusable by Checkbox/Radio/etc.):**
> octane inputs are UNCONTROLLED (a `checked` prop writes a `checked` ATTRIBUTE), but React's
> controlled `<input checked>` reflects only the INITIAL checked to the attribute (as its
> default-state) and drives the live value via the `.checked` PROPERTY. So the port: (1) passes
> `checked: initialCheckedRef.current || undefined` (the initial state → attribute), (2) drives
> the live `input.checked` PROPERTY imperatively via the native
> `HTMLInputElement.prototype` setter in a layout effect, and (3) the root's `onClick`
> dispatches a native `click` on the hidden input → native `change` → `onChange` (octane
> delegates `change` for de-opt `createElement` inputs — confirmed). This mirrors the proven
> `@octanejs/radix` bubble-input pattern; it is a binding adaptation to octane's *documented*
> uncontrolled-input divergence, not a workaround for a bug. Verified byte-identical incl. the
> click-toggle interaction.

> **Phase 1 COMPLETE — ToggleGroup + Avatar DONE (2026-07). Green: 26 differential tests
> vs real `@base-ui/react@1.6.0`, base-ui typecheck clean, full monorepo suite green.**
> All Phase-1 components shipped: Separator, Fieldset, Meter, Progress, Toggle, **ToggleGroup**,
> **Avatar**.
>
> - **ToggleGroup** (`src/toggle-group.ts`) + Toggle's group path — required porting Base UI's
>   entire **composite roving-focus system** (`src/utils/composite/`): `CompositeRoot` +
>   `useCompositeRoot` (arrow/Home/End keyboard nav, default tab stop), `CompositeList` +
>   `useCompositeListItem` (stable-Map registration → document-order index + MutationObserver),
>   `CompositeItem` + `useCompositeItem` (roving `tabIndex` 0/-1 + focus/hover), plus vendored
>   floating-ui list utils (`list-utils.ts`), `keys.ts` (nav constants + `scrollIntoViewIfNeeded`),
>   a minimal `DirectionContext`, and `useRefWithInit`. Decision: **ported Base UI's composite
>   directly** rather than bridging to `@octanejs/floating-ui`'s `Composite` (different API +
>   behavior would break byte-parity). Differential tests: single-select (roving tabindex +
>   value→aria-pressed + click moves value), multiple-select (`data-multiple`), disabled group.
>   **This unlocks Toolbar / Menu / Menubar / Select / NavigationMenu / Tabs / RadioGroup for
>   later phases.**
> - **Avatar** (`src/avatar.ts`) — Root/Image/Fallback + the **transition system**:
>   `useTransitionStatus` (+ `transitionStatusMapping` → `data-starting-style`/`data-ending-style`),
>   `useOpenChangeComplete` → `useAnimationsFinished` → `useAnimationFrame`/`resolveRef`,
>   `useImageLoadingStatus` (off-DOM `new Image()` load tracking), `useTimeout`. Under jsdom the
>   image never resolves, so (identically on both renderers) the `<img>` stays unmounted and the
>   Fallback shows — verified `<span class="av"><span class="av-fb">JD</span></span>`.
>
> Internals now available for Phase 2+: the composite system, the transition/animation system,
> `useButton`/`useControlled`/`useFocusableWhenDisabled`, `useStableCallback`/`useValueAsRef`/
> `useRefWithInit`/`useTimeout`, `useBaseUiId`/`useRegisteredLabelId`, `DirectionContext`.

> **Phase 1 (in progress) — Meter + Progress + Toggle DONE (2026-07). Green: 21 differential
> tests vs real `@base-ui/react@1.6.0` (Separator ×5, useRender ×2, Fieldset ×4, Meter ×3,
> Progress ×3, Toggle ×4), base-ui typecheck clean, full monorepo suite 1497 green.**
>
> - **Meter** (`src/meter.ts`): Root (`role="meter"`, range math)/Track/Indicator/Value/Label.
>   Proves the multi-part context + derived-state + **style-object serialization parity** with
>   React (`visuallyHidden`, `insetInlineStart`, `width:40%` all byte-identical).
> - **Progress** (`src/progress.ts`): adds the `status` state
>   ('indeterminate'|'progressing'|'complete') via a custom `stateAttributesMapping` →
>   `data-progressing`/`data-complete`/`data-indeterminate` on every part; indeterminate
>   (`value={null}`) omits `aria-valuenow` + empties the fill. Uses `useValueAsRef(format)`.
> - **Toggle** (`src/toggle.ts`): a two-state `<button>` (`type="button"`, `aria-pressed`).
>   Differential test drives **real clicks** — uncontrolled toggle flips byte-identically to
>   React across clicks; disabled + controlled are no-ops. The group path (CompositeItem)
>   throws pending ToggleGroup; standalone is complete.
>
> **Reusable internals layer built (all slot-threaded plain-`.ts`, faithful ports):**
> `utils/useBaseUiId`, `useRegisteredLabelId`, `valueToPercent`, `clamp`, `stringifyLocale`,
> `formatNumber`/`formatNumberValue`, `visuallyHidden`, `useValueAsRef` (≈ floating-ui
> `useLatestRef`), `useStableCallback`, `useControlled`, `useFocusableWhenDisabled`,
> `CompositeRootContext` (stub — undefined until the composite system lands), `useButton`
> (native-event adaptation: `makeEventPreventable` on the native event), `createChangeEventDetails`
> + `REASONS`, `ToggleGroupContext`. Dev-warning surfaces dropped per the port policy.

> **Phase 1 (in progress) — Fieldset DONE (2026-07). Green: 11 differential tests
> (4 new: basic aria-labelledby wiring, disabled, explicit-id, legend render-prop).**
> `src/fieldset.ts` — `Fieldset.Root` (`<fieldset>`, `disabled` state + `data-disabled`,
> provides a plain octane context) and `Fieldset.Legend` (`<div>`, generated id via the
> net-new `src/utils/useBaseUiId.ts` = octane `useId` + `base-ui-` prefix; a layout effect
> feeds `legendId` back to the Root as `aria-labelledby`). Base UI uses a PLAIN React
> context (not the scoped factory) → ported as a plain `createContext` + `Provider`
> (`createElement(Ctx.Provider, …)`) + throwing consumer.
>
> **octane bug #1 — fixed in octane (compiler), not worked around.** A component root that
> PRECEDES a static host root in a multi-root fragment body rendered in REVERSED order.
> Base UI's Fieldset hits this because a Root's children (`[<Legend/>, <control/>]`) thread
> through `useRenderElement` → `createElement('fieldset', { children })`, and the `.tsrx`
> compiler lowers those children to a fragment render-fn. The fragment-body codegen
> (`planJsx` / `emitElementHtml` in `compiler/compile.js`) dropped the component root's
> source-order `<!>` anchor, so the static content drained first and the component appended
> at `endMarker` AFTER it — also a client/server divergence (the server emitted source
> order) that could mis-adopt on hydration. Fix: emit the `<!>` anchor for a component root
> in a mixed body, mirroring the in-element mixed-children path. Regression tests:
> `tests/mixed-child-order.test.ts` (client mount: static / value-position / effect-driven),
> `tests/hydration/mixed-frag-hydrate.test.ts` (server DOM adopted in place, no mismatch).
> Changeset `.changeset/mixed-fragment-component-anchor.md` (`octane` patch). Full suite:
> 1488 tests green.

> **Phase 0 foundation — DONE (2026-07). Green: 7 differential tests, base-ui typecheck
> clean.** Established the whole substrate: pinned `.base-ui/` checkout (gitignored,
> `v1.6.0`), package scaffolding (`package.json`, `tsconfig`, `internal.ts`
> re-namespaced from radix, README), the catalog entry (`@base-ui/react`
> `1.6.0`), the `base-ui` vitest project (jsdom + differential precompile + `octane()`
> exclude for `src/`+floating-ui + subpath aliases), the root typecheck entry, and the
> differential harness (`_setup.ts` per-subpath rewrite `@octanejs/base-ui/<sub>` →
> `@base-ui/react/<sub>`; reuses octane's `mountDifferential`).
>
> **The composition engine is ported and byte-verified** — the make-or-break piece
> (`docs/radix-migration-plan.md:267` rejected Base UI on the missing-clone blocker, now
> resolved): `mergeProps`/`mergePropsN`/`mergeClassNames` (`src/utils/mergeProps.ts` — with
> the octane adaptation: octane dispatches NATIVE events, so `preventBaseUIHandler` is
> shimmed onto the native event instead of gated behind React's `isSyntheticEvent`),
> `useRenderElement` (`src/utils/useRenderElement.ts` — the engine, over octane
> `cloneElement`/`createElement`/`useComposedRefs`; octane's no-rules-of-hooks drops Base
> UI's conditional-ref-hook dance), and the public `useRender` (`src/use-render.ts`) +
> `merge-props` (`src/merge-props.ts`). Supporting utils ported: `resolveClassName`,
> `resolveStyle`, `mergeObjects`, `getStateAttributesProps`, `getElementRef`, and
> `composeRefs` (copied from radix). First component **`Separator`** (`src/separator.ts`)
> passes differential parity in all forms — intrinsic-tag render, render-prop **element**
> (clones onto `<hr>`, className concatenates), render-prop **function**, `className` as a
> function of state, `state`→`data-orientation` — as does `useRender` (basic + function).
> **Key finding: Base UI's `render`-prop is prop-position (an element descriptor), which is
> octane's native shape — a *better* fit than Radix's children-position `asChild`.**
> No octane bugs surfaced yet.

## Parity audit (2026-07-26, vs `@base-ui/react@1.6.0`)

Measured by diffing the pinned `.base-ui/packages/react/src` tree against
`packages/base-ui/src`. Upstream `1.6.0` is still the published `latest`, so the
pin is current. Baseline at audit time: **60 base-ui tests green**, `22 of 43`
published subpaths implemented, `19,614` ported source lines against `73,766`
upstream source lines (tests excluded).

> **Superseded in part by Phases 3a–3d** (see the progress log above): the
> subpath count is now `28 of 43`, gaps B1 (`Dialog.Viewport`/`Popover.Viewport`)
> and C1 (`openOnHover`) are closed, and `tooltip`, `preview-card`, `button`,
> `direction-provider`, `csp-provider` and `unstable-use-media-query` have landed.
> The rest of the inventory below still stands.

### A. Missing components (21 of 43 subpaths)

| Component | Upstream loc | Blocking infrastructure |
| --- | ---: | --- |
| `combobox` | 6,469 | list navigation, grid navigation, `filter`, `itemEquality`, `resolveValueLabel` |
| `drawer` | 4,722 | `useSwipeDismiss`, `getElementAtPoint`, `scrollable`, viewport |
| `menu` | 4,303 | list navigation, typeahead, `useMixedToggleClickHandler`, `getPseudoElementBounds`, viewport |
| `select` | 4,220 | list navigation, typeahead, `scrollEdges`, `styles`, `usePopupAutoResize` |
| `navigation-menu` | 3,106 | hover layer, `getCssDimensions`, `setSharedFixedSize`, `isOutsideMenuEvent` |
| `toast` | 3,004 | `useSwipeDismiss`, `FloatingPortalLite`, `focusVisible` |
| `scroll-area` | 1,745 | `scrollEdges`, `getOffset`, `styles`, `CSPContext` |
| `tooltip` | 1,625 | hover layer, `FloatingDelayGroup`, `FloatingPortalLite`, viewport |
| `tabs` | 1,537 | `getCssDimensions`, `CSPContext` (composite already ported) |
| `otp-field` | 1,436 | `utils/otp` (field/composite already ported) |
| `preview-card` | 1,363 | hover layer, `FloatingPortalLite`, viewport |
| `collapsible` | 1,149 | `collapsibleOpenStateMapping` |
| `accordion` | 961 | Collapsible |
| `autocomplete` | 820 | Combobox (thin layer over it) |
| `toolbar` | 638 | none — composite + `useButton` already ported |
| `context-menu` | 433 | Menu, `useClientPoint` |
| `menubar` | 217 | Menu |
| `unstable-use-media-query` | 90 | none |
| `button` | 82 | none — `useButton` + `useRenderElement` already ported |
| `direction-provider` | 72 | none — `DirectionContext` already ported |
| `csp-provider` | 47 | `CSPContext` |

### B. Missing parts inside shipped components

- `Dialog.Viewport` and `Popover.Viewport` — both need `utils/usePopupViewport`
  (376) + `utils/popups/inlineRect` (293). The same pair also gates the Viewport
  part on Tooltip / PreviewCard / Menu / NavigationMenu / Drawer.
- `NumberField.ScrubArea` and `NumberField.ScrubAreaCursor`.

### C. Live stubs — shipped components with silently inert features

- `utils/floating/useHoverReferenceInteraction` + `useHoverFloatingInteraction`
  return `{}`, so **`openOnHover` on Popover is a no-op**. Un-stubbing needs the
  whole hover layer (below).
- `utils/usePressAndHold` fires once, so **NumberField Increment/Decrement
  hold-to-repeat is inert**. Single clicks work.

These are the only places where the port accepts a prop and does nothing; both
are documented in-file, but neither is covered by a failing-pin test.

### D. Missing shared infrastructure

`floating-ui-react` (3,704 loc, gates every remaining overlay):
`useListNavigation` (931), `useHover` (468), `safePolygon` (452),
`FloatingDelayGroup` (287), `useClientPoint` (261), `useTypeahead` (254),
`useFocus` (251), `useHoverInteractionSharedState` (132), `useHoverShared` (73),
`gridNavigation` (51). `middleware/arrow` (124) is currently satisfied by
`@octanejs/floating-ui`'s ref-aware `arrow` and needs no port.

`utils` (2,454 loc): `useSwipeDismiss` (1,209), `usePopupViewport` (376),
`popups/inlineRect` (293), `usePopupAutoResize` (239), `scrollable` (73),
`useMixedToggleClickHandler` (62), `getPseudoElementBounds` (50),
`FloatingPortalLite` (44), `collapsibleOpenStateMapping` (36), `scrollEdges`
(34), `getCssDimensions` (25), `styles` (13), `getElementAtPoint` (4).

`internals` (~690 loc): `resolveValueLabel` (152), `composite/root/gridNavigation`
(128), `RequestQueue` (127), `filter` (83), `itemEquality` (61), `reason-parts`
(43), `TimeoutManager` (30), `CSPContext` (24).

**Out of scope:** `internals/temporal`, `internals/temporal-adapter-date-fns`,
`internals/temporal-adapter-luxon` (~1,290 loc) are unreachable from any exported
component in `1.6.0` — groundwork for unreleased date components. Port them only
when an exported component consumes them.

### E. Cross-cutting debt

- **octane `Provider` children shape-flip** (memory `octane-provider-children-shape-flip`):
  every overlay Root currently pays a stable-descriptor wrapper workaround. Fix in
  octane core before Menu/Select/Combobox multiply it.
- **Differential rig blind spots**: the rig compares final HTML only, so focus
  order, effect timing and hover/delay behavior need dedicated behavior tests.
  Every phase below must budget for them.
- **SSR/hydration**: only closed overlays and static components are covered.
  Open-overlay SSR is untested.

## Remaining plan to full parity

Ordered so that each phase unblocks the next, with the cheap export-surface wins
pulled forward. Every phase exits on: differential parity for the new components,
dedicated behavior tests for anything the rig cannot see, `pnpm typecheck`,
`pnpm format:check`, full `pnpm test`, a changeset, and a `status.json` update.

- **Phase 3a — Zero-dependency backlog** (DONE): `Button`, `DirectionProvider`,
  `CSPProvider` (+ `CSPContext`), `unstable-use-media-query`. ✅
- **Phase 3b — Hover + focus interaction layer** (DONE, ~2,400 loc):
  `safePolygon`, `useHoverShared`, `useHoverInteractionSharedState`, the real
  `useHoverReferenceInteraction` / `useHoverFloatingInteraction`, `useFocus`,
  `FloatingDelayGroup`. Stub C1 deleted. Upstream's standalone `useHover`
  combiner was deliberately skipped — no component uses it, and this binding does
  not republish the vendored `floating-ui-react` surface. ✅
- **Phase 3c — Popup viewport** (DONE, ~700 loc): `usePopupViewport` +
  `usePopupAutoResize` + `FloatingPortalLite` + `getCssDimensions` +
  `usePreviousValue`, then `Dialog.Viewport` and `Popover.Viewport`. Gap B1
  closed. (`popups/inlineRect` moved to 3d: it serves PreviewCard, not the
  viewport.) ✅
- **Phase 3d — Tooltip + PreviewCard** (DONE, ~3,000 loc), plus the
  `useClientPoint` and `popups/inlineRect` they depend on. ✅
- **Phase 3e — List navigation + typeahead** (~1,400 loc): `useListNavigation`,
  `gridNavigation` (both copies), `useTypeahead`, `RequestQueue`,
  `TimeoutManager`, `useMixedToggleClickHandler`, `getPseudoElementBounds`. ✅
- **Phase 3f — Menu family** (~5,000 loc), in four stages:
  - *Stage 1* (DONE, ~1,750 loc): `MenuStore`/`MenuHandle`, `findRootOwnerId`,
    `Root`, `Trigger`, `Portal`, `Positioner`, `Popup` — the open/close +
    roving-focus path, and the first point a differential test can render an
    OPEN menu. Exercises Phase 3e's `useListNavigation`/`useTypeahead`. ✅
  - *Stage 2* (DONE, ~1,700 loc): `Item`, `CheckboxItem`(+`Indicator`),
    `RadioGroup`/`RadioItem`(+`Indicator`), `Group`/`GroupLabel`, `LinkItem`,
    `Separator`, `Arrow`, `Backdrop`, `Viewport`, and
    `menu/utils/stateAttributesMapping`. Differential on populated open menus;
    behavior tests for roving focus, typeahead (including buffer accumulation
    and reset), and checkbox/radio item semantics. ✅
  - *Stage 3* (DONE, ~340 loc): `SubmenuRoot` + `SubmenuTrigger`. Differential
    on a closed submenu and on the open submenu's own portal subtree; behavior
    tests for submenu open/close, the child-only Escape, the trigger's dual
    item+trigger role, and nested placement. ✅
  - *Stage 4* (~650 loc): `Menubar` and `ContextMenu` (+ `useClientPoint`),
    which fill in the already-transcribed `menubar` / `context-menu` parent
    branches and provide the two context-only modules stage 1 landed.
- **Phase 3g — Toast** (~4,200 loc): `useSwipeDismiss` + `focusVisible` + the 11
  Toast parts. `useSwipeDismiss` is shared with Drawer, so it lands here.
  *Exit:* differential on a rendered toast, behavior tests for timeout dismiss,
  swipe dismiss, and the viewport focus model.
- **Phase 4 — Disclosure, navigation, composite** (~6,000 loc), independent of
  the floating store and parallelisable with Phase 3: `Collapsible`
  (+ `collapsibleOpenStateMapping`) → `Accordion`; `Toolbar`; `Tabs`
  (+ `getCssDimensions`); `ScrollArea` (+ `scrollEdges`, `getOffset`, `styles`).
  *Exit:* rig-green plus roving-focus/keyboard behavior tests.
- **Phase 5 — Selection giants** (~13,000 loc): `Select` (+ `itemEquality`,
  `resolveValueLabel`, `usePopupAutoResize`), then `Combobox` (+ `filter`,
  `handleInputPress`, `useInitialLiveRegionTextMutation`,
  `ComboboxInternalDismissButton`), then `Autocomplete` as a thin layer, then
  `OtpField` (+ `utils/otp`). *Exit:* differential on open lists, behavior tests
  for keyboard selection, typeahead, filtering, and Field integration.
- **Phase 6 — Drawer + residual** (~5,300 loc): `NavigationMenu`
  (+ `setSharedFixedSize`, `isOutsideMenuEvent`), `Drawer` (+ `getElementAtPoint`,
  `scrollable`, reusing 3g's `useSwipeDismiss`), and `NumberField.ScrubArea` /
  `ScrubAreaCursor` with the real `usePressAndHold` (deletes stub C2).
- **Phase 7 — Close-out**: barrel export of the full surface, open-overlay SSR +
  hydration coverage, README + divergence notes, `docs/bindings-status.md`
  refresh, and a re-run of this audit to confirm 43/43 subpaths.

### Sequencing notes

- Phase 3a and Phase 4 have no dependency on Phase 3b–3g and can run in parallel
  with them.
- Fix the octane `Provider` children shape-flip before Phase 3f — Menu, Select and
  Combobox each add several Roots that would otherwise inherit the workaround.
- `useSwipeDismiss` (1,209 loc) is the single largest shared util and serves only
  Toast and Drawer; keeping it in Phase 3g means Phase 6's Drawer is mostly
  component code.

### Historical phase plan (superseded)

- **Phase 0 — Foundation** (DONE): scaffolding + `.base-ui` + engine + differential harness.
  *Exit:* `useRender` + a trivial component byte-equal in the rig (element+function render,
  className string+fn, `data-*` state). ✅
- **Phase 1 — Simple state / proof** (DONE): Separator, Toggle, ToggleGroup, Avatar, Progress,
  Meter, Fieldset. *Exit:* rig-green; state exposure + render engine proven.
- **Phase 2 — Field/Form + form controls (densest)** (DONE): Field, Form, Checkbox, CheckboxGroup,
  Switch, Radio, RadioGroup, NumberField, Input, Slider. Validation system + octane
  uncontrolled-input adaptations. *Exit:* native-behavior parity; divergences documented.
- **Phase 3 — Overlays (on `@octanejs/floating-ui`)** (PARTIAL — Dialog, AlertDialog, Popover
  done): Popover, Dialog, AlertDialog, Tooltip, PreviewCard, Menu, Menubar, ContextMenu, Toast.
- **Phase 4 — Navigation + composite + Select**: Tabs, Accordion, Collapsible, Toolbar,
  NavigationMenu, ScrollArea, Select. *Exit:* rig + roving-focus/keyboard tests.
- **Phase 5 — Long tail + polish**: Autocomplete, Combobox; SSR/hydration; README +
  divergence notes; changeset; parity-plan + memory. *Exit:* full `pnpm test`/typecheck/
  format green.

## Reused from the octane ecosystem

- **`@octanejs/floating-ui`** — full `@floating-ui/react` port; Base UI's entire
  positioning/interaction/focus/portal substrate (Phase 3+). Depend on it like radix does.
- **`packages/radix/src/` helpers** (copy-by-value, re-namespace `S`): `internal.ts`,
  `compose-refs.ts`, `use-effect-event.ts`, `useControllableState.ts`, `useId.ts`,
  `direction.ts`, `context.ts`, `Presence.ts`, `Portal.ts`, `FocusScope.ts`,
  `DismissableLayer.ts`, `collection.ts`, `scroll-lock.ts`, `use-size.ts`. `Form.ts` is the
  validation reference for Field/Form.
- **octane runtime**: `cloneElement`/`Children`/`isValidElement`/`normalizeClass`.

## Intentional divergences (port the functional outcome, not React's surface)

- Native events, not synthetic (`preventBaseUIHandler` shimmed onto the native event).
- `forwardRef` → ref-as-prop.
- `className` composition via octane's `normalizeClass` at the apply site; the render-prop
  merge concatenates strings exactly like Base UI.
- Base UI-specific dev warnings were omitted from this package migration's
  historical scope. Core Octane's progressive React/ReactDOM diagnostic parity
  policy does not automatically include diagnostics owned by an upstream binding.

## Verification

Per phase: the `base-ui` vitest project (differential + unit) green; `pnpm typecheck`;
`pnpm format:check`. Differential parity vs real `@base-ui/react` is the gold
standard. Re-clone the source: `git clone https://github.com/mui/base-ui .base-ui && git -C
.base-ui checkout v1.6.0`.
