import type { ClientUnhead } from 'unhead/client';
import type { CreateClientHeadOptions, Unhead } from 'unhead/types';
import type { OctaneNode } from 'octane';
import type { UniversalUnheadProviderProps } from './context';
import { createElement, useRef } from 'octane';
import {
	createHead as createClientHead,
	createDebouncedFn,
	createDomRenderer,
} from 'unhead/client';
import { UnheadContext } from './context';
import { subSlot } from './internal';

export { renderDOMHead } from 'unhead/client';

export function createHead(options: CreateClientHeadOptions = {}): ClientUnhead {
	const domRenderer = createDomRenderer();
	let head: ClientUnhead;
	const debouncedRenderer = createDebouncedFn(
		function render() {
			return domRenderer(head);
		},
		function schedule(fn) {
			return setTimeout(fn, 0);
		},
	);
	head = createClientHead({ render: debouncedRenderer, ...options });
	return head;
}

interface LegacyUnheadProviderProps {
	children?: OctaneNode;
	value?: never;
	/**
	 * @deprecated Use `value` for a consistent provider API across client and server entries.
	 */
	head?: Unhead;
}

export type UnheadProviderProps =
	(UniversalUnheadProviderProps & { head?: never }) | LegacyUnheadProviderProps;

export function UnheadProvider(props: UnheadProviderProps): OctaneNode {
	const children = props.children;
	const value = 'value' in props ? props.value : undefined;
	const head = 'head' in props ? props.head : undefined;
	const headRef = useRef<Unhead | null>(null, subSlot(undefined, 'provider:head'));
	if (value !== undefined && head !== undefined) {
		throw new TypeError('UnheadProvider received both value and head props');
	}

	const suppliedHead = value ?? head;
	if (suppliedHead === undefined && headRef.current === null) {
		headRef.current = createHead();
	}
	return createElement(
		UnheadContext.Provider,
		{ value: suppliedHead ?? headRef.current },
		children,
	);
}

export type { CreateClientHeadOptions, Unhead };
