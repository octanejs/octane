import { describe, expect, it } from 'vitest';
import { flushSync, hydrateRoot } from '../src/index.js';
import { renderToString } from 'octane/server';
import { mount, act } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import { InputRows, InputOnlyRows, type InputRowsProps } from './_fixtures/root-render-inputs.tsrx';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('root row inputs', () => {
	it.each(['both', 'captures', 'item'] as const)(
		'keeps accepted %s values available to row state updates during a hold',
		async (change) => {
			const picks: string[] = [];
			const gate = deferred();
			let ready = false;
			const Component = change === 'item' ? InputOnlyRows : InputRows;
			const props: InputRowsProps = {
				items: [
					{ id: 'a', label: 'A' },
					{ id: 'b', label: 'B' },
				],
				prefix: 'accepted',
				read: () => 'ready',
				onPick: (value) => picks.push(value),
			};
			const mounted = mount(Component, props);
			try {
				const rowA = mounted.find('[data-id="a"]');
				const rowB = mounted.find('[data-id="b"]');
				const buttonA = change === 'item' ? rowA : rowA.querySelector('button')!;
				const candidate: InputRowsProps = {
					...props,
					items:
						change === 'captures'
							? props.items
							: [
									{ id: 'b', label: 'B-new' },
									{ id: 'a', label: 'A-new' },
								],
					prefix: 'candidate',
					read() {
						if (!ready) throw gate.promise;
						return 'resolved';
					},
				};
				mounted.update(Component, candidate);
				expect(mounted.findAll('[data-id]')).toEqual([rowA, rowB]);
				flushSync(() => buttonA.dispatchEvent(new MouseEvent('click', { bubbles: true })));
				expect(buttonA.textContent?.trim()).toBe(change === 'item' ? 'A:1' : 'A:accepted:1');
				if (change !== 'item') expect(picks).toEqual(['A:accepted']);
				ready = true;
				await act(async () => {
					gate.resolve();
					await gate.promise;
				});
				expect(mounted.find('[data-id="a"]')).toBe(rowA);
				expect(mounted.findAll('[data-id]')).toEqual(
					change === 'captures' ? [rowA, rowB] : [rowB, rowA],
				);
				expect(buttonA.textContent?.trim()).toBe(
					change === 'item' ? 'A-new:1' : (change === 'captures' ? 'A' : 'A-new') + ':candidate:1',
				);
				expect(mounted.find('p').textContent).toBe('resolved');
			} finally {
				mounted.unmount();
				gate.resolve();
			}
		},
	);

	it.each([true, false])(
		'restores hydrated row values before a newer commit (server dev=%s)',
		async (dev) => {
			const server = loadServerFixture('packages/octane/tests/_fixtures/root-render-inputs.tsrx', {
				compileOptions: { dev },
			});
			const picks: string[] = [];
			const props: InputRowsProps = {
				items: [
					{ id: 'a', label: 'A' },
					{ id: 'b', label: 'B' },
				],
				prefix: 'server',
				read: () => 'ready',
				onPick: (value) => picks.push(value),
			};
			const container = document.createElement('div');
			container.innerHTML = renderToString(server.InputRows, props).html;
			document.body.appendChild(container);
			const input = container.querySelector('input')!;
			const button = container.querySelector('button')!;
			input.value = 'typed before hydration';
			const root = hydrateRoot(container, InputRows, props);
			const gate = deferred();
			try {
				flushSync(() => {});
				expect(container.querySelector('input')).toBe(input);
				flushSync(() =>
					root.render(InputRows, {
						...props,
						items: [
							{ id: 'b', label: 'draft B' },
							{ id: 'a', label: 'draft A' },
						],
						prefix: 'draft',
						read() {
							throw gate.promise;
						},
					}),
				);
				flushSync(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
				expect(button.textContent).toBe('A:server:1');
				expect(input.value).toBe('typed before hydration');
				flushSync(() =>
					root.render(InputRows, {
						...props,
						items: [
							{ id: 'a', label: 'latest A' },
							{ id: 'b', label: 'latest B' },
						],
						prefix: 'latest',
					}),
				);
				await act(async () => {
					gate.resolve();
					await gate.promise;
				});
				expect(container.querySelector('button')).toBe(button);
				expect(button.textContent).toBe('latest A:latest:1');
				expect(input.value).toBe('typed before hydration');
				expect(picks).toEqual(['A:server']);
			} finally {
				root.unmount();
				container.remove();
				gate.resolve();
			}
		},
	);
});
