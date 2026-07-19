// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Breadcrumbs.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` components use the S()/subSlot component-slot convention. The collection
// composes the Phase-4 engine: `CollectionBuilder`/`createLeafComponent` from `../collections/
// CollectionBuilder`, the renderer's `CollectionRoot` via `CollectionRendererContext`.
// Upstream's RAC-local `CollectionProps` import is our `ItemCollectionProps` (see
// ./Collection.ts). Upstream recreates `useBreadcrumbItem` inline (composition instead of a
// built-in link) — kept verbatim, feeding `LinkContext`.
import type { AriaLabelingProps, Key, Node } from '@react-types/shared';
import { createContext, createElement, useContext } from 'octane';

import { type AriaBreadcrumbsProps, useBreadcrumbs } from '../breadcrumbs/useBreadcrumbs';
import { CollectionNode } from '../collections/BaseCollection';
import { CollectionBuilder, createLeafComponent } from '../collections/CollectionBuilder';
import { S, subSlot } from '../internal';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { Collection, CollectionRendererContext, type ItemCollectionProps } from './Collection';
import { LinkContext } from './Link';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	type DOMRenderProps,
	type RenderProps,
	type SlotProps,
	type StyleProps,
	useContextProps,
	useRenderProps,
	useSlottedContext,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;

export interface BreadcrumbsProps<T>
	extends
		Omit<ItemCollectionProps<T>, 'disabledKeys'>,
		AriaBreadcrumbsProps,
		StyleProps,
		SlotProps,
		AriaLabelingProps,
		DOMRenderProps<'ol', undefined>,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-Breadcrumbs'
	 */
	className?: string;
	/** Whether the breadcrumbs are disabled. */
	isDisabled?: boolean;
	/** Handler that is called when a breadcrumb is clicked. */
	onAction?: (key: Key) => void;
}

export const BreadcrumbsContext =
	createContext<ContextValue<BreadcrumbsProps<any>, HTMLOListElement>>(null);

/**
 * Breadcrumbs display a hierarchy of links to the current page or resource in an application.
 */
export function Breadcrumbs<T extends object>(props: BreadcrumbsProps<T>): any {
	const slot = S('Breadcrumbs');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, BreadcrumbsContext, subSlot(slot, 'ctx'));
	let { CollectionRoot } = useContext(CollectionRendererContext);
	let { navProps } = useBreadcrumbs(props, subSlot(slot, 'breadcrumbs'));
	let DOMProps = filterDOMProps(props, { global: true, labelable: true });

	return createElement(CollectionBuilder, {
		content: createElement(Collection, props as any),
		children: (collection: any) =>
			createElement(dom.ol, {
				render: props.render,
				ref,
				...mergeProps(DOMProps, navProps),
				slot: props.slot || undefined,
				style: props.style,
				className: props.className ?? 'react-aria-Breadcrumbs',
				children: createElement(BreadcrumbsContext.Provider, {
					value: props,
					children: createElement(CollectionRoot, { collection }),
				}),
			}),
	});
}

export interface BreadcrumbRenderProps {
	/**
	 * Whether the breadcrumb is for the current page.
	 *
	 * @selector [data-current]
	 */
	isCurrent: boolean;
	/**
	 * Whether the breadcrumb is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
}

export interface BreadcrumbProps
	extends RenderProps<BreadcrumbRenderProps, 'li'>, AriaLabelingProps, GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Breadcrumb'
	 */
	className?: ClassNameOrFunction<BreadcrumbRenderProps>;
	/**
	 * A unique id for the breadcrumb, which will be passed to `onAction` when the breadcrumb is
	 * pressed.
	 */
	id?: Key;
}

class BreadcrumbNode extends CollectionNode<unknown> {
	static readonly type = 'item';
}

/**
 * A Breadcrumb represents an individual item in a `<Breadcrumbs>` list.
 */
export const Breadcrumb: (props: BreadcrumbProps & { ref?: any }) => any = createLeafComponent(
	BreadcrumbNode,
	// The third (node) parameter is declared so `render.length === 3` keeps the
	// engine's "cannot be rendered outside a collection" guard; it is always
	// provided when rendered from a collection node.
	function Breadcrumb(props: BreadcrumbProps, ref: any, node?: Node<unknown>): any {
		const slot = S('Breadcrumb');
		// Recreating useBreadcrumbItem because we want to use composition instead of having the link builtin.
		let isCurrent = node!.nextKey == null;
		let { isDisabled, onAction } = useSlottedContext(BreadcrumbsContext)!;
		let linkProps = {
			'aria-current': isCurrent ? 'page' : null,
			isDisabled: isDisabled || isCurrent,
			onPress: () => onAction?.(node!.key),
		};

		let renderProps = useRenderProps(
			{
				...node!.props,
				children: node!.rendered,
				values: { isDisabled: isDisabled || isCurrent, isCurrent },
				defaultClassName: 'react-aria-Breadcrumb',
			} as any,
			subSlot(slot, 'render'),
		);

		let DOMProps = filterDOMProps(props as any, { global: true, labelable: true });
		delete DOMProps.id;

		return createElement(dom.li, {
			...DOMProps,
			...renderProps,
			ref,
			'data-disabled': isDisabled || isCurrent || undefined,
			'data-current': isCurrent || undefined,
			children: createElement(LinkContext.Provider, {
				value: linkProps as any,
				children: renderProps.children,
			}),
		});
	},
);
