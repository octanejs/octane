import { describe, it, expect } from 'vitest';
import { flushSync } from '../src/index.js';
import { mount } from './_helpers';
import {
	App,
	InlineModal,
	PortalOwnedStateApp,
	PortalPlacementApp,
	type PortalPlacementControls,
} from './_fixtures/portal.tsrx';

function elementSlots(parent: Element): Array<string | null> {
	return Array.from(parent.children, (child) => child.getAttribute('data-slot'));
}

describe('portal', () => {
	it('renders content into a foreign DOM target, with context flowing through', () => {
		const portalTarget = document.createElement('section');
		document.body.appendChild(portalTarget);

		const r = mount(App, { target: portalTarget });

		// The modal's DOM lives in portalTarget, NOT in the app container.
		expect(r.findAll('.modal')).toHaveLength(0);
		expect(portalTarget.querySelector('.modal')).not.toBe(null);

		// Context (the `Theme.Provider value="dark"`) flows through the portal.
		expect(portalTarget.querySelector('.child')!.textContent).toBe('dark');

		r.unmount();
		expect(portalTarget.querySelector('.modal')).toBe(null);
		portalTarget.remove();
	});

	it('unmounts portal content when the if-branch closes', () => {
		const portalTarget = document.createElement('section');
		document.body.appendChild(portalTarget);

		const r = mount(App, { target: portalTarget });
		expect(portalTarget.querySelector('.modal')).not.toBe(null);

		r.click('button'); // close
		expect(portalTarget.querySelector('.modal')).toBe(null);

		r.click('button'); // reopen
		expect(portalTarget.querySelector('.modal')).not.toBe(null);

		r.unmount();
		portalTarget.remove();
	});
});

describe('portal — inline element body (React authoring shape)', () => {
	it('compiles and renders an inline host-element body into the target, updating reactively', () => {
		const portalTarget = document.createElement('section');
		document.body.appendChild(portalTarget);

		const r = mount(InlineModal, { target: portalTarget });
		expect(r.findAll('.inline-modal')).toHaveLength(0);
		const modal = portalTarget.querySelector('.inline-modal');
		expect(modal).not.toBe(null);
		expect(modal!.textContent).toBe('count:0');

		r.click('#bump');
		expect(portalTarget.querySelector('.inline-modal')!.textContent).toBe('count:1');

		r.unmount();
		expect(portalTarget.querySelector('.inline-modal')).toBe(null);
		portalTarget.remove();
	});
});

describe('portal — descendant-owned updates', () => {
	it('keeps a descendant-owned root replacement inside its portal target', () => {
		const portalTarget = document.createElement('section');
		const before = document.createElement('i');
		before.dataset.slot = 'foreign-before';
		portalTarget.appendChild(before);
		document.body.appendChild(portalTarget);

		const r = mount(PortalOwnedStateApp, { target: portalTarget });
		const logicalRoot = r.find('[data-slot="portal-owner"]');
		const initial = portalTarget.querySelector('[data-slot="portal-owned-child"]')!;
		const after = document.createElement('i');
		after.dataset.slot = 'foreign-after';
		portalTarget.appendChild(after);

		expect(Array.from(portalTarget.children)).toEqual([before, initial, after]);
		expect(initial.tagName).toBe('BUTTON');

		flushSync(() => (initial as HTMLButtonElement).click());

		const replacement = portalTarget.querySelector('[data-slot="portal-owned-child"]')!;
		expect(replacement.tagName).toBe('SECTION');
		expect(replacement.textContent).toBe('updated');
		expect(replacement.parentNode).toBe(portalTarget);
		expect(r.find('[data-slot="portal-owner"]')).toBe(logicalRoot);
		expect(r.findAll('[data-slot="portal-owned-child"]')).toHaveLength(0);
		expect(Array.from(portalTarget.children)).toEqual([before, replacement, after]);
		expect(initial.isConnected).toBe(false);

		r.unmount();
		expect(Array.from(portalTarget.children)).toEqual([before, after]);
		portalTarget.remove();
	});
});

describe('portal — absolute placement', () => {
	it('places a Portal-to-element first-child transition before stable later siblings', () => {
		const portalTarget = document.createElement('section');
		document.body.appendChild(portalTarget);
		let controls!: PortalPlacementControls;
		const r = mount(PortalPlacementApp, {
			target: portalTarget,
			initialMode: 'portal',
			bind(next) {
				controls = next;
			},
		});
		const parent = r.find('[data-slot="parent"]');
		const second = r.find('[data-slot="second"]');
		const third = r.find('[data-slot="third"]');

		expect(elementSlots(parent)).toEqual(['second', 'third']);
		expect(portalTarget.querySelector('[data-slot="portalled"]')).not.toBe(null);

		flushSync(() => controls.setMode('inline'));

		expect(r.find('[data-slot="parent"]')).toBe(parent);
		expect(elementSlots(parent)).toEqual(['first', 'second', 'third']);
		expect(parent.children[1]).toBe(second);
		expect(parent.children[2]).toBe(third);
		expect(portalTarget.querySelector('[data-slot="portalled"]')).toBe(null);

		r.unmount();
		portalTarget.remove();
	});

	it('places a null-to-element first-child transition before stable later siblings', () => {
		const portalTarget = document.createElement('section');
		document.body.appendChild(portalTarget);
		let controls!: PortalPlacementControls;
		const r = mount(PortalPlacementApp, {
			target: portalTarget,
			initialMode: 'null',
			bind(next) {
				controls = next;
			},
		});
		const parent = r.find('[data-slot="parent"]');
		const second = r.find('[data-slot="second"]');
		const third = r.find('[data-slot="third"]');

		expect(elementSlots(parent)).toEqual(['second', 'third']);
		flushSync(() => controls.setMode('inline'));

		expect(r.find('[data-slot="parent"]')).toBe(parent);
		expect(elementSlots(parent)).toEqual(['first', 'second', 'third']);
		expect(parent.children[1]).toBe(second);
		expect(parent.children[2]).toBe(third);

		r.unmount();
		portalTarget.remove();
	});
});
