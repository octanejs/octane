import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as Client from '../src/index.js';
import * as Server from 'octane/server';
import * as fixture from './_fixtures/strong-render-values.tsrx';
import { act, flushEffects } from './_helpers.js';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';

const fixturePath = 'packages/octane/tests/_fixtures/strong-render-values.tsrx';
const server = loadServerFixture(fixturePath);
let root: Client.Root | undefined;
let container: HTMLElement;
afterEach(() => {
	root?.unmount();
	root = undefined;
	container?.remove();
});

const inspect = (value: unknown) =>
	Client.isChildrenBlock(value) ? 'body' : Client.isValidElement(value) ? 'element' : typeof value;
const clone = (value: Client.OctaneNode) =>
	Client.cloneElement(value as Client.ElementDescriptor, { title: 'cloned' });

for (const mode of ['render', 'hydrate'] as const) {
	describe(`Strong named render values (${mode})`, () => {
		function start<K extends keyof typeof fixture>(
			name: K,
			props: Parameters<(typeof fixture)[K]>[0],
			serverProps: unknown = props,
		) {
			container = document.createElement('div');
			document.body.appendChild(container);
			if (mode === 'hydrate') {
				container.innerHTML = Server.renderToString(server[name], serverProps).html;
				const elements = [...container.querySelectorAll('*')];
				const recoverable = vi.fn();
				root = Client.hydrateRoot(container, fixture[name], props, {
					onRecoverableError: recoverable,
				});
				Client.flushSync(() => {});
				const adopted = [...container.querySelectorAll('*')];
				expect(adopted).toHaveLength(elements.length);
				for (const [index, element] of elements.entries()) expect(adopted[index]).toBe(element);
				expect(recoverable).not.toHaveBeenCalled();
			} else {
				root = Client.createRoot(container);
				root.render(fixture[name], props);
			}
			flushEffects();
			return {
				update(next: Parameters<(typeof fixture)[K]>[0]) {
					Client.flushSync(() => root!.render(fixture[name], next));
					flushEffects();
				},
				click(selector: string) {
					Client.flushSync(() => container.querySelector<HTMLButtonElement>(selector)!.click());
					flushEffects();
				},
			};
		}

		it('distinguishes render bodies from callbacks while retaining descriptor inspection', () => {
			const props = { label: 'one', inspect, clone };
			const app = start('RenderValueContracts', props, {
				...props,
				inspect: (value: unknown) =>
					Server.isChildrenBlock(value)
						? 'body'
						: Server.isValidElement(value)
							? 'element'
							: typeof value,
				clone: (value: Parameters<typeof Server.cloneElement>[0]) =>
					Server.cloneElement(value, { title: 'cloned' }),
			});
			expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
				'body',
				'element',
				'element',
				'function',
			]);
			expect(container.querySelector('[data-cloned] span')!.getAttribute('title')).toBe('cloned');
			expect(container.querySelector('[data-body]')!.textContent).toBe('one');
			expect(container.querySelector('[data-callback]')!.textContent).toBe('one:payload');
			app.update({ ...props, label: 'two' });
			expect(container.querySelector('[data-body]')!.textContent).toBe('two');
			expect(container.querySelector('[data-cloned]')!.textContent).toBe('two');
			expect(container.querySelector('[data-callback]')!.textContent).toBe('two:payload');
		});

		it('preserves deferred render bodies through TypeScript expression wrappers', () => {
			const hiddenRead = vi.fn(() => {
				throw new Error('Wrapped content has not been inserted');
			});
			const app = start('WrappedRenderValues', {
				visible: false,
				get label() {
					return hiddenRead();
				},
			});
			expect([...container.querySelectorAll('section')].map((node) => node.dataset.kind)).toEqual([
				'body',
				'body',
				'body',
			]);
			expect(container.querySelector('span')).toBeNull();
			expect(hiddenRead).not.toHaveBeenCalled();
			app.update({ visible: true, label: 'one' });
			const spans = [...container.querySelectorAll('span')];
			expect(spans.map((node) => node.textContent)).toEqual(['one', 'one', 'one']);
			app.update({ visible: true, label: 'two' });
			for (const [index, span] of spans.entries()) {
				expect(container.querySelectorAll('span')[index]).toBe(span);
				expect(span.textContent).toBe('two');
			}
		});

		it('evaluates only inserted content under the receiver context and retains captured updates', () => {
			const events: string[] = [];
			const evaluate = vi.fn();
			const subscribe = (channel: string) => {
				events.push(`mount:${channel}`);
				return () => {
					events.push(`cleanup:${channel}`);
				};
			};
			const props = { label: 'one', visible: false, channel: 'receiver', evaluate, subscribe };
			const app = start('NamedRenderValue', props);
			expect(container.querySelector('section')!.getAttribute('data-kind')).toBe('body');
			expect(evaluate).not.toHaveBeenCalled();
			expect(events).toEqual([]);

			app.update({ ...props, visible: true });
			const button = container.querySelector('button')!;
			expect(button.textContent).toBe('receiver:one:0');
			expect(evaluate).toHaveBeenCalled();
			expect(events).toEqual(['mount:receiver']);
			app.click('button');
			app.update({ ...props, visible: true, label: 'two' });
			expect(container.querySelector('button')).toBe(button);
			expect(button.textContent).toBe('receiver:two:1');
			expect(events).toEqual(['mount:receiver']);
			app.update({ ...props, visible: true, label: 'two', channel: 'next' });
			expect(button.textContent).toBe('next:two:1');
			expect(events).toEqual(['mount:receiver', 'cleanup:receiver', 'mount:next']);
			app.update(props);
			expect(container.querySelector('button')).toBeNull();
			expect(events).toEqual(['mount:receiver', 'cleanup:receiver', 'mount:next', 'cleanup:next']);
		});

		it.each(['own', 'inherited'] as const)(
			'defers an %s leaf getter until the body is inserted',
			(position) => {
				const hiddenRead = vi.fn(() => {
					throw new Error('The leaf body is hidden');
				});
				const visibleRead = vi.fn(() => 'ready');
				const makeProps = (
					visible: boolean,
					read: () => string,
				): Parameters<typeof fixture.PureLeafRenderValue>[0] =>
					position === 'own'
						? {
								visible,
								get label() {
									return read();
								},
							}
						: Object.assign(
								Object.create({
									get label() {
										return read();
									},
								}),
								{ visible },
							);
				const app = start('PureLeafRenderValue', makeProps(false, hiddenRead));
				expect(container.querySelector('span')).toBeNull();
				expect(hiddenRead).not.toHaveBeenCalled();
				app.update(makeProps(true, visibleRead));
				const span = container.querySelector('span')!;
				expect(span.textContent).toBe('ready');
				expect(visibleRead).toHaveBeenCalled();
				expect(hiddenRead).not.toHaveBeenCalled();
				app.update(makeProps(true, () => 'next'));
				expect(container.querySelector('span')).toBe(span);
				expect(span.textContent).toBe('next');
			},
		);

		it('defers a deep read through null until the body is inserted', () => {
			const app = start('PureDeepRenderValue', { visible: false, detail: null });
			expect(container.querySelector('span')).toBeNull();
			app.update({ visible: true, detail: { label: 'ready' } });
			const span = container.querySelector('span')!;
			expect(span.textContent).toBe('ready');
			app.update({ visible: true, detail: { label: 'next' } });
			expect(container.querySelector('span')).toBe(span);
			expect(span.textContent).toBe('next');
			app.update({ visible: false, detail: null });
			expect(container.querySelector('span')).toBeNull();
		});

		it('keeps body-local bindings out of caller memo comparisons', () => {
			const app = start('PureLocalRenderValue', { label: 'one' });
			const span = container.querySelector('span')!;
			expect(span.textContent).toBe('one');
			app.update({ label: 'two' });
			expect(container.querySelector('span')).toBe(span);
			expect(span.textContent).toBe('two');
		});

		it('keeps pure body conditional captures inside their receiving scope', () => {
			let readable = false;
			const props = {
				get label() {
					if (!readable) throw new Error('Pure content is still hidden');
					return 'one';
				},
				detail: null,
				visible: false,
			};
			const app = start('PureRenderValue', props);
			expect(container.querySelector('article')).toBeNull();
			readable = true;
			app.update({ ...props, visible: true });
			const article = container.querySelector('article')!;
			expect(article.textContent).toBe('one');
			app.update({ label: 'two', visible: true, detail: { label: 'detail' } });
			expect(container.querySelector('article')).toBe(article);
			expect(article.textContent).toBe('twodetail');
			app.update({ label: 'three', visible: true, detail: null });
			expect(article.textContent).toBe('three');
		});

		it('leaves captured getters unread until the receiver inserts the body', () => {
			let readable = false;
			const props = {
				get label() {
					if (!readable) throw new Error('The content has not been inserted');
					return 'ready';
				},
				visible: false,
				channel: 'receiver',
				evaluate: () => {},
				subscribe: () => () => {},
			};
			const app = start('NamedRenderValue', props);
			expect(container.querySelector('button')).toBeNull();
			readable = true;
			app.update({ ...props, visible: true });
			expect(container.querySelector('button')!.textContent).toBe('receiver:ready:0');
		});

		it('owns state and cleanup independently for every insertion of the same body', () => {
			const events: string[] = [];
			const subscribe = (channel: string) => {
				events.push(`mount:${channel}`);
				return () => {
					events.push(`cleanup:${channel}`);
				};
			};
			const props = { label: 'one', second: true, subscribe };
			const app = start('RepeatedRenderValue', props);
			const first = container.querySelector('[data-slot="first"] button')!;
			const second = container.querySelector('[data-slot="second"] button')!;
			expect(events).toEqual(['mount:first', 'mount:second']);
			app.click('[data-slot="first"] button');
			app.update({ ...props, label: 'two' });
			expect(first.textContent).toBe('first:two:1');
			expect(second.textContent).toBe('second:two:0');
			expect(container.querySelector('[data-slot="first"] button')).toBe(first);
			expect(container.querySelector('[data-slot="second"] button')).toBe(second);
			app.update({ ...props, second: false });
			expect(events).toEqual(['mount:first', 'mount:second', 'cleanup:second']);
			app.update(props);
			expect(container.querySelector('[data-slot="second"] button')).not.toBe(second);
			expect(container.querySelector('[data-slot="second"] button')!.textContent).toBe(
				'second:one:0',
			);
			expect(first.textContent).toBe('first:one:1');
			root!.unmount();
			root = undefined;
			expect(events.filter((event) => event === 'cleanup:first')).toHaveLength(1);
			expect(events.filter((event) => event === 'mount:second')).toHaveLength(2);
			expect(events.filter((event) => event === 'cleanup:second')).toHaveLength(2);
		});

		it('retains a keyed child until its key or component type changes', () => {
			const props = { label: 'one', entryKey: 'a', Component: fixture.StatefulLeaf };
			const app = start('KeyedRenderValue', props, { ...props, Component: server.StatefulLeaf });
			const first = container.querySelector('button')!;
			app.click('button');
			app.update({ ...props, label: 'two' });
			expect(container.querySelector('button')).toBe(first);
			expect(first.textContent).toBe('two:1');
			app.update({ ...props, entryKey: 'b' });
			const keyed = container.querySelector('button')!;
			expect(keyed).not.toBe(first);
			expect(keyed.textContent).toBe('one:0');
			app.click('button');
			app.update({ ...props, entryKey: 'b', Component: fixture.AlternateLeaf });
			expect(container.querySelector('button')).not.toBe(keyed);
			expect(container.querySelector('button')!.textContent).toBe('one:0');
			expect(container.querySelector('button')!.className).toBe('alternate');
		});

		it.each(['direct', 'dynamic host'] as const)(
			'keeps the committed body and effects when a replacement suspends through %s',
			async (kind) => {
				const events: string[] = [];
				const subscribe = (name: string) => {
					events.push(`mount:${name}`);
					return () => {
						events.push(`cleanup:${name}`);
					};
				};
				let ready = false;
				let resolve!: () => void;
				const pending = new Promise<void>((done) => {
					resolve = done;
				});
				const read = () => {
					if (!ready) throw pending;
					return 'resolved';
				};
				const forward =
					kind === 'dynamic host'
						? (content: Client.OctaneNode) =>
								Client.createElement(fixture.DynamicHost, { tag: 'div', content })
						: undefined;
				const props = { label: 'one', detail: null, useSecond: false, subscribe, read, forward };
				const app = start('SelectedRenderValue', props, {
					...props,
					forward:
						kind === 'dynamic host'
							? (content: Parameters<typeof Server.createElement>[2]) =>
									Server.createElement(server.DynamicHost, { tag: 'div', content })
							: undefined,
				});
				const article = container.querySelector('article');
				app.update({ ...props, useSecond: true });
				expect(container.querySelector('article')).toBe(article);
				expect(container.querySelector('aside, [data-second-prefix]')).toBeNull();
				expect(events).toEqual(['mount:first']);
				await act(() => {
					ready = true;
					resolve();
				});
				expect(container.querySelector('article')).toBeNull();
				expect(container.querySelector('[data-second-prefix]')!.textContent).toBe('prefix');
				expect(container.querySelector('input')!.value).toBe('resolved');
				expect(events).toEqual(['mount:first', 'cleanup:first', 'mount:second']);
				app.update(props);
				expect(container.querySelector('article')!.textContent).toBe('one');
				expect(container.querySelector('aside, [data-second-prefix]')).toBeNull();
				expect(events).toEqual([
					'mount:first',
					'cleanup:first',
					'mount:second',
					'cleanup:second',
					'mount:first',
				]);
			},
		);

		it('cleans up the committed body when its replacement throws to the receiving boundary', () => {
			const events: string[] = [];
			const subscribe = (name: string) => {
				events.push(`mount:${name}`);
				return () => {
					events.push(`cleanup:${name}`);
				};
			};
			const read = () => {
				throw new Error('replacement failed');
			};
			const props = { label: 'one', detail: null, useSecond: false, subscribe, read };
			const app = start('CaughtReplacement', props);
			app.update({ ...props, useSecond: true });
			expect(container.querySelector('[data-caught]')!.textContent).toContain('replacement failed');
			expect(container.querySelector('article, aside, [data-second-prefix]')).toBeNull();
			expect(events).toEqual(['mount:first', 'cleanup:first']);
		});

		it.each(
			mode === 'render'
				? (['descriptor', 'host', 'dynamic host'] as const)
				: (['descriptor', 'dynamic host'] as const),
		)('replaces forwarded bodies through a %s wrapper', (kind) => {
			const Host: Client.ComponentBody<{ content: Client.OctaneNode }> = (props, scope) => {
				Client.hostComponent(scope, 0, 'div', null, props.content);
			};
			const forward = (content: Client.OctaneNode) =>
				kind === 'host'
					? Client.createElement(Host, { content })
					: kind === 'dynamic host'
						? Client.createElement(fixture.DynamicHost, { tag: 'div', content })
						: Client.createElement('div', null, content);
			const props = { label: 'one', detail: null, useSecond: false, forward };
			const app = start('SelectedRenderValue', props, {
				...props,
				forward: (content: Parameters<typeof Server.createElement>[2]) =>
					kind === 'dynamic host'
						? Server.createElement(server.DynamicHost, { tag: 'div', content })
						: Server.createElement('div', null, content),
			});
			expect(container.querySelector('article')!.textContent).toBe('one');
			app.update({ ...props, useSecond: true });
			expect(container.querySelector('article')).toBeNull();
			expect(container.querySelector('input')!.value).toBe('one');
			app.update({ ...props, label: 'two' });
			expect(container.querySelector('aside, [data-second-prefix]')).toBeNull();
			expect(container.querySelector('article')!.textContent).toBe('two');
		});

		it('uses the receiver namespace for SVG content', () => {
			const app = start('SvgRenderValue', { radius: 3 });
			const circle = container.querySelector('circle')!;
			expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg');
			expect(circle.getAttribute('r')).toBe('3');
			app.update({ radius: 7 });
			expect(container.querySelector('circle')).toBe(circle);
			expect(circle.getAttribute('r')).toBe('7');
		});

		it('applies block-scoped styles only to the content', () => {
			const app = start('StyledRenderValue', { label: 'one' });
			const content = container.querySelector('[data-slot] span')!;
			expect(getComputedStyle(content).color).toBe('rgb(41, 52, 63)');
			expect(getComputedStyle(container.querySelector('[data-outside]')!).color).not.toBe(
				'rgb(41, 52, 63)',
			);
			app.update({ label: 'two' });
			expect(container.querySelector('[data-slot] span')).toBe(content);
			expect(content.textContent).toBe('two');
		});

		it('retains descriptors in a component descriptor created in setup', () => {
			const app = start('DescriptorSetupValue', { label: 'one' });
			expect(container.querySelector('[data-kind]')!.getAttribute('data-kind')).toBe('value');
			expect(container.querySelector('b')!.textContent).toBe('one');
			app.update({ label: 'two' });
			expect(container.querySelector('b')!.textContent).toBe('two');
		});

		it('replaces different named bodies in one insertion and keeps inactive captures guarded', () => {
			const props = { label: 'one', detail: null, useSecond: false };
			const app = start('SelectedRenderValue', props);
			const article = container.querySelector('article')!;
			expect(article.textContent).toBe('one');
			app.update({ ...props, label: 'two', detail: { label: 'detail' } });
			expect(container.querySelector('article')).toBe(article);
			expect(article.textContent).toBe('twodetail');
			app.update({ ...props, label: 'three' });
			expect(article.textContent).toBe('three');
			app.update({ ...props, useSecond: true });
			expect(container.querySelector('article')).toBeNull();
			const input = container.querySelector('input')!;
			input.value = 'edited';
			app.update({ ...props, useSecond: true, label: 'two' });
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe('edited');
			app.update(props);
			expect(container.querySelector('aside, [data-second-prefix]')).toBeNull();
			expect(container.querySelector('article')!.textContent).toBe('one');
		});

		it.each(['direct', 'dynamic host'] as const)(
			'renders a body update with its committed captures after a dropped render through %s',
			async (kind) => {
				let ready = false;
				let resolve!: () => void;
				const pending = new Promise<void>((done) => {
					resolve = done;
				});
				const read = () => {
					if (!ready) throw pending;
					return 'ready';
				};
				const props = { label: 'one', wait: false, host: kind === 'dynamic host', read };
				const app = start('DroppedCaptureValue', props);
				const button = container.querySelector('button')!;
				expect(button.textContent).toBe('one:0');
				// New captures reach the body, then a sibling suspends: the render drops.
				app.update({ ...props, label: 'two', wait: true });
				expect(container.querySelector('button')).toBe(button);
				expect(button.textContent).toBe('one:0');
				app.click('button');
				expect(button.textContent).toBe('one:1');
				await act(() => {
					ready = true;
					resolve();
				});
				expect(container.querySelector('button')).toBe(button);
				expect(button.textContent).toBe('two:1');
				expect(container.querySelector('i')!.textContent).toBe('ready');
			},
		);

		// One click replaces a forwarded body twice in one drain: the parent's
		// urgent update, then the owner's transition in the boundary's window.
		it.each([false, true])(
			'lands the last of two replacements in one drain (transition suspends: %s)',
			async (suspends) => {
				let ready = !suspends;
				let resolve!: () => void;
				const pending = new Promise<void>((done) => {
					resolve = done;
				});
				const read = () => {
					if (!ready) throw pending;
					return 'ready';
				};
				const app = start(
					'NestedReplacement',
					{
						read,
						forward: (content) =>
							Client.createElement(fixture.DynamicHost, { tag: 'div', content }),
					},
					{
						read,
						forward: (content: Parameters<typeof Server.createElement>[2]) =>
							Server.createElement(server.DynamicHost, { tag: 'div', content }),
					},
				);
				const host = container.querySelector('section > div')!;
				expect(host.querySelector('article')!.textContent).toBe('first');
				app.click('button');
				expect(container.querySelector('section > div')).toBe(host);
				expect(container.querySelector('[role=status]')).toBeNull();
				if (suspends) {
					// The held transition's window drops; the urgent replacement commits.
					expect(host.querySelector('article')).toBeNull();
					expect(host.querySelector('aside')!.textContent).toBe('second');
					await act(() => {
						ready = true;
						resolve();
					});
				}
				expect(host.querySelector('aside')).toBeNull();
				expect(host.querySelector('article')!.textContent).toBe('first');
				expect(container.querySelector('i')!.textContent).toBe('ready');
			},
		);
	});
}

it('classifies TypeScript-wrapped blocks as render bodies on the server', () => {
	container = document.createElement('div');
	container.innerHTML = Server.renderToString(server.WrappedRenderValues, {
		visible: true,
		label: 'server',
	}).html;
	expect([...container.querySelectorAll('section')].map((node) => node.dataset.kind)).toEqual([
		'body',
		'body',
		'body',
	]);
	expect([...container.querySelectorAll('span')].map((node) => node.textContent)).toEqual([
		'server',
		'server',
		'server',
	]);
});

it.each(['client', 'server'] as const)(
	'retains the descriptor contract outside Strong mode (%s)',
	(mode) => {
		const source = readFileSync(fixturePath, 'utf8').replace("'use strong';", '');
		const ordinary = loadCompiledFixtureSource(source, {
			id: 'ordinary-render-values.tsrx',
			mode,
			compileOptions: { hmr: false },
		});
		const props = { label: 'ordinary', inspect, clone };
		if (mode === 'server') {
			container = document.createElement('div');
			container.innerHTML = Server.renderToString(ordinary.RenderValueContracts, props).html;
		} else {
			container = document.createElement('div');
			document.body.appendChild(container);
			root = Client.createRoot(container);
			root.render(ordinary.RenderValueContracts, props);
		}
		expect(container.querySelector('[data-kind="body"]')!.textContent).toBe('element');
		expect(container.querySelector('[data-cloned] span')!.getAttribute('title')).toBe('cloned');
	},
);
