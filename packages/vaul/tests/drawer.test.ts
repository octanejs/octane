import { describe, expect, it } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers.ts';
import { DrawerFixture } from './_fixtures/drawer.tsrx';

function findButton(container: ParentNode, label: string): HTMLButtonElement {
	const button = Array.from(container.querySelectorAll('button')).find(function matchLabel(node) {
		return (node.textContent ?? '').trim() === label;
	});
	if (!button) throw new Error(`missing button "${label}"`);
	return button as HTMLButtonElement;
}

describe('vaul v1.1.2 adapted drawer behavior', () => {
	// @parity-case runtime:controlled-open-close
	// Per upstream/test/tests/base.spec.ts:10 (should open drawer).
	// Per upstream/test/tests/base.spec.ts:27 (should close when `Drawer.Close` is clicked).
	it('opens and closes through the public trigger and close controls', async () => {
		const view = mount(DrawerFixture);
		expect(view.container.querySelector('#drawer-state')?.textContent).toBe('closed');

		await act(() => findButton(view.container, 'Open drawer').click());
		expect(view.container.querySelector('#drawer-state')?.textContent).toBe('open');
		const content = document.body.querySelector('[data-vaul-drawer]');
		expect(content).not.toBeNull();
		expect(content?.getAttribute('data-vaul-drawer-direction')).toBe('bottom');
		expect(content?.textContent).toContain('Account settings');

		await act(() => findButton(document.body, 'Close drawer').click());
		expect(view.container.querySelector('#drawer-state')?.textContent).toBe('closed');
		// Upstream waits ANIMATION_DURATION then asserts content is not visible.
		await act(async function waitForExitAnimation() {
			await new Promise(function delay(resolve) {
				setTimeout(resolve, 550);
			});
		});
		expect(document.body.querySelector('[data-vaul-drawer]')).toBeNull();
		view.unmount();
	});

	// Per upstream/test/tests/base.spec.ts:35 (should close when controlled).
	it('closes when the controlled open prop is set false', async () => {
		const view = mount(DrawerFixture);
		await act(() => findButton(view.container, 'Open drawer').click());
		expect(view.container.querySelector('#drawer-state')?.textContent).toBe('open');
		expect(document.body.querySelector('[data-vaul-drawer]')).not.toBeNull();

		await act(() => findButton(view.container, 'Controlled close').click());
		expect(view.container.querySelector('#drawer-state')?.textContent).toBe('closed');
		// Upstream waits ANIMATION_DURATION then asserts content is not visible.
		await act(async function waitForExitAnimation() {
			await new Promise(function delay(resolve) {
				setTimeout(resolve, 550);
			});
		});
		expect(document.body.querySelector('[data-vaul-drawer]')).toBeNull();
		view.unmount();
	});
});
