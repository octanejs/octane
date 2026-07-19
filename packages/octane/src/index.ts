// Keep package metadata behind an isolated re-export: applications that do not
// read `version` can tree-shake this module and the package.json payload in full.
export { version } from './version.js';
export { initializeHydrationEventCapture } from './hydration/event-capture.js';

// Profiling's application API and compiler ABI live at `octane/profiling`;
// neither belongs on the React-shaped main namespace.

// The export surface has exactly three tiers — keep new exports in the right one:
//
//  1. PUBLIC API — React parity plus deliberately documented Octane extensions
//     such as compiler-backed deferred hydration.
//  2. SEMI-PUBLIC compiler/binding helpers — the contract between the compiler's
//     emitted code (and the @octanejs/* bindings) and the runtime. Not for app
//     code; may change with the compiler in lockstep.
//  3. TEST-ONLY — used by this repo's test infrastructure. Not API at all.
export {
	// ── 1. Public API (React parity) ──────────────────────────────────────────
	createRoot,
	hydrateRoot,
	flushSync,
	act,
	type Root,
	type RootOptions,
	// Hooks (octane extension: each accepts a trailing compiler slot — required
	// when calling from plain .ts, injected by the compiler in .tsrx/.tsx)
	useState,
	useReducer,
	useEffect,
	useLayoutEffect,
	useInsertionEffect,
	useMemo,
	useCallback,
	useRef,
	useId,
	useImperativeHandle,
	useEffectEvent,
	useSyncExternalStore,
	useDeferredValue,
	useTransition,
	useActionState,
	useFormStatus,
	useOptimistic,
	useDebugValue,
	type FormStatus,
	startTransition,
	requestFormReset,
	memo,
	lazy,
	// Resource hints (React DOM parity)
	preload,
	preinit,
	preconnect,
	prefetchDNS,
	// Context
	createContext,
	use,
	useContext,
	type Context,
	type ForeignHostContext,
	// Components
	Suspense,
	ErrorBoundary,
	Hydrate,
	Activity,
	ViewTransition,
	addTransitionType,
	// React ships View Transitions on the experimental channel as unstable_-
	// prefixed exports — alias them so React-experimental code ports unchanged.
	ViewTransition as unstable_ViewTransition,
	addTransitionType as unstable_addTransitionType,
	ViewTransitionPseudoElement,
	type ViewTransitionProps,
	type ViewTransitionInstance,
	Fragment,
	createPortal,
	type PortalDescriptor,
	// Elements
	createElement,
	cloneElement,
	isValidElement,
	isChildrenBlock,
	Children,
	type ElementDescriptor,
	type ComponentBody,
	type OctaneNode,

	// ── 2. Semi-public: compiler-emitted / binding-infrastructure helpers ─────
	// (the compiled-output ↔ runtime contract; also used by @octanejs/* bindings)
	// `@try`/`@catch` as the language tooling's type-only virtual TSX spells it.
	TsrxErrorBoundary,
	__useStateWithGetter,
	__useReducerWithGetter,
	__createVoidRoot,
	bindRendererRegionOwner,
	EXTERNAL_HYDRATION_PROMISE,
	HYDRATION_RANGE_BOUNDARY,
	createHostContextRequest,
	// Module-load "this module uses <ViewTransition>" hint (view-transitions plan).
	__vtSeen,
	template,
	clone,
	drainFrag,
	// Binding-bag arity factories — one-shot allocate+insert+commit for the
	// compiled mount path (fields are compiler-assigned 1-char names).
	bag0,
	bag1,
	bag2,
	bag3,
	bag4,
	bag5,
	bag6,
	bag7,
	bag8,
	bag9,
	bag10,
	bag11,
	bag12,
	bag13,
	bag14,
	bag15,
	bag16,
	bagOf,
	// Event-bundle helpers (3b) — build the `{ fn, args }` descriptor once at
	// mount, mutate it in place on update (dispatch reads `el[key]` per event).
	evt0,
	evt0u,
	evt1,
	evt1u,
	evt2,
	evt2u,
	evtN,
	evtNu,
	devEventListener,
	htext,
	htextSwap,
	child,
	sibling,
	setText,
	setScriptText,
	setHTML,
	setDangerouslySetInnerHTML,
	setDangerouslySetInnerHTMLSources,
	markDangerouslySetInnerHTMLChildren,
	setAttribute,
	setStringData,
	setBooleanAttribute,
	setAriaAttribute,
	setClassName,
	setClassAttr,
	normalizeClass,
	setStyle,
	setSpread,
	snapshotSpread,
	setHostPropSources,
	queueNativeChangeDiagnostic,
	markNativeChangeDiagnosticStatic,
	setFormAction,
	// Controlled form components (value/checked/defaultValue/defaultChecked
	// property bindings on input/textarea/select — React-parity semantics on
	// native events).
	setValue,
	setFormControlSources,
	setChecked,
	setCheckedCheckable,
	setSelectValue,
	setDefaultValue,
	setDefaultValueUncontrolled,
	setDefaultChecked,
	// autoFocus (commit-phase focus on mount; never an attribute)
	setAutoFocus,
	attachRef,
	queueRefAttach,
	queueRefDetach,
	injectStyle,
	headBlock,
	namespaceHead,
	namespaceHeadElement,
	delegateEvents,
	delegateCaptureEvents,
	forBlock,
	ifBlock,
	tryBlock,
	switchBlock,
	activityBlock,
	componentSlot,
	componentSlotVoid,
	componentSlotLite,
	compilerCacheContext,
	markSingleRoot,
	// Compact compiler ABI; keep the descriptive export for older compiled output.
	markSingleRoot as __s,
	markChildrenBlock,
	childSlot,
	positionalChildren,
	textSlot,
	textHole,
	childTextHole,
	hostComponent,
	renderBlock,
	portal,
	hookSlots,
	withSlot,
	// Compiler-emitted parallel use(): batched stratum unwrap + fetch-tree
	// warming (docs/suspense-parallel-use-plan.md).
	useBatch,
	warmMemo,
	warmChild,
	provideContext,
	mountFragmentRef,
	FragmentInstance,
	hmr,
	HMR,
	// Scheduler-quiescence probe for @octanejs/testing-library's sync settle.
	hasPendingWork,
	type Scope,
	type Block,

	// ── 3. Test-only (this repo's test infrastructure; not API) ───────────────
	drainPassiveEffects,
	setIsOctaneActEnvironment,
	setTransitionFallbackTimeout,
	getTransitionFallbackTimeout,
} from './runtime.js';

export type {
	HydrateOptions,
	HydrateProps,
	HydrateWhen,
	HydrationInteractionEvent,
	HydrationInteractionEvents,
	HydrationPrefetchContext,
	HydrationPrefetchFunction,
	HydrationPrefetchStrategy,
	HydrationPrefetchWaitReason,
	HydrationStrategy,
	HydrationWhen,
} from './hydration/types.js';

// Semi-public compiler target for `module server` browser stubs.
export { __serverRpc } from './server-rpc-client.js';
