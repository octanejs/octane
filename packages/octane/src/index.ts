import pkg from '../package.json' with { type: 'json' };

// Source the version from package.json so it can't drift from the published
// package version (the previous hardcoded literal already had).
export const version: string = pkg.version;

// The export surface has exactly three tiers — keep new exports in the right one:
//
//  1. PUBLIC API — mirrors React's API, no octane-invented surface. If React
//     doesn't ship it, it doesn't belong here.
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
	// Hooks (octane extension: each accepts a trailing slot symbol — required
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
	// Components
	Suspense,
	ErrorBoundary,
	Activity,
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

	// ── 2. Semi-public: compiler-emitted / binding-infrastructure helpers ─────
	// (the compiled-output ↔ runtime contract; also used by @octanejs/* bindings)
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
	htext,
	htextSwap,
	child,
	sibling,
	setText,
	setAttribute,
	setClassName,
	setClassAttr,
	normalizeClass,
	setStyle,
	setSpread,
	setFormAction,
	// Controlled form components (value/checked/defaultValue/defaultChecked
	// property bindings on input/textarea/select — React-parity semantics on
	// native events).
	setValue,
	setChecked,
	setSelectValue,
	setDefaultValue,
	setDefaultChecked,
	// autoFocus (commit-phase focus on mount; never an attribute)
	setAutoFocus,
	attachRef,
	queueRefAttach,
	queueRefDetach,
	injectStyle,
	headBlock,
	delegateEvents,
	delegateCaptureEvents,
	forBlock,
	ifBlock,
	tryBlock,
	switchBlock,
	activityBlock,
	componentSlot,
	componentSlotLite,
	markChildrenBlock,
	childSlot,
	positionalChildren,
	textSlot,
	textHole,
	childTextHole,
	hostComponent,
	renderBlock,
	portal,
	withSlot,
	// Parallel use() (compiler parallelUse pipeline): batched stratum unwrap +
	// fetch-tree warming (docs/suspense-parallel-use-plan.md).
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
