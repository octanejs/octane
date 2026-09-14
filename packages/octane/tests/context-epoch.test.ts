import { describe, it, expect, vi } from 'vitest';
import { createContext, createElement, memo, use } from '../src/index.js';
import { bumpContextEpoch, contextEpochNow } from '../src/context-epoch.js';
import { mount } from './_helpers';

describe('context epoch', () => {
	it('is shared across module copies via the Symbol.for cell', async () => {
		// A second bundled/octane copy gets its own module instance; Context
		// objects are deliberately cross-instance (CONTEXT_TAG is Symbol.for'd),
		// so a foreign copy's version bump must still move OUR epoch or the
		// $$ctxDepsEpoch bail fast path masks the stale entry.
		vi.resetModules();
		const secondCopy = await import('../src/context-epoch.js');
		const before = contextEpochNow();
		secondCopy.bumpContextEpoch();
		expect(contextEpochNow()).toBe(before + 1);
		bumpContextEpoch();
		expect(secondCopy.contextEpochNow()).toBe(before + 2);
	});

	it('a context version bumped outside provideContext still refreshes consumers on the next root.render', () => {
		// The react-hosted mirror contract: publishSnapshots bumps
		// mirror.$$version directly and the paired epoch bump is discharged by
		// the root.render commit that follows (renderResolved). Without it the
		// $$ctxDepsEpoch fast path would skip the dep scans and strand the
		// consumer — this simulates that external bumper end to end.
		const Ctx = createContext(0);
		let reads = 0;
		const Reader = memo(function Reader() {
			reads++;
			return createElement('output', { className: 'v' }, String(use(Ctx)));
		});
		const App = (props: { value: number }) =>
			createElement(Ctx.Provider, { value: props.value }, createElement(Reader));
		const r = mount(App, { value: 1 });
		expect(reads).toBe(1);
		// Bare version write — no provideContext, no bumpContextEpoch. The
		// root.render commit below is the only epoch mover.
		(Ctx as any).$$version++;
		r.update(App, { value: 1 });
		// Equal props AND an Object.is-equal provider value — the memo bail and
		// the provider's early return both stand; only the renderResolved epoch
		// bump can explain the consumer re-executing.
		expect(reads).toBe(2);
		r.unmount();
	});
});
