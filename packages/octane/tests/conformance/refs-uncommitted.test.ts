/**
 * Refs from render passes that never commit, with React 19 callback-ref cleanups.
 *
 * Per refs-test.js:274 (React 19.2.7): a callback ref that returns a cleanup is
 * detached through that cleanup, never with `null`, and React calls a ref only
 * once the commit holding it lands.
 *
 * OCTANE DIVERGENCE: a cross-component render-time update joins the current
 * drain (docs/differences-from-react.md, Scheduler), where React commits the
 * first pass and re-renders afterwards. The parent here renders several times
 * before one commit, so only the last pass's ref may be called. Earlier passes'
 * refs never committed: calling one with the element or with `null` breaks that
 * contract and leaks the cleanup it returns.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type MountResult } from '../_helpers';
import { flushSync } from '../../src/index.js';
import {
	RequeuedRefHost,
	RequeuedActivityReveal,
	RequeuedRefCycle,
} from './_fixtures/refs-uncommitted.tsrx';

const calls: string[] = [];

// A callback ref that logs each call and returns a React 19 cleanup.
function tracked(label: string) {
	return (target: unknown) => {
		const kind =
			target === null ? 'null' : target instanceof Element ? target.localName : 'fragment';
		calls.push(`attach ${label} ${kind}`);
		return () => {
			calls.push(`cleanup ${label}`);
		};
	};
}
const track = (label: string, target: unknown) => tracked(label)(target);

function rerender<P>(m: MountResult, body: (props: P) => unknown, props: P): string[] {
	calls.length = 0;
	m.root.render(body as any, props);
	flushSync(() => {});
	return calls;
}

// The cross-component update warns in development; that warning is all it logs.
let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	calls.length = 0;
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	for (const [message] of consoleError.mock.calls) {
		expect(String(message)).toMatch(/^Cannot update a component/);
	}
	consoleError.mockRestore();
});

for (const fragment of [false, true]) {
	const kind = fragment ? 'fragment' : 'div';

	describe(`${fragment ? 'Fragment' : 'host'} refs from an uncommitted pass`, () => {
		it('runs only the committed refs when the owner renders several times before its commit', () => {
			const props = { show: true, target: 0, hideAt: Infinity, fragment, track };
			const m = mount(RequeuedRefHost, props);
			expect(calls).toEqual([`attach 0/0 ${kind}`]);

			// Passes 0/2 and 1/2 render and are replaced before the commit.
			expect(rerender(m, RequeuedRefHost, { ...props, target: 2 })).toEqual([
				'cleanup 0/0',
				`attach 2/2 ${kind}`,
			]);

			calls.length = 0;
			m.unmount();
			expect(calls).toEqual(['cleanup 2/2']);
		});

		it('runs only the last ref of a host that mounts and re-renders before its commit', () => {
			const props = { show: false, target: 0, hideAt: Infinity, fragment, track };
			const m = mount(RequeuedRefHost, props);
			expect(calls).toEqual([]);

			expect(rerender(m, RequeuedRefHost, { ...props, show: true, target: 1 })).toEqual([
				`attach 1/1 ${kind}`,
			]);

			calls.length = 0;
			m.unmount();
			expect(calls).toEqual(['cleanup 1/1']);
		});

		it('never calls the ref of a host that mounts and unmounts before its commit', () => {
			const props = { show: false, target: 0, hideAt: 1, fragment, track };
			const m = mount(RequeuedRefHost, props);

			expect(rerender(m, RequeuedRefHost, { ...props, show: true, target: 1 })).toEqual([]);
			m.unmount();
			expect(calls).toEqual([]);
		});

		it('swaps the committed ref when an Activity hides and reveals the host before its commit', () => {
			const props = { a: tracked('a'), b: tracked('b'), target: 0, fragment };
			const m = mount(RequeuedActivityReveal, props);
			expect(calls).toEqual([`attach a ${kind}`]);

			expect(rerender(m, RequeuedActivityReveal, { ...props, target: 2 })).toEqual([
				'cleanup a',
				`attach b ${kind}`,
			]);

			calls.length = 0;
			m.unmount();
			expect(calls).toEqual(['cleanup b']);
		});
	});
}

it('leaves a committed ref alone when passes re-point the host back to it', () => {
	const props = { refs: [tracked('a'), tracked('b')], target: 0 };
	const m = mount(RequeuedRefCycle, props);
	expect(calls).toEqual(['attach a div']);

	// Passes a, b, a: the committed ref is the one that ends up current.
	expect(rerender(m, RequeuedRefCycle, { ...props, target: 2 })).toEqual([]);

	m.unmount();
	expect(calls).toEqual(['cleanup a']);
});
