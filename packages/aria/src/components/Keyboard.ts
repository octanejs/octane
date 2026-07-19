// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Keyboard.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` component uses the S()/subSlot component-slot convention; React's
// HTMLAttributes prop bag → a structural record.
import { createContext, createElement } from 'octane';

import { S, subSlot } from '../internal';
import { type ContextValue, dom, type DOMRenderProps, useContextProps } from './utils';

// octane adaptation: structural prop bag (upstream extends React's HTMLAttributes).
type HTMLAttributes = Record<string, any>;

export interface KeyboardProps extends HTMLAttributes, DOMRenderProps<'kbd', undefined> {}

export const KeyboardContext = createContext<ContextValue<KeyboardProps, HTMLElement>>({});

export function Keyboard(props: KeyboardProps): any {
	const slot = S('Keyboard');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, KeyboardContext, subSlot(slot, 'ctx'));
	return createElement(dom.kbd, { dir: 'ltr', ...props, ref });
}
