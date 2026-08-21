/**
 * Differential parity: the SAME `.tsrx` fixture runs through @octanejs/xstate
 * (octane) AND the real @xstate/react@6.1.0 (React) — the setup rewrites
 * `@octanejs/xstate` → `@xstate/react` and `octane` → `react`, while `xstate`
 * itself stays shared so both sides drive the identical pinned actor core.
 * octane's `mountDifferential` mounts both, drives identical clicks, and asserts
 * byte-identical innerHTML after each step. This is the proof that the binding
 * behaves like @xstate/react — not merely that it passes tests written for it.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const PARITY = resolve(__dirname, '../_fixtures/differential/parity.tsrx');
// React fixtures are precompiled into THIS package's cache (see differential
// _setup.ts) so the React side resolves @xstate/react and xstate from here.
const CACHE = resolve(__dirname, '.react-cache');

await preloadDifferentialFixture(PARITY, CACHE);

describe('differential: @octanejs/xstate vs real @xstate/react', () => {
	// @parity-case differential:xstate-use-machine
	it('useMachine: state transitions are byte-identical', async () => {
		const d = await mountDifferential(PARITY, 'Toggle', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('toggle', async (i, r) => {
			await i.click('#toggle');
			await r.click('#toggle');
		});
		await d.step('toggle back', async (i, r) => {
			await i.click('#toggle');
			await r.click('#toggle');
		});
		d.unmount();
	});

	// @parity-case differential:xstate-create-actor-context
	it('createActorContext: provider, selectors, and assigns are byte-identical', async () => {
		const d = await mountDifferential(PARITY, 'Counter', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('inc', async (i, r) => {
			await i.click('#inc');
			await r.click('#inc');
		});
		await d.step('inc again', async (i, r) => {
			await i.click('#inc');
			await r.click('#inc');
		});
		await d.step('incOther', async (i, r) => {
			await i.click('#inc-other');
			await r.click('#inc-other');
		});
		// RESET both assigns context and moves the machine to a final state, so
		// this step compares a state-value change and a context change together.
		await d.step('reset to final', async (i, r) => {
			await i.click('#reset');
			await r.click('#reset');
		});
		// Sending to a stopped/final machine must be an identical no-op on both.
		await d.step('inc after final', async (i, r) => {
			await i.click('#inc');
			await r.click('#inc');
		});
		d.unmount();
	});

	// @parity-case differential:xstate-unbound-selector
	it('unbound useSelector over a context actor is byte-identical', async () => {
		const d = await mountDifferential(PARITY, 'Unbound', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('inc', async (i, r) => {
			await i.click('#inc');
			await r.click('#inc');
		});
		await d.step('incOther leaves the derived value alone', async (i, r) => {
			await i.click('#inc-other');
			await r.click('#inc-other');
		});
		d.unmount();
	});
});
