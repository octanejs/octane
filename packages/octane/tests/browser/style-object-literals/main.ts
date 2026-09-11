import { flushSync, hydrateRoot } from '../../../src/index.js';
import { ShorthandStyles } from '../../_fixtures/style-object-shorthand.tsrx';

const container = document.querySelector('#root') as HTMLElement;
const ids = ['longhand-first', 'shorthand-first'] as const;
const elements = ids.map((id) => container.querySelector(`#${id}`) as HTMLElement);

function snapshot() {
	return ids.map((id, index) => {
		const element = container.querySelector(`#${id}`) as HTMLElement;
		return {
			id,
			same: element === elements[index],
			style: element.getAttribute('style'),
			top: element.style.marginTop,
			right: element.style.marginRight,
		};
	});
}

const before = snapshot();
const root = hydrateRoot(container, ShorthandStyles, {
	discarded: '1px',
	margin: '4px',
	top: '8px',
});
flushSync(() => {});
const hydrated = snapshot();

flushSync(() =>
	root.render(ShorthandStyles, {
		discarded: '2px',
		margin: '12px',
		top: '16px',
	}),
);
const updated = snapshot();

flushSync(() =>
	root.render(ShorthandStyles, {
		discarded: '3px',
		margin: null,
		top: null,
	}),
);
const removed = snapshot();

window.__styleObjectHydration = {
	before,
	hydrated,
	updated,
	removed,
	unmount() {
		root.unmount();
	},
};

declare global {
	interface Window {
		__styleObjectHydration: {
			before: ReturnType<typeof snapshot>;
			hydrated: ReturnType<typeof snapshot>;
			updated: ReturnType<typeof snapshot>;
			removed: ReturnType<typeof snapshot>;
			unmount(): void;
		};
	}
}
