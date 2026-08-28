import { createRoot, flushSync } from 'octane';
import { createScope } from 'octane/signals';
import { NativeCounter, type NativeProps } from './native.tsrx';
import type {} from './bridge.js';

const container = document.querySelector<HTMLElement>('#app')!;
const scope = createScope({ scopeKey: 'browser-counter' });
const count$ = scope.signal$('count', 0);
const root = createRoot(container);
let props: NativeProps = { count$, label: 'initial', visible: true };
let rememberedInput: Element | null = null;

root.render(NativeCounter, props);

window.__nativeCollectionBrowser = {
	mode: 'native',
	rename(label) {
		props = { ...props, label };
		flushSync(() => root.render(NativeCounter, props));
	},
	showReaders(visible) {
		props = { ...props, visible };
		flushSync(() => root.render(NativeCounter, props));
	},
	setSignal(value) {
		flushSync(() => count$.set(value));
	},
	read$: () => count$.get(),
	unmount: () => root.unmount(),
	disposeData: () => scope.dispose(),
	rememberInput() {
		rememberedInput = container.querySelector('#draft');
	},
	inputIsSame: () => rememberedInput === container.querySelector('#draft'),
};
