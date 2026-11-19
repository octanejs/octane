export { trustHTML, type TrustedHTML } from './trusted-html.js';
export { createResizeObserver } from './resize-observer.js';
// Read and write phases for layout work. Kept apart from the reconciling
// runtime so an app that never queues layout work does not ship the queue.
export { RenderingPhase, readLayout, writeLayout, flushLayoutSync } from './layout-phases.js';
// Keep package metadata behind an isolated re-export: applications that do not
// read `version` can tree-shake this module and the package.json payload in full.
export { version } from './version.js';
export type * from './public-types.js';
export type {
	LayoutSnapshotOptions,
	LayoutSnapshotOptionsWithInitial,
} from './layout-snapshot-types.js';
export { StrictMode, unstable_batchedUpdates } from './compatibility.js';
export { initializeHydrationEventCapture } from './hydration/event-capture.js';
// Keep external DOM ownership separate from the reconciling runtime so
// behavior-only consumers never retain component or hydration machinery.
export { attachBehaviorRoot } from './behavior-root.js';
export { captureFormSubmissions } from './behavior-form-submissions.js';
export type * from './behavior-root.js';
export {
	createSubSlot,
	subSlot,
	type SubSlot,
	type SlotlessSubSlot,
	type SubSlotOptions,
} from './sub-slot.js';

// Profiling's application API and compiler ABI live at `octane/profiling`;
// neither belongs on the React-shaped main namespace.

// Only public API lives here: React parity plus deliberately documented Octane
// extensions such as compiler-backed deferred hydration. Compiler-emitted
// helpers, binding infrastructure and test-only hooks import from
// `octane/internal/client`; compiler/public-runtime-exports.js lists these
// names so compiled output never imports anything else from this entry.
export {
	createRoot,
	hydrateRoot,
	flushSync,
	// Octane extension: the layout phase of the running commit or queued task.
	getPhase,
	setLayoutSnapshotTiming,
	type LayoutSnapshotTiming,
	act,
	isInActScope,
	type Root,
	type RootContainer,
	type RootOptions,
	// Hooks (octane extension: each accepts a trailing compiler slot — required
	// when calling from plain .ts, injected by the compiler in .tsrx/.tsx)
	useState,
	useLinkedState,
	type LinkedStatePrevious,
	type LinkedStateOptions,
	useReducer,
	useEffect,
	useLayoutEffect,
	useLayoutSnapshot,
	useInsertionEffect,
	useMemo,
	useCallback,
	useRef,
	useLazyRef,
	useInitialValue,
	useId,
	useImperativeHandle,
	useEffectEvent,
	useSyncExternalStore,
	useDeferredValue,
	useTransition,
	useActionState,
	useActionState as useFormState,
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
	preloadModule,
	preinitModule,
	preconnect,
	prefetchDNS,
	// Context
	createContext,
	createCompiledContext,
	CompiledContext,
	CompiledOutlet,
	type CompiledComponent,
	use,
	useContext,
	type Context,
	type ForeignHostContext,
	// Components
	Suspense,
	ErrorBoundary,
	Hydrate,
	Activity,
	// React shipped Activity as unstable_Activity before 19.2 — alias it so
	// experimental-channel ports compile unchanged (mirrors unstable_ViewTransition).
	Activity as unstable_Activity,
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
	FragmentInstance,
	type FragmentProps,
	createPortal,
	type PortalDescriptor,
	// Elements
	createElement,
	cloneElement,
	isValidElement,
	isChildrenBlock,
	descriptorChildren,
	Children,
	type ElementDescriptor,
	type ComponentBody,
	type OctaneNode,
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

export { ServerCallUncertainError } from './server-rpc-protocol.js';
export { batchServerCalls, type ServerCallBatchOptions } from './server-rpc-batch-client.js';
