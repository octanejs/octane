/**
 * The intentional divergence from @xstate/react@6.1.0 that no adapted upstream
 * case can reach, pinned as behavior instead of prose (UPSTREAM.md, "Intentional
 * divergences"). Its companion — the optional server `getServerSnapshot` — is
 * pinned in ../ssr/server.test.ts, since it is only observable without a DOM.
 */
import { describe, expect, it } from 'vitest';
import { act, mount, nextPaint } from '../_helpers';
import { CommitWindowApp, createActorLikeStore } from '../_fixtures/divergences.tsrx';

describe('useSyncExternalStore commit-time re-read', () => {
	// OCTANE DIVERGENCE: React's `updateSyncExternalStore` re-pushes
	// `updateStoreInstance` whenever `inst.getSnapshot` identity changed, so a
	// re-render with an inline `getSnapshot` buys a commit-time snapshot re-read
	// even when the rendered value was unchanged. Octane gates its commit-sync on
	// the VALUE instead: an unchanged read enqueues nothing, so a mutation that
	// slips into that window without notifying is not reconciled.
	// @parity-case ordinary:xstate-sync-external-store-skips-commit-reread
	it('skips the commit-time getSnapshot re-read when a store mutates without notifying between render and commit', async () => {
		const store = createActorLikeStore(0);
		const r = mount(CommitWindowApp, { store, notify: false });

		expect(r.find('#readout').textContent).toBe('value=0 label=0');

		r.click('#bump');
		await nextPaint();

		// The readout re-rendered and read the unchanged 0; the mutator's layout
		// effect then moved the store to 1 silently. The committed DOM keeps 0.
		expect(store.actorRef.getSnapshot()).toBe(1);
		expect(r.find('#readout').textContent).toBe('value=0 label=1');

		// Nothing is lost: the skipped value is picked up by the next notify.
		await act(() => {
			store.send(3);
		});
		expect(r.find('#readout').textContent).toBe('value=3 label=1');

		r.unmount();
	});

	// The control that keeps the case above honest, and the reason the divergence
	// is unreachable from the binding: an actor that notifies reconciles inside
	// the very same commit window.
	// @parity-case ordinary:xstate-sync-external-store-notify-reconciles
	it('reconciles a mutation in the same render-to-commit window when the store notifies, as every xstate actor does', async () => {
		const store = createActorLikeStore(0);
		const r = mount(CommitWindowApp, { store, notify: true });

		expect(r.find('#readout').textContent).toBe('value=0 label=0');

		r.click('#bump');
		await nextPaint();

		expect(store.actorRef.getSnapshot()).toBe(1);
		expect(r.find('#readout').textContent).toBe('value=1 label=1');

		r.unmount();
	});
});
