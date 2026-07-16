/**
 * Differential parity: the SAME `parity.tsrx` runs through @octanejs/tanstack-ai
 * (octane) AND the real @tanstack/ai-react@0.17.0 (the setup rewrites
 * `@octanejs/tanstack-ai` → `@tanstack/ai-react` and `octane` → `react`). Both
 * sides drive an identical deterministic in-memory connection adapter, so the
 * rendered chat transcript must be byte-identical after each step — proving the
 * octane binding wires `useChat` + the shared `@tanstack/ai-client` streaming
 * path exactly like the React binding.
 */
import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/parity.tsrx');
const cache = resolve(__dirname, '.react-cache');

// Let each side's async stream fully drain before the rig flushes and compares.
// The adapter uses no timers, so a short macrotask is enough for the whole
// TEXT_MESSAGE_CONTENT → RUN_FINISHED sequence to settle on both runtimes.
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

describe('differential: @octanejs/tanstack-ai vs @tanstack/ai-react', () => {
	it('matches streamed chat output after each step', async () => {
		const d = await mountDifferential(fixture, 'ChatParity', undefined, cache);
		await d.step('mount', () => {});
		await d.step('send a message', async (octane, react) => {
			await octane.click('#send');
			await react.click('#send');
			await settle();
		});
		d.unmount();
	});
});
