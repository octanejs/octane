import { createRoot, flushSync } from 'octane';

function CallbackRoot(props: { label: string }) @{
	<main id="minimal-callback-root">{props.label as string}</main>
}

// The root never escapes `attach`; the controller only calls render/unmount on
// it after `attach` returns.
function attach(container: HTMLElement) {
	const root = createRoot(container);
	root.render(CallbackRoot, { label: 'first' });
	return {
		replace(label: string) {
			flushSync(() => root.render(CallbackRoot, { label }));
		},
		dispose() {
			root.unmount();
		},
	};
}

export function run(container: HTMLElement) {
	const controller = attach(container);
	const before = container.textContent;
	controller.replace('second');
	const after = container.textContent;
	controller.dispose();
	return { before, after, cleaned: container.childNodes.length === 0 };
}
