/**
 * `octane/server` — server-rendering entry.
 *
 * Re-exports the server runtime. The `octane/compiler` compiler, in
 * `mode: 'server'`, emits component modules that `import { … } from
 * 'octane/server'` — pulling the server hook implementations and the `ssr*`
 * string-building helpers from here. `render(Component, props)` is the server
 * analogue of `createRoot().render()`.
 */

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

	// Compiler-emitted codegen helpers
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
