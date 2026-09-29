import { describe, it, expect } from 'vitest';
import { act as reactAct } from 'react';
import { flushSync } from '../../src/index.js';
import { mountDifferential, preloadDifferentialFixture, type DiffMount } from './_rig.js';
import { resolve } from 'node:path';

const FIX = resolve(__dirname, '../_fixtures/action-state-diff.tsrx');

await preloadDifferentialFixture(FIX);

// Both runtimes intercept a native submit on a function form action.
function submitNamed(m: DiffMount, name: string): void {
	(m.find('#field') as HTMLInputElement).value = name;
	m.find('form').dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
}

async function submitBoth(i: DiffMount, r: DiffMount, name: string): Promise<void> {
	flushSync(() => submitNamed(i, name));
	await reactAct(async () => submitNamed(r, name));
}

// React serializes a javascript: sentinel as the form's `action` attribute and
// Octane does not (documented divergence), so these steps compare the rendered
// action state instead of the whole container's HTML.
function expectBoth(i: DiffMount, r: DiffMount, state: string, pending: string): void {
	for (const m of [i, r]) {
		expect(m.find('#state').textContent).toBe(state);
		expect(m.find('#pending').textContent).toBe(pending);
	}
}

describe('differential: action-state-diff.tsrx — useActionState queue matches React', () => {
	it('runs a queued submission with the action it was dispatched to', async () => {
		let release!: () => void;
		const gate = new Promise<void>((done) => (release = done));
		const d = await mountDifferential(FIX, 'VersionedActionForm', { gate });
		try {
			await d.observe('submit first (held)', (i, r) => submitBoth(i, r, 'first'));
			expectBoth(d.octane, d.react, 'init', 'pending');
			await d.observe('queue second', (i, r) => submitBoth(i, r, 'second'));
			expectBoth(d.octane, d.react, 'init', 'pending');
			await d.observe('swap the action', async (i, r) => {
				await i.click('#swap');
				await r.click('#swap');
			});
			expectBoth(d.octane, d.react, 'init', 'pending');
			await d.observe('release first', () => release());
			expectBoth(d.octane, d.react, 'init/old:first/old:second', 'idle');
			await d.observe('submit third', (i, r) => submitBoth(i, r, 'third'));
			expectBoth(d.octane, d.react, 'init/old:first/old:second/new:third', 'idle');
		} finally {
			release();
			d.unmount();
		}
	});
});
