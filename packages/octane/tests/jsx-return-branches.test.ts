import { describe, expect, it } from 'vitest';
import * as ServerRT from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { mount } from './_helpers';
import { loadServerFixture } from './_server-fixture.js';
import {
	Badge,
	IconHost,
	Logged,
	MemoHost,
	Outlet,
	Panel,
	Split,
	StampList,
	Tree,
	UnstableGuard,
} from './_fixtures/jsx-return-branches.tsx';

// React-style conditional RETURNS (`if (c) return <A/>; return <B/>;`) must
// behave identically regardless of how the compiler chooses to execute them:
// same DOM, same state retention on an arm flip, same teardown, and the same
// SSR markup adopted cleanly by hydration.

const FIXTURE = 'packages/octane/tests/_fixtures/jsx-return-branches.tsx';
const server = loadServerFixture(FIXTURE);

describe('conditional JSX returns', () => {
	it('renders a recursive multi-return tree and swaps depth correctly', () => {
		const m = mount(Tree as any, { depth: 2, path: 'r' });
		expect(m.findAll('.leaf').map((n) => n.textContent)).toEqual(['rLL', 'rLR', 'rRL', 'rRR']);
		expect(m.findAll('.n')).toHaveLength(3);

		m.update(Tree as any, { depth: 0, path: 'r' });
		expect(m.findAll('.leaf').map((n) => n.textContent)).toEqual(['r']);
		expect(m.findAll('.n')).toHaveLength(0);

		m.update(Tree as any, { depth: 1, path: 'q' });
		expect(m.findAll('.leaf').map((n) => n.textContent)).toEqual(['qL', 'qR']);
		m.unmount();
	});

	it('routes through an early-exit chain, replacing pages wholesale', () => {
		const m = mount(Outlet as any, { route: 'a' });
		expect(m.find('.page-a')).toBeTruthy();
		expect(m.findAll('.leaf')).toHaveLength(4);

		m.update(Outlet as any, { route: 'b' });
		expect(m.container.querySelector('.page-a')).toBeNull();
		expect(m.find('.page-b').textContent).toBe('page b');

		m.update(Outlet as any, { route: 'x' });
		expect(m.container.querySelector('.page-b')).toBeNull();
		expect(m.find('.page-missing').textContent).toBe('404');
		m.unmount();
	});

	it('keeps hook state across ternary arm flips AND across a null output', () => {
		const m = mount(Panel as any, { show: true, big: true });
		expect(m.find('.panel.big').textContent).toBe('count:0');
		m.click('.panel.big');
		expect(m.find('.panel.big').textContent).toBe('count:1');

		// Null output: the component STAYS mounted (React: returning null does not
		// unmount), so its state must survive the round-trip.
		m.update(Panel as any, { show: false, big: true });
		expect(m.container.querySelector('.panel')).toBeNull();
		m.update(Panel as any, { show: true, big: false });
		expect(m.find('.panel.small').textContent).toBe('count:1');
		m.click('.panel.small');
		expect(m.find('.panel.small').textContent).toBe('count:2');

		// Arm flip with live state: content remounts, state survives.
		m.update(Panel as any, { show: true, big: true });
		expect(m.find('.panel.big').textContent).toBe('count:2');
		m.unmount();
	});

	it('runs a non-returning else path before the trailing return', () => {
		const log: string[] = [];
		const m = mount(Logged as any, { fast: true, log: (entry: string) => log.push(entry) });
		expect(m.find('.fast')).toBeTruthy();
		expect(log).toEqual([]);

		m.update(Logged as any, { fast: false, log: (entry: string) => log.push(entry) });
		expect(m.container.querySelector('.fast')).toBeNull();
		expect(m.find('.slow')).toBeTruthy();
		expect(log).toEqual(['slow path']);
		m.unmount();
	});

	it('renders a fragment arm and swaps it against a single-root arm', () => {
		const m = mount(Split as any, { pair: true });
		expect(m.findAll('u').map((n) => n.className)).toEqual(['one', 'two']);

		m.update(Split as any, { pair: false });
		expect(m.findAll('u').map((n) => n.className)).toEqual(['solo']);

		m.update(Split as any, { pair: true });
		expect(m.findAll('u').map((n) => n.className)).toEqual(['one', 'two']);
		m.unmount();
	});

	it('supports destructured props in conditional returns', () => {
		const m = mount(Badge as any, { kind: 'dot', label: 'new' });
		expect(m.find('.badge.dot').textContent).toBe('new');
		m.update(Badge as any, { kind: 'pill', label: 'sale' });
		expect(m.find('.badge.pill').textContent).toBe('sale');
		m.unmount();
	});

	it('renders a memo-wrapped conditional-return component', () => {
		const m = mount(MemoHost as any, { depth: 1 });
		expect(m.findAll('.leaf').map((n) => n.textContent)).toEqual(['mL', 'mR']);
		m.update(MemoHost as any, { depth: 0 });
		expect(m.findAll('.leaf').map((n) => n.textContent)).toEqual(['m']);
		m.unmount();
	});

	it('keeps a directly-called multi-return helper on the value path', () => {
		const m = mount(StampList as any, { first: 'a', second: '' });
		expect(m.findAll('.stamp').map((n) => n.textContent)).toEqual(['a', '(empty)']);
		m.update(StampList as any, { first: 'c', second: 'd' });
		expect(m.findAll('.stamp').map((n) => n.textContent)).toEqual(['c', 'd']);
		m.unmount();
	});

	it('keeps unstable_use* hook state on the component scope across branch flips', () => {
		// The hook sits BEHIND the early return: whatever compilation strategy is
		// chosen, its state belongs to the component and must survive the branch
		// flipping away and back.
		const m = mount(UnstableGuard as any, { ready: true });
		expect(m.find('.ready').textContent).toBe('n:0');
		m.click('.ready');
		expect(m.find('.ready').textContent).toBe('n:1');

		m.update(UnstableGuard as any, { ready: false });
		expect(m.find('.pending')).toBeTruthy();

		m.update(UnstableGuard as any, { ready: true });
		expect(m.find('.ready').textContent).toBe('n:1'); // state preserved
		m.unmount();
	});

	it('keeps a use*-named JSX-returning hook on the value path', () => {
		const m = mount(IconHost as any, { kind: 'dot' });
		expect(m.find('.icon.dot').textContent).toBe('*');
		m.update(IconHost as any, { kind: 'pill' });
		expect(m.find('.icon.pill').textContent).toBe('o');
		m.unmount();
	});

	it('SSR output for every branch shape adopts cleanly under hydration', () => {
		// Server side through the shared fixture loader, client side through the
		// vitest plugin (the pairing every core hydration suite uses) — this pins
		// CLIENT/SERVER symmetry of whatever lowering strategy the compiler picks
		// for conditional returns.
		// Adoption is asserted BY NODE IDENTITY (marker comments are hydration's
		// own bookkeeping and may be rewritten while claiming — do not pin them).
		const client: Record<string, any> = { Outlet, Panel, Split };
		const cases: Array<[string, any, string[]]> = [
			['Outlet', { route: 'a' }, ['.page-a', '.n', '.leaf']],
			['Panel', { show: true, big: false }, ['.panel.small']],
			['Split', { pair: true }, ['.one', '.two']],
		];
		for (const [name, props, selectors] of cases) {
			const { html } = ServerRT.renderToString(server[name], props);
			const container = document.createElement('div');
			document.body.appendChild(container);
			container.innerHTML = html;
			const serverNodes = selectors.map((sel) => {
				const el = container.querySelector(sel);
				expect(el, `${name}: server rendered ${sel}`).not.toBeNull();
				return el;
			});
			const errors: unknown[][] = [];
			const original = console.error;
			console.error = (...args: unknown[]) => {
				errors.push(args);
			};
			try {
				const root = hydrateRoot(container, client[name] as any, props);
				flushSync(() => {});
				selectors.forEach((sel, i) => {
					// The server element instance was ADOPTED, not rebuilt.
					expect(container.querySelector(sel), `${name}: ${sel} adopted`).toBe(serverNodes[i]);
				});
				expect(errors).toEqual([]); // no hydration mismatch warnings
				root.unmount();
			} finally {
				console.error = original;
				container.remove();
			}
		}
	});
});
