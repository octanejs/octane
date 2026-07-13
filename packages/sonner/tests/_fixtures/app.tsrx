import { Toaster, toast, useSonner } from '@octanejs/sonner';

export function ToasterApp(props?: any) {
	return <div>
		<button data-testid="origin">Origin</button>
		<Toaster {...props} />
	</div>;
}

export function DualToasterApp() {
	return <div>
		<Toaster id="primary" position="bottom-right" />
		<Toaster id="secondary" position="top-left" />
		<Toaster />
	</div>;
}

export function SonnerStateProbe() {
	const { toasts } = useSonner();
	return <div>
		<span data-testid="count">{String(toasts.length)}</span>
		<span data-testid="latest">{String(toasts[0]?.title ?? '')}</span>
		<Toaster />
	</div>;
}

export function showCustom(id: string): number | string {
	return toast.custom(
		(toastId) => <div data-testid="custom-content">
			<strong>Custom content</strong>
			<button data-testid="custom-dismiss" onClick={() => toast.dismiss(toastId)}>
				Dismiss
			</button>
		</div>,
		{ id, duration: Infinity },
	);
}
