import { describe, it, expect, vi } from 'vitest';
import { flushSync } from '../src/index.js';
import { mount, nextPaint } from './_helpers';
import {
	PhaseOrder,
	LayoutReadsDom,
	PassiveDeferred,
	CoalescedPassiveArtifact,
	ManyPassiveEffects,
	PassiveBeforeCascadeRender,
} from './_fixtures/effect-timing.tsrx';

describe('effect timing', () => {
	it('phase order on mount: insertion → layout (sync) → passive (post-paint)', async () => {
		const log: string[] = [];
		const r = mount(PhaseOrder, { tick: 0, log });
		// insertion + layout fire synchronously during commit (inside mount's flushSync).
		expect(log).toEqual(['ins:body', 'lay:body']);
		// passive deferred until after paint.
		await nextPaint();
		expect(log).toEqual(['ins:body', 'lay:body', 'eff:body']);
		r.unmount();
	});

	it('phase order on re-render: cleanups fire before bodies of same phase', async () => {
		const log: string[] = [];
		const r = mount(PhaseOrder, { tick: 0, log });
		await nextPaint();
		log.length = 0; // clear mount log
		r.update(PhaseOrder, { tick: 1, log });
		// After update: insertion cleanup → insertion body → layout cleanup → layout body.
		expect(log).toEqual(['ins:cleanup', 'ins:body', 'lay:cleanup', 'lay:body']);
		await nextPaint();
		// Then passive cleanup → passive body.
		expect(log).toEqual([
			'ins:cleanup',
			'ins:body',
			'lay:cleanup',
			'lay:body',
			'eff:cleanup',
			'eff:body',
		]);
		r.unmount();
	});

	it('unmount destroys insertion+layout in declaration order sync; passive deferred', async () => {
		// React's deletion contract (commitDeletionEffectsOnFiber): the deleted
		// fiber's effect list is walked FORWARD (hook declaration order), firing
		// insertion and layout destroys synchronously in their declared
		// interleaving; passive destroys are deferred to the passive flush
		// (commitPassiveUnmountEffects). The PhaseOrder fixture declares
		// useEffect → useLayoutEffect → useInsertionEffect, so the sync walk
		// yields layout → insertion, and the passive cleanup lands post-paint.
		const log: string[] = [];
		const r = mount(PhaseOrder, { tick: 0, log });
		await nextPaint();
		log.length = 0;
		r.unmount();
		expect(log).toEqual(['lay:cleanup', 'ins:cleanup']);
		await nextPaint();
		expect(log).toEqual(['lay:cleanup', 'ins:cleanup', 'eff:cleanup']);
	});

	it('useLayoutEffect can read the committed DOM synchronously', () => {
		const onCommit = vi.fn();
		const r = mount(LayoutReadsDom, { onCommit });
		expect(onCommit).toHaveBeenCalledTimes(1);
		const html = onCommit.mock.calls[0][0];
		expect(html).toContain('id="measured"');
		expect(html).toContain('A');
		r.unmount();
	});

	it('flushSync drains insertion+layout but NOT passive', async () => {
		const log: string[] = [];
		const r = mount(PassiveDeferred, { tick: 0, log });
		// flushSync (used by mount) drained layout but not passive.
		expect(log).toEqual(['layout']);
		await nextPaint();
		expect(log).toEqual(['layout', 'passive']);
		r.unmount();
	});

	it('coalesced dependency changes leave one live passive side effect', async () => {
		const log: string[] = [];
		const r = mount(CoalescedPassiveArtifact, { label: 'a', log });
		await nextPaint();

		const host = r.find('#coalesced-passive-host');
		expect(Array.from(host.children, (child) => child.getAttribute('data-label'))).toEqual(['a']);
		expect(log).toEqual(['render:a', 'body:a']);

		// Commit b, but issue c before the ordinary asynchronous passive drain.
		// Octane settles b's queued passive work before beginning the c render,
		// so each committed revision owns exactly one artifact at the boundary.
		flushSync(() => r.root.render(CoalescedPassiveArtifact, { label: 'b', log }));
		expect(log).toEqual(['render:a', 'body:a', 'render:b']);

		flushSync(() => r.root.render(CoalescedPassiveArtifact, { label: 'c', log }));
		expect(Array.from(host.children, (child) => child.getAttribute('data-label'))).toEqual(['b']);
		expect(log).toEqual(['render:a', 'body:a', 'render:b', 'cleanup:a', 'body:b', 'render:c']);

		await nextPaint();
		expect(Array.from(host.children, (child) => child.getAttribute('data-label'))).toEqual(['c']);
		expect(log).toEqual([
			'render:a',
			'body:a',
			'render:b',
			'cleanup:a',
			'body:b',
			'render:c',
			'cleanup:b',
			'body:c',
		]);
		r.unmount();
		await nextPaint();
		expect(log).toEqual([
			'render:a',
			'body:a',
			'render:b',
			'cleanup:a',
			'body:b',
			'render:c',
			'cleanup:b',
			'body:c',
			'cleanup:c',
		]);
	});

	it('pending passive effects flush BEFORE a layout-cascade render mounts new children', async () => {
		// React parity (flushPassiveEffects-at-render-start): when a layout effect
		// schedules a follow-up render (Presence-style reveal), the PREVIOUS
		// commit's passive effects flush before that render begins. So a parent's
		// open-announcement dispatch fires while the revealed child does not exist
		// yet — the child's own listener must not hear it. Regression: octane's
		// flushSync convergence loop used to merge both commits' passives into one
		// child-first drain, so the child received the announcement of its own
		// mount (real-world: Radix Tooltip self-closed on open).
		const log: string[] = [];
		const r = mount(PassiveBeforeCascadeRender, { log });
		await nextPaint();
		expect(log).toEqual([]);
		r.click('#open');
		await nextPaint();
		// dispatch (commit #1 passive) before attach (commit #2 passive), and the
		// listener never observes its own open announcement.
		expect(log).toEqual(['dispatch', 'attach']);
		expect(r.find('#listener').textContent).toBe('on');
		r.unmount();
	});

	it('within a single phase, cleanups fire in declaration order on unmount (deferred for passive)', async () => {
		// Mirrors React's per-fiber unmount-cleanup contract: the fiber's effect
		// list is walked FORWARD on deletion (commitHookEffectListUnmount starts
		// at firstEffect), so multiple effects in the same phase destroy in
		// declaration order — first-declared cleanup runs first (per
		// ReactHooksWithNoopRenderer-test.js "unmounts all previous effects
		// before creating any new ones": Unmount A before Unmount B). These are
		// passive effects, so the destroys fire in the deferred passive flush,
		// not synchronously at unmount.
		const log: string[] = [];
		const r = mount(ManyPassiveEffects, { log });
		await nextPaint();
		expect(log).toEqual(['A:body', 'B:body', 'C:body']);

		log.length = 0;
		r.unmount();
		expect(log).toEqual([]);
		await nextPaint();
		expect(log).toEqual(['A:cleanup', 'B:cleanup', 'C:cleanup']);
	});
});
