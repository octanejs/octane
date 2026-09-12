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
 * Everything below the "compiler-emitted" divider is NOT for hand-written
 * code: the `octane/compiler` in `mode: 'server'` emits component modules that
 * import those string-building helpers from here. Treat them as the compiler's
 * private ABI — present because compiled output needs them, not because apps
 * should call them.
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
export {
	__registerServerFunction,
	__serverCall,
	__setServerCallContextSource,
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

// Semi-public compiler target for inferred method-call dependencies — the
// same helper the client entry ships, because inferred dependency arrays are
// compiled identically for SSR (see applyHookDependencies' server call site).
export { __methodDep } from '../method-dep.js';

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
	type RenderOptions,
	type ServerRenderNode,
	type StreamOptions,
	type StreamInjectionSource,
	setSsrSuspenseTimeout,
	getSsrSuspenseTimeout,
	EXTERNAL_HYDRATION_PROMISE,
	HYDRATION_RANGE_BOUNDARY,

	// Hooks (server semantics)
	useState,
	useLinkedState,
	useReducer,
	__useStateWithGetter,
	__useLinkedStateWithGetter,
	__useReducerWithGetter,
	type LinkedStatePrevious,
	type LinkedStateOptions,
	useEffect,
	useLayoutEffect,
	useInsertionEffect,
	useImperativeHandle,
	useMemo,
	useCallback,
	useRef,
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
	hookSlots,
	withSlot,
	manualHook,
	invokeManualHook,
	startTransition,
	flushSync,
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
	use,
	useContext,
	ssrIsSuspense,
	type Context,
	type FormStatus,

	// Compiler-emitted codegen helpers (private ABI — see module doc)
	markChildrenBlock,
	markWarm,
	ssrHtml,
	ssrChildTextPre,
	ssrChildPre,
	descriptorChildren,
	createElement,
	createScopedValue,
	createScopedElement,
	positionalChildren,
	escapeHtml,
	escapeAttr,
	ssrText,
	ssrTextPre,
	ssrNestingText,
	ssrChild,
	ssrChildText,
	ssrAttr,
	normalizeClass,
	ssrStyle,
	ssrClass,
	ssrAttrs,
	ssrSignalValue,
	ssrSignalControlValue,
	ssrSignalControlAttrs,
	ssrSnapshotSpread,
	enableServerSignalBindings,
	ssrSpread,
	ssrInnerHtml,
	ssrScriptInnerHtml,
	ssrChildrenSources,
	ssrSpreadContent,
	ssrVoidContent,
	// Controlled form serialization (value/checked attrs, textarea content,
	// select option-projection scope)
	ssrValueAttr,
	ssrCheckedAttr,
	ssrInputAttrs,
	ssrFormAuthoringDiagnostics,
	ssrTextareaValue,
	ssrTextareaValueSources,
	ssrSelectAttrs,
	ssrSelectScope,
	ssrSelectScopeSources,
	ssrOptionValueSources,
	ssrOption,
	ssrElement,
	ssrComponent,
	ssrComponentNS,
	ssrInNamespace,
	ssrBlock,
	ssrFragmentMarker,
	ssrActivity,
	ssrForBlock,
	mapSlot,
	ssrControl,
	ssrArm,
	ssrTry,
	ssrPortal,
	injectStyle,
	ssrHeadEl,
	styleMap,
	touchStyleMap,
	// React Float resources (stylesheet precedence links, style resources, async scripts)
	ssrStylesheetResource,
	ssrStyleResource,
	ssrScriptResource,
	namespaceHead,
	namespaceHeadElement,
	// SSR parallel-use mirror (compiler targets — see suspense-parallel-use plan).
	puMemo,
	puBatch,
	warmMemo,
	warmChild,
} from '../runtime.server.js';
