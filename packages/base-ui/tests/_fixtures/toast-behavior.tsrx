import { Toast } from '@octanejs/base-ui/toast';

// Octane-only Toast fixtures. Kept OUT of `base-ui-diff.tsrx` deliberately: the differential setup
// compiles every fixture module for React too, and a module that fails to import there would take
// down every React-side fixture that shares the file. These use a module-scope `createToastManager`
// handle, which is the "drive toasts from outside a component" path.

export const manager = Toast.createToastManager();

function ToastList() @{
	const toastManager = Toast.useToastManager();
	<Toast.Viewport className="toast-viewport">
		@for (const toast of toastManager.toasts; key toast.id) {
			<Toast.Root toast={toast} className="toast-root">
				<Toast.Content className="toast-content">
					<Toast.Title className="toast-title" />
					<Toast.Description className="toast-description" />
				</Toast.Content>
				<Toast.Close className="toast-close" aria-label="Close">x</Toast.Close>
			</Toast.Root>
		}
	</Toast.Viewport>
}

// `timeout={0}` disables auto-dismiss, so tests that are not about timers stay deterministic.
export function ToastManaged() @{
	<Toast.Provider toastManager={manager} timeout={0}>
		<ToastList />
	</Toast.Provider>
}

// A short timeout, for the auto-dismiss and hover-pause tests.
export function ToastAutoDismiss() @{
	<Toast.Provider toastManager={manager} timeout={60}>
		<ToastList />
	</Toast.Provider>
}

// A limit of 1, so the second toast marks the first as limited.
export function ToastLimitOne() @{
	<Toast.Provider toastManager={manager} timeout={0} limit={1}>
		<ToastList />
	</Toast.Provider>
}
