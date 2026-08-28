/**
 * Shared React-island transport. This module imports neither renderer runtime,
 * so the client and server adapters can validate the same authored boundary.
 */
import * as React from 'react';
import type { Context, OctaneNode } from '../runtime.js';
import type { Context as ServerContext } from '../runtime.server.js';

/** One native Octane context delivered through a real React context provider. */
export interface ReactContextBridge<T> {
	readonly source: Context<T> | ServerContext<T>;
	readonly target: React.Context<T>;
}

interface ReactCompatContextProps {
	/** Keep the ordered context identities stable for this boundary's lifetime. */
	contexts?: readonly ReactContextBridge<any>[];
}

export interface ReactCompatProps extends ReactCompatContextProps {
	/** Exactly one React component element authored in the Octane template. */
	children: OctaneNode;
	component?: never;
	props?: never;
}

/** React owns function, class, memo, lazy, and forwarded-ref components. */
export type ReactHostedComponent<P = Record<string, never>> =
	React.ComponentType<P> | React.ExoticComponent<P>;

/** Infer island props from the React component, including refs declared in its props. */
export type ReactCompatComponentProps<P> = ReactCompatContextProps & {
	component: ReactHostedComponent<P>;
	children?: never;
} & ({} extends P ? { props?: NoInfer<P> } : { props: NoInfer<P> });

/** React class refs target the instance, not a field in the class's props. */
export type ReactCompatClassComponentProps<C extends React.ComponentClass<any>> =
	ReactCompatContextProps & {
		component: C;
		children?: never;
	} & ({} extends React.ComponentPropsWithRef<C>
			? { props?: NoInfer<React.ComponentPropsWithRef<C>> }
			: { props: NoInfer<React.ComponentPropsWithRef<C>> });

export interface TransportedReactChild {
	readonly type: ReactHostedComponent<any>;
	readonly props: Record<string, unknown>;
	readonly key: string | null;
}

const OCTANE_ELEMENT_TAG = Symbol.for('octane.element');
const OCTANE_CONTEXT_TAG = Symbol.for('octane.context');
const REACT_CONTEXT_TAG = Symbol.for('react.context');
const REACT_MEMO_TAG = Symbol.for('react.memo');
const REACT_LAZY_TAG = Symbol.for('react.lazy');
const REACT_FORWARD_REF_TAG = Symbol.for('react.forward_ref');
const EMPTY_PROPS: Record<string, unknown> = Object.freeze({});
const EMPTY_CONTEXTS: readonly ReactContextBridge<any>[] = Object.freeze([]);

function validateContextBridge(source: unknown, target: unknown): void {
	// Server contexts intentionally have no client version counter. Both native
	// contexts share this callable identity and public default-value metadata.
	if (
		typeof source !== 'function' ||
		(source as { $$kind?: unknown }).$$kind !== OCTANE_CONTEXT_TAG ||
		!('defaultValue' in source)
	) {
		throw new TypeError('bridgeReactContext() requires a native Octane source context.');
	}
	if (
		target === null ||
		typeof target !== 'object' ||
		(target as { $$typeof?: unknown }).$$typeof !== REACT_CONTEXT_TAG
	) {
		throw new TypeError('bridgeReactContext() requires a real React target context.');
	}
}

/**
 * Map context identities once; values remain scoped to the enclosing Octane
 * provider. The mapping never reads or changes React's renderer-owned values.
 */
export function bridgeReactContext<T>(
	source: Context<T> | ServerContext<T>,
	target: React.Context<NoInfer<T>>,
): ReactContextBridge<T> {
	validateContextBridge(source, target);
	return Object.freeze({ source, target });
}

/** Validate raw JavaScript input too; duplicate targets have no clear precedence. */
export function validateReactContextBridges(
	contexts: readonly ReactContextBridge<any>[] | undefined,
): readonly ReactContextBridge<any>[] {
	if (contexts === undefined) return EMPTY_CONTEXTS;
	if (!Array.isArray(contexts)) {
		throw new TypeError('<ReactCompat> `contexts` must be an array of context mappings.');
	}
	const targets = contexts.length > 1 ? new Set<object>() : null;
	for (const mapping of contexts) {
		if (mapping === null || typeof mapping !== 'object') {
			throw new TypeError('<ReactCompat> `contexts` must contain context mappings.');
		}
		const { source, target } = mapping;
		validateContextBridge(source, target);
		if (targets !== null) {
			if (targets.has(target)) {
				throw new TypeError('<ReactCompat> cannot map the same React context more than once.');
			}
			targets.add(target);
		}
	}
	return contexts;
}

function validateComponent(type: unknown): asserts type is ReactHostedComponent<any> {
	if (typeof type === 'function') return;
	if (type !== null && typeof type === 'object') {
		const tag = (type as { $$typeof?: unknown }).$$typeof;
		if (tag === REACT_MEMO_TAG || tag === REACT_LAZY_TAG || tag === REACT_FORWARD_REF_TAG) return;
	}
	throw new TypeError(
		'<ReactCompat> expects one React function, class, memo, lazy, or forwardRef component; ' +
			'DOM elements, fragments, and multiple children cannot be the island root.',
	);
}

function snapshotProps(props: unknown): Record<string, unknown> {
	if (props == null) return EMPTY_PROPS;
	if (typeof props !== 'object' || Array.isArray(props)) {
		throw new TypeError('<ReactCompat> island props must be an object.');
	}
	// Scoped Octane descriptors can expose getters. Materialize them while the
	// Octane render scope is active; React must never evaluate them later.
	return { ...props };
}

/** Resolve both authoring forms without invoking either renderer's component. */
export function resolveReactIsland(
	props: ReactCompatProps | ReactCompatComponentProps<unknown>,
): TransportedReactChild {
	const component = props.component;
	if (component !== undefined) {
		if (props.children !== undefined) {
			throw new TypeError(
				'<ReactCompat> accepts either a `component` prop or one element child, not both.',
			);
		}
		validateComponent(component);
		return { type: component, props: snapshotProps(props.props), key: null };
	}
	if (props.props !== undefined) {
		throw new TypeError('<ReactCompat> the `props` prop requires a `component` prop.');
	}
	const child = props.children;
	if (
		child === null ||
		typeof child !== 'object' ||
		(child as { $$kind?: unknown }).$$kind !== OCTANE_ELEMENT_TAG
	) {
		throw new TypeError(
			'<ReactCompat> expects exactly one React component element authored in an Octane template.',
		);
	}
	const descriptor = child as { type: unknown; props: unknown; key: unknown };
	const type = descriptor.type;
	const childProps = descriptor.props;
	const key = descriptor.key;
	validateComponent(type);
	return {
		type,
		props: snapshotProps(childProps),
		key: key == null ? null : '' + key,
	};
}

/** Keep React's key normalization and React 19 ref ownership at element creation. */
export function createReactIslandElement(child: TransportedReactChild): React.ReactElement {
	return React.createElement(
		child.type,
		child.key === null ? child.props : { ...child.props, key: child.key },
	);
}
