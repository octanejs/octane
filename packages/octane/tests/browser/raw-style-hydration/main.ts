import { flushSync, hydrateRoot } from '../../../src/index.js';
import { RawStyle } from '../../_fixtures/script-innerhtml.tsrx';
import { RAW_STYLE_SOURCE, UPDATED_RAW_STYLE_SOURCE } from '../../_fixtures/raw-style-content.js';

const container = document.querySelector('#root') as HTMLElement;
const serverStyle = container.querySelector('#raw-style-sheet') as HTMLStyleElement;
const serverTarget = container.querySelector('#raw-style-target') as HTMLElement;
const props = { tag: 'style', source: RAW_STYLE_SOURCE };
const root = hydrateRoot(container, RawStyle, props);
flushSync(() => {});

function snapshot() {
	const style = container.querySelector('#raw-style-sheet') as HTMLStyleElement;
	const target = container.querySelector('#raw-style-target') as HTMLElement;
	return {
		color: getComputedStyle(target).color,
		content: getComputedStyle(target, '::before').content,
		cssRuleCount: style.sheet?.cssRules.length ?? -1,
		styleCount: container.querySelectorAll('style').length,
		styleSame: style === serverStyle,
		styleText: style.textContent ?? '',
		targetSame: target === serverTarget,
		unexpectedElementCount: container.querySelectorAll('[data-pwn]').length,
	};
}

const initial = snapshot();
flushSync(() =>
	root.render(RawStyle, {
		tag: 'style',
		source: UPDATED_RAW_STYLE_SOURCE,
	}),
);
const updated = snapshot();

window.__rawStyleHydration = {
	initial,
	updated,
	unmount() {
		root.unmount();
	},
};

declare global {
	interface Window {
		__rawStyleHydration: {
			initial: ReturnType<typeof snapshot>;
			updated: ReturnType<typeof snapshot>;
			unmount(): void;
		};
	}
}
