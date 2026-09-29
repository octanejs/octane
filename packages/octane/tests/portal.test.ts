import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, it, expect } from 'vitest';
import { flushSync } from '../src/index.js';
import { act, flushEffects, mount } from './_helpers';
import {
	App,
	InlineModal,
	KeyedPortalApp,
	PortalOwnedStateApp,
	PortalPlacementApp,
	type KeyedPortalControls,
	type PortalPlacementControls,
} from './_fixtures/portal.tsrx';

function elementSlots(parent: Element): Array<string | null> {
	return Array.from(parent.children, (child) => child.getAttribute('data-slot'));
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

function fulfilled(value: string): Promise<string> {
	return {
		status: 'fulfilled',
		value,
		then: (accept: (value: string) => void) => void accept(value),
	} as unknown as Promise<string>;
}

function dialogIds(target: Element): Array<string | null> {
	return Array.from(target.children, (child) => child.getAttribute('data-id'));
}

function lifecycle(ids: number[], cleanedUp: boolean): string[] {
	const phases = cleanedUp
		? ['layout', 'passive', 'layout-cleanup', 'passive-cleanup']
		: ['layout', 'passive'];
	return ids.flatMap((id) => phases.map((phase) => phase + ':' + id)).sort();
}

// Weakly observe every node the target holds now, markers included. Kept out
// of async frames so no strong local outlives the call.
function observeRange(target: Element, into: WeakRef<Node>[]): void {
	for (const node of Array.from(target.childNodes)) into.push(new WeakRef(node));
}

function retainedCount(refs: WeakRef<Node>[]): number {
	let count = 0;
	for (const ref of refs) if (ref.deref() !== undefined) count++;
	return count;
}

// A WeakRef keeps its target alive until the current job ends, so collect on
// later macrotasks.
async function collectGarbage(): Promise<void> {
	setFlagsFromString('--expose-gc');
	const gc = runInNewContext('gc') as () => void;
	setFlagsFromString('--no-expose-gc');
	for (let attempt = 0; attempt < 3; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		gc();
	}
}

describe('portal', () => {
	it('renders content into a foreign DOM target, with context flowing through', () => {
		const portalTarget = document.createElement('section');
		document.body.appendChild(portalTarget);

		const r = mount(App, { target: portalTarget });

		// The modal's DOM lives in portalTarget, NOT in the app container.
		expect(r.findAll('.modal')).toHaveLength(0);
		expect(portalTarget.querySelector('.modal')).not.toBe(null);

		// Context (the `Theme value="dark"`) flows through the portal.
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

describe('portal — keyed rebuilds under a mounted owner', () => {
	it('releases every replaced portal range while its owner stays mounted', async () => {
		const portalTarget = document.createElement('section');
		document.body.appendChild(portalTarget);
		const log: string[] = [];
		let controls!: KeyedPortalControls;
		const r = mount(KeyedPortalApp, {
			target: portalTarget,
			log: (entry) => log.push(entry),
			bind(next) {
				controls = next;
			},
		});
		flushEffects();
		const owner = r.find('.keyed-owner');
		const replaced: WeakRef<Node>[] = [];
		const last = 40;
		const committed = Array.from({ length: last }, (_, id) => id);
		for (let id = 1; id <= last; id++) {
			observeRange(portalTarget, replaced);
			flushSync(() => controls.setId(id));
			flushEffects();
		}

		expect(r.find('.keyed-owner')).toBe(owner);
		expect(dialogIds(portalTarget)).toEqual([String(last)]);
		// No earlier range, its markers included, is left behind in the target.
		expect(replaced.filter((ref) => ref.deref()?.isConnected === true)).toHaveLength(0);
		expect([...log].sort()).toEqual(
			[...lifecycle(committed, true), ...lifecycle([last], false)].sort(),
		);

		await collectGarbage();
		expect(retainedCount(replaced)).toBe(0);

		r.unmount();
		flushEffects();
		expect(portalTarget.childNodes).toHaveLength(0);
		expect([...log].sort()).toEqual(lifecycle([...committed, last], true));
		portalTarget.remove();
	});

	it.each(['commits after the data resolves', 'unmounts while held'] as const)(
		'restores the committed portal when a transition that rebuilt it suspends, then %s',
		async (outcome) => {
			const portalTarget = document.createElement('section');
			document.body.appendChild(portalTarget);
			const pending = deferred<string>();
			const log: string[] = [];
			let controls!: KeyedPortalControls;
			const r = mount(KeyedPortalApp, {
				target: portalTarget,
				log: (entry) => log.push(entry),
				bind(next) {
					controls = next;
				},
				load: (id) => (id === 0 ? fulfilled('ready:0') : pending.promise),
			});
			try {
				await act(() => {});
				const committed = new WeakRef(portalTarget.querySelector('.keyed-dialog')!);
				const initialRange: WeakRef<Node>[] = [];
				observeRange(portalTarget, initialRange);
				expect(log.splice(0)).toEqual(['layout:0', 'passive:0']);

				await act(() => controls.transitionTo(1));

				// The committed UI holds: same dialog node, no fallback, no effects
				// for the abandoned rebuild, and events still reach the owner.
				expect(r.find('.keyed-status').textContent).toBe('ready:0');
				expect(r.findAll('.keyed-fallback')).toHaveLength(0);
				expect(Array.from(portalTarget.children)).toEqual([committed.deref()]);
				expect(log).toEqual([]);
				flushSync(() => (committed.deref() as HTMLElement).click());
				expect(log.splice(0)).toEqual(['click:0']);

				if (outcome === 'commits after the data resolves') {
					await act(async () => {
						pending.resolve('ready:1');
						await pending.promise;
					});
					flushEffects();
					expect(r.find('.keyed-status').textContent).toBe('ready:1');
					expect(dialogIds(portalTarget)).toEqual(['1']);
					expect(initialRange.filter((ref) => ref.deref()?.isConnected === true)).toHaveLength(0);
					flushSync(() => (portalTarget.querySelector('.keyed-dialog') as HTMLElement).click());
					expect(log.splice(0).sort()).toEqual(
						['click:1', 'layout-cleanup:0', 'passive-cleanup:0', ...lifecycle([1], false)].sort(),
					);
					await collectGarbage();
					expect(retainedCount(initialRange)).toBe(0);
				}

				r.unmount();
				flushEffects();
				expect(portalTarget.childNodes).toHaveLength(0);
				expect(log.sort()).toEqual(
					outcome === 'unmounts while held'
						? ['layout-cleanup:0', 'passive-cleanup:0']
						: ['layout-cleanup:1', 'passive-cleanup:1'],
				);
			} finally {
				pending.resolve('late');
				portalTarget.remove();
			}
		},
	);
});
