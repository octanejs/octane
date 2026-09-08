/** @jsxImportSource octane */
/**
 * Private authoring control: descriptorChildren transports one React component
 * through an Octane template. A stock React root publishes from layout; this
 * deliberately does not implement prepared commits or boundary coordination.
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
	createElement,
	descriptorChildren,
	isValidElement,
	useInsertionEffect,
	useLayoutEffect,
	useRef,
	type ElementDescriptor,
	type OctaneNode,
} from 'octane';

const HOST_SLOT = Symbol('authoring-control.host');
const ROOT_SLOT = Symbol('authoring-control.root');
const PUBLISH_SLOT = Symbol('authoring-control.publish');
const LIFETIME_SLOT = Symbol('authoring-control.lifetime');
const REACT_COMPONENT_TAGS = new Set([
	Symbol.for('react.memo'),
	Symbol.for('react.lazy'),
	Symbol.for('react.forward_ref'),
]);

function snapshotChild(child: unknown): React.ReactElement {
	if (!isValidElement(child)) {
		throw new TypeError('The authoring control requires one inspectable component element.');
	}
	// Scoped descriptors can expose getters. Resolve all transported fields now,
	// while the Octane owner is rendering, rather than from React's later render.
	const descriptor = child as ElementDescriptor<Record<string, unknown>>;
	const type: unknown = descriptor.type;
	const key = descriptor.key;
	const props = { ...descriptor.props };
	if (
		typeof type !== 'function' &&
		!(
			type !== null &&
			typeof type === 'object' &&
			REACT_COMPONENT_TAGS.has((type as { $$typeof: symbol }).$$typeof)
		)
	) {
		throw new TypeError('The authoring control requires a React component, not host content.');
	}
	// Octane lifts key out of props, but leaves React 19 ref props intact.
	if (key !== null) props.key = key;
	return React.createElement(type as React.ElementType, props);
}

function ReactCompatImpl(props: { children?: OctaneNode }): ElementDescriptor {
	const element = snapshotChild(props.children);
	const host = useRef<HTMLDivElement | null>(null, HOST_SLOT);
	const root = useRef<Root | null>(null, ROOT_SLOT);
	useInsertionEffect(
		() => () => {
			root.current?.unmount();
			root.current = null;
		},
		[],
		LIFETIME_SLOT,
	);
	useLayoutEffect(
		() => {
			if (host.current === null) throw new Error('The authoring control host did not attach.');
			root.current ??= createRoot(host.current);
			root.current.render(element);
		},
		null,
		PUBLISH_SLOT,
	);
	return createElement('div', { ref: host, 'data-react-authoring-control': '' });
}

export const ReactCompat = descriptorChildren(ReactCompatImpl);
