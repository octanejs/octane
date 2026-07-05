// Ported from .base-ui/packages/react/src/internals/composite/root/CompositeRoot.tsx.
// Wraps a composite in the roving-focus engine (useCompositeRoot) + the item registry
// (CompositeList), and provides CompositeRootContext to the items.
import { createElement, useMemo } from 'octane';

import { S, subSlot } from '../../internal';
import { useRenderElement } from '../useRenderElement';
import type { StateAttributesMapping } from '../getStateAttributesProps';
import { useDirection } from '../DirectionContext';
import { CompositeRootContext } from '../CompositeRootContext';
import { CompositeList, type CompositeMetadata } from './CompositeList';
import { useCompositeRoot } from './useCompositeRoot';
import type { ModifierKey } from './keys';

const EMPTY_ARRAY: never[] = [];
const EMPTY_OBJECT: Record<string, never> = {};

export interface CompositeRootProps<Metadata, State extends Record<string, any>> {
	render?: any;
	className?: any;
	style?: any;
	refs?: any[];
	props?: Array<Record<string, any> | (() => Record<string, any>)>;
	state?: State;
	stateAttributesMapping?: StateAttributesMapping<State>;
	highlightedIndex?: number;
	onHighlightedIndexChange?: (index: number) => void;
	orientation?: 'horizontal' | 'vertical' | 'both';
	grid?: ((params: any) => number) | undefined;
	loopFocus?: boolean;
	onLoop?: any;
	enableHomeAndEndKeys?: boolean;
	onMapChange?: (newMap: Map<Element, CompositeMetadata<Metadata> | null>) => void;
	stopEventPropagation?: boolean;
	rootRef?: any;
	disabledIndices?: number[];
	modifierKeys?: ModifierKey[];
	highlightItemOnHover?: boolean;
	tag?: string;
	[key: string]: any;
}

export function CompositeRoot<Metadata extends {}, State extends Record<string, any>>(
	componentProps: CompositeRootProps<Metadata, State>,
): any {
	const slot = S('CompositeRoot');
	const {
		render,
		className,
		style,
		refs = EMPTY_ARRAY,
		props = EMPTY_ARRAY,
		state = EMPTY_OBJECT as State,
		stateAttributesMapping,
		highlightedIndex: highlightedIndexProp,
		onHighlightedIndexChange: onHighlightedIndexChangeProp,
		orientation,
		grid,
		loopFocus,
		onLoop,
		enableHomeAndEndKeys,
		onMapChange: onMapChangeProp,
		stopEventPropagation = true,
		rootRef,
		disabledIndices,
		modifierKeys,
		highlightItemOnHover = false,
		tag = 'div',
		...elementProps
	} = componentProps;

	const direction = useDirection();

	const {
		props: defaultProps,
		highlightedIndex,
		onHighlightedIndexChange,
		elementsRef,
		onMapChange: onMapChangeUnwrapped,
		relayKeyboardEvent,
	} = useCompositeRoot(
		{
			grid,
			loopFocus,
			onLoop,
			orientation,
			highlightedIndex: highlightedIndexProp,
			onHighlightedIndexChange: onHighlightedIndexChangeProp,
			rootRef,
			stopEventPropagation,
			enableHomeAndEndKeys,
			direction,
			disabledIndices,
			modifierKeys,
		},
		subSlot(slot, 'root'),
	);

	const element = useRenderElement(
		tag,
		{ render, className, style },
		{
			state,
			ref: refs,
			props: [defaultProps, ...props, elementProps],
			stateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	const contextValue = useMemo(
		() => ({
			highlightedIndex,
			onHighlightedIndexChange,
			highlightItemOnHover,
			relayKeyboardEvent,
		}),
		[highlightedIndex, onHighlightedIndexChange, highlightItemOnHover, relayKeyboardEvent],
		subSlot(slot, 'ctx'),
	);

	const list = createElement(CompositeList, {
		elementsRef,
		onMapChange: (newMap: any) => {
			onMapChangeProp?.(newMap);
			onMapChangeUnwrapped(newMap);
		},
		children: element,
	});

	return createElement(CompositeRootContext.Provider, { value: contextValue, children: list });
}
