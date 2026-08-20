// Per packages/signals-react/upstream/canonical/test/browser/exports.test.tsx
import { describe, expect, it } from 'vitest';
import * as Signals from '../src/index.ts';
import * as Runtime from '../src/runtime/index.ts';
import * as Utils from '../src/utils/index.ts';
import * as Core from '@preact/signals-core';

describe('exports', function exportsSuite() {
	it('re-exports the signals-core surface and React hooks', function coreAndHooks() {
		expect(Signals.signal).toBe(Core.signal);
		expect(Signals.computed).toBe(Core.computed);
		expect(Signals.batch).toBe(Core.batch);
		expect(Signals.effect).toBe(Core.effect);
		expect(Signals.untracked).toBe(Core.untracked);
		expect(typeof Signals.useSignal).toBe('function');
		expect(typeof Signals.useComputed).toBe('function');
		expect(typeof Signals.useSignalEffect).toBe('function');
		expect(typeof Signals.useModel).toBe('function');
	});

	it('publishes runtime and utils entry points', function subpaths() {
		expect(typeof Runtime.useSignals).toBe('function');
		expect(typeof Runtime.wrapJsx).toBe('function');
		expect(typeof Utils.Show).toBe('function');
		expect(typeof Utils.For).toBe('function');
		expect(typeof Utils.useLiveSignal).toBe('function');
		expect(typeof Utils.useSignalRef).toBe('function');
	});
});
