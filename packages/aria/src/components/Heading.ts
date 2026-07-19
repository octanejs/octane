// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Heading.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` component uses the S()/subSlot component-slot convention; React's
// HTMLAttributes prop bag → a structural record.
import { createContext, createElement } from 'octane';

import { S, subSlot } from '../internal';
import { type ContextValue, dom, type DOMRenderProps, useContextProps } from './utils';

// octane adaptation: structural prop bag (upstream extends React's HTMLAttributes).
type HTMLAttributes = Record<string, any>;

export interface HeadingProps extends HTMLAttributes, DOMRenderProps<'h1', undefined> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-Heading'
	 */
	className?: string;
	/**
	 * The heading level.
	 *
	 * @default 3
	 */
	level?: number;
}

export const HeadingContext = createContext<ContextValue<HeadingProps, HTMLHeadingElement>>({});

export function Heading(props: HeadingProps): any {
	const slot = S('Heading');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, HeadingContext, subSlot(slot, 'ctx'));
	let { children, level = 3, className, ...domProps } = props;
	let Element = dom[`h${level}`];

	return createElement(Element, {
		...domProps,
		ref,
		className: className ?? 'react-aria-Heading',
		children,
	});
}
