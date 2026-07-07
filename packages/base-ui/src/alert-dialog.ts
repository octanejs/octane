// Ported from .base-ui/packages/react/src/alert-dialog/ (v1.6.0). AlertDialog is a thin variant of
// Dialog: the Root delegates to Dialog's `useRenderDialogRoot` with the `'alert-dialog'` mode (which
// forces `modal: true`, `disablePointerDismissal: true`, `role: 'alertdialog'`), and every other part
// — Trigger, Portal, Backdrop, Popup, Title, Description, Close — is literally Dialog's part reused.
// The handle extends `DialogHandle`, enforcing the alert-dialog invariants on its store.
import { useRenderDialogRoot, DialogHandle, DialogStore, Dialog } from './dialog';

const alertDialogState = {
	modal: true,
	disablePointerDismissal: true,
	role: 'alertdialog',
} as const;

/**
 * A handle to control an Alert Dialog imperatively and to associate detached triggers with it.
 */
export class AlertDialogHandle<Payload> extends DialogHandle<Payload> {
	constructor(store?: DialogStore<Payload>) {
		const alertDialogStore = store ?? new DialogStore<Payload>(alertDialogState as any);
		super(alertDialogStore);

		if (store) {
			// Supplied stores may have been created as plain dialogs; enforce alert-dialog state.
			this.store.update(alertDialogState as any);
		}
	}
}

export function createAlertDialogHandle<Payload>(): AlertDialogHandle<Payload> {
	return new AlertDialogHandle<Payload>();
}

function AlertDialogRoot<Payload>(props: any): any {
	return useRenderDialogRoot<Payload>(props, 'alert-dialog');
}

export const AlertDialog = {
	Root: AlertDialogRoot,
	Trigger: Dialog.Trigger,
	Portal: Dialog.Portal,
	Backdrop: Dialog.Backdrop,
	Popup: Dialog.Popup,
	Title: Dialog.Title,
	Description: Dialog.Description,
	Close: Dialog.Close,
	createHandle: createAlertDialogHandle,
};
