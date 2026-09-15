# Mantine Hooks upstream contract

This binding targets MIT-licensed `@mantine/hooks@9.6.1`, commit
`61049ecd950f6fb9ddc631decfec2edbdffe58e1`. The SRI-verified npm archive,
published declarations, source license and exact monorepo test setup are retained
under `upstream-artifact/`; `audit/provenance.json` authenticates those bytes.
The package-relative Git source and all 63 upstream runtime files are pinned by
`audit/upstream.lock.json` and verified offline under `upstream/`.

All 545 upstream registrations are represented in `audit/registrations.json` and
`audit/crosswalk.json` and execute in both React and Octane. Adapted test files are
regenerated from the lock. Five patches record six timer-observation differences:
Octane owns additional scheduler timers, so native checks identify the hook timer
and retain its exact cleanup, deadline and state assertions. The pristine and
adapted environments also support the upstream legacy writable mouse coordinates.
Octane refs are ordinary objects, supplied by the small native test helper.

Upstream has no dedicated type-test inventory. All 223 exports below participate
in explicit public assertions against pinned npm declarations, complemented by
handwritten inference, negative and JSX consumers. `audit/compatibility-baseline.json`
authenticates the complete previous native source, including Octane’s optional
compiler slot on `useIsomorphicEffect`. React types remain compatibility vocabulary;
the shipped implementation loads Octane at runtime.

The update carries collapse completion/cancellation, leading debounce, Activity
effect bookkeeping, stable interval callbacks and ref scroll hosts. Floating-window
callbacks now use distinct native refs, including after prop updates. The previous
local plain-TypeScript helper shared one hook slot and delivered the end callback
for start and move events. Touch cancellation, late refs, zero coordinates and
selection cleanup remain intact. Chromium
covers client startup and real SSR hydration, alongside the native SSR and shared
React differential suites.

## Source boundary

The shipped implementation is `src/`. `audit/source-ledger.json` records all 96
modules: the hook and utility implementations are adapted from the MIT-licensed
Mantine source, and `src/internal.ts` contains authored Octane argument
normalization. Octane provides the runtime hooks; React imports supply compatibility
types only. The source closure is recorded in `audit/closure.json`.

`upstream/`, `upstream-artifact/`, `audit/`, `tests/`, and `typetests/` retain the
immutable source, declarations, test evidence, and prior native API baseline for
review. The package's explicit `files` list publishes the native source, README,
this contract, and both license files.

## Public export mapping

Each export is retained in the Octane implementation; its expected keys or arity
are recorded in `tests/types/published-contract.ts` and checked with precise public
type witnesses. DOM events, refs and hook slots use Octane’s native contracts.

| Export | Disposition |
| --- | --- |
| `useDebouncedCallback` | Retained; public assertion and source closure. |
| `useClickOutside` | Retained; public assertion and source closure. |
| `useClipboard` | Retained; public assertion and source closure. |
| `useColorScheme` | Retained; public assertion and source closure. |
| `useCounter` | Retained; public assertion and source closure. |
| `useDebouncedState` | Retained; public assertion and source closure. |
| `useDebouncedValue` | Retained; public assertion and source closure. |
| `useDocumentTitle` | Retained; public assertion and source closure. |
| `useDocumentVisibility` | Retained; public assertion and source closure. |
| `useFocusReturn` | Retained; public assertion and source closure. |
| `useDidUpdate` | Retained; public assertion and source closure. |
| `useFocusTrap` | Retained; public assertion and source closure. |
| `useForceUpdate` | Retained; public assertion and source closure. |
| `useId` | Retained; public assertion and source closure. |
| `useIdle` | Retained; public assertion and source closure. |
| `useInterval` | Retained; public assertion and source closure. |
| `useIsomorphicEffect` | Retained; public assertion and source closure. |
| `useListState` | Retained; public assertion and source closure. |
| `useLocalStorage` | Retained; public assertion and source closure. |
| `readLocalStorageValue` | Retained; public assertion and source closure. |
| `useSessionStorage` | Retained; public assertion and source closure. |
| `readSessionStorageValue` | Retained; public assertion and source closure. |
| `useMediaQuery` | Retained; public assertion and source closure. |
| `useMergedRef` | Retained; public assertion and source closure. |
| `mergeRefs` | Retained; public assertion and source closure. |
| `assignRef` | Retained; public assertion and source closure. |
| `useMouse` | Retained; public assertion and source closure. |
| `useMousePosition` | Retained; public assertion and source closure. |
| `useMove` | Retained; public assertion and source closure. |
| `clampUseMovePosition` | Retained; public assertion and source closure. |
| `usePagination` | Retained; public assertion and source closure. |
| `useQueue` | Retained; public assertion and source closure. |
| `usePageLeave` | Retained; public assertion and source closure. |
| `useReducedMotion` | Retained; public assertion and source closure. |
| `useScrollIntoView` | Retained; public assertion and source closure. |
| `useResizeObserver` | Retained; public assertion and source closure. |
| `useElementSize` | Retained; public assertion and source closure. |
| `useShallowEffect` | Retained; public assertion and source closure. |
| `useToggle` | Retained; public assertion and source closure. |
| `useUncontrolled` | Retained; public assertion and source closure. |
| `useViewportSize` | Retained; public assertion and source closure. |
| `useWindowEvent` | Retained; public assertion and source closure. |
| `useWindowScroll` | Retained; public assertion and source closure. |
| `useIntersection` | Retained; public assertion and source closure. |
| `useHash` | Retained; public assertion and source closure. |
| `useHotkeys` | Retained; public assertion and source closure. |
| `getHotkeyHandler` | Retained; public assertion and source closure. |
| `useFullscreenDocument` | Retained; public assertion and source closure. |
| `useFullscreenElement` | Retained; public assertion and source closure. |
| `useLogger` | Retained; public assertion and source closure. |
| `useHover` | Retained; public assertion and source closure. |
| `useValidatedState` | Retained; public assertion and source closure. |
| `useOs` | Retained; public assertion and source closure. |
| `useSetState` | Retained; public assertion and source closure. |
| `useInputState` | Retained; public assertion and source closure. |
| `useEventListener` | Retained; public assertion and source closure. |
| `useDisclosure` | Retained; public assertion and source closure. |
| `useFocusWithin` | Retained; public assertion and source closure. |
| `useNetwork` | Retained; public assertion and source closure. |
| `useTimeout` | Retained; public assertion and source closure. |
| `useTextSelection` | Retained; public assertion and source closure. |
| `usePrevious` | Retained; public assertion and source closure. |
| `useFavicon` | Retained; public assertion and source closure. |
| `useHeadroom` | Retained; public assertion and source closure. |
| `useScrollDirection` | Retained; public assertion and source closure. |
| `useEyeDropper` | Retained; public assertion and source closure. |
| `useInViewport` | Retained; public assertion and source closure. |
| `useMutationObserver` | Retained; public assertion and source closure. |
| `useMutationObserverTarget` | Retained; public assertion and source closure. |
| `useMounted` | Retained; public assertion and source closure. |
| `useStateHistory` | Retained; public assertion and source closure. |
| `useMap` | Retained; public assertion and source closure. |
| `useSet` | Retained; public assertion and source closure. |
| `useThrottledCallback` | Retained; public assertion and source closure. |
| `useThrottledState` | Retained; public assertion and source closure. |
| `useThrottledValue` | Retained; public assertion and source closure. |
| `useIsFirstRender` | Retained; public assertion and source closure. |
| `useOrientation` | Retained; public assertion and source closure. |
| `useFetch` | Retained; public assertion and source closure. |
| `useRadialMove` | Retained; public assertion and source closure. |
| `normalizeRadialValue` | Retained; public assertion and source closure. |
| `useScrollSpy` | Retained; public assertion and source closure. |
| `useScroller` | Retained; public assertion and source closure. |
| `useFileDialog` | Retained; public assertion and source closure. |
| `useLongPress` | Retained; public assertion and source closure. |
| `useSelection` | Retained; public assertion and source closure. |
| `useFloatingWindow` | Retained; public assertion and source closure. |
| `useCollapse` | Retained; public assertion and source closure. |
| `useHorizontalCollapse` | Retained; public assertion and source closure. |
| `useMask` | Retained; public assertion and source closure. |
| `formatMask` | Retained; public assertion and source closure. |
| `unformatMask` | Retained; public assertion and source closure. |
| `isMaskComplete` | Retained; public assertion and source closure. |
| `generatePattern` | Retained; public assertion and source closure. |
| `useRovingIndex` | Retained; public assertion and source closure. |
| `useDrag` | Retained; public assertion and source closure. |
| `useSplitter` | Retained; public assertion and source closure. |
| `UseMediaQueryOptions` | Retained; public assertion and source closure. |
| `UseClipboardOptions` | Retained; public assertion and source closure. |
| `UseClipboardReturnValue` | Retained; public assertion and source closure. |
| `UseColorSchemeValue` | Retained; public assertion and source closure. |
| `UseCounterOptions` | Retained; public assertion and source closure. |
| `UseCounterHandlers` | Retained; public assertion and source closure. |
| `UseCounterReturnValue` | Retained; public assertion and source closure. |
| `UseDebouncedCallbackOptions` | Retained; public assertion and source closure. |
| `UseDebouncedCallbackReturnValue` | Retained; public assertion and source closure. |
| `UseDebouncedStateOptions` | Retained; public assertion and source closure. |
| `UseDebouncedStateReturnValue` | Retained; public assertion and source closure. |
| `UseDebouncedValueHandlers` | Retained; public assertion and source closure. |
| `UseDebouncedValueOptions` | Retained; public assertion and source closure. |
| `UseDebouncedValueReturnValue` | Retained; public assertion and source closure. |
| `UseDisclosureOptions` | Retained; public assertion and source closure. |
| `UseDisclosureHandlers` | Retained; public assertion and source closure. |
| `UseDisclosureReturnValue` | Retained; public assertion and source closure. |
| `EyeDropperOpenOptions` | Retained; public assertion and source closure. |
| `EyeDropperOpenReturnType` | Retained; public assertion and source closure. |
| `UseEyeDropperReturnValue` | Retained; public assertion and source closure. |
| `UseFetchOptions` | Retained; public assertion and source closure. |
| `UseFetchReturnValue` | Retained; public assertion and source closure. |
| `UseFileDialogOptions` | Retained; public assertion and source closure. |
| `UseFileDialogReturnValue` | Retained; public assertion and source closure. |
| `UseFocusReturnOptions` | Retained; public assertion and source closure. |
| `UseFocusReturnReturnValue` | Retained; public assertion and source closure. |
| `UseFocusWithinOptions` | Retained; public assertion and source closure. |
| `UseFocusWithinReturnValue` | Retained; public assertion and source closure. |
| `UseFullscreenElementReturnValue` | Retained; public assertion and source closure. |
| `UseHashOptions` | Retained; public assertion and source closure. |
| `UseHashReturnValue` | Retained; public assertion and source closure. |
| `UseHeadroomOptions` | Retained; public assertion and source closure. |
| `ScrollDirection` | Retained; public assertion and source closure. |
| `HotkeyItemOptions` | Retained; public assertion and source closure. |
| `HotkeyItem` | Retained; public assertion and source closure. |
| `UseHoverReturnValue` | Retained; public assertion and source closure. |
| `UseIdleOptions` | Retained; public assertion and source closure. |
| `UseInViewportReturnValue` | Retained; public assertion and source closure. |
| `UseInputStateReturnValue` | Retained; public assertion and source closure. |
| `UseIntersectionReturnValue` | Retained; public assertion and source closure. |
| `UseIntervalOptions` | Retained; public assertion and source closure. |
| `UseIntervalReturnValue` | Retained; public assertion and source closure. |
| `UseListStateReturnValue` | Retained; public assertion and source closure. |
| `UseListStateHandlers` | Retained; public assertion and source closure. |
| `UseStorageOptions` | Retained; public assertion and source closure. |
| `UseStorageReturnValue` | Retained; public assertion and source closure. |
| `UseMovePosition` | Retained; public assertion and source closure. |
| `UseMoveHandlers` | Retained; public assertion and source closure. |
| `UseMoveReturnValue` | Retained; public assertion and source closure. |
| `UserNetworkReturnValue` | Retained; public assertion and source closure. |
| `UseOrientationOptions` | Retained; public assertion and source closure. |
| `UseOrientationReturnType` | Retained; public assertion and source closure. |
| `UseOSReturnValue` | Retained; public assertion and source closure. |
| `UseOsOptions` | Retained; public assertion and source closure. |
| `UsePaginationOptions` | Retained; public assertion and source closure. |
| `UsePaginationReturnValue` | Retained; public assertion and source closure. |
| `UseQueueOptions` | Retained; public assertion and source closure. |
| `UseQueueReturnValue` | Retained; public assertion and source closure. |
| `UseRadialMoveOptions` | Retained; public assertion and source closure. |
| `UseRadialMoveReturnValue` | Retained; public assertion and source closure. |
| `UseScrollIntoViewOptions` | Retained; public assertion and source closure. |
| `UseScrollIntoViewReturnValue` | Retained; public assertion and source closure. |
| `UseScrollSpyOptions` | Retained; public assertion and source closure. |
| `UseScrollSpyHeadingData` | Retained; public assertion and source closure. |
| `UseScrollSpyReturnValue` | Retained; public assertion and source closure. |
| `UseScrollerOptions` | Retained; public assertion and source closure. |
| `UseScrollerReturnValue` | Retained; public assertion and source closure. |
| `UseScrollerScrollState` | Retained; public assertion and source closure. |
| `UseSetStateCallback` | Retained; public assertion and source closure. |
| `UseSetStateReturnValue` | Retained; public assertion and source closure. |
| `UseStateHistoryHandlers` | Retained; public assertion and source closure. |
| `StateHistory` | Retained; public assertion and source closure. |
| `UseStateHistoryValue` | Retained; public assertion and source closure. |
| `UseStateHistoryReturnValue` | Retained; public assertion and source closure. |
| `UseTimeoutOptions` | Retained; public assertion and source closure. |
| `UseTimeoutReturnValue` | Retained; public assertion and source closure. |
| `UseToggleReturnValue` | Retained; public assertion and source closure. |
| `UseUncontrolledOptions` | Retained; public assertion and source closure. |
| `UseUncontrolledReturnValue` | Retained; public assertion and source closure. |
| `UseValidatedStateValue` | Retained; public assertion and source closure. |
| `UseValidatedStateReturnValue` | Retained; public assertion and source closure. |
| `UseWindowScrollPosition` | Retained; public assertion and source closure. |
| `UseWindowScrollTo` | Retained; public assertion and source closure. |
| `UseWindowScrollReturnValue` | Retained; public assertion and source closure. |
| `UseLongPressEvent` | Retained; public assertion and source closure. |
| `UseLongPressOptions` | Retained; public assertion and source closure. |
| `UseLongPressReturnValue` | Retained; public assertion and source closure. |
| `SetFloatingWindowPosition` | Retained; public assertion and source closure. |
| `UseFloatingWindowOptions` | Retained; public assertion and source closure. |
| `UseFloatingWindowReturnValue` | Retained; public assertion and source closure. |
| `UseSelectionHandlers` | Retained; public assertion and source closure. |
| `UseSelectionInput` | Retained; public assertion and source closure. |
| `UseSelectionReturnValue` | Retained; public assertion and source closure. |
| `UseElementSizeReturnValue` | Retained; public assertion and source closure. |
| `UseResizeObserverReturnValue` | Retained; public assertion and source closure. |
| `ObserverRect` | Retained; public assertion and source closure. |
| `UseCollapseInput` | Retained; public assertion and source closure. |
| `UseCollapseReturnValue` | Retained; public assertion and source closure. |
| `UseCollapseState` | Retained; public assertion and source closure. |
| `UseHorizontalCollapseInput` | Retained; public assertion and source closure. |
| `UseHorizontalCollapseReturnValue` | Retained; public assertion and source closure. |
| `UseHorizontalCollapseState` | Retained; public assertion and source closure. |
| `UseMaskOptions` | Retained; public assertion and source closure. |
| `UseMaskReturnValue` | Retained; public assertion and source closure. |
| `MaskState` | Retained; public assertion and source closure. |
| `UseRovingIndexInput` | Retained; public assertion and source closure. |
| `UseRovingIndexGetItemPropsInput` | Retained; public assertion and source closure. |
| `UseRovingIndexReturnValue` | Retained; public assertion and source closure. |
| `UseDragState` | Retained; public assertion and source closure. |
| `UseDragOptions` | Retained; public assertion and source closure. |
| `UseDragReturnValue` | Retained; public assertion and source closure. |
| `UseSplitterPanel` | Retained; public assertion and source closure. |
| `UseSplitterOptions` | Retained; public assertion and source closure. |
| `UseSplitterReturnValue` | Retained; public assertion and source closure. |
| `UseSplitterRedistributeInput` | Retained; public assertion and source closure. |
| `UseSplitterRedistributeFn` | Retained; public assertion and source closure. |
| `UseSplitterResolvedPanel` | Retained; public assertion and source closure. |
| `SplitterPaneSize` | Retained; public assertion and source closure. |
| `SplitterStep` | Retained; public assertion and source closure. |
| `clamp` | Retained; public assertion and source closure. |
| `lowerFirst` | Retained; public assertion and source closure. |
| `randomId` | Retained; public assertion and source closure. |
| `range` | Retained; public assertion and source closure. |
| `shallowEqual` | Retained; public assertion and source closure. |
| `upperFirst` | Retained; public assertion and source closure. |
| `useCallbackRef` | Retained; public assertion and source closure. |
