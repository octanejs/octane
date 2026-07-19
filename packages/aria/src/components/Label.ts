// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Label.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// arrives positionally from `createHideableComponent` (which forwards `props.ref`); the
// plain-`.ts` component uses the S()/subSlot component-slot convention; React's
// LabelHTMLAttributes prop bag → a structural record.
import { createContext, createElement } from 'octane';

import { createHideableComponent } from '../collections/Hidden';
import { S, subSlot } from '../internal';
import { type ContextValue, dom, type DOMRenderProps, useContextProps } from './utils';

// octane adaptation: structural prop bag (upstream extends React's LabelHTMLAttributes).
type LabelHTMLAttributes = Record<string, any>;

export interface LabelProps extends LabelHTMLAttributes, DOMRenderProps<'label', undefined> {
	elementType?: string;
}

export const LabelContext = createContext<ContextValue<LabelProps, HTMLLabelElement>>({});

export const Label = /*#__PURE__*/ createHideableComponent(function Label(
	props: LabelProps,
	ref: any,
) {
	const slot = S('Label');
	[props, ref] = useContextProps(props, ref, LabelContext, subSlot(slot, 'ctx'));
	let { elementType = 'label', ...labelProps } = props;
	let ElementType = dom[elementType];
	return createElement(ElementType, { className: 'react-aria-Label', ...labelProps, ref });
});
