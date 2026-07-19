// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Disclosure.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref` (Disclosure passes it into `useContextProps` explicitly; DisclosureGroup and
// DisclosurePanel read it directly, DisclosurePanel merging it with the internal panel ref via
// the binding's `mergeRefs`); the plain-`.ts` components use the S()/subSlot component-slot
// convention. NOTE: `DOMProps` here is `@react-types/shared`'s (upstream imports it from
// there in this module), NOT the RAC utils bag. Upstream's `GlobalDOMAttributes` and React's
// `DOMAttributes` → structural records.
import type { DOMProps, Key } from '@react-types/shared';
import { createContext, createElement, useContext, useRef } from 'octane';

import { type AriaDisclosureProps, useDisclosure } from '../disclosure/useDisclosure';
import { useFocusRing } from '../focus/useFocusRing';
import { S, subSlot } from '../internal';
import type { LabelAriaProps } from '../label/useLabel';
import {
	type DisclosureGroupState,
	type DisclosureGroupProps as StatelyDisclosureGroupProps,
	useDisclosureGroupState,
} from '../stately/disclosure/useDisclosureGroupState';
import { type DisclosureState, useDisclosureState } from '../stately/disclosure/useDisclosureState';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { mergeRefs } from '../utils/mergeRefs';
import { useId } from '../utils/useId';
import { ButtonContext } from './Button';
import {
	type ClassNameOrFunction,
	type ContextValue,
	DEFAULT_SLOT,
	dom,
	Provider,
	type RenderProps,
	type SlotProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptations: structural bags (upstream's React attribute/handler types).
type GlobalDOMAttributes = Record<string, any>;
type DOMAttributes = Record<string, any>;
type ReactNode = any;

export interface DisclosureGroupProps
	extends
		StatelyDisclosureGroupProps,
		RenderProps<DisclosureGroupRenderProps>,
		DOMProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-DisclosureGroup'
	 */
	className?: ClassNameOrFunction<DisclosureGroupRenderProps>;
}

export interface DisclosureGroupRenderProps {
	/**
	 * Whether the disclosure group is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * State of the disclosure group.
	 */
	state: DisclosureGroupState;
}

export const DisclosureGroupStateContext = createContext<DisclosureGroupState | null>(null);

/**
 * A DisclosureGroup is a grouping of related disclosures, sometimes called an accordion.
 * It supports both single and multiple expanded items.
 */
export function DisclosureGroup(props: DisclosureGroupProps): any {
	const slot = S('DisclosureGroup');
	let ref = (props as any).ref;
	let state = useDisclosureGroupState(props, subSlot(slot, 'state'));

	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-DisclosureGroup',
			values: {
				isDisabled: state.isDisabled,
				state,
			},
		},
		subSlot(slot, 'render'),
	);

	let domProps = filterDOMProps(props, { global: true });

	return createElement(dom.div, {
		...domProps,
		...renderProps,
		ref,
		'data-disabled': props.isDisabled || undefined,
		children: createElement(DisclosureGroupStateContext.Provider, {
			value: state,
			children: renderProps.children,
		}),
	});
}

export interface DisclosureProps
	extends
		Omit<AriaDisclosureProps, 'children'>,
		RenderProps<DisclosureRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Disclosure'
	 */
	className?: ClassNameOrFunction<DisclosureRenderProps>;
	/**
	 * An id for the disclosure when used within a DisclosureGroup, matching the id used in
	 * `expandedKeys`.
	 */
	id?: Key;
}

export interface DisclosureRenderProps {
	/**
	 * Whether the disclosure is expanded.
	 *
	 * @selector [data-expanded]
	 */
	isExpanded: boolean;
	/**
	 * Whether the disclosure has keyboard focus.
	 *
	 * @selector [data-focus-visible-within]
	 */
	isFocusVisibleWithin: boolean;
	/**
	 * Whether the disclosure is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * State of the disclosure.
	 */
	state: DisclosureState;
}

export const DisclosureContext = createContext<ContextValue<DisclosureProps, HTMLDivElement>>(null);
export const DisclosureStateContext = createContext<DisclosureState | null>(null);

interface InternalDisclosureContextValue {
	panelProps: DOMAttributes;
	panelRef: { current: HTMLDivElement | null };
}

const InternalDisclosureContext = createContext<InternalDisclosureContextValue | null>(null);

/**
 * A disclosure is a collapsible section of content. It is composed of a a header with a heading and
 * trigger button, and a panel that contains the content.
 */
export function Disclosure(props: DisclosureProps): any {
	const slot = S('Disclosure');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, DisclosureContext, subSlot(slot, 'ctx'));
	let groupState = useContext(DisclosureGroupStateContext)!;
	let { id, ...otherProps } = props;

	// Generate an id if one wasn't provided.
	// (can't pass id into useId since it can also be a number)
	let defaultId = useId(subSlot(slot, 'defaultId'));
	id ||= defaultId;

	let isExpanded = groupState ? groupState.expandedKeys.has(id) : props.isExpanded;
	let state = useDisclosureState(
		{
			...props,
			isExpanded,
			onExpandedChange(isExpanded) {
				if (groupState) {
					groupState.toggleKey(id);
				}

				props.onExpandedChange?.(isExpanded);
			},
		},
		subSlot(slot, 'state'),
	);

	let panelRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'panelRef'));
	let isDisabled = props.isDisabled || groupState?.isDisabled || false;
	let { buttonProps, panelProps } = useDisclosure(
		{
			...props,
			isExpanded,
			isDisabled,
		},
		state,
		panelRef,
		subSlot(slot, 'disclosure'),
	);
	let { isFocusVisible: isFocusVisibleWithin, focusProps: focusWithinProps } = useFocusRing(
		{
			within: true,
		},
		subSlot(slot, 'focusRing'),
	);

	let renderProps = useRenderProps(
		{
			...props,
			id: undefined,
			defaultClassName: 'react-aria-Disclosure',
			values: {
				isExpanded: state.isExpanded,
				isDisabled,
				isFocusVisibleWithin,
				state,
			},
		},
		subSlot(slot, 'render'),
	);

	let domProps = filterDOMProps(otherProps, { global: true });

	return createElement(Provider, {
		values: [
			[
				ButtonContext,
				{
					slots: {
						[DEFAULT_SLOT]: {},
						trigger: buttonProps,
					},
				},
			],
			[InternalDisclosureContext, { panelProps, panelRef }],
			[DisclosureStateContext, state],
		] as any,
		children: createElement(dom.div, {
			...mergeProps(domProps, renderProps, focusWithinProps),
			ref,
			'data-expanded': state.isExpanded || undefined,
			'data-disabled': isDisabled || undefined,
			'data-focus-visible-within': isFocusVisibleWithin || undefined,
			children: renderProps.children,
		}),
	});
}

export interface DisclosurePanelRenderProps {
	/**
	 * Whether keyboard focus is within the disclosure panel.
	 *
	 * @selector [data-focus-visible-within]
	 */
	isFocusVisibleWithin: boolean;
}

export interface DisclosurePanelProps
	extends RenderProps<DisclosurePanelRenderProps>, DOMProps, LabelAriaProps, GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-DisclosurePanel'
	 */
	className?: ClassNameOrFunction<DisclosurePanelRenderProps>;
	/**
	 * The accessibility role for the disclosure's panel.
	 *
	 * @default 'group'
	 */
	role?: 'group' | 'region';
	/**
	 * The children of the component.
	 */
	children: ReactNode;
}

/**
 * A DisclosurePanel provides the content for a disclosure.
 */
export function DisclosurePanel(props: DisclosurePanelProps): any {
	const slot = S('DisclosurePanel');
	let ref = (props as any).ref;
	let { role = 'group' } = props;
	let { panelProps, panelRef } = useContext(InternalDisclosureContext)!;
	let { isFocusVisible: isFocusVisibleWithin, focusProps: focusWithinProps } = useFocusRing(
		{
			within: true,
		},
		subSlot(slot, 'focusRing'),
	);
	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-DisclosurePanel',
			values: {
				isFocusVisibleWithin,
			},
		},
		subSlot(slot, 'render'),
	);
	let DOMProps = filterDOMProps(props, { global: true, labelable: true });
	return createElement(dom.div, {
		...mergeProps(DOMProps, renderProps, panelProps, focusWithinProps),
		ref: mergeRefs(ref, panelRef),
		role,
		'data-focus-visible-within': isFocusVisibleWithin || undefined,
		children: createElement(Provider, {
			values: [[ButtonContext, null]] as any,
			children: props.children,
		}),
	});
}
