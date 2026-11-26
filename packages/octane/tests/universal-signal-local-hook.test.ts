import { describe, expect, it } from 'vitest';
import { useSignal$ } from '../src/signals/universal.js';

// A module of its own: no signals module has enabled native reads here, so the
// universal local hook is not installed.
describe('universal useSignal$ without native reads', () => {
	it('fails with the renderer capability it needs', () => {
		expect(() => useSignal$(0, Symbol('slot'))).toThrow(
			/requires a renderer with the signal-bindings capability/,
		);
	});
});
