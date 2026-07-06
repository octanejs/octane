// The compat SHIM — the `react` entry point a bridged package resolves to.
//
// It re-exports Octane's React-parity surface verbatim and synthesizes the
// handful of symbols Octane omits by design. Everything here is a runtime
// adapter: it is what lets the codemod stay tiny (import re-homing only) — the
// behavioural bridging happens at these boundaries, not by rewriting call sites.
//
// Absorbed here (no code rewrite needed in the package):
//   • forwardRef      → refs-as-props wrapper
//   • useDebugValue   → no-op
//   • StrictMode      → passthrough (no double-invoke in Octane)
//   • default export  → the `React.*` namespace object
// NOT absorbed (the detector blocks these — no honest runtime shim exists):
//   • Component / PureComponent (class components)

export {
	// hooks
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
	startTransition,
	// context
	createContext,
	use,
	useContext,
	// composition
	memo,
	Fragment,
	Suspense,
	// elements
	createElement,
	cloneElement,
	isValidElement,
	Children,
} from 'octane';

import {
	createElement,
	cloneElement,
	isValidElement,
	Children,
	Fragment,
	memo,
	createContext,
	useContext,
} from 'octane';

/**
 * forwardRef → React-19 refs-as-props. Octane passes a ref through as the
 * `ref` prop, so we simply hand it to the render fn's second parameter. Works
 * for any `forwardRef(fn)` without parsing `fn` — which is exactly why the
 * codemod never has to touch the call site.
 */
export function forwardRef<T, P extends object>(
	render: (props: P, ref: T | null) => unknown,
): (props: P & { ref?: T | null }) => unknown {
	const Wrapped = (props: P & { ref?: T | null }) => render(props, props.ref ?? null);
	(Wrapped as { displayName?: string }).displayName =
		(render as { displayName?: string; name?: string }).displayName ??
		(render as { name?: string }).name;
	return Wrapped;
}

/** useDebugValue → no-op (Octane has no devtools hook surface). */
export function useDebugValue(_value?: unknown, _format?: (v: unknown) => unknown): void {}

/** StrictMode → passthrough. Octane never double-invokes, so the wrapper is inert. */
export function StrictMode(props: { children?: unknown }): unknown {
	return props.children;
}

const classComponentError = (name: string) =>
	new Error(
		`[react-compat] ${name} (class component) has no Octane runtime shim — the bridger flags this for a manual/MCP port (class→hooks). See detector rule 'class-component'.`,
	);

/** Class bases exist only so imports resolve; constructing one is a hard error. */
export class Component {
	constructor() {
		throw classComponentError('React.Component');
	}
}
export class PureComponent {
	constructor() {
		throw classComponentError('React.PureComponent');
	}
}

// The `React.*` namespace object for `import React from 'react'` default usage.
const React = {
	createElement,
	cloneElement,
	isValidElement,
	Children,
	Fragment,
	memo,
	createContext,
	useContext,
	forwardRef,
	useDebugValue,
	StrictMode,
	Component,
	PureComponent,
};
export default React;
