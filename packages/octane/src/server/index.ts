/**
 * `octane/server` — server-rendering entry.
 *
 * Public API: `render(Component, props?, options?)`, the server analogue of
 * `createRoot().render()`. It resolves to `{ head, body, css }`: hoisted head
 * elements, the rendered body (plus the suspense seed script when anything
 * suspended), and the deduped scoped-style tags. Options cover an AbortSignal,
 * a CSP nonce for the inline tags, and a per-render suspense deadline.
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

export { executeServerFunction } from './rpc.js';

export {
	// Entry
	render,
	type RenderResult,
	type RenderOptions,
	setSsrSuspenseTimeout,
	getSsrSuspenseTimeout,

	// Hooks (server semantics)
	useState,
	useReducer,
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
	useFormStatus,
	useOptimistic,
	memo,
	withSlot,
	startTransition,

	// Suspense / error boundaries as JSX components (alongside the @try directive)
	Suspense,
	ErrorBoundary,

	// Context
	createContext,
	use,
	useContext,
	ssrIsSuspense,
	type Context,
	type FormStatus,

	// Compiler-emitted codegen helpers (private ABI — see module doc)
	createElement,
	escapeHtml,
	escapeAttr,
	ssrText,
	ssrChild,
	ssrChildText,
	ssrAttr,
	normalizeClass,
	ssrStyle,
	ssrSpread,
	ssrInnerHtml,
	ssrComponent,
	ssrBlock,
	ssrPortal,
	injectStyle,
	ssrHeadEl,
} from '../runtime.server.js';
