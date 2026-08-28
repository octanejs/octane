import { createRoot, flushSync } from 'octane';
import { OrdinaryCounter } from './ordinary.tsrx';
import type {} from './bridge.js';

const container = document.querySelector<HTMLElement>('#app')!;
const root = createRoot(container);
let rememberedInput: Element | null = null;

root.render(OrdinaryCounter, { label: 'initial' });

window.__nativeCollectionBrowser = {
	mode: 'ordinary',
	rename(label) {
		flushSync(() => root.render(OrdinaryCounter, { label }));
	},
	unmount: () => root.unmount(),
	rememberInput() {
		rememberedInput = container.querySelector('#draft');
	},
	inputIsSame: () => rememberedInput === container.querySelector('#draft'),
};
