// Ported from @radix-ui/react-alert-dialog. A modal confirmation dialog built as a thin
// wrapper over Dialog: always `modal`, `role="alertdialog"`, outside interactions never
// dismiss (pointer-down/interact-outside prevented), and opening autofocuses the CANCEL
// action (the safe choice) instead of the first tabbable.
import { createElement, useRef } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import * as DialogPrimitive from './Dialog';
import { createDialogScope } from './Dialog';
import { S, subSlot } from './internal';

const [createAlertDialogContext, createAlertDialogScope] = createContextScope('AlertDialog', [
	createDialogScope,
]);
export { createAlertDialogScope };
const useDialogScope = createDialogScope();

const [AlertDialogContentProvider, useAlertDialogContentContext] = createAlertDialogContext<{
	cancelRef: { current: HTMLElement | null };
}>('AlertDialogContent');

export function Root(props: any): any {
	const slot = S('AlertDialog.Root');
	const { __scopeAlertDialog, ...alertDialogProps } = props ?? {};
	const dialogScope = useDialogScope(__scopeAlertDialog, subSlot(slot, 'scope'));
	return createElement(DialogPrimitive.Root, { ...dialogScope, ...alertDialogProps, modal: true });
}

export function Trigger(props: any): any {
	const slot = S('AlertDialog.Trigger');
	const { __scopeAlertDialog, ...triggerProps } = props ?? {};
	const dialogScope = useDialogScope(__scopeAlertDialog, subSlot(slot, 'scope'));
	return createElement(DialogPrimitive.Trigger, { ...dialogScope, ...triggerProps });
}

export function Portal(props: any): any {
	const slot = S('AlertDialog.Portal');
	const { __scopeAlertDialog, ...portalProps } = props ?? {};
	const dialogScope = useDialogScope(__scopeAlertDialog, subSlot(slot, 'scope'));
	return createElement(DialogPrimitive.Portal, { ...dialogScope, ...portalProps });
}

export function Overlay(props: any): any {
	const slot = S('AlertDialog.Overlay');
	const { __scopeAlertDialog, ...overlayProps } = props ?? {};
	const dialogScope = useDialogScope(__scopeAlertDialog, subSlot(slot, 'scope'));
	return createElement(DialogPrimitive.Overlay, { ...dialogScope, ...overlayProps });
}

export function Content(props: any): any {
	const slot = S('AlertDialog.Content');
	const { __scopeAlertDialog, children, ref: forwardedRef, ...contentProps } = props ?? {};
	const dialogScope = useDialogScope(__scopeAlertDialog, subSlot(slot, 'scope'));
	const contentRef = useRef<HTMLElement | null>(null, subSlot(slot, 'content'));
	const composedRefs = useComposedRefs(forwardedRef, contentRef, subSlot(slot, 'refs'));
	const cancelRef = useRef<HTMLElement | null>(null, subSlot(slot, 'cancel'));
	return createElement(AlertDialogContentProvider, {
		scope: __scopeAlertDialog,
		cancelRef,
		children: createElement(DialogPrimitive.Content, {
			role: 'alertdialog',
			...dialogScope,
			...contentProps,
			ref: composedRefs,
			onOpenAutoFocus: composeEventHandlers(contentProps.onOpenAutoFocus, (event: Event) => {
				event.preventDefault();
				cancelRef.current?.focus({ preventScroll: true });
			}),
			onPointerDownOutside: (event: Event) => event.preventDefault(),
			onInteractOutside: (event: Event) => event.preventDefault(),
			children,
		}),
	});
}

export function Title(props: any): any {
	const slot = S('AlertDialog.Title');
	const { __scopeAlertDialog, ...titleProps } = props ?? {};
	const dialogScope = useDialogScope(__scopeAlertDialog, subSlot(slot, 'scope'));
	return createElement(DialogPrimitive.Title, { ...dialogScope, ...titleProps });
}

export function Description(props: any): any {
	const slot = S('AlertDialog.Description');
	const { __scopeAlertDialog, ...descriptionProps } = props ?? {};
	const dialogScope = useDialogScope(__scopeAlertDialog, subSlot(slot, 'scope'));
	return createElement(DialogPrimitive.Description, { ...dialogScope, ...descriptionProps });
}

/** Confirms the action — closes the dialog (a `Dialog.Close`). */
export function Action(props: any): any {
	const slot = S('AlertDialog.Action');
	const { __scopeAlertDialog, ...actionProps } = props ?? {};
	const dialogScope = useDialogScope(__scopeAlertDialog, subSlot(slot, 'scope'));
	return createElement(DialogPrimitive.Close, { ...dialogScope, ...actionProps });
}

/** Cancels — closes the dialog and is the element autofocused on open. */
export function Cancel(props: any): any {
	const slot = S('AlertDialog.Cancel');
	const { __scopeAlertDialog, ref: forwardedRef, ...cancelProps } = props ?? {};
	const { cancelRef } = useAlertDialogContentContext('AlertDialogCancel', __scopeAlertDialog);
	const dialogScope = useDialogScope(__scopeAlertDialog, subSlot(slot, 'scope'));
	const ref = useComposedRefs(forwardedRef, cancelRef, subSlot(slot, 'refs'));
	return createElement(DialogPrimitive.Close, { ...dialogScope, ...cancelProps, ref });
}

export { Root as AlertDialog };
