// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Text.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` component uses the S()/subSlot component-slot convention; React's
// HTMLAttributes prop bag → a structural record.
import { createContext, createElement } from 'octane';

import { S, subSlot } from '../internal';
import { type ContextValue, dom, type DOMRenderProps, useContextProps } from './utils';

// octane adaptation: structural prop bag (upstream extends React's HTMLAttributes).
type HTMLAttributes = Record<string, any>;

export interface TextProps extends HTMLAttributes, DOMRenderProps<any, any> {
	elementType?: string;
}

export const TextContext = createContext<ContextValue<TextProps, HTMLElement>>({});

export function Text(props: TextProps): any {
	const slot = S('Text');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, TextContext, subSlot(slot, 'ctx'));
	let { elementType = 'span', ...domProps } = props;
	let ElementType = dom[elementType];
	return createElement(ElementType, { className: 'react-aria-Text', ...domProps, ref });
}
