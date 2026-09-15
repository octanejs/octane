import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThinkingOrb as ReferenceOrb } from 'thinking-orbs';
import { OrbGrid, type OrbGridProps } from './app.tsrx';

declare global {
	interface Window {
		orbHarness: {
			serverCanvases: HTMLCanvasElement[];
			refs: Record<string, HTMLCanvasElement | null>;
			clicks: number;
			update: (next: Partial<OrbGridProps>) => void;
			unmount: () => void;
		};
	}
}

const container = document.querySelector('#root')!;
const refs: Record<string, HTMLCanvasElement | null> = {};
const serverCanvases = [...container.querySelectorAll('canvas')];
let props: OrbGridProps = {
	ids: ['a', 'b'],
	state: 'working',
	size: 20,
	theme: 'light',
	paused: true,
	onCanvas: (id, node) => {
		refs[id] = node;
	},
	onClick: () => {
		window.orbHarness.clicks += 1;
	},
};
const root = hydrateRoot(container, OrbGrid, props);
const reference = createRoot(document.querySelector('#reference')!);
function renderReference() {
	reference.render(
		createElement(ReferenceOrb, {
			state: props.state,
			size: props.size,
			theme: props.theme,
			paused: props.paused,
		}),
	);
}
window.orbHarness = {
	serverCanvases,
	refs,
	clicks: 0,
	update(next) {
		props = { ...props, ...next };
		flushSync(() => root.render(OrbGrid, props));
		drainPassiveEffects();
		renderReference();
	},
	unmount() {
		root.unmount();
		reference.unmount();
	},
};
drainPassiveEffects();
flushSync(() => {});
renderReference();
