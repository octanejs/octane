/**
 * Host-agnostic pieces shared by the `octane/react` client controller and the
 * `octane/react/server` hosted renderer: the public prop/facade types and the
 * §3 transported-child validation. No React DOM, no Octane runtime imports —
 * both entries layer their renderer on top.
 */
import * as React from 'react';
import type { ComponentBody } from '../index.js';

export interface OctaneCompatProps {
	/** Exactly one compiled Octane component element. */
	children: React.ReactElement;
	component?: undefined;
	props?: undefined;
}

/**
 * The value accepted by `<OctaneCompat component={…}>`: any octane-component-
 * shaped function — a compiled `.tsrx` export exactly as the tsrx language
 * tooling types it (`(props) => Octane.JSX.Element`), a plain-TS octane
 * component, or the core `ComponentBody` (its extra scope/extra parameters
 * are absorbed by the `never[]` rest). The return type is deliberately
 * unconstrained: octane invokes the component, React never does, so this type
 * exists to INFER `P` and gate the paired `props` attribute — not to make the
 * value callable from React.
 */
export type OctaneHostedComponent<P = Record<string, never>> = (
	props: P,
	...hostArgs: never[]
) => unknown;

/**
 * The typed `component`/`props` authoring form of `<OctaneCompat>`:
 *
 * ```tsx
 * <OctaneCompat component={Island} props={{ id: 42 }} />
 * ```
 *
 * This is the same `{ type, props }` transport the children form extracts
 * from its element — accepted directly, WITHOUT routing the octane component
 * through React's JSX element-creation typing (which correctly rejects octane
 * components as element types). `P` infers from the component's own props
 * parameter, so a wrong, missing, or unknown island prop is a type error at
 * the call site with zero per-island declarations; `props` may be omitted
 * only when the component accepts an empty props object.
 */
export type OctaneCompatComponentProps<P> = {
	/** The compiled Octane component to host — octane invokes it, never React. */
	component: OctaneHostedComponent<P>;
	children?: never;
} & ({} extends P ? { props?: NoInfer<P> } : { props: NoInfer<P> });

declare const OCTANE_RENDERED: unique symbol;

/**
 * Opaque branded node type for the JSX-facing view of a compiled Octane
 * component: assignable to `React.ReactNode` so React JSX accepts the child
 * site, but never actually produced at runtime — `OctaneCompat` consumes the
 * child element as a `{ type, props }` transport and React never invokes it.
 */
export type OctaneRenderedNode = React.ReactElement & {
	readonly [OCTANE_RENDERED]: 'octane';
};

/**
 * The React-JSX-facing type of a compiled Octane component. The runtime value
 * is the compiled body; only the declared type differs so `<Island …/>` is
 * valid zero-cast inside `<OctaneCompat>`. Intersects cleanly with
 * `ComponentBody<P>` so one declaration can serve both hosts.
 */
export type OctaneReactComponent<P = Record<string, never>> = (props: P) => OctaneRenderedNode;

/** React 19 context objects carry $$typeof: Symbol.for('react.context'). */
export const REACT_CONTEXT_TAG = Symbol.for('react.context');

/** The client's stable opaque-host sentinel; the server writes real island HTML. */
export const OPAQUE_HOST_SENTINEL_COMMENT = 'octane-compat-island';
export const OPAQUE_HOST_SENTINEL = Object.freeze({
	__html: `<!--${OPAQUE_HOST_SENTINEL_COMMENT}-->`,
});

export interface TransportedChild {
	type: ComponentBody;
	props: Record<string, unknown>;
	/** React key of the transported element — part of island identity (§3/§10). */
	key: string | null;
}

function describeChildType(type: unknown): string {
	if (typeof type === 'string') return `the DOM element <${type}>`;
	if (type === React.Fragment) return 'a Fragment';
	if (typeof type === 'function')
		return `the component ${(type as Function).name || '(anonymous)'}`;
	return 'an exotic React element';
}

function assertNotClassComponent(type: Function): void {
	if (process.env.NODE_ENV !== 'production') {
		// A class component is provably a React-only component. A PLAIN function
		// cannot be distinguished from a prod-compiled or plain-TS Octane
		// component today (the compiler does not yet emit a runtime brand), so
		// unbranded plain functions are accepted; passing an ordinary React
		// function component here fails inside the island when it calls React
		// hooks against the Octane runtime.
		if ((type as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent) {
			throw new Error(
				`<OctaneCompat> cannot host ${describeChildType(type)}: class components are ` +
					'React-only; pass one compiled Octane component.',
			);
		}
	}
}

export function validateIslandChild(children: React.ReactNode): TransportedChild {
	if (React.Children.count(children) !== 1) {
		throw new Error(
			'<OctaneCompat> expects exactly one Octane component element child; received ' +
				`${React.Children.count(children)} children.`,
		);
	}
	if (!React.isValidElement(children)) {
		throw new Error('<OctaneCompat> expects an Octane component element, not a plain renderable.');
	}
	const type = children.type as unknown;
	if (typeof type !== 'function') {
		throw new Error(
			`<OctaneCompat> cannot host ${describeChildType(type)}; ` +
				'pass one compiled Octane component. (memo/forwardRef/lazy wrappers are React-only ' +
				'element types — use Octane memo()/lazy() inside the island instead.)',
		);
	}
	assertNotClassComponent(type as Function);
	return {
		type: type as unknown as ComponentBody,
		props: (children.props ?? {}) as Record<string, unknown>,
		key: children.key ?? null,
	};
}

/**
 * Stable empty transported props for `component`-form islands that omit
 * `props`. Frozen and shared: island props are read-only transport, and a
 * stable identity keeps the client's §10 unchanged-parent-rerender bail and
 * the server's replay-stable session keying trivially correct.
 */
const EMPTY_HOSTED_PROPS: Record<string, unknown> = Object.freeze({});

/**
 * Resolve either authoring form to the one island transport both hosted
 * renderers consume. The `component`/`props` form is used verbatim; the
 * children form goes through the §3 element validation. `key` is `null` for
 * the component form — island identity is the React key on `<OctaneCompat>`
 * itself, which React resolves by remounting the wrapper.
 */
export function resolveHostedIsland(
	props: OctaneCompatProps | OctaneCompatComponentProps<unknown>,
): TransportedChild {
	const component = props.component;
	if (component === undefined) {
		return validateIslandChild((props as OctaneCompatProps).children);
	}
	if ((props as { children?: unknown }).children !== undefined) {
		throw new Error(
			'<OctaneCompat> accepts either a `component` prop or one element child, not both.',
		);
	}
	if (typeof component !== 'function') {
		throw new Error(
			'<OctaneCompat> `component` must be a compiled Octane component function; received ' +
				`${component === null ? 'null' : typeof component}.`,
		);
	}
	assertNotClassComponent(component);
	return {
		type: component as unknown as ComponentBody,
		props: (props.props ?? EMPTY_HOSTED_PROPS) as Record<string, unknown>,
		key: null,
	};
}
