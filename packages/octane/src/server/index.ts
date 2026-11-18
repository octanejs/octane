export { trustHTML, type TrustedHTML } from '../trusted-html.js';
export type {
	LayoutSnapshotOptions,
	LayoutSnapshotOptionsWithInitial,
} from '../layout-snapshot-types.js';
export { createResizeObserver } from '../resize-observer.js';
/**
 * `octane/server` — server-rendering entry.
 *
 * Public API (React `react-dom/server` parity): `renderToString(Component,
 * props?, options?)` (a single sync pass; suspended boundaries render their
 * fallback) and `renderToStaticMarkup` (non-hydratable HTML). Both return
 * `{ html, css }`: hoisted head folds into `html` (plus the suspense seed script
 * when anything resolved synchronously) and the deduped scoped-style tags are in
 * `css`. The await-everything renderer is `prerender` in `octane/static`.
 * `RenderOptions` cover an `AbortSignal`, a CSP `nonce` for the inline tags, and a
 * per-render suspense deadline (`timeoutMs`).
 *
 * `executeServerFunction` is the metaframework's RPC executor for `module
 * server` functions — the vite plugin loads it via
 * `ssrLoadModule('octane/server')` so it runs inside the SSR module graph.
 *
 * Server-compiled modules import their string-building helpers from
 * `octane/internal/server`, the compiler's private ABI; this entry exports only
 * the names in compiler/public-runtime-exports.js.
 */

export { executeServerFunction, executeServerFunctionStream } from './rpc.js';
export { earlySignalBootstrapScript, type EarlySignalBootstrapOptions } from './early-signals.js';
export {
	batchServerCalls,
	executeServerFunctionBatch,
	type ServerCallBatchOptions,
	type ServerBatchMember,
} from './rpc-batch.js';
export type { ServerResultLimits } from '../server-rpc-protocol.js';
export {
	createStreamedRegionPlacementFrame,
	type StreamedRegionPlacementOptions,
} from './streamed-region.js';
export {
	createAutomaticStreamedSignalInjection,
	createStreamedRendererFrameStream,
	createStreamedSignalInjection,
	createStreamedSignalResultFrames,
	streamedRendererFrameScript,
	type StreamedRendererLimits,
	type AutomaticStreamedSignalInjection,
	type AutomaticStreamedSignalOptions,
	type StreamedSignalResultOptions,
} from './streamed-signals.js';
// Engine-free request-owner bridge. Metaframeworks install this on their
// existing async context without retaining the signal graph in signal-free
// server bundles.
export {
	installSignalOwnerEnvironment,
	retireSignalOwnerIdentity,
} from '../signals/owner-context.js';
export type { SignalOwner, SignalOwnerEnvironment } from '../signals/types.js';
export type { CompiledComponent } from '../runtime.js';
export {
	type ServerCallContext,
	type ServerCallContextSource,
	type ServerCallHost,
	type ServerCallOptions,
	type ServerFunction,
	type ServerFunctionTarget,
} from '../server-call.js';
export { version } from '../version.js';
export { StrictMode, unstable_batchedUpdates } from '../compatibility.js';

export {
	createSubSlot,
	subSlot,
	type SubSlot,
	type SlotlessSubSlot,
	type SubSlotOptions,
} from '../sub-slot.js';

export {
	// Buffered and streaming renderers accept renderable roots plus options,
	// or the Octane (Component, props, options) extension. Synchronous rendering
	// uses boundary fallbacks and rejects suspension without a boundary.
	// The await-everything behaviour lives in `octane/static` as `prerender`.
	renderToString,
	renderToStaticMarkup,
	renderToPipeableStream,
	renderToReadableStream,
	type RenderResult,
	type NativeSignalManifest,
	type NativeSignalReference,
	type RenderOptions,
	type ServerRenderNode,
	type ShellWitness,
	type StreamOptions,
	type StreamInjectionSource,
	setSsrSuspenseTimeout,
	getSsrSuspenseTimeout,

	// Hooks (server semantics)
	useState,
	useLinkedState,
	useReducer,
	type LinkedStatePrevious,
	type LinkedStateOptions,
	useEffect,
	useLayoutEffect,
	useLayoutSnapshot,
	useInsertionEffect,
	useImperativeHandle,
	useMemo,
	useCallback,
	useRef,
	useLazyRef,
	useInitialValue,
	useId,
	useEffectEvent,
	useTransition,
	useDeferredValue,
	useSyncExternalStore,
	useActionState,
	useActionState as useFormState,
	useFormStatus,
	useOptimistic,
	useDebugValue,
	memo,
	lazy,
	startTransition,
	flushSync,
	RenderingPhase,
	getPhase,
	readLayout,
	writeLayout,
	flushLayoutSync,
	setLayoutSnapshotTiming,
	isChildrenBlock,
	isValidElement,
	cloneElement,
	Children,
	createPortal,
	requestFormReset,
	preload,
	preinit,
	preloadModule,
	preinitModule,
	preconnect,
	prefetchDNS,

	// Suspense / error boundaries as JSX components (alongside the @try directive)
	Suspense,
	ErrorBoundary,
	Hydrate,
	Fragment,
	Activity,
	Activity as unstable_Activity,
	// Transparent server twin of the client ViewTransition boundary (client-only
	// behavior; SSR annotations are view-transitions plan Phase 5).
	ViewTransition,
	ViewTransition as unstable_ViewTransition,
	addTransitionType,
	addTransitionType as unstable_addTransitionType,

	// Context
	createContext,
	createCompiledContext,
	CompiledContext,
	CompiledOutlet,
	use,
	useContext,
	type Context,
	type FormStatus,
	descriptorChildren,
	createElement,
} from '../runtime.server.js';
