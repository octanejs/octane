// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Separator.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// arrives positionally from `createLeafComponent` (which forwards `props.ref`); the
// plain-`.ts` component uses the S()/subSlot component-slot convention; the collection engine
// classes come from the binding's `../collections/BaseCollection` port.
import { createContext, createElement } from 'octane';

import { BaseCollection, CollectionNode } from '../collections/BaseCollection';
import { createLeafComponent } from '../collections/CollectionBuilder';
import { S, subSlot } from '../internal';
import { type SeparatorProps as AriaSeparatorProps, useSeparator } from '../separator/useSeparator';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import {
	type ContextValue,
	dom,
	type DOMRenderProps,
	type SlotProps,
	type StyleProps,
	useContextProps,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;

export interface SeparatorProps
	extends
		AriaSeparatorProps,
		StyleProps,
		SlotProps,
		DOMRenderProps<'hr' | 'div', undefined>,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-Separator'
	 */
	className?: string;
}

export const SeparatorContext = createContext<ContextValue<SeparatorProps, HTMLElement>>({});

export class SeparatorNode extends CollectionNode<any> {
	static readonly type = 'separator';

	filter(
		collection: BaseCollection<any>,
		newCollection: BaseCollection<any>,
	): CollectionNode<any> | null {
		let prevItem = newCollection.getItem(this.prevKey!);
		if (prevItem && prevItem.type !== 'separator') {
			let clone = this.clone();
			newCollection.addDescendants(clone, collection);
			return clone;
		}

		return null;
	}
}

/**
 * A separator is a visual divider between two groups of content, e.g. groups of menu items or
 * sections of a page.
 */
export const Separator = /*#__PURE__*/ createLeafComponent(
	SeparatorNode,
	function Separator(props: SeparatorProps, ref: any) {
		const slot = S('Separator');
		[props, ref] = useContextProps(props, ref, SeparatorContext, subSlot(slot, 'ctx'));

		let { elementType, orientation, style, className, slot: slotProp, ...otherProps } = props;
		let Element = elementType || 'hr';
		if (Element === 'hr' && orientation === 'vertical') {
			Element = 'div';
		}

		let ElementType = dom[Element];

		let { separatorProps } = useSeparator({
			...otherProps,
			elementType,
			orientation,
		});

		let DOMProps = filterDOMProps(props, { global: true });

		return createElement(ElementType, {
			render: props.render,
			...mergeProps(DOMProps, separatorProps),
			style,
			className: className ?? 'react-aria-Separator',
			ref,
			slot: slotProp || undefined,
		});
	},
);
