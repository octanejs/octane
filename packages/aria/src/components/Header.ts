// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Header.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// arrives positionally from `createLeafComponent` (which forwards `props.ref`); the
// plain-`.ts` component uses the S()/subSlot component-slot convention; React's
// HTMLAttributes prop bag → a structural record.
import { createContext, createElement } from 'octane';

import { HeaderNode } from '../collections/BaseCollection';
import { createLeafComponent } from '../collections/CollectionBuilder';
import { S, subSlot } from '../internal';
import { type ContextValue, dom, type DOMRenderProps, useContextProps } from './utils';

// octane adaptation: structural prop bag (upstream extends React's HTMLAttributes).
type HTMLAttributes = Record<string, any>;

export interface HeaderProps extends HTMLAttributes, DOMRenderProps<'header', undefined> {}

export const HeaderContext = createContext<ContextValue<HeaderProps, HTMLElement>>({});

export const Header = /*#__PURE__*/ createLeafComponent(
	HeaderNode,
	function Header(props: HeaderProps, ref: any) {
		const slot = S('Header');
		[props, ref] = useContextProps(props, ref, HeaderContext, subSlot(slot, 'ctx'));
		return createElement(dom.header, {
			className: 'react-aria-Header',
			...props,
			ref,
			children: props.children,
		});
	},
);
