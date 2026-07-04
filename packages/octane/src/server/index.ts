/**
 * `octane/server` — server-rendering entry.
 *
 * Public API (React `react-dom/server` parity): `renderToString(Component,
 * props?, options?)` (a single sync pass; suspended boundaries render their
 * fallback) and `renderToStaticMarkup` (clean, non-hydratable HTML). Both return
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

export { executeServerFunction } from './rpc.js';

export {
	// Entry — React `react-dom/server` parity (buffered; streaming lands in a
	// later phase). `renderToString` is a single sync pass (fallbacks for
	// suspended boundaries); `renderToStaticMarkup` is non-hydratable clean HTML.
	// The await-everything behaviour lives in `octane/static` as `prerender`.
	renderToString,
	renderToStaticMarkup,
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
