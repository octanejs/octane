import { page, utils } from 'vitest/browser';
import { act as nativeAct, type OctaneNode } from 'octane';
import { render as mount, cleanup as unmountAll } from '@octanejs/testing-library';

import { setOctaneActEnvironment } from '../../../testing-library/src/act-environment';

// Match vitest-browser-react's scope: real browser automation dispatches native
// events outside act. Renderer operations use act and restore the browser mode.
let activeActs = 0;
async function act<T>(callback: () => T | Promise<T>): Promise<T> {
	activeActs++;
	setOctaneActEnvironment(true);
	try {
		return await nativeAct(callback);
	} finally {
		activeActs--;
		setOctaneActEnvironment(activeActs > 0);
	}
}

/** Real browser locators around the same Octane mount used by the DOM lane. */
export async function render(ui: OctaneNode, options?: Parameters<typeof mount>[1]) {
	const view = await act(async () => mount(ui, options));
	return {
		...view,
		...utils.getElementLocatorSelectors(view.baseElement),
		locator: page.elementLocator(view.container),
		rerender: (next: OctaneNode) =>
			act(async () => {
				view.rerender(next);
			}),
		unmount: () =>
			act(async () => {
				view.unmount();
			}),
	};
}

export const cleanup = () =>
	act(async () => {
		unmountAll();
	});
