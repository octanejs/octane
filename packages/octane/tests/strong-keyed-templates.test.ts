import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Client from '../src/index.js';
import * as Server from 'octane/server';
import * as Signals from 'octane/signals';
import * as fixture from './_fixtures/strong-keyed-templates.tsrx';
import { act, flushEffects } from './_helpers.js';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';

const server = loadServerFixture('packages/octane/tests/_fixtures/strong-keyed-templates.tsrx', {
	runtimeModules: { 'octane/signals': Signals },
});
let root: Client.Root | undefined;
let container: HTMLElement;
afterEach(() => {
	root?.unmount();
	root = undefined;
	container?.remove();
});

for (const mode of ['render', 'hydrate'] as const) {
	describe(`Strong keyed templates (${mode})`, () => {
		function start<K extends keyof typeof fixture>(
			name: K,
			props: Parameters<(typeof fixture)[K]>[0],
		) {
			container = document.createElement('div');
			document.body.appendChild(container);
			if (mode === 'hydrate') {
				const serverProps =
					'Component' in props ? { ...props, Component: server.SpreadChild } : props;
				container.innerHTML = Server.renderToString(server[name], serverProps).html;
				const elements = [...container.querySelectorAll('*')];
				const recoverable = vi.fn();
				root = Client.hydrateRoot(container, fixture[name], props, {
					onRecoverableError: recoverable,
				});
				Client.flushSync(() => {});
				expect([...container.querySelectorAll('*')]).toEqual(elements);
				for (const [index, element] of elements.entries()) {
					expect(container.querySelectorAll('*')[index]).toBe(element);
				}
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
				click(button: HTMLButtonElement) {
					Client.flushSync(() => button.click());
					flushEffects();
				},
			};
		}

		it('keeps captures current and owns state, providers and cleanup for each keyed mount', () => {
			const events: string[] = [];
			const subscribe = (id: string) => {
				events.push(`mount:${id}`);
				return () => {
					events.push(`cleanup:${id}`);
				};
			};
			const props = { id: 'a', label: 'one', channel: 'inside', subscribe };
			const app = start('RepeatedGroups', props);
			const [first, second] = [...container.querySelectorAll('button')];
			app.click(first);
			app.update({ ...props, label: 'two', channel: 'updated' });
			expect([...container.querySelectorAll('button')]).toEqual([first, second]);
			expect(first.textContent).toBe('two:1');
			expect(second.textContent).toBe('two:0');
			expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
				'updated',
				'updated',
				'outside',
			]);
			expect(events).toEqual(['mount:a', 'mount:a']);
			app.update({ ...props, id: 'b' });
			expect([...container.querySelectorAll('button')].map((node) => node.textContent)).toEqual([
				'one:0',
				'one:0',
			]);
			expect(container.querySelector('button')).not.toBe(first);
			expect(events.filter((event) => event === 'cleanup:a')).toHaveLength(2);
			expect(events.filter((event) => event === 'mount:b')).toHaveLength(2);
			root!.unmount();
			root = undefined;
			expect(events.filter((event) => event === 'cleanup:b')).toHaveLength(2);
		});

		it('resets the entire caught boundary with its key and keeps the new captures', () => {
			const events: string[] = [];
			const subscribe = (id: string) => {
				events.push(`mount:${id}`);
				return () => {
					events.push(`cleanup:${id}`);
				};
			};
			const props = { id: 'a', label: 'one', read: () => 'ready', subscribe };
			const app = start('BoundaryGroup', props);
			expect(container.textContent).toBe('one:ready');
			app.update({
				...props,
				read: () => {
					throw new Error('failed');
				},
			});
			expect(container.querySelector('p')!.textContent).toBe('one:failed');
			expect(events).toEqual(['mount:a', 'cleanup:a']);
			app.update({ ...props, label: 'two' });
			expect(container.querySelector('strong')).toBeNull();
			app.update({ ...props, id: 'b', label: 'three' });
			expect(container.textContent).toBe('three:ready');
			expect(events).toEqual(['mount:a', 'cleanup:a', 'mount:b']);
		});

		it('discards an old pending boundary when the key changes', async () => {
			const props = { id: 'a', label: 'one', read: () => 'ready', subscribe: () => () => {} };
			const app = start('BoundaryGroup', props);
			let resolve!: () => void;
			const pending = new Promise<void>((done) => {
				resolve = done;
			});
			app.update({
				...props,
				id: 'b',
				label: 'two',
				read: () => {
					throw pending;
				},
			});
			expect(container.querySelector('i')!.textContent).toBe('pending:two');
			app.update({ ...props, id: 'c', label: 'three' });
			const current = container.querySelector('strong');
			expect(current!.textContent).toBe('three:ready');
			await act(() => resolve());
			expect(container.querySelector('strong')).toBe(current);
			expect(container.textContent).toBe('three:ready');
		});

		for (const name of ['SpreadBeforeKey', 'KeyBeforeSpread'] as const) {
			it(`${name} normalizes keys and remounts across keyed and unkeyed values`, () => {
				const makeProps = (key: string | number | null | undefined) => ({
					Component: fixture.SpreadChild,
					props: { key, label: 'value', subscribe: () => () => {} },
					readKey: () => key,
					readTail: () => '',
				});
				const app = start(name, makeProps(1));
				const first = container.querySelector('button')!;
				app.click(first);
				app.update(makeProps('1'));
				expect(container.querySelector('button')).toBe(first);
				expect(first.textContent).toBe('value:1:');
				app.update(makeProps(undefined));
				const unkeyed = container.querySelector('button')!;
				expect(unkeyed).not.toBe(first);
				expect(unkeyed.textContent).toBe('value:0:');
				app.click(unkeyed);
				app.update(makeProps(undefined));
				expect(container.querySelector('button')).toBe(unkeyed);
				expect(unkeyed.textContent).toBe('value:1:');
				app.update(makeProps(null));
				const nullKey = container.querySelector('button')!;
				expect(nullKey).not.toBe(unkeyed);
				app.click(nullKey);
				app.update(makeProps('null'));
				expect(container.querySelector('button')).toBe(nullKey);
				expect(nullKey.textContent).toBe('value:1:');
			});

			it(`${name} preserves getter order, winning key and same-key state`, () => {
				const order: string[] = [];
				const events: string[] = [];
				const subscribe = (label: string) => {
					events.push(`mount:${label}`);
					return () => {
						events.push(`cleanup:${label}`);
					};
				};
				const makeProps = (explicit: string, spread: string, label: string) => ({
					Component: fixture.SpreadChild,
					props: {
						get key() {
							order.push('spread:key');
							return spread;
						},
						get label() {
							order.push('spread:label');
							return label;
						},
						subscribe,
					},
					readKey: () => {
						order.push('explicit:key');
						return explicit;
					},
					readTail: () => {
						order.push('tail');
						return 'last';
					},
				});
				const app = start(name, makeProps('a', 'x', 'one'));
				const expectedOrder =
					name === 'SpreadBeforeKey'
						? ['spread:key', 'spread:label', 'explicit:key', 'tail']
						: ['explicit:key', 'spread:key', 'spread:label', 'tail'];
				expect(order).toEqual(
					mode === 'hydrate' ? [...expectedOrder, ...expectedOrder] : expectedOrder,
				);
				const first = container.querySelector('button')!;
				app.click(first);
				order.length = 0;
				app.update(
					name === 'SpreadBeforeKey' ? makeProps('a', 'y', 'two') : makeProps('b', 'x', 'two'),
				);
				expect(order).toEqual(expectedOrder);
				expect(container.querySelector('button')).toBe(first);
				expect(first.textContent).toBe('two:1:last');
				expect(events).toEqual(['mount:one']);
				app.update(makeProps('c', 'z', 'three'));
				expect(container.querySelector('button')).not.toBe(first);
				expect(container.textContent).toBe('three:0:last');
				expect(events).toEqual(['mount:one', 'cleanup:one', 'mount:three']);
			});
		}
	});
}

it('aborts a scoped resource on key replacement and ignores its late result', async () => {
	const attempts: { signal: AbortSignal; resolve: (value: string) => void }[] = [];
	const load = (_selection: string, { signal }: { signal: AbortSignal }) =>
		new Promise<string>((resolve) => {
			attempts.push({ signal, resolve });
		});
	container = document.createElement('div');
	document.body.appendChild(container);
	root = Client.createRoot(container);
	root.render(fixture.ResourceGroup, { id: 'a', load });
	await act(() => {});
	expect(container.textContent).toBe('waiting');
	expect(attempts).toHaveLength(1);
	Client.flushSync(() => root!.render(fixture.ResourceGroup, { id: 'b', load }));
	await act(() => {});
	expect(attempts[0].signal.aborted).toBe(true);
	expect(attempts).toHaveLength(2);
	await act(() => attempts[0].resolve('stale'));
	expect(container.textContent).toBe('waiting');
	await act(() => attempts[1].resolve('current'));
	expect(container.textContent).toBe('current');
	Client.flushSync(() => root!.render(fixture.ResourceGroup, { id: 'c', load }));
	await act(() => {});
	expect(attempts).toHaveLength(3);
	root.unmount();
	root = undefined;
	expect(attempts[2].signal.aborted).toBe(true);
});

it('preserves keyed Fragment refs and SVG namespaces in Strong mode', () => {
	const id = 'packages/octane/tests/_fixtures/template-keyed-fragment.tsrx';
	const strong = loadCompiledFixtureSource(`'use strong';\n${readFileSync(id, 'utf8')}`, {
		id,
		mode: 'client',
		compileOptions: { dev: false, hmr: false },
	});
	container = document.createElement('div');
	document.body.appendChild(container);
	root = Client.createRoot(container);
	const fragmentRef: { current: Client.FragmentInstance | null } = { current: null };
	root.render(strong.KeyedFragmentRef, { selected: 'a', fragmentRef });
	flushEffects();
	const first = fragmentRef.current;
	expect(first).toBeInstanceOf(Client.FragmentInstance);
	Client.flushSync(() => root!.render(strong.KeyedFragmentRef, { selected: 'b', fragmentRef }));
	expect(fragmentRef.current).toBeInstanceOf(Client.FragmentInstance);
	expect(fragmentRef.current).not.toBe(first);
	Client.flushSync(() => root!.render(strong.KeyedSvg, { selected: 'a' }));
	expect(fragmentRef.current).toBeNull();
	const circle = container.querySelector('circle')!;
	Client.flushSync(() => root!.render(strong.KeyedSvg, { selected: 'bb' }));
	expect(container.querySelector('circle')).not.toBe(circle);
	expect(container.querySelector('circle')!.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(container.querySelector('circle')!.getAttribute('r')).toBe('2');
});

for (const mode of ['client', 'server'] as const) {
	it(`preserves imported component config semantics and evaluation order (${mode})`, () => {
		const events: string[] = [];
		const hidden = Symbol('hidden');
		const render = mode === 'client' ? Client.createElement : Server.createElement;
		const Child = (props: Record<string | symbol, unknown>) => {
			expect(Object.hasOwn(props, 'key')).toBe(false);
			expect(Object.hasOwn(props, hidden)).toBe(false);
			return render('output', null, String(props.label));
		};
		let defaultLabel = 'default';
		Object.defineProperty(Child, 'defaultProps', {
			get() {
				events.push('defaults');
				return { label: defaultLabel };
			},
		});
		const compiled = loadCompiledFixtureSource(
			`
			'use strong';
			import { Child } from './child';
			export function View(props) @{
				<Child {...props.config} key={props.getKey()} />
			}
		`,
			{
				id: '/strong-keyed-config.tsrx',
				mode,
				compileOptions: { dev: false, hmr: false },
				runtimeModules: { './child': { Child } },
			},
		);
		const props = {
			config: {
				get label() {
					events.push('label');
					return undefined;
				},
				get [hidden]() {
					events.push('symbol');
					return 'ignored';
				},
			},
			getKey: () => {
				events.push('key');
				return {
					toString() {
						events.push('coerce');
						return 'a';
					},
				};
			},
		};
		container = document.createElement('div');
		document.body.appendChild(container);
		const update = () => {
			if (mode === 'client') {
				root ??= Client.createRoot(container);
				Client.flushSync(() => root!.render(compiled.View, props));
			} else {
				container.innerHTML = Server.renderToString(compiled.View, props).html;
			}
		};
		update();
		expect(container.textContent).toBe('default');
		expect(events).toEqual(['label', 'symbol', 'key', 'coerce', 'defaults']);
		defaultLabel = 'updated';
		events.length = 0;
		update();
		expect(container.textContent).toBe('updated');
		expect(events).toEqual(['label', 'symbol', 'key', 'coerce', 'defaults']);
	});
}

for (const mode of ['render', 'hydrate'] as const) {
	it(`preserves the lexical receiver and arguments inside a keyed Fragment (${mode})`, () => {
		const source = `
			'use strong';
			import { Fragment } from 'octane';
			export function View(props) @{
				const receiver = this;
				<Fragment key={props.id}>
					<output>{(this === receiver ? arguments[0].label : 'wrong receiver') as string}</output>
				</Fragment>
			}
		`;
		const compiled = loadCompiledFixtureSource(source, {
			id: '/strong-fragment-lexical-values.tsrx',
			mode: 'client',
			compileOptions: { dev: false, hmr: false },
		});
		container = document.createElement('div');
		document.body.appendChild(container);
		const props = { id: 'a', label: 'first' };
		if (mode === 'hydrate') {
			const serverView = loadCompiledFixtureSource(source, {
				id: '/strong-fragment-lexical-values.tsrx',
				mode: 'server',
				compileOptions: { dev: false, hmr: false },
			});
			container.innerHTML = Server.renderToString(serverView.View, props).html;
			const output = container.querySelector('output');
			const onRecoverableError = vi.fn();
			root = Client.hydrateRoot(container, compiled.View, props, { onRecoverableError });
			Client.flushSync(() => {});
			expect(container.querySelector('output')).toBe(output);
			expect(onRecoverableError).not.toHaveBeenCalled();
		} else {
			root = Client.createRoot(container);
			root.render(compiled.View, props);
		}
		expect(container.textContent).toBe('first');
		const output = container.querySelector('output');
		Client.flushSync(() => root!.render(compiled.View, { id: 'a', label: 'updated' }));
		expect(container.querySelector('output')).toBe(output);
		expect(container.textContent).toBe('updated');
	});

	it.each(['++count', "{ toString() { count = 1; return 'a'; } }"])(
		`evaluates a Fragment key %s before capturing its body locals (${mode})`,
		(key) => {
			const source = `
			'use strong';
			import { Fragment } from 'octane';
			export function View() @{
				let count = 0;
				<Fragment key={${key}}><output>{count as string}</output></Fragment>
			}
		`;
			const compiled = loadCompiledFixtureSource(source, {
				id: '/strong-fragment-key-order.tsrx',
				mode: 'client',
				compileOptions: { dev: false, hmr: false },
			});
			container = document.createElement('div');
			document.body.appendChild(container);
			if (mode === 'hydrate') {
				const serverView = loadCompiledFixtureSource(source, {
					id: '/strong-fragment-key-order.tsrx',
					mode: 'server',
					compileOptions: { dev: false, hmr: false },
				});
				container.innerHTML = Server.renderToString(serverView.View, {}).html;
				const output = container.querySelector('output');
				const onRecoverableError = vi.fn();
				root = Client.hydrateRoot(container, compiled.View, {}, { onRecoverableError });
				Client.flushSync(() => {});
				expect(container.querySelector('output')).toBe(output);
				expect(onRecoverableError).not.toHaveBeenCalled();
			} else {
				root = Client.createRoot(container);
				root.render(compiled.View, {});
			}
			expect(container.textContent).toBe('1');
		},
	);

	it(`preserves dynamic Fragment refs, Activity and host form actions (${mode})`, async () => {
		const source = `
			'use strong';
			export function View(props) @{
				<props.Tag key={props.id} {...props.config}>
					<input name="draft" defaultValue="initial" />
				</props.Tag>
			}
		`;
		const compiled = loadCompiledFixtureSource(source, {
			id: '/strong-dynamic-keyed-config.tsrx',
			mode: 'client',
			compileOptions: { dev: false, hmr: false },
		});
		container = document.createElement('div');
		document.body.appendChild(container);
		const props = { Tag: Client.Fragment, id: 'a', config: { ref: null } };
		if (mode === 'hydrate') {
			const serverView = loadCompiledFixtureSource(source, {
				id: '/strong-dynamic-keyed-config.tsrx',
				mode: 'server',
				compileOptions: { dev: false, hmr: false },
			});
			container.innerHTML = Server.renderToString(serverView.View, props).html;
			const input = container.querySelector('input');
			const onRecoverableError = vi.fn();
			root = Client.hydrateRoot(container, compiled.View, props, { onRecoverableError });
			Client.flushSync(() => {});
			expect(container.querySelector('input')).toBe(input);
			expect(onRecoverableError).not.toHaveBeenCalled();
		} else {
			root = Client.createRoot(container);
			root.render(compiled.View, props);
		}
		const input = container.querySelector('input')!;
		input.value = 'edited';
		const ref: { current: Client.FragmentInstance | null } = { current: null };
		Client.flushSync(() => root!.render(compiled.View, { ...props, config: { ref } }));
		expect(ref.current).toBeInstanceOf(Client.FragmentInstance);
		expect(container.querySelector('input')).toBe(input);
		expect(input.value).toBe('edited');
		Client.flushSync(() => root!.render(compiled.View, props));
		expect(ref.current).toBeNull();
		expect(container.querySelector('input')).toBe(input);

		const activityProps = { Tag: Client.Activity, id: 'a', config: { mode: 'visible' } };
		Client.flushSync(() => root!.render(compiled.View, activityProps));
		const activityInput = container.querySelector('input')!;
		Client.flushSync(() =>
			root!.render(compiled.View, { ...activityProps, config: { mode: 'hidden' } }),
		);
		expect(activityInput.style.display).toBe('none');
		Client.flushSync(() => root!.render(compiled.View, activityProps));
		expect(container.querySelector('input')).toBe(activityInput);
		expect(activityInput.style.display).toBe('');

		const submitted: string[] = [];
		const action = (data: FormData) => {
			submitted.push(String(data.get('draft')));
		};
		Client.flushSync(() =>
			root!.render(compiled.View, { Tag: 'form', id: 'a', config: { action } }),
		);
		container.querySelector('input')!.value = 'submitted';
		await act(() =>
			container
				.querySelector('form')!
				.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
		);
		expect(submitted).toEqual(['submitted']);
	});
}

it('keeps keyed Fragment identities and nested captures stable across server async replays', async () => {
	const { prerender } = await import('octane/static');
	const compiled = loadCompiledFixtureSource(
		`
		'use strong';
		import { Fragment, use } from 'octane';
		export function View(props) @{
			<div>
				@for (const row of props.rows; key row.id) {
					@try {
						const prefix = row.label + ':';
						<section>
							<Fragment key={row.selection}>
								@{
									const value = use(props.load(row.id));
									<output>{(prefix + value) as string}</output>
								}
							</Fragment>
						</section>
					} @pending {
						<p>pending</p>
					}
				}
			</div>
		}
	`,
		{
			id: '/strong-keyed-fragment-replay.tsrx',
			mode: 'server',
			compileOptions: { dev: false, hmr: false },
		},
	);
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(new Error('keyed Fragment replay did not settle')),
		2000,
	);
	try {
		const result = await prerender(
			compiled.View,
			{
				rows: [
					{ id: 'a', selection: 'first', label: 'one' },
					{ id: 'b', selection: 'second', label: 'two' },
				],
				load: (id: string) => new Promise<string>((resolve) => setTimeout(() => resolve(id), 0)),
			},
			{ signal: controller.signal },
		);
		container = document.createElement('div');
		container.innerHTML = result.html;
		expect([...container.querySelectorAll('output')].map((node) => node.textContent)).toEqual([
			'one:a',
			'two:b',
		]);
		expect(container.querySelector('p')).toBeNull();
	} finally {
		clearTimeout(timeout);
		controller.abort();
	}
});

it('preserves setup locals across a keyed Fragment during server rendering and hydration', () => {
	const source = `
		'use strong';
		import { Fragment, useState } from 'octane';
		export function View({ value }) @{
			@{
				const label = value;
				<Fragment key={label}>
					@{ const [text] = useState(() => label); <span>{text}</span> }
				</Fragment>
			}
		}
	`;
	const options = { id: '/keyed-setup-capture.tsrx', compileOptions: { dev: false, hmr: false } };
	const serverView = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
	const clientView = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
	const props = { value: 'hello' };
	container = document.createElement('div');
	document.body.appendChild(container);
	container.innerHTML = Server.renderToString(serverView['View'], props).html;
	const span = container.querySelector('span');
	expect(span?.textContent).toBe('hello');
	const onRecoverableError = vi.fn();
	root = Client.hydrateRoot(container, clientView['View'], props, { onRecoverableError });
	Client.flushSync(() => {});
	expect(container.querySelector('span')).toBe(span);
	expect(onRecoverableError).not.toHaveBeenCalled();
});
