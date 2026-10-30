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
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '../_helpers';
import { flushSync } from '../../src/index.js';
import { RequeuedRefHost, RequeuedRefCycle } from './_fixtures/refs-uncommitted.tsrx';

type HostProps = Parameters<typeof RequeuedRefHost>[0];

// The cross-component update warns in development; that warning is all it logs.
let consoleError: ReturnType<typeof vi.spyOn>;
afterEach(() => {
	for (const [message] of consoleError.mock.calls) {
		expect(String(message)).toMatch(/^Cannot update a component/);
	}
	consoleError.mockRestore();
});

function setup(props: Omit<HostProps, 'track'>) {
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
	const calls: string[] = [];
	const track = (label: string, target: unknown) => {
		const kind =
			target === null ? 'null' : target instanceof Element ? target.localName : 'fragment';
		calls.push(`attach ${label} ${kind}`);
		return () => {
			calls.push(`cleanup ${label}`);
		};
	};
	const m = mount(RequeuedRefHost, { ...props, track });
	const render = (next: Partial<HostProps>) => {
		calls.length = 0;
		m.root.render(RequeuedRefHost, { ...props, ...next, track });
		flushSync(() => {});
		return calls;
	};
	return { calls, m, render };
}

for (const fragment of [false, true]) {
	const kind = fragment ? 'fragment' : 'div';

	describe(`${fragment ? 'Fragment' : 'host'} refs from an uncommitted pass`, () => {
		it('runs only the committed refs when the owner renders several times before its commit', () => {
			const { calls, m, render } = setup({ show: true, target: 0, hideAt: Infinity, fragment });
			expect(calls).toEqual([`attach 0/0 ${kind}`]);

			// Passes 0/2 and 1/2 render and are replaced before the commit.
			expect(render({ target: 2 })).toEqual(['cleanup 0/0', `attach 2/2 ${kind}`]);

			calls.length = 0;
			m.unmount();
			expect(calls).toEqual(['cleanup 2/2']);
		});

		it('runs only the last ref of a host that mounts and re-renders before its commit', () => {
			const { calls, m, render } = setup({ show: false, target: 0, hideAt: Infinity, fragment });
			expect(calls).toEqual([]);

			expect(render({ show: true, target: 1 })).toEqual([`attach 1/1 ${kind}`]);

			calls.length = 0;
			m.unmount();
			expect(calls).toEqual(['cleanup 1/1']);
		});

		it('never calls the ref of a host that mounts and unmounts before its commit', () => {
			const { calls, m, render } = setup({ show: false, target: 0, hideAt: 1, fragment });

			expect(render({ show: true, target: 1 })).toEqual([]);
			m.unmount();
			expect(calls).toEqual([]);
		});
	});
}

it('leaves a committed ref alone when passes re-point the host back to it', () => {
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
	const calls: string[] = [];
	const ref = (label: string) => (el: Element | null) => {
		calls.push(`attach ${label} ${el === null ? 'null' : el.localName}`);
		return () => {
			calls.push(`cleanup ${label}`);
		};
	};
	const refs = [ref('a'), ref('b')];
	const m = mount(RequeuedRefCycle, { refs, target: 0 });
	expect(calls).toEqual(['attach a div']);

	// Passes a, b, a: the committed ref is the one that ends up current.
	calls.length = 0;
	m.root.render(RequeuedRefCycle, { refs, target: 2 });
	flushSync(() => {});
	expect(calls).toEqual([]);

	m.unmount();
	expect(calls).toEqual(['cleanup a']);
});
