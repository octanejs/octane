/** @jsxImportSource octane */
import { createRoot } from 'octane';
import { version } from 'react';
import { App } from './App.tsrx';

let resolveNext!: (value: string) => void;
const next = new Promise<string>((resolve) => {
	resolveNext = resolve;
});
let resolveNative!: (value: string) => void;
const nativeNext = new Promise<string>((resolve) => {
	resolveNative = resolve;
});
let delivered = 0;
const buttonRef: { current: HTMLButtonElement | null } = { current: null };
const subscription = document.getElementById('subscription')!;
const reference = document.getElementById('reference')!;
const deliveries = document.getElementById('deliveries')!;
document.getElementById('react-version')!.textContent = version;

document.getElementById('ping')!.addEventListener('click', () => {
	window.dispatchEvent(new Event('react-compat-ping'));
});
document.getElementById('focus')!.addEventListener('click', () => {
	buttonRef.current?.focus();
});

const root = createRoot(document.getElementById('root')!);
root.render(App, {
	initial: Promise.resolve('initial'),
	next,
	resolve: () => resolveNext('resolved'),
	nativeNext,
	resolveNative: () => resolveNative('native resolved'),
	target: document.getElementById('portal-target')!,
	ref: (button: HTMLButtonElement | null) => {
		buttonRef.current = button;
		reference.textContent = button === null ? 'detached' : 'attached';
	},
	onSubscription: (connected: boolean) => {
		subscription.textContent = connected ? 'connected' : 'disconnected';
	},
	onSignal: () => {
		deliveries.textContent = String(++delivered);
	},
});
document.getElementById('unmount')!.addEventListener('click', () => root.unmount());
