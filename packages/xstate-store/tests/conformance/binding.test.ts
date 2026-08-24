/**
 * @octanejs/xstate-store conformance — the ported hooks driven against the REAL
 * `@xstate/store@4.2.3` core. These assertions cover what the differential rig
 * cannot observe through `innerHTML`: per-call-site hook-slot independence,
 * selector bail-out, and the stable-instance contracts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import {
	AtomReader,
	AtomStateReader,
	HookStoreReader,
	LocalStore,
	SelectorApp,
	renderLog,
	resetFixtures,
} from '../_fixtures/conformance.tsrx';

// The fixture store and atom are module-level so the components can close over
// them, so each case starts from a known context rather than inheriting the
// previous one's sends.
beforeEach(function resetFixtureState() {
	resetFixtures();
});

describe('useSelector', () => {
	it('selects a slice and follows store updates', async () => {
		const r = mount(SelectorApp);

		expect(r.find('#count').textContent).toBe('0');
		expect(r.find('#snapshot').textContent).toBe('0');

		r.click('#inc');
		await nextPaint();

		expect(r.find('#count').textContent).toBe('1');
		expect(r.find('#snapshot').textContent).toBe('1');

		r.unmount();
	});

	// @parity-case ordinary:xstate-store-hook-slot-per-call-site
	it('gives each selector call site its own hook slot', async () => {
		const r = mount(SelectorApp);

		r.click('#inc');
		await nextPaint();

		// A shared cell would make `other` follow `count`.
		expect(r.find('#both-count').textContent).toBe('1');
		expect(r.find('#both-other').textContent).toBe('0');

		r.click('#inc-other');
		await nextPaint();

		expect(r.find('#both-count').textContent).toBe('1');
		expect(r.find('#both-other').textContent).toBe('1');

		r.unmount();
	});

	it('re-renders only the subscribers whose selected value changed', async () => {
		const r = mount(SelectorApp);
		renderLog.length = 0;

		r.click('#inc-other');
		await nextPaint();

		// BothSlices selects `other`, WholeSnapshot selects the whole snapshot (a
		// new object every send). CountOnly selects an unchanged number and must
		// bail out.
		expect(renderLog).toContain('BothSlices');
		expect(renderLog).toContain('WholeSnapshot');
		expect(renderLog).not.toContain('CountOnly');

		r.unmount();
	});
});

describe('useStore', () => {
	it('returns the same store instance across re-renders', async () => {
		const instances: unknown[] = [];
		const r = mount(LocalStore, { onInstance: (store: unknown) => instances.push(store) });

		r.click('#local-rerender');
		await nextPaint();
		r.click('#local-rerender');
		await nextPaint();

		expect(r.find('#local-tick').textContent).toBe('2');
		expect(instances.length).toBeGreaterThan(1);
		expect(new Set(instances).size).toBe(1);

		r.unmount();
	});

	it('drives its own selector', async () => {
		const r = mount(LocalStore, {});

		expect(r.find('#local-count').textContent).toBe('0');
		r.click('#local-inc');
		await nextPaint();
		expect(r.find('#local-count').textContent).toBe('1');

		r.unmount();
	});
});

describe('useAtom', () => {
	it('reads the atom and re-renders on set', async () => {
		const r = mount(AtomReader);

		expect(r.find('#atom').textContent).toBe('0');
		r.click('#bump-atom');
		await nextPaint();
		expect(r.find('#atom').textContent).toBe('1');

		r.unmount();
	});
});

describe('useAtomState', () => {
	it('creates a stable atom from a config and input', async () => {
		const instances: unknown[] = [];
		const r = mount(AtomStateReader, { onInstance: (atom: unknown) => instances.push(atom) });

		expect(r.find('#atom-state').textContent).toBe('10');

		r.click('#rerender-atom-state');
		await nextPaint();

		expect(r.find('#atom-tick').textContent).toBe('1');
		expect(instances.length).toBeGreaterThan(1);
		expect(new Set(instances).size).toBe(1);

		r.unmount();
	});
});

describe('createStoreHook', () => {
	it('returns the selected value and the store', async () => {
		const r = mount(HookStoreReader);

		expect(r.find('#hook-count').textContent).toBe('0');
		r.click('#hook-inc');
		await nextPaint();
		expect(r.find('#hook-count').textContent).toBe('2');

		r.unmount();
	});
});

describe('exports', () => {
	it('re-exports the @xstate/store core alongside the ported hooks', async () => {
		const mod = await import('@octanejs/xstate-store');

		for (const hook of ['useSelector', 'useStore', 'useAtom', 'useAtomState', 'createStoreHook']) {
			expect(typeof (mod as Record<string, unknown>)[hook], hook).toBe('function');
		}

		// Re-exported verbatim from the framework-neutral core, exactly as upstream
		// does with `export * from '@xstate/store'`.
		for (const core of [
			'createStore',
			'createStoreConfig',
			'createStoreLogic',
			'createAtom',
			'createAtomConfig',
			'createAsyncAtom',
			'createReducerAtom',
			'fromStore',
			'shallowEqual',
		]) {
			expect(typeof (mod as Record<string, unknown>)[core], core).toBe('function');
		}
	});
});
