import { hydrateRoot } from 'octane';
import { load, never } from 'octane/hydration';
import { App } from './App.tsrx';

const host = document.querySelector('#app')!;
let root: ReturnType<typeof hydrateRoot>;
let input: HTMLInputElement;
let button: HTMLButtonElement;
let hydrated = 0;
let clicked = 0;
const props = {
	onHydrated: () => hydrated++,
	onClick: () => clicked++,
};

window.__deferredStyle = {
	hydrate(html: string) {
		host.innerHTML = html;
		input = host.querySelector('input')!;
		button = host.querySelector('button')!;
		root = hydrateRoot(host, App, { ...props, when: never() });
	},
	activate() {
		root.render(App, { ...props, when: load() });
	},
	read() {
		return {
			hydrated,
			clicked,
			inputSurvived: host.querySelector('input') === input,
			buttonSurvived: host.querySelector('button') === button,
		};
	},
};

declare global {
	interface Window {
		__deferredStyle: {
			hydrate(html: string): void;
			activate(): void;
			read(): {
				hydrated: number;
				clicked: number;
				inputSurvived: boolean;
				buttonSurvived: boolean;
			};
		};
	}
}
