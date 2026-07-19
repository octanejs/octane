// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Toolbar.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` component uses the S()/subSlot component-slot convention.
import type { Orientation } from '@react-types/shared';
import { createContext, createElement } from 'octane';

import { S, subSlot } from '../internal';
import { type AriaToolbarProps, useToolbar } from '../toolbar/useToolbar';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	type RenderProps,
	type SlotProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;

export interface ToolbarRenderProps {
	/**
	 * The current orientation of the toolbar.
	 *
	 * @selector [data-orientation]
	 */
	orientation: Orientation;
}

export interface ToolbarProps
	extends AriaToolbarProps, SlotProps, RenderProps<ToolbarRenderProps>, GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Toolbar'
	 */
	className?: ClassNameOrFunction<ToolbarRenderProps>;
}

export const ToolbarContext = createContext<ContextValue<ToolbarProps, HTMLDivElement>>({});

/**
 * A toolbar is a container for a set of interactive controls, such as buttons, dropdown menus, or
 * checkboxes, with arrow key navigation.
 */
export function Toolbar(props: ToolbarProps): any {
	const slot = S('Toolbar');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, ToolbarContext, subSlot(slot, 'ctx'));
	let { toolbarProps } = useToolbar(props, ref, subSlot(slot, 'toolbar'));
	let renderProps = useRenderProps(
		{
			...props,
			values: { orientation: props.orientation || 'horizontal' },
			defaultClassName: 'react-aria-Toolbar',
		},
		subSlot(slot, 'render'),
	);
	let DOMProps = filterDOMProps(props, { global: true });
	delete DOMProps.id;

	return createElement(dom.div, {
		...mergeProps(DOMProps, renderProps, toolbarProps),
		ref,
		slot: props.slot || undefined,
		'data-orientation': props.orientation || 'horizontal',
		children: renderProps.children,
	});
}
