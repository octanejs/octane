// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Dialog.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly; the plain-`.ts` components use the
// S()/subSlot component-slot convention; `RootMenuTriggerStateContext` comes from the Phase-5
// `./Menu` stub module; React's ReactNode/JSX types → `any`; the dev-only accessibility
// console.warn keeps its upstream NODE_ENV guard (same as `./utils`' DOMElement warnings).
import { createContext, createElement, useContext, useRef } from 'octane';

import { type AriaDialogProps, useDialog } from '../dialog/useDialog';
import { ButtonContext } from './Button';
import { S, subSlot } from '../internal';
import { filterDOMProps } from '../utils/filterDOMProps';
import { HeadingContext } from './Heading';
import { mergeProps } from '../utils/mergeProps';
import type {
	OverlayTriggerProps,
	OverlayTriggerState,
} from '../stately/overlays/useOverlayTriggerState';
import { PopoverContext } from './Popover';
import { PressResponder } from '../interactions/PressResponder';
import { RootMenuTriggerStateContext } from './Menu';
import { useId } from '../utils/useId';
import { useMenuTriggerState } from '../stately/menu/useMenuTriggerState';
import { useOverlayTrigger } from '../overlays/useOverlayTrigger';
import {
	type ContextValue,
	DEFAULT_SLOT,
	dom,
	type DOMRenderProps,
	Provider,
	type SlotProps,
	type StyleProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptations: structural aliases for the React types upstream drags along.
type ReactNode = any;
type GlobalDOMAttributes = Record<string, any>;

export interface DialogTriggerProps extends OverlayTriggerProps {
	children: ReactNode;
}

export interface DialogRenderProps {
	close: () => void;
}

export interface DialogProps
	extends
		AriaDialogProps,
		StyleProps,
		SlotProps,
		DOMRenderProps<'section', undefined>,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-Dialog'
	 */
	className?: string;
	/** Children of the dialog. A function may be provided to access a function to close the dialog. */
	children?: ReactNode | ((opts: DialogRenderProps) => ReactNode);
}

export const DialogContext = createContext<ContextValue<DialogProps, HTMLElement>>(null);
export const OverlayTriggerStateContext = createContext<OverlayTriggerState | null>(null);

/**
 * A DialogTrigger opens a dialog when a trigger element is pressed.
 */
export function DialogTrigger(props: DialogTriggerProps): any {
	const slot = S('DialogTrigger');
	// Use useMenuTriggerState instead of useOverlayTriggerState in case a menu is embedded in the dialog.
	// This is needed to handle submenus.
	let state = useMenuTriggerState(props, subSlot(slot, 'state'));

	let buttonRef = useRef<HTMLButtonElement | null>(null, subSlot(slot, 'buttonRef'));
	let { triggerProps, overlayProps } = useOverlayTrigger(
		{ type: 'dialog' },
		state,
		buttonRef,
		subSlot(slot, 'trigger'),
	);

	// Label dialog by the trigger as a fallback if there is no title slot.
	// This is done in RAC instead of hooks because otherwise we cannot distinguish
	// between context and props. Normally aria-labelledby overrides the title
	// but when sent by context we want the title to win.
	triggerProps.id = useId(undefined, subSlot(slot, 'triggerId'));
	(overlayProps as any)['aria-labelledby'] = triggerProps.id;

	return createElement(Provider, {
		values: [
			[OverlayTriggerStateContext, state],
			[RootMenuTriggerStateContext, state],
			[DialogContext, overlayProps],
			[
				PopoverContext,
				{
					trigger: 'DialogTrigger',
					triggerRef: buttonRef,
					'aria-labelledby': (overlayProps as any)['aria-labelledby'],
				},
			],
		] as any,
		children: createElement(PressResponder, {
			...triggerProps,
			ref: buttonRef,
			isPressed: state.isOpen,
			children: props.children,
		}),
	});
}

/**
 * A dialog is an overlay shown above other content in an application.
 */
export function Dialog(props: DialogProps): any {
	const slot = S('Dialog');
	let originalAriaLabelledby = props['aria-labelledby'];
	let ref: any;
	[props, ref] = useContextProps(props, (props as any).ref, DialogContext, subSlot(slot, 'ctx'));
	let { dialogProps, titleProps } = useDialog(
		{
			...props,
			// Only pass aria-labelledby from props, not context.
			// Context is used as a fallback below.
			'aria-labelledby': originalAriaLabelledby,
		},
		ref,
		subSlot(slot, 'dialog'),
	);
	let state = useContext(OverlayTriggerStateContext);

	if (!dialogProps['aria-label'] && !dialogProps['aria-labelledby']) {
		// If aria-labelledby exists on props, we know it came from context.
		// Use that as a fallback in case there is no title slot.
		if (props['aria-labelledby']) {
			dialogProps['aria-labelledby'] = props['aria-labelledby'];
		} else if (process.env.NODE_ENV !== 'production') {
			console.warn(
				'If a Dialog does not contain a <Heading slot="title">, it must have an aria-label or aria-labelledby attribute for accessibility.',
			);
		}
	}

	let renderProps = useRenderProps(
		{
			defaultClassName: 'react-aria-Dialog',
			className: props.className,
			style: props.style,
			children: props.children,
			values: {
				close: state?.close || (() => {}),
			},
		},
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });

	return createElement(dom.section, {
		...mergeProps(DOMProps, renderProps, dialogProps),
		render: props.render,
		ref,
		slot: props.slot || undefined,
		children: createElement(Provider, {
			values: [
				[
					HeadingContext,
					{
						slots: {
							[DEFAULT_SLOT]: {},
							title: { ...titleProps, level: 2 },
						},
					},
				],
				[
					ButtonContext,
					{
						slots: {
							[DEFAULT_SLOT]: {},
							close: {
								onPress: () => state?.close(),
							},
						},
					},
				],
			] as any,
			children: renderProps.children,
		}),
	});
}
