// Ported from @radix-ui/react-accordion. A set of collapsible sections. Each Item is a
// Collapsible whose `open` is derived from the Accordion's controllable `value` (a single
// string for `type="single"`, or a string[] for `type="multiple"`). `.ts` components via
// createElement; plain octane context.
//
// DEFERRED: arrow-key roving focus between triggers (Radix wraps triggers in
// RovingFocusGroup). Expand/collapse + ARIA + data-state are complete; the roving-focus
// primitive is a separate, reusable follow-up (also used by Tabs/Toolbar/RadioGroup).
import { createContext, createElement, useCallback, useContext, useId } from 'octane';

import * as Collapsible from './Collapsible';
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

const AccordionValueContext = createContext<ValueContextValue | null>(null);
const AccordionImplContext = createContext<ImplContextValue | null>(null);
const AccordionItemContext = createContext<ItemContextValue | null>(null);

function useValueContext(): ValueContextValue {
	const ctx = useContext(AccordionValueContext);
	if (!ctx) throw new Error('Accordion parts must be used within `Accordion.Root`.');
	return ctx;
}
function useImplContext(): ImplContextValue {
	const ctx = useContext(AccordionImplContext);
	if (!ctx) throw new Error('Accordion parts must be used within `Accordion.Root`.');
	return ctx;
}
function useItemContext(): ItemContextValue {
	const ctx = useContext(AccordionItemContext);
	if (!ctx)
		throw new Error('`Accordion.Header`/`Trigger`/`Content` must be within `Accordion.Item`.');
	return ctx;
}

function getState(open?: boolean): 'open' | 'closed' {
	return open ? 'open' : 'closed';
}

export function Root(props: any): any {
	const slot = S('Accordion.Root');
	const {
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

	return createElement(AccordionValueContext.Provider, {
		value: { value: valueArray, onItemOpen, onItemClose },
		children: createElement(AccordionImplContext.Provider, {
			value: { disabled, orientation, collapsible, isMultiple },
			children: createElement(Primitive.div, { 'data-orientation': orientation, ...rest }),
		}),
	});
}

export function Item(props: any): any {
	const slot = S('Accordion.Item');
	const { value: itemValue, disabled: itemDisabled, ...rest } = props ?? {};
	const impl = useImplContext();
	const valueCtx = useValueContext();
	const triggerId = useId(subSlot(slot, 'id'));
	const open = (itemValue != null && valueCtx.value.includes(itemValue)) || false;
	const disabled = impl.disabled || itemDisabled || false;

	return createElement(AccordionItemContext.Provider, {
		value: { open, disabled, triggerId },
		children: createElement(Collapsible.Root, {
			'data-orientation': impl.orientation,
			'data-state': getState(open),
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
	const impl = useImplContext();
	const item = useItemContext();
	return createElement(Primitive.h3, {
		'data-orientation': impl.orientation,
		'data-state': getState(item.open),
		'data-disabled': item.disabled ? '' : undefined,
		...props,
	});
}

export function Trigger(props: any): any {
	const impl = useImplContext();
	const item = useItemContext();
	// A `type="single"` non-collapsible open item can't be closed → aria-disabled.
	const ariaDisabled = (item.open && !impl.isMultiple && !impl.collapsible) || undefined;
	return createElement(Collapsible.Trigger, {
		'aria-disabled': ariaDisabled,
		'data-orientation': impl.orientation,
		id: item.triggerId,
		...props,
	});
}

export function Content(props: any): any {
	const impl = useImplContext();
	const item = useItemContext();
	const { style, ...rest } = props ?? {};
	return createElement(Collapsible.Content, {
		role: 'region',
		'aria-labelledby': item.triggerId,
		'data-orientation': impl.orientation,
		...rest,
		style: {
			'--radix-accordion-content-height': 'var(--radix-collapsible-content-height)',
			'--radix-accordion-content-width': 'var(--radix-collapsible-content-width)',
			...style,
		},
	});
}

export { Root as Accordion };
