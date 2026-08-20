import type { OverlayScrollbars, EventListeners, PartialOptions } from 'overlayscrollbars';
import { createElement, useEffect, useImperativeHandle, useRef } from 'octane';
import type { OctaneNode } from 'octane';
import { useOverlayScrollbars } from './useOverlayScrollbars.ts';
import { subSlot } from './internal.ts';

const COMPONENT_SLOT = Symbol.for('@octanejs/overlayscrollbars:component');

export type OverlayScrollbarsComponentProps = {
	element?: string;
	options?: PartialOptions | false | null;
	events?: EventListeners | false | null;
	defer?: boolean | IdleRequestOptions;
	children?: OctaneNode;
	ref?:
		| OverlayScrollbarsComponentRef
		| { current: OverlayScrollbarsComponentRef | null }
		| ((value: OverlayScrollbarsComponentRef | null) => void)
		| null;
	class?: string;
	className?: string;
	style?: Record<string, string | number> | string;
	[key: string]: unknown;
};

export interface OverlayScrollbarsComponentRef {
	/** Returns the OverlayScrollbars instance or null if not initialized. */
	osInstance(): OverlayScrollbars | null;
	/** Returns the root element. */
	getElement(): HTMLElement | null;
}

export function OverlayScrollbarsComponent(props: OverlayScrollbarsComponentProps) {
	const element = (props.element as string | undefined) || 'div';
	const options = props.options as OverlayScrollbarsComponentProps['options'];
	const events = props.events as OverlayScrollbarsComponentProps['events'];
	const defer = props.defer as OverlayScrollbarsComponentProps['defer'];
	const children = props.children;
	const ref = props.ref as OverlayScrollbarsComponentProps['ref'];
	const rest: Record<string, unknown> = {};
	for (const key in props) {
		if (
			key === 'element' ||
			key === 'options' ||
			key === 'events' ||
			key === 'defer' ||
			key === 'children' ||
			key === 'ref'
		) {
			continue;
		}
		rest[key] = props[key];
	}

	const elementRef = useRef<HTMLElement | null>(null, subSlot(COMPONENT_SLOT, 'element'));
	const childrenRef = useRef<HTMLDivElement | null>(null, subSlot(COMPONENT_SLOT, 'contents'));
	const [initialize, osInstance] = useOverlayScrollbars(
		{ options, events, defer },
		subSlot(COMPONENT_SLOT, 'hook'),
	);

	useEffect(
		function mountOs() {
			const elm = elementRef.current;
			const contentsElm = childrenRef.current;
			if (!elm) {
				return undefined;
			}

			const target = elm;
			initialize(
				element === 'body'
					? {
							target,
							cancel: {
								body: null,
							},
						}
					: {
							target,
							elements: {
								viewport: contentsElm,
								content: contentsElm,
							},
						},
			);

			return function destroyOs() {
				const instance = osInstance();
				if (instance) {
					instance.destroy();
				}
			};
		},
		[initialize, element],
		subSlot(COMPONENT_SLOT, 'mount'),
	);

	useImperativeHandle(
		ref as
			| { current: OverlayScrollbarsComponentRef | null }
			| ((value: OverlayScrollbarsComponentRef | null) => void)
			| null
			| undefined,
		function getHandle() {
			return {
				osInstance,
				getElement: function getElement() {
					return elementRef.current;
				},
			};
		},
		[],
		subSlot(COMPONENT_SLOT, 'handle'),
	);

	const contents =
		element === 'body'
			? children
			: createElement(
					'div',
					{
						'data-overlayscrollbars-contents': '',
						ref: childrenRef,
					},
					children,
				);

	return createElement(
		element,
		Object.assign(
			{
				'data-overlayscrollbars-initialize': '',
				ref: elementRef,
			},
			rest,
		),
		contents,
	);
}
