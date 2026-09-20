import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement, lazy, type ComponentBody } from 'octane';
import { act, flushEffects, mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

const source = readFileSync(
	'packages/octane/tests/_fixtures/output-ownership-handoff.tsrx',
	'utf8',
);

function compileFixture() {
	return loadCompiledFixtureSource(source, {
		id: 'output-ownership-handoff.tsrx',
		mode: 'client',
		compileOptions: {
			hmr: false,
			dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod',
			autoMemo: true,
			inlineHookMemo: true,
		},
	});
}

function resolvedLazyBody(first: ComponentBody<any>) {
	let current = first;
	const Lazy = lazy(
		() =>
			({
				then(resolve: (module: { default: ComponentBody<any> }) => void) {
					resolve({
						get default() {
							return current;
						},
					});
				},
			}) as PromiseLike<{ default: ComponentBody<any> }>,
	);
	return {
		Lazy,
		select(body: ComponentBody<any>) {
			current = body;
		},
	};
}

describe('resolved lazy component output', () => {
	it('restores returned output when a later sibling holds a native Activity handoff', async () => {
		const fixture = compileFixture();
		const selected = resolvedLazyBody((props) => createElement(fixture.ReturnedLifetime, props));
		const log: string[] = [];
		let ref: HTMLButtonElement | null = null;
		const props = {
			Lazy: selected.Lazy,
			text: 'initial',
			mode: 'visible' as const,
			alternate: false,
			log: (entry: string) => log.push(entry),
			onRef: (node: HTMLButtonElement | null) => {
				ref = node;
			},
			onPick: () => {},
			read: () => 'following',
		};
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const view = mount(fixture.LifetimeOwner, props);
		const events = (entry: string) => log.filter((value) => value === entry).length;
		try {
			flushEffects();
			const returned = view.find('.lifetime-counter');
			const following = view.find('.following');
			view.click('.lifetime-counter');
			expect(returned.textContent).toBe('returned:initial:1');
			expect(view.find('.parent-count').textContent).toBe('1');
			selected.select(fixture.ActivityLifetime);
			view.update(fixture.LifetimeOwner, {
				...props,
				text: 'held',
				read: () => {
					throw gate;
				},
			});
			flushEffects();
			expect(log).toContain('render activity');
			expect(view.find('.lifetime-counter')).toBe(returned);
			expect(returned.textContent).toBe('returned:initial:1');
			expect(ref).toBe(returned);
			expect(view.find('.parent-count').textContent).toBe('1');
			expect(view.find('.following')).toBe(following);
			for (const effect of ['layout', 'passive']) {
				expect(events(`${effect} mount returned`)).toBe(1);
				expect(events(`${effect} cleanup returned`)).toBe(0);
				expect(events(`${effect} mount activity`)).toBe(0);
			}
			selected.select(() => undefined);
			view.update(fixture.LifetimeOwner, props);
			flushEffects();
			expect(view.findAll('.lifetime-counter')).toEqual([]);
			expect(returned.isConnected).toBe(false);
			expect(ref).toBeNull();
			expect(view.find('.parent-count').textContent).toBe('1');
			expect(view.find('.following')).toBe(following);
			await act(async () => {
				release();
				await gate;
			});
			expect(view.findAll('.lifetime-counter')).toEqual([]);
			expect(ref).toBeNull();
			expect(view.find('.following')).toBe(following);
			view.click('.following');
			expect(view.find('.parent-count').textContent).toBe('2');
			for (const effect of ['layout', 'passive']) {
				expect(events(`${effect} cleanup returned`)).toBe(1);
				expect(events(`${effect} mount activity`)).toBe(0);
			}
		} finally {
			view.unmount();
			flushEffects();
		}
	});

	it('clears the live root of a nested branch and keeps its following sibling', () => {
		const fixture = compileFixture();
		const selected = resolvedLazyBody(fixture.NestedLifetime);
		const props = {
			Lazy: selected.Lazy,
			text: 'first',
			mode: 'visible' as const,
			alternate: false,
			log: () => {},
			onRef: () => {},
			onPick: () => {},
		};
		const view = mount(fixture.LifetimeOwner, props);
		try {
			const first = view.find('span.nested-output');
			const following = view.find('.following');
			view.click('.following');
			expect(view.find('.parent-count').textContent).toBe('1');
			view.update(fixture.LifetimeOwner, { ...props, text: 'replacement', alternate: true });
			expect(first.isConnected).toBe(false);
			const replacement = view.find('strong.nested-output');
			expect(replacement.textContent).toBe('replacement');
			expect(view.find('.following')).toBe(following);

			selected.select(() => undefined);
			view.update(fixture.LifetimeOwner, props);
			expect(view.findAll('.nested-output')).toEqual([]);
			expect(replacement.isConnected).toBe(false);
			expect(view.find('.following')).toBe(following);
			expect(view.find('.parent-count').textContent).toBe('1');
			view.click('.following');
			expect(view.find('.parent-count').textContent).toBe('2');
			expect(view.findAll('.nested-output')).toEqual([]);
			expect(view.find('.following')).toBe(following);
		} finally {
			view.unmount();
		}
	});

	it('replaces returned output with an Activity that disconnects and restores its child', () => {
		const fixture = compileFixture();
		const selected = resolvedLazyBody((props) => createElement(fixture.ReturnedLifetime, props));
		const log: string[] = [];
		const picks: string[] = [];
		let ref: HTMLButtonElement | null = null;
		const props = {
			Lazy: selected.Lazy,
			text: 'initial',
			mode: 'visible' as 'visible' | 'hidden',
			alternate: false,
			log: (entry: string) => log.push(entry),
			onRef: (node: HTMLButtonElement | null) => {
				ref = node;
			},
			onPick: (value: string) => picks.push(value),
		};
		const view = mount(fixture.LifetimeOwner, props);
		const events = (entry: string) => log.filter((value) => value === entry).length;
		try {
			flushEffects();
			const returned = view.find('.lifetime-counter');
			view.click('.lifetime-counter');
			expect(returned.textContent).toBe('returned:initial:1');
			expect(view.find('.parent-count').textContent).toBe('1');

			selected.select(fixture.ActivityLifetime);
			view.update(fixture.LifetimeOwner, { ...props, text: 'accepted' });
			flushEffects();
			const button = view.find('.lifetime-counter') as HTMLButtonElement;
			expect(button.textContent).toBe('activity:accepted:0');
			expect(button).not.toBe(returned);
			expect(returned.isConnected).toBe(false);
			expect(ref).toBe(button);
			expect(view.find('.parent-count').textContent).toBe('1');
			for (const effect of ['layout', 'passive']) {
				expect(events(`${effect} mount returned`)).toBe(1);
				expect(events(`${effect} cleanup returned`)).toBe(1);
				expect(events(`${effect} mount activity`)).toBe(1);
			}
			view.click('.lifetime-counter');
			expect(button.textContent).toBe('activity:accepted:1');
			expect(view.find('.parent-count').textContent).toBe('2');

			view.update(fixture.LifetimeOwner, { ...props, text: 'hidden update', mode: 'hidden' });
			flushEffects();
			expect(view.find('.lifetime-counter')).toBe(button);
			expect(button.style.display).toBe('none');
			expect(button.textContent).toBe('activity:hidden update:1');
			expect(ref).toBeNull();
			for (const effect of ['layout', 'passive']) {
				expect(events(`${effect} mount activity`)).toBe(1);
				expect(events(`${effect} cleanup activity`)).toBe(1);
			}

			view.update(fixture.LifetimeOwner, { ...props, text: 'revealed' });
			flushEffects();
			expect(view.find('.lifetime-counter')).toBe(button);
			expect(button.style.display).toBe('');
			expect(button.textContent).toBe('activity:revealed:1');
			expect(ref).toBe(button);
			for (const effect of ['layout', 'passive']) {
				expect(events(`${effect} mount activity`)).toBe(2);
				expect(events(`${effect} cleanup activity`)).toBe(1);
			}
			view.click('.lifetime-counter');
			expect(button.textContent).toBe('activity:revealed:2');
			expect(view.find('.parent-count').textContent).toBe('3');
			expect(picks).toEqual(['returned:initial', 'activity:accepted', 'activity:revealed']);

			selected.select(() => undefined);
			for (const text of ['empty', 'still empty']) {
				view.update(fixture.LifetimeOwner, { ...props, text });
				flushEffects();
				expect(view.findAll('.lifetime-counter')).toEqual([]);
				expect(button.isConnected).toBe(false);
				expect(ref).toBeNull();
				expect(view.find('.parent-count').textContent).toBe('3');
				for (const effect of ['layout', 'passive']) {
					expect(events(`${effect} cleanup activity`)).toBe(2);
				}
			}
		} finally {
			view.unmount();
			flushEffects();
		}
	});

	for (const name of ['ConditionalLifetime', 'SelectedLifetime'] as const) {
		it(`restores the same returned descriptor after switching to ${name}`, () => {
			const fixture = compileFixture();
			let descriptor: ReturnType<typeof createElement> | undefined;
			const returnedBody: ComponentBody<any> = (props) =>
				(descriptor ??= createElement(fixture.ReturnedLifetime, props));
			const selected = resolvedLazyBody(returnedBody);
			const log: string[] = [];
			const picks: string[] = [];
			let ref: HTMLButtonElement | null = null;
			const props = {
				Lazy: selected.Lazy,
				text: 'initial',
				mode: 'visible' as const,
				alternate: false,
				log: (entry: string) => log.push(entry),
				onRef: (node: HTMLButtonElement | null) => {
					ref = node;
				},
				onPick: (value: string) => picks.push(value),
			};
			const view = mount(fixture.LifetimeOwner, props);
			const cleanups = (role: string, effect: string) =>
				log.filter((value) => value === `${effect} cleanup ${role}`).length;
			try {
				flushEffects();
				const initial = view.find('.lifetime-counter');
				view.click('.lifetime-counter');
				expect(initial.textContent).toBe('returned:initial:1');
				selected.select(fixture[name]);
				view.update(fixture.LifetimeOwner, { ...props, text: 'branch' });
				flushEffects();
				const first = view.find('.lifetime-counter');
				expect(first.textContent).toBe('first:branch:0');
				expect(first).not.toBe(initial);
				expect(initial.isConnected).toBe(false);
				expect(ref).toBe(first);
				for (const effect of ['layout', 'passive']) expect(cleanups('returned', effect)).toBe(1);
				view.click('.lifetime-counter');
				view.update(fixture.LifetimeOwner, { ...props, text: 'updated branch' });
				flushEffects();
				expect(view.find('.lifetime-counter')).toBe(first);
				expect(first.textContent).toBe('first:updated branch:1');
				view.click('.lifetime-counter');
				expect(first.textContent).toBe('first:updated branch:2');

				view.update(fixture.LifetimeOwner, { ...props, text: 'other branch', alternate: true });
				flushEffects();
				const second = view.find('.lifetime-counter');
				expect(second.textContent).toBe('second:other branch:0');
				expect(first.isConnected).toBe(false);
				view.click('.lifetime-counter');
				expect(second.textContent).toBe('second:other branch:1');

				selected.select(returnedBody);
				view.update(fixture.LifetimeOwner, { ...props, text: 'ignored by cached descriptor' });
				flushEffects();
				const restored = view.find('.lifetime-counter');
				expect(restored.textContent).toBe('returned:initial:0');
				expect(restored).not.toBe(initial);
				expect(restored).not.toBe(second);
				expect(second.isConnected).toBe(false);
				expect(ref).toBe(restored);
				expect(view.find('.parent-count').textContent).toBe('4');
				for (const effect of ['layout', 'passive']) {
					expect(cleanups('first', effect)).toBe(1);
					expect(cleanups('second', effect)).toBe(1);
				}
				view.click('.lifetime-counter');
				expect(restored.textContent).toBe('returned:initial:1');
				expect(view.find('.parent-count').textContent).toBe('5');
				expect(picks).toEqual([
					'returned:initial',
					'first:branch',
					'first:updated branch',
					'second:other branch',
					'returned:initial',
				]);
				selected.select(() => undefined);
				view.update(fixture.LifetimeOwner, props);
				flushEffects();
				expect(view.findAll('.lifetime-counter')).toEqual([]);
				expect(ref).toBeNull();
				expect(view.find('.parent-count').textContent).toBe('5');
				for (const effect of ['layout', 'passive']) expect(cleanups('returned', effect)).toBe(2);
			} finally {
				view.unmount();
				flushEffects();
			}
		});
	}

	for (const name of ['ConditionalLabel', 'SelectedLabel'] as const) {
		it(`keeps conditional output after switching to ${name}`, () => {
			const fixture = compileFixture();
			const selected = resolvedLazyBody(() =>
				createElement(fixture.NativeLabel, { text: 'returned' }),
			);
			const view = mount(selected.Lazy, { text: 'returned', alternate: false });
			try {
				const previous = view.find('span');
				expect(previous.textContent).toBe('returned');
				selected.select(fixture[name]);
				for (const props of [
					{ text: 'first branch', alternate: false },
					{ text: 'updated first branch', alternate: false },
					{ text: 'second branch', alternate: true },
					{ text: 'updated second branch', alternate: true },
					{ text: 'first branch again', alternate: false },
				]) {
					view.update(selected.Lazy, props);
					expect(view.container.textContent).toBe(props.text);
					expect(view.find(props.alternate ? 'strong' : 'span').textContent).toBe(props.text);
				}
				expect(previous.isConnected).toBe(false);
			} finally {
				view.unmount();
			}
		});
	}

	it('renders mapped rows after switching from an empty returned array', () => {
		const fixture = compileFixture();
		const selected = resolvedLazyBody(() => []);
		const rows = Array.from({ length: 20 }, (_, id) => ({ id, text: `row ${id}` }));
		const view = mount(selected.Lazy, { rows });
		try {
			expect(view.container.textContent).toBe('');
			selected.select(fixture.MappedLabels);
			for (const next of [rows, rows, [...rows].reverse()]) {
				view.update(selected.Lazy, { rows: next });
				expect(view.findAll('[data-row]').map((row) => row.textContent)).toEqual(
					next.map((row) => row.text),
				);
			}
		} finally {
			view.unmount();
		}
	});

	it('keeps visible Activity output after switching from a returned component', () => {
		const fixture = compileFixture();
		const selected = resolvedLazyBody(() =>
			createElement(fixture.NativeLabel, { text: 'returned' }),
		);
		const view = mount(selected.Lazy, { text: 'returned' });
		try {
			expect(view.container.textContent).toBe('returned');
			selected.select(fixture.VisibleLabel);
			for (const text of ['visible first', 'visible updated', 'visible updated', 'visible again']) {
				view.update(selected.Lazy, { text });
				expect(view.container.textContent).toBe(text);
				expect(view.find('span').textContent).toBe(text);
			}
		} finally {
			view.unmount();
		}
	});
});
