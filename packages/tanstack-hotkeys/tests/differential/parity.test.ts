import { resolve } from 'node:path';
import { HotkeyManager, SequenceManager } from '@tanstack/hotkeys';
import { drainPassiveEffects } from 'octane';
import { describe, expect, it } from 'vitest';
import {
	mountDifferential,
	preloadDifferentialFixture,
	type DiffMount,
} from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/hotkeys-diff.tsrx');
const cache = resolve(__dirname, '.react-cache');

function expectHotkeyProgress(
	mount: DiffMount,
	expected: { single?: number; first?: number; second?: number; sequence?: number },
): void {
	const html = mount.container.innerHTML;
	if (expected.single !== undefined) expect(html).toContain(`single:${expected.single}`);
	if (expected.first !== undefined) expect(html).toContain(`first:${expected.first}`);
	if (expected.second !== undefined) expect(html).toContain(`second:${expected.second}`);
	if (expected.sequence !== undefined) expect(html).toContain(`sequence:${expected.sequence}`);
}

async function pressBoth(
	octane: DiffMount,
	react: DiffMount,
	key: string,
	init: KeyboardEventInit,
): Promise<void> {
	await octane.keydown('#hotkeys-parity', key, init);
	await react.keydown('#hotkeys-parity', key, init);
}

await Promise.all([preloadDifferentialFixture(fixture, cache)]);

describe('differential: @octanejs/tanstack-hotkeys vs @tanstack/react-hotkeys', function () {
	// @parity-case differential:tanstack-hotkeys-keyboard-lifecycle
	it('matches registration, shortcuts, sequences, enabled updates, and cleanup', async function () {
		const differential = await mountDifferential(fixture, 'HotkeysParity', undefined, cache);
		// Assert after step settle(): mountDifferential drains Octane passive
		// effects only after the step callback returns.
		await differential.step('mount', function () {});
		expect(HotkeyManager.getInstance().registrations.state.size).toBeGreaterThan(0);
		await differential.step('single shortcut', async function (octane, react) {
			await pressBoth(octane, react, 'k', { code: 'KeyK', ctrlKey: true });
			expectHotkeyProgress(octane, { single: 1 });
			expectHotkeyProgress(react, { single: 1 });
		});
		await differential.step('first multi-shortcut definition', async function (octane, react) {
			await pressBoth(octane, react, 'l', { code: 'KeyL', ctrlKey: true });
			expectHotkeyProgress(octane, { single: 1, first: 1 });
			expectHotkeyProgress(react, { single: 1, first: 1 });
		});
		await differential.step('second multi-shortcut definition', async function (octane, react) {
			await pressBoth(octane, react, 'x', { code: 'KeyX', altKey: true });
			expectHotkeyProgress(octane, { single: 1, first: 1, second: 1 });
			expectHotkeyProgress(react, { single: 1, first: 1, second: 1 });
		});
		await differential.step('complete sequence', async function (octane, react) {
			await pressBoth(octane, react, 'g', { code: 'KeyG' });
			await pressBoth(octane, react, 'g', { code: 'KeyG' });
			expectHotkeyProgress(octane, { single: 1, first: 1, second: 1, sequence: 1 });
			expectHotkeyProgress(react, { single: 1, first: 1, second: 1, sequence: 1 });
		});
		await differential.step('disable shortcut', async function (octane, react) {
			await octane.click('#toggle');
			await react.click('#toggle');
		});
		await differential.step('disabled shortcut is inert', async function (octane, react) {
			await pressBoth(octane, react, 'k', { code: 'KeyK', ctrlKey: true });
			expectHotkeyProgress(octane, { single: 1, first: 1, second: 1, sequence: 1 });
			expectHotkeyProgress(react, { single: 1, first: 1, second: 1, sequence: 1 });
			expect(octane.container.innerHTML).toContain('enabled:false');
			expect(react.container.innerHTML).toContain('enabled:false');
		});
		differential.unmount();
		drainPassiveEffects();
		expect(HotkeyManager.getInstance().registrations.state.size).toBe(0);
		expect(SequenceManager.getInstance().registrations.state.size).toBe(0);
	});
});
