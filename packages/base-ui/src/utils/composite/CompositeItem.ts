// Ported from .base-ui/packages/react/src/internals/composite/item/CompositeItem.tsx.
// Renders a composite item, merging the roving-focus props (tabIndex/onFocus/onMouseMove)
// UNDER the caller's own props, and composing the caller's refs with the composite ref.
import { S, subSlot } from '../../internal';
import { useRenderElement } from '../useRenderElement';
import type { StateAttributesMapping } from '../getStateAttributesProps';
import { useCompositeItem } from './useCompositeItem';

const EMPTY_ARRAY: never[] = [];
const EMPTY_OBJECT: Record<string, never> = {};

export interface CompositeItemProps<Metadata, State extends Record<string, any>> {
	render?: any;
	className?: any;
	style?: any;
	children?: any;
	metadata?: Metadata;
	refs?: any[];
	props?: Array<Record<string, any> | (() => Record<string, any>)>;
	state?: State;
	stateAttributesMapping?: StateAttributesMapping<State>;
	tag?: string;
	[key: string]: any;
}

export function CompositeItem<Metadata, State extends Record<string, any>>(
	componentProps: CompositeItemProps<Metadata, State>,
): any {
	const slot = S('CompositeItem');
	const {
		render,
		className,
		style,
		state = EMPTY_OBJECT as State,
		props = EMPTY_ARRAY,
		refs = EMPTY_ARRAY,
		metadata,
		stateAttributesMapping,
		tag = 'div',
		...elementProps
	} = componentProps;

	const { compositeProps, compositeRef } = useCompositeItem({ metadata }, subSlot(slot, 'item'));

	return useRenderElement(
		tag,
		{ render, className, style },
		{
			state,
			ref: [...refs, compositeRef],
			props: [compositeProps, ...props, elementProps],
			stateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}
