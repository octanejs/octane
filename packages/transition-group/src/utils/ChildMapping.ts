import {
	Children,
	cloneElement,
	isValidElement,
	type ElementDescriptor,
	type OctaneNode,
} from 'octane';
import type { TransitionGroupProps } from '../types.ts';

export type ChildMapping = Record<string, ElementDescriptor>;

export function getChildMapping(
	children: OctaneNode,
	mapFn?: (child: ElementDescriptor) => ElementDescriptor,
): ChildMapping {
	const result = Object.create(null) as ChildMapping;
	for (const child of Children.toArray(children)) {
		if (!isValidElement(child)) continue;
		const mapped = mapFn ? mapFn(child) : child;
		result[String(mapped.key)] = mapped;
	}
	return result;
}

export function mergeChildMappings(prev: ChildMapping = {}, next: ChildMapping = {}): ChildMapping {
	const getValue = (key: string) => (key in next ? next[key] : prev[key]);
	const pendingBefore: Record<string, string[]> = Object.create(null);
	let pending: string[] = [];
	for (const key of Object.keys(prev)) {
		if (key in next) {
			if (pending.length) {
				pendingBefore[key] = pending;
				pending = [];
			}
		} else pending.push(key);
	}
	const merged: ChildMapping = {};
	for (const key of Object.keys(next)) {
		for (const waiting of pendingBefore[key] ?? []) merged[waiting] = getValue(waiting);
		merged[key] = getValue(key);
	}
	for (const key of pending) merged[key] = getValue(key);
	return merged;
}

function inherited(
	child: ElementDescriptor,
	name: 'appear' | 'enter' | 'exit',
	props: TransitionGroupProps,
) {
	return props[name] == null ? child.props[name] : props[name];
}

export function getInitialChildMapping(
	props: TransitionGroupProps,
	onExited: (child: ElementDescriptor, node?: Element) => void,
) {
	return getChildMapping(props.children, (child) =>
		cloneElement(child, {
			appear: inherited(child, 'appear', props),
			enter: inherited(child, 'enter', props),
			exit: inherited(child, 'exit', props),
			in: true,
			onExited: (node?: Element) => onExited(child, node),
		}),
	);
}

export function getNextChildMapping(
	nextProps: TransitionGroupProps,
	previous: ChildMapping,
	onExited: (child: ElementDescriptor, node?: Element) => void,
) {
	const next = getChildMapping(nextProps.children);
	const children = mergeChildMappings(previous, next);
	for (const key of Object.keys(children)) {
		const child = children[key];
		const hasPrevious = key in previous;
		const hasNext = key in next;
		const previousChild = previous[key];
		const isLeaving = isValidElement(previousChild) && previousChild.props.in === false;
		if (hasNext && (!hasPrevious || isLeaving)) {
			children[key] = cloneElement(child, {
				enter: inherited(child, 'enter', nextProps),
				exit: inherited(child, 'exit', nextProps),
				in: true,
				onExited: (node?: Element) => onExited(child, node),
			});
		} else if (!hasNext && hasPrevious && !isLeaving) {
			// Apply the group's current exit/enter flags when a child begins
			// leaving so switching TransitionGroup.exit from false → true keeps
			// the outgoing node for the exit transition (upstream only sets
			// `in: false`, which leaves a stale exit=false from the prior enter).
			// Do not rebind onExited: the enter-time handleExited wrapper must
			// remain so TransitionGroup.handleExited can forward to the user's
			// original callback instead of calling itself again.
			children[key] = cloneElement(child, {
				in: false,
				enter: inherited(child, 'enter', nextProps),
				exit: inherited(child, 'exit', nextProps),
			});
		} else if (hasNext && hasPrevious && isValidElement(previousChild)) {
			children[key] = cloneElement(child, {
				enter: inherited(child, 'enter', nextProps),
				exit: inherited(child, 'exit', nextProps),
				in: previousChild.props.in,
				onExited: (node?: Element) => onExited(child, node),
			});
		}
	}
	return children;
}
