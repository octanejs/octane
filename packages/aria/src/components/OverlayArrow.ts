// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/OverlayArrow.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` component uses the S()/subSlot component-slot convention; React's
// HTMLAttributes prop bag → a structural record; `filterDOMProps` / `PlacementAxis` come from
// the binding's ported react-aria modules.
import type { DOMProps as SharedDOMProps } from '@react-types/shared';
import { createContext, createElement } from 'octane';

import { S, subSlot } from '../internal';
import type { PlacementAxis } from '../overlays/useOverlayPosition';
import { filterDOMProps } from '../utils/filterDOMProps';
import {
	type ClassNameOrFunction,
	type ContextValue,
	type CSSProperties,
	dom,
	type RenderProps,
	type SlotProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptation: structural prop bag (upstream extends React's HTMLAttributes).
type HTMLAttributes = Record<string, any>;

// octane adaptation: SlotProps is explicit here — upstream inherits `slot` through React's
// HTMLAttributes, which the structural record alias cannot surface as a declared property.
interface OverlayArrowContextValue extends OverlayArrowProps, SlotProps {
	placement: PlacementAxis | null;
}

export const OverlayArrowContext = createContext<
	ContextValue<OverlayArrowContextValue, HTMLDivElement>
>({
	placement: 'bottom',
});

export interface OverlayArrowProps
	extends
		Omit<HTMLAttributes, 'className' | 'style' | 'render' | 'children'>,
		RenderProps<OverlayArrowRenderProps>,
		SharedDOMProps {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-OverlayArrow'
	 */
	className?: ClassNameOrFunction<OverlayArrowRenderProps>;
}

export interface OverlayArrowRenderProps {
	/**
	 * The placement of the overlay relative to the trigger.
	 *
	 * @selector [data-placement="left | right | top | bottom"]
	 */
	placement: PlacementAxis | null;
}

/**
 * An OverlayArrow renders a custom arrow element relative to an overlay element
 * such as a popover or tooltip such that it aligns with a trigger element.
 */
export function OverlayArrow(props: OverlayArrowProps): any {
	const slot = S('OverlayArrow');
	let ref: any;
	// octane adaptation: explicit type args — the context value type has a REQUIRED
	// `placement`, which defeats inference against the ContextValue union.
	[props, ref] = useContextProps<OverlayArrowProps, OverlayArrowContextValue, HTMLDivElement>(
		props,
		props.ref,
		OverlayArrowContext,
		subSlot(slot, 'ctx'),
	);
	let placement = (props as OverlayArrowContextValue).placement;
	let style: CSSProperties = {
		position: 'absolute',
		transform:
			placement === 'top' || placement === 'bottom' ? 'translateX(-50%)' : 'translateY(-50%)',
	};
	if (placement != null) {
		style[placement] = '100%';
	}

	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-OverlayArrow',
			values: {
				placement,
			},
		},
		subSlot(slot, 'renderProps'),
	);
	// remove undefined values from renderProps.style object so that it can be
	// spread merged with the other style object
	if (renderProps.style) {
		Object.keys(renderProps.style).forEach(
			(key) => renderProps.style![key] === undefined && delete renderProps.style![key],
		);
	}

	let DOMProps = filterDOMProps(props);

	return createElement(dom.div, {
		...DOMProps,
		...renderProps,
		style: {
			...style,
			...renderProps.style,
		},
		ref,
		'data-placement': placement,
	});
}
