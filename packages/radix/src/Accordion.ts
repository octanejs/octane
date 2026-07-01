// Ported from @radix-ui/react-accordion. A set of collapsible sections. Each Item is a
// Collapsible whose `open` is derived from the Accordion's controllable `value` (a single
// string for `type="single"`, or a string[] for `type="multiple"`). `.ts` components via
// createElement. Uses Radix's scoped context: `createAccordionScope` composes
// `createCollapsibleScope`, so each Item threads its own isolated Collapsible scope
// (`__scopeCollapsible`) — a user's separate Collapsible won't collide with an Accordion's.
//
// DEFERRED: arrow-key roving focus between triggers (Radix wraps triggers in
// RovingFocusGroup). Expand/collapse + ARIA + data-state are complete; the roving-focus
// primitive is a separate, reusable follow-up (also used by Tabs/Toolbar/RadioGroup).
import { createElement, useCallback, useId } from 'octane';

import * as Collapsible from './Collapsible';
import { createCollapsibleScope } from './Collapsible';
import { createContextScope } from './context';
import { S, subSlot } from './internal';
import { Primitive } from './Primitive';
import { useControllableState } from './useControllableState';

interface ValueContextValue {
	value: string[];
	onItemOpen: (value: string) => void;
	onItemClose: (value: string) => void;
}
interface ImplContextValue {
	disabled?: boolean;
	orientation: 'horizontal' | 'vertical';
	collapsible: boolean;
	isMultiple: boolean;
}
interface ItemContextValue {
	open: boolean;
	disabled?: boolean;
	triggerId: string;
}

const [createAccordionContext, createAccordionScope] = createContextScope('Accordion', [
	createCollapsibleScope,
]);
export { createAccordionScope };
const useCollapsibleScope = createCollapsibleScope();

const [AccordionValueProvider, useAccordionValueContext] =
	createAccordionContext<ValueContextValue>('Accordion');
const [AccordionImplProvider, useAccordionImplContext] =
	createAccordionContext<ImplContextValue>('Accordion');
const [AccordionItemProvider, useAccordionItemContext] =
	createAccordionContext<ItemContextValue>('AccordionItem');

function getState(open?: boolean): 'open' | 'closed' {
	return open ? 'open' : 'closed';
}

export function Root(props: any): any {
	const slot = S('Accordion.Root');
	const {
		__scopeAccordion,
		type,
		value: valueProp,
		defaultValue,
		onValueChange,
		collapsible = false,
		disabled,
		orientation = 'vertical',
		...rest
	} = props ?? {};
	const isMultiple = type === 'multiple';

	const [value, setValue] = useControllableState<any>(
		{
			prop: valueProp,
			defaultProp: defaultValue ?? (isMultiple ? [] : undefined),
			onChange: onValueChange,
		},
		subSlot(slot, 'value'),
	);
	const valueArray: string[] = isMultiple
		? (value ?? [])
		: value != null && value !== ''
			? [value]
			: [];

	const onItemOpen = useCallback(
		(itemValue: string) => {
			if (isMultiple) setValue((prev: string[]) => [...(prev ?? []), itemValue]);
			else setValue(itemValue);
		},
		[isMultiple],
		subSlot(slot, 'open'),
	);
	const onItemClose = useCallback(
		(itemValue: string) => {
			if (isMultiple) setValue((prev: string[]) => (prev ?? []).filter((v) => v !== itemValue));
			else if (collapsible) setValue('');
		},
		[isMultiple, collapsible],
		subSlot(slot, 'close'),
	);

	return createElement(AccordionValueProvider, {
		scope: __scopeAccordion,
		value: valueArray,
		onItemOpen,
		onItemClose,
		children: createElement(AccordionImplProvider, {
			scope: __scopeAccordion,
			disabled,
			orientation,
			collapsible,
			isMultiple,
			children: createElement(Primitive.div, { 'data-orientation': orientation, ...rest }),
		}),
	});
}

export function Item(props: any): any {
	const slot = S('Accordion.Item');
	const { __scopeAccordion, value: itemValue, disabled: itemDisabled, ...rest } = props ?? {};
	const impl = useAccordionImplContext('AccordionItem', __scopeAccordion);
	const valueCtx = useAccordionValueContext('AccordionItem', __scopeAccordion);
	const collapsibleScope = useCollapsibleScope(__scopeAccordion, subSlot(slot, 'cscope'));
	const triggerId = useId(subSlot(slot, 'id'));
	const open = (itemValue != null && valueCtx.value.includes(itemValue)) || false;
	const disabled = impl.disabled || itemDisabled || false;

	return createElement(AccordionItemProvider, {
		scope: __scopeAccordion,
		open,
		disabled,
		triggerId,
		children: createElement(Collapsible.Root, {
			'data-orientation': impl.orientation,
			'data-state': getState(open),
			...collapsibleScope,
			...rest,
			disabled,
			open,
			onOpenChange: (isOpen: boolean) => {
				if (isOpen) valueCtx.onItemOpen(itemValue);
				else valueCtx.onItemClose(itemValue);
			},
		}),
	});
}

export function Header(props: any): any {
	const { __scopeAccordion, ...rest } = props ?? {};
	const impl = useAccordionImplContext('AccordionHeader', __scopeAccordion);
	const item = useAccordionItemContext('AccordionHeader', __scopeAccordion);
	return createElement(Primitive.h3, {
		'data-orientation': impl.orientation,
		'data-state': getState(item.open),
		'data-disabled': item.disabled ? '' : undefined,
		...rest,
	});
}

export function Trigger(props: any): any {
	const slot = S('Accordion.Trigger');
	const { __scopeAccordion, ...rest } = props ?? {};
	const impl = useAccordionImplContext('AccordionTrigger', __scopeAccordion);
	const item = useAccordionItemContext('AccordionTrigger', __scopeAccordion);
	const collapsibleScope = useCollapsibleScope(__scopeAccordion, subSlot(slot, 'cscope'));
	// A `type="single"` non-collapsible open item can't be closed → aria-disabled.
	const ariaDisabled = (item.open && !impl.isMultiple && !impl.collapsible) || undefined;
	return createElement(Collapsible.Trigger, {
		'aria-disabled': ariaDisabled,
		'data-orientation': impl.orientation,
		id: item.triggerId,
		...collapsibleScope,
		...rest,
	});
}

export function Content(props: any): any {
	const slot = S('Accordion.Content');
	const { __scopeAccordion, style, ...rest } = props ?? {};
	const impl = useAccordionImplContext('AccordionContent', __scopeAccordion);
	const item = useAccordionItemContext('AccordionContent', __scopeAccordion);
	const collapsibleScope = useCollapsibleScope(__scopeAccordion, subSlot(slot, 'cscope'));
	return createElement(Collapsible.Content, {
		role: 'region',
		'aria-labelledby': item.triggerId,
		'data-orientation': impl.orientation,
		...collapsibleScope,
		...rest,
		style: {
			'--radix-accordion-content-height': 'var(--radix-collapsible-content-height)',
			'--radix-accordion-content-width': 'var(--radix-collapsible-content-width)',
			...style,
		},
	});
}

export { Root as Accordion };
