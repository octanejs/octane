import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { createRoot, flushSync, hydrateRoot } from '../src/index.js';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import {
	NestedCaptures,
	BranchHoldCaptures,
	ShadowedCaptures,
	FoldedCaptures,
	ElseCaptures,
	ReorderedCaptures,
	ArgumentMutation,
	NestedArgumentMutation,
	EvalArgumentMutation,
} from './_fixtures/branch-captures.tsrx';

const fixture = 'packages/octane/tests/_fixtures/branch-captures.tsrx';

describe('branch captures', () => {
	it.each(['render', 'hydrate'] as const)(
		'%s preserves branch captures and lifetimes across a held root update',
		async (mode) => {
			const effects: string[] = [];
			const cleanups: string[] = [];
			const picks: string[] = [];
			const ready = { status: 'fulfilled', value: 'ready', then() {} };
			const props = {
				visible: true,
				label: 'initial',
				promise: ready as PromiseLike<string>,
				ifRef: { current: null as HTMLButtonElement | null },
				switchRef: { current: null as HTMLButtonElement | null },
				effects,
				cleanups,
				pick: (value: string) => picks.push(value),
			};
			const container = document.createElement('div');
			document.body.appendChild(container);
			let adopted: Element[] | null = null;
			if (mode === 'hydrate') {
				const server = await loadServerFixture(fixture, { hmr: false, dev: false });
				container.innerHTML = renderToString(server.BranchHoldCaptures, props).html;
				adopted = [...container.querySelectorAll('button')];
			}
			const errors: unknown[] = [];
			const root =
				mode === 'render'
					? createRoot(container)
					: hydrateRoot(container, BranchHoldCaptures, props, {
							onRecoverableError: (error) => errors.push(error),
						});
			if (mode === 'render') root.render(BranchHoldCaptures, props);
			const host = container;
			try {
				flushSync(() => {});
				const buttons = [...host.querySelectorAll('button')];
				if (adopted !== null) {
					for (const [index, button] of buttons.entries()) expect(button).toBe(adopted[index]);
				}
				flushSync(() =>
					root.render(BranchHoldCaptures, {
						...props,
						label: 'held',
						promise: new Promise<string>(() => {}),
					}),
				);
				for (const button of buttons) {
					expect(button.textContent).toBe('initial:0');
					flushSync(() => button.click());
					expect(button.textContent).toBe('initial:1');
				}
				expect(picks).toEqual(['if:initial', 'switch:initial']);
				expect(effects).toEqual(['if:initial', 'switch:initial']);
				expect(cleanups).toEqual([]);
				flushSync(() => root.render(BranchHoldCaptures, { ...props, label: 'accepted' }));
				expect([...host.querySelectorAll('button')]).toEqual(buttons);
				expect(props.ifRef.current).toBe(buttons[0]);
				expect(props.switchRef.current).toBe(buttons[1]);
				for (const button of buttons) expect(button.textContent).toBe('accepted:1');
				flushSync(() => root.render(BranchHoldCaptures, { ...props, visible: false }));
				expect(host.querySelector('button')).toBeNull();
				expect(props.ifRef.current).toBeNull();
				expect(props.switchRef.current).toBeNull();
				expect([...cleanups].sort()).toEqual([...effects].sort());
				flushSync(() => root.render(BranchHoldCaptures, { ...props, label: 'returned' }));
				const returned = [...host.querySelectorAll('button')];
				expect(returned.map((button) => button.textContent)).toEqual(['returned:0', 'returned:0']);
				for (const [index, button] of returned.entries()) {
					expect(button).not.toBe(buttons[index]);
					expect(button.textContent).toBe('returned:0');
				}
				expect(errors).toEqual([]);
			} finally {
				root.unmount();
				container.remove();
			}
			expect(props.ifRef.current).toBeNull();
			expect(props.switchRef.current).toBeNull();
			expect([...cleanups].sort()).toEqual([...effects].sort());
		},
	);

	it.each([
		['outer arguments', ArgumentMutation, 'original'],
		['nested arguments', NestedArgumentMutation, 'originaloriginal'],
		['direct eval', EvalArgumentMutation, 'original'],
	] as const)('keeps capture values independent when %s escape', (_name, Component, expected) => {
		const props = {
			visible: true,
			inner: true,
			label: 'original',
			mutate(args: IArguments) {
				for (const value of args) {
					if (Array.isArray(value)) value.fill({ ...props, label: 'mutated' });
				}
			},
		};
		const mounted = mount(Component, props);
		try {
			expect(mounted.container.textContent).toBe(expected);
		} finally {
			mounted.unmount();
		}
	});

	it('keeps nested state and updates event captures after hiding and showing', () => {
		const picks: string[] = [];
		const props = {
			read: () => true,
			inner: true,
			label: 'first',
			onPick: (value: string) => picks.push(value),
		};
		const mounted = mount(NestedCaptures, props);
		try {
			const button = mounted.find('button');
			mounted.click('button');
			expect(button.textContent).toBe('first:1');
			mounted.update(NestedCaptures, { ...props, label: 'second' });
			expect(mounted.find('button')).toBe(button);
			mounted.click('button');
			expect(button.textContent).toBe('second:2');
			expect(picks).toEqual(['first', 'second']);
			mounted.update(NestedCaptures, { ...props, read: () => false });
			expect(mounted.container.querySelector('button')).toBeNull();
			mounted.update(NestedCaptures, { ...props, label: 'third' });
			expect(mounted.find('button').textContent).toBe('third:0');
		} finally {
			mounted.unmount();
		}
	});

	it.each([
		['direct', NestedCaptures],
		['returned', FoldedCaptures],
		['else only', ElseCaptures],
	] as const)(
		'%s evaluates the condition once and renders the selected body',
		(_name, Component) => {
			const picks: string[] = [];
			const reads: string[] = [];
			const active = Component !== ElseCaptures;
			let first = active;
			const props = {
				read() {
					reads.push('condition');
					const value = first;
					first = !first;
					return value;
				},
				inner: true,
				get label() {
					reads.push('label');
					return 'current';
				},
				onPick: (value: string) => picks.push(value),
			};
			const mounted = mount(Component, props);
			try {
				expect(mounted.find('button').textContent).toContain('current');
				expect(reads.filter((entry) => entry === 'condition')).toEqual(['condition']);
				mounted.click('button');
				expect(picks).toEqual(['current']);
				first = !active;
				mounted.update(Component, props);
				expect(mounted.container.querySelector('button')).toBeNull();
			} finally {
				mounted.unmount();
			}
		},
	);

	it.each([NestedCaptures, FoldedCaptures, ElseCaptures])(
		'preserves a throwing condition through client and server rendering',
		(Component) => {
			const error = new Error('condition failed');
			const props = {
				read() {
					throw error;
				},
				inner: true,
				label: 'unused',
				onPick() {},
			};
			expect(() => mount(Component, props)).toThrow(error);
			const server = loadServerFixture(fixture);
			const name =
				Component === NestedCaptures
					? 'NestedCaptures'
					: Component === FoldedCaptures
						? 'FoldedCaptures'
						: 'ElseCaptures';
			expect(() => renderToString(server[name], props)).toThrow(error);
		},
	);

	it('keeps a local shadow distinct from the capture used by the other arm', () => {
		const picks: string[] = [];
		const props = {
			visible: true,
			inner: true,
			label: 'first',
			onPick: (value: string) => picks.push(value),
		};
		const mounted = mount(ShadowedCaptures, props);
		try {
			expect(mounted.find('button').textContent).toBe('inner:first');
			mounted.update(ShadowedCaptures, { ...props, label: 'second' });
			mounted.click('button');
			expect(picks).toEqual(['inner:second']);
			mounted.update(ShadowedCaptures, { ...props, visible: false, label: 'outer' });
			expect(mounted.find('span').textContent).toBe('outer');
		} finally {
			mounted.unmount();
		}
	});

	it('keeps keyed row identity and current row captures through reorder', () => {
		const picks: string[] = [];
		const a = { id: 'a', label: 'A' },
			b = { id: 'b', label: 'B' };
		const props = {
			items: [a, b],
			visible: true,
			inner: true,
			label: 'one',
			onPick: (value: string) => picks.push(value),
		};
		const mounted = mount(ReorderedCaptures, props);
		try {
			const rowA = mounted.find('[data-id="a"] button');
			mounted.update(ReorderedCaptures, { ...props, items: [b, a], label: 'two' });
			expect(mounted.findAll('button').map((node) => node.textContent?.trim())).toEqual([
				'B:two',
				'A:two',
			]);
			expect(mounted.find('[data-id="a"] button')).toBe(rowA);
			mounted.click('[data-id="a"] button');
			expect(picks).toEqual(['A:two']);
		} finally {
			mounted.unmount();
		}
	});

	it.each([false, true])(
		'hydrates nested captures by adoption from dev=%s server output',
		(dev) => {
			const server = loadServerFixture(fixture, { compileOptions: { dev, hmr: false } });
			const picks: string[] = [];
			const props = {
				read: () => true,
				inner: true,
				label: 'server',
				onPick: (value: string) => picks.push(value),
			};
			const container = document.createElement('div');
			container.innerHTML = renderToString(server.NestedCaptures, props).html;
			document.body.appendChild(container);
			const button = container.querySelector('button');
			const errors: unknown[] = [];
			const root = hydrateRoot(container, NestedCaptures, props, {
				onRecoverableError: (error) => errors.push(error),
			});
			try {
				expect(container.querySelector('button')).toBe(button);
				flushSync(() => root.render(NestedCaptures, { ...props, label: 'client' }));
				flushSync(() => (button as HTMLButtonElement).click());
				expect(button?.textContent).toBe('client:1');
				expect(picks).toEqual(['client']);
				expect(errors).toEqual([]);
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);
});
