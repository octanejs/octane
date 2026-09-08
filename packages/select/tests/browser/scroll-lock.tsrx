import { createRoot, delegateEvents, flushSync } from 'octane';

import { BrowserSelectFixture, type BrowserSelectOption } from './select-fixture.tsrx';

delegateEvents(['focusin', 'focusout', 'keydown', 'mousedown', 'mousemove', 'mouseover']);

const options: readonly BrowserSelectOption[] = [
	{ label: 'One', value: '1' },
];
const callbacks = {
	onChange() {},
	onInputChange(value: string) {
		return value;
	},
	onMenuClose() {},
	onMenuOpen() {},
};

function bodyStyle() {
	return {
		boxSizing: document.body.style.boxSizing,
		height: document.body.style.height,
		overflow: document.body.style.overflow,
		paddingRight: document.body.style.paddingRight,
		position: document.body.style.position,
	};
}

window.__reactSelectScrollLocks = {
	async run(order: 'first-second' | 'second-first') {
		document.body.style.boxSizing = 'content-box';
		document.body.style.height = '73px';
		document.body.style.overflow = 'scroll';
		document.body.style.paddingRight = '7px';
		document.body.style.position = 'absolute';
		const original = bodyStyle();

		const elements = [document.createElement('div'), document.createElement('div')];
		elements.forEach((element) => document.body.appendChild(element));
		const roots = elements.map((element) => createRoot(element));
		for (const root of roots) {
			flushSync(() => {
				root.render(
					BrowserSelectFixture,
					{
						...callbacks,
						menuIsOpen: true,
						menuShouldBlockScroll: true,
						options,
					} as never,
				);
			});
		}
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		const locked = bodyStyle();
		const removalOrder =
			order === 'first-second' ? [0, 1] : [1, 0];
		flushSync(() => roots[removalOrder[0]!]!.render(() => null, {}));
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		const afterFirst = bodyStyle();
		flushSync(() => roots[removalOrder[1]!]!.render(() => null, {}));
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		const afterSecond = bodyStyle();
		elements.forEach((element) => element.remove());
		return { afterFirst, afterSecond, locked, original };
	},
};

declare global {
	interface Window {
		__reactSelectScrollLocks: {
			run(order: 'first-second' | 'second-first'): Promise<{
				afterFirst: ReturnType<typeof bodyStyle>;
				afterSecond: ReturnType<typeof bodyStyle>;
				locked: ReturnType<typeof bodyStyle>;
				original: ReturnType<typeof bodyStyle>;
			}>;
		};
	}
}
