// Ported from .base-ui/packages/react/src/accordion/ (v1.6.0): root/AccordionRootContext,
// root/AccordionRoot, item/AccordionItemContext, item/stateAttributesMapping, item/AccordionItem,
// header/AccordionHeader, trigger/AccordionTrigger, panel/AccordionPanel,
// panel/AccordionPanelCssVars — plus its `index.parts` (the `Accordion` namespace).
//
// Accordion is a thin layer over Collapsible: each Item runs its own `useCollapsibleRoot` and
// PROVIDES `CollapsibleRootContext`, so Trigger and Panel reuse the collapsible open/transition
// machinery unchanged. Root only owns the value set and single-vs-multiple policy. Reading this
// file alongside `collapsible.ts` is the intended way to follow it.
//
// octane adaptations:
//   1. `forwardRef` → ref-as-prop; `useMergedRefs` becomes an array ref, which octane accepts.
//   2. `useIsoLayoutEffect` → `useLayoutEffect`, per the other ports in this package.
//   3. Events are native, so the handler receives the native event directly.
//   4. Every hook threads an explicit compiler slot (`S(...)` / `subSlot(...)`), because these
//      are plain `.ts` hooks rather than compiled `.tsrx` call sites.
//   5. This package's `useCollapsiblePanel` returns `panelRef` and takes no `externalRef`, so the
//      panel composes `ref: [ref, panelRef]` rather than passing a forwarded ref inward.
import {
	createContext,
	createElement,
	useContext,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { S, splitSlot, subSlot } from './internal';
import { useRenderElement } from './utils/useRenderElement';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { useBaseUiId } from './utils/useBaseUiId';
import { useButton } from './utils/useButton';
import { useControlled } from './utils/useControlled';
import { useStableCallback } from './utils/useStableCallback';
import { resolveStyle } from './utils/resolveStyle';
import { transitionStatusMapping } from './utils/useTransitionStatus';
import type { TransitionStatus } from './utils/useTransitionStatus';
import { CompositeList } from './utils/composite/CompositeList';
import { useCompositeListItem } from './utils/composite/useCompositeListItem';
import { useDirection } from './utils/DirectionContext';
import {
	collapsibleOpenStateMapping,
	collapsibleTriggerOpenStateMapping,
} from './utils/collapsibleOpenStateMapping';
import {
	CollapsibleRootContext,
	useCollapsibleRoot,
	useCollapsibleRootContext,
	useCollapsiblePanel,
} from './collapsible';
import type { CollapsibleRootContextValue, CollapsibleRootState } from './collapsible';

export type AccordionValue<Value = any> = Value[];
export type Orientation = 'horizontal' | 'vertical';

export interface AccordionRootState<Value = any> {
	value: AccordionValue<Value>;
	disabled: boolean;
	/** @deprecated no longer affects keyboard focus behavior, per the APG guidance update. */
	orientation: Orientation;
}

export interface AccordionItemState extends AccordionRootState {
	hidden: boolean;
	index: number;
	open: boolean;
}

export interface AccordionPanelState extends AccordionItemState {
	transitionStatus: TransitionStatus;
}

// `value` maps to null because the open set is not a serializable attribute — it would otherwise
// stringify the whole array onto the element.
const rootStateAttributesMapping: StateAttributesMapping<AccordionRootState> = {
	value: () => null,
};

const accordionStateAttributesMapping: StateAttributesMapping<AccordionItemState> = {
	...(collapsibleOpenStateMapping as StateAttributesMapping<any>),
	index(value: number) {
		return Number.isInteger(value) ? { 'data-index': String(value) } : null;
	},
	...(transitionStatusMapping as StateAttributesMapping<any>),
	value: () => null,
};

const triggerStateAttributesMapping: StateAttributesMapping<AccordionItemState> = {
	...(collapsibleTriggerOpenStateMapping as StateAttributesMapping<any>),
};

export const AccordionPanelCssVars = {
	accordionPanelHeight: '--accordion-panel-height',
	accordionPanelWidth: '--accordion-panel-width',
} as const;

// --- Root context -------------------------------------------------------------

export interface AccordionRootContextValue<Value = any> {
	disabled: boolean;
	handleValueChange: (newValue: Value, nextOpen: boolean, eventDetails: any) => void;
	hiddenUntilFound: boolean;
	keepMounted: boolean;
	state: AccordionRootState<Value>;
	value: AccordionValue<Value>;
}

const AccordionRootContext = createContext<AccordionRootContextValue | undefined>(undefined);

export function useAccordionRootContext(): AccordionRootContextValue {
	const context = useContext(AccordionRootContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: AccordionRootContext is missing. Accordion parts must be placed within <Accordion.Root>.',
		);
	}
	return context;
}

// --- Item context -------------------------------------------------------------

export interface AccordionItemContextValue {
	open: boolean;
	state: AccordionItemState;
	setTriggerId: (id: string | undefined) => void;
	triggerId?: string | undefined;
}

const AccordionItemContext = createContext<AccordionItemContextValue | undefined>(undefined);

export function useAccordionItemContext(): AccordionItemContextValue {
	const context = useContext(AccordionItemContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: AccordionItemContext is missing. Accordion parts must be placed within <Accordion.Item>.',
		);
	}
	return context;
}

// --- Root ---------------------------------------------------------------------

function AccordionRoot(props: any): any {
	const slot = S('AccordionRoot');
	const {
		render,
		className,
		disabled = false,
		hiddenUntilFound: hiddenUntilFoundProp,
		keepMounted: keepMountedProp,
		loopFocus,
		onValueChange,
		multiple = false,
		orientation = 'vertical',
		value: valueProp,
		defaultValue: defaultValueProp,
		style,
		ref,
		...elementProps
	} = props;

	const direction = useDirection();

	useLayoutEffect(
		() => {
			if (hiddenUntilFoundProp && keepMountedProp === false) {
				console.warn(
					'Base UI: The `keepMounted={false}` prop on `Accordion.Root` is ignored when ' +
						'`hiddenUntilFound` is enabled, since panels must remain mounted while closed.',
				);
			}
		},
		[hiddenUntilFoundProp, keepMountedProp],
		subSlot(slot, 'warn'),
	);

	// Memoized so BOTH `defaultValue` and `value` may be omitted without `useControlled`
	// warning about a component switching between controlled and uncontrolled.
	const defaultValue = useMemo(
		() => {
			if (valueProp === undefined) {
				return defaultValueProp ?? [];
			}
			return undefined;
		},
		[valueProp, defaultValueProp],
		subSlot(slot, 'defaultValue'),
	);

	const accordionItemRefs = useRef<(HTMLElement | null)[]>([], subSlot(slot, 'itemRefs'));

	const [value, setValue] = useControlled<any[]>(
		{ controlled: valueProp, default: defaultValue, name: 'Accordion', state: 'value' },
		subSlot(slot, 'ctrl'),
	);

	const handleValueChange = useStableCallback(
		(newValue: any, nextOpen: boolean, details: any) => {
			if (!multiple) {
				const nextValue = value[0] === newValue ? [] : [newValue];
				onValueChange?.(nextValue, details);
				if (details.isCanceled) {
					return;
				}
				setValue(nextValue);
			} else if (nextOpen) {
				const nextOpenValues = value.slice();
				nextOpenValues.push(newValue);
				onValueChange?.(nextOpenValues, details);
				if (details.isCanceled) {
					return;
				}
				setValue(nextOpenValues);
			} else {
				const nextOpenValues = value.filter((v: any) => v !== newValue);
				onValueChange?.(nextOpenValues, details);
				if (details.isCanceled) {
					return;
				}
				setValue(nextOpenValues);
			}
		},
		subSlot(slot, 'valueChange'),
	);

	const state: AccordionRootState = useMemo(
		() => ({ value, disabled, orientation }),
		[value, disabled, orientation],
		subSlot(slot, 'state'),
	);

	const contextValue: AccordionRootContextValue = useMemo(
		() => ({
			disabled,
			handleValueChange,
			hiddenUntilFound: hiddenUntilFoundProp ?? false,
			keepMounted: keepMountedProp ?? false,
			state,
			value,
		}),
		[disabled, handleValueChange, hiddenUntilFoundProp, keepMountedProp, state, value],
		subSlot(slot, 'ctx'),
	);

	const element = useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref,
			props: [{ dir: direction }, elementProps],
			stateAttributesMapping: rootStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	return createElement(AccordionRootContext.Provider, {
		value: contextValue,
		children: createElement(CompositeList, {
			elementsRef: accordionItemRefs,
			children: element,
		}),
	});
}

// --- Item ---------------------------------------------------------------------

function AccordionItem(props: any): any {
	const slot = S('AccordionItem');
	const {
		className,
		disabled: disabledProp = false,
		onOpenChange: onOpenChangeProp,
		render,
		value: valueProp,
		style,
		ref,
		...elementProps
	} = props;

	const { ref: listItemRef, index } = useCompositeListItem(subSlot(slot, 'listItem'));

	const {
		disabled: contextDisabled,
		handleValueChange,
		state: rootState,
		value: openValues,
	} = useAccordionRootContext();

	const fallbackValue = useBaseUiId(undefined, subSlot(slot, 'fallbackValue'));
	const value = valueProp ?? fallbackValue;
	const disabled = disabledProp || contextDisabled;

	const isOpen = useMemo(
		() => {
			if (!openValues) {
				return false;
			}
			for (let i = 0; i < openValues.length; i += 1) {
				if (openValues[i] === value) {
					return true;
				}
			}
			return false;
		},
		[openValues, value],
		subSlot(slot, 'isOpen'),
	);

	const onOpenChange = useStableCallback(
		(nextOpen: boolean, eventDetails: any) => {
			onOpenChangeProp?.(nextOpen, eventDetails);

			if (eventDetails.isCanceled) {
				return;
			}

			handleValueChange(value, nextOpen, eventDetails);
		},
		subSlot(slot, 'onOpenChange'),
	);

	const collapsible = useCollapsibleRoot(
		{ open: isOpen, onOpenChange, disabled },
		subSlot(slot, 'collapsible'),
	);

	const collapsibleState: CollapsibleRootState = useMemo(
		() => ({
			open: collapsible.open,
			disabled: collapsible.disabled,
			transitionStatus: collapsible.transitionStatus,
		}),
		[collapsible.open, collapsible.disabled, collapsible.transitionStatus],
		subSlot(slot, 'collapsibleState'),
	);

	const collapsibleContext: CollapsibleRootContextValue = useMemo(
		() => ({ ...collapsible, onOpenChange, state: collapsibleState }),
		[collapsible, collapsibleState, onOpenChange],
		subSlot(slot, 'collapsibleCtx'),
	);

	const state: AccordionItemState = useMemo(
		() => ({
			...rootState,
			hidden: !isOpen && !collapsible.mounted,
			index,
			disabled,
			open: isOpen,
		}),
		[collapsible.mounted, disabled, index, isOpen, rootState],
		subSlot(slot, 'state'),
	);

	const defaultTriggerId = useBaseUiId(undefined, subSlot(slot, 'defaultTriggerId'));
	const [triggerId, setTriggerId] = useState<string | undefined>(
		undefined,
		subSlot(slot, 'triggerId'),
	);

	const accordionItemContext: AccordionItemContextValue = useMemo(
		() => ({
			open: isOpen,
			state,
			setTriggerId,
			triggerId: triggerId ?? defaultTriggerId,
		}),
		[defaultTriggerId, isOpen, state, setTriggerId, triggerId],
		subSlot(slot, 'itemCtx'),
	);

	const element = useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref: [ref, listItemRef],
			props: elementProps,
			stateAttributesMapping: accordionStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	return createElement(CollapsibleRootContext.Provider, {
		value: collapsibleContext,
		children: createElement(AccordionItemContext.Provider, {
			value: accordionItemContext,
			children: element,
		}),
	});
}

// --- Header -------------------------------------------------------------------

function AccordionHeader(props: any): any {
	const slot = S('AccordionHeader');
	const { render, className, style, ref, ...elementProps } = props;

	const { state } = useAccordionItemContext();

	return useRenderElement(
		'h3',
		{ render, className, style },
		{
			state,
			ref,
			props: elementProps,
			stateAttributesMapping: accordionStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Trigger ------------------------------------------------------------------

function AccordionTrigger(props: any): any {
	const slot = S('AccordionTrigger');
	const {
		disabled: disabledProp,
		className,
		id: idProp,
		render,
		nativeButton = true,
		style,
		ref,
		...elementProps
	} = props;

	const { panelId, open, handleTrigger, disabled: contextDisabled } = useCollapsibleRootContext();

	const disabled = disabledProp || contextDisabled;

	const { getButtonProps, buttonRef } = useButton(
		{ disabled, focusableWhenDisabled: true, native: nativeButton },
		subSlot(slot, 'button'),
	);

	const { state, setTriggerId, triggerId: id } = useAccordionItemContext();

	useLayoutEffect(
		() => {
			if (idProp) {
				setTriggerId(idProp);
			}
			return () => {
				setTriggerId(undefined);
			};
		},
		[idProp, setTriggerId],
		subSlot(slot, 'registerId'),
	);

	return useRenderElement(
		'button',
		{ render, className, style },
		{
			state,
			ref: [ref, buttonRef],
			props: [
				{
					'aria-controls': open ? panelId : undefined,
					'aria-expanded': open,
					id,
					onClick: handleTrigger,
				},
				elementProps,
				getButtonProps,
			],
			stateAttributesMapping: triggerStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Panel --------------------------------------------------------------------

function AccordionPanel(props: any): any {
	const slot = S('AccordionPanel');
	const {
		className,
		hiddenUntilFound: hiddenUntilFoundProp,
		keepMounted: keepMountedProp,
		id: idProp,
		render,
		style,
		ref,
		...elementProps
	} = props;

	const { hiddenUntilFound: contextHiddenUntilFound, keepMounted: contextKeepMounted } =
		useAccordionRootContext();

	const {
		mounted,
		onOpenChange,
		open,
		panelId,
		setMounted,
		setOpen,
		setPanelIdState,
		transitionStatus,
	} = useCollapsibleRootContext();

	const hiddenUntilFound = hiddenUntilFoundProp ?? contextHiddenUntilFound;
	const keepMounted = keepMountedProp ?? contextKeepMounted;

	useLayoutEffect(
		() => {
			if (keepMountedProp === false && hiddenUntilFound) {
				console.warn(
					'Base UI: The `keepMounted={false}` prop on an `Accordion.Panel` is ignored when ' +
						'`hiddenUntilFound` is enabled on the panel or root, since the panel must remain ' +
						'mounted while closed.',
				);
			}
		},
		[hiddenUntilFound, keepMountedProp],
		subSlot(slot, 'warn'),
	);

	useLayoutEffect(
		() => {
			if (idProp) {
				setPanelIdState(idProp);
				return () => {
					setPanelIdState(undefined);
				};
			}
			return undefined;
		},
		[idProp, setPanelIdState],
		subSlot(slot, 'registerId'),
	);

	const {
		height,
		props: panelProps,
		panelRef,
		shouldPreventOpenAnimation,
		shouldRender,
		transitionStatus: panelTransitionStatus,
		width,
	} = useCollapsiblePanel(
		{
			hiddenUntilFound,
			id: idProp ?? panelId,
			keepMounted,
			mounted,
			onOpenChange,
			open,
			setMounted,
			setOpen,
			transitionStatus,
		},
		subSlot(slot, 'panel'),
	);

	const { state, triggerId } = useAccordionItemContext();

	const panelState: AccordionPanelState = {
		...state,
		transitionStatus: panelTransitionStatus,
	};

	const resolvedStyle = resolveStyle(style, panelState);

	const element = useRenderElement(
		'div',
		{ render, className, style: undefined },
		{
			state: panelState,
			ref: [ref, panelRef],
			props: [
				panelProps,
				{
					'aria-labelledby': triggerId,
					role: 'region',
					style: {
						[AccordionPanelCssVars.accordionPanelHeight]:
							height === undefined ? 'auto' : `${height}px`,
						[AccordionPanelCssVars.accordionPanelWidth]:
							width === undefined ? 'auto' : `${width}px`,
					},
				},
				elementProps,
				resolvedStyle ? { style: resolvedStyle } : undefined,
				// The public `style` prop is resolved above so a temporary `animationName: 'none'`
				// can still win after the user's inline styles have been merged.
				shouldPreventOpenAnimation ? { style: { animationName: 'none' } } : undefined,
			],
			stateAttributesMapping: accordionStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	if (!shouldRender) {
		return null;
	}

	return element;
}

// --- Namespace (mirrors `export * as Accordion`) ------------------------------

export const Accordion = {
	Root: AccordionRoot,
	Item: AccordionItem,
	Header: AccordionHeader,
	Trigger: AccordionTrigger,
	Panel: AccordionPanel,
};

export { AccordionRoot, AccordionItem, AccordionHeader, AccordionTrigger, AccordionPanel };
