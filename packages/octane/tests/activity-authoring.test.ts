import { afterEach, describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup as reactStaticMarkup } from 'react-dom/server';
import * as Server from 'octane/server';
import {
	Activity,
	createElement,
	createPortal,
	createRoot,
	flushSync,
	hydrateRoot,
} from '../src/index.js';
import { flushEffects, mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import { collectPipeableStream, collectReadableStream } from './_server-stream.js';
import * as Fixture from './_fixtures/activity-authoring.tsrx';
import * as ReturnedFixture from './_fixtures/activity-authoring-returned.js';
import {
	BlockShadowedActivity,
	CallbackShadowedActivity,
	ModuleShadowedActivity,
} from './_fixtures/activity-authoring-shadowed.js';

const server = loadServerFixture('packages/octane/tests/_fixtures/activity-authoring.tsrx');
const returnedServer = loadServerFixture(
	'packages/octane/tests/_fixtures/activity-authoring-returned.tsx',
);
const shadowedServer = loadServerFixture(
	'packages/octane/tests/_fixtures/activity-authoring-shadowed.tsx',
);
const roots: Array<{ unmount(): void }> = [];
const containers: HTMLElement[] = [];

function container(): HTMLElement {
	const element = document.createElement('div');
	document.body.appendChild(element);
	containers.push(element);
	return element;
}

function child(host: ParentNode, label: string): HTMLButtonElement {
	return host.querySelector(`[data-activity-child="${label}"]`) as HTMLButtonElement;
}

afterEach(() => {
	for (const root of roots.splice(0)) root.unmount();
	for (const element of containers.splice(0)) element.remove();
});

describe('<Activity> authoring forms', () => {
	// ReactFizzServer renders REACT_ACTIVITY_TYPE by identity, not the identifier
	// used at its JSX site. React's Activity-test.js also preserves child state
	// when the mode changes while ordinary keyed identity still controls resets.
	for (const name of [
		'DirectActivity',
		'AliasedActivity',
		'NamespacedActivity',
		'DynamicActivity',
		'DynamicSpreadActivity',
		'SpreadActivity',
		'ActivityChildrenProp',
	] as const) {
		it(`${name} preserves state and DOM while hiding and revealing`, () => {
			const Component = Fixture[name];
			const effects: string[] = [];
			const props = {
				mode: 'visible' as const,
				config: { mode: 'visible' as const },
				label: 'child',
				onEffect: (event: string) => effects.push(event),
			};
			const view = mount(Component, props);
			roots.push(view);
			flushEffects();
			const button = child(view.container, 'child');
			expect(button).not.toBeNull();
			flushSync(() => button.click());
			expect(button.textContent).toBe('child:1');
			view.update(Component, { ...props, mode: 'hidden', config: { mode: 'hidden' } });
			flushEffects();
			expect(child(view.container, 'child')).toBe(button);
			expect(button.style.display).toBe('none');
			expect(effects).toEqual(['mount:child', 'cleanup:child']);
			view.update(Component, props);
			flushEffects();
			expect(child(view.container, 'child')).toBe(button);
			expect(button.style.display).toBe('');
			expect(button.textContent).toBe('child:1');
			expect(effects).toEqual(['mount:child', 'cleanup:child', 'mount:child']);
		});
	}

	it('keeps an unrelated local component named Activity ordinary', () => {
		const view = mount(Fixture.ShadowedActivity, { label: 'ordinary' });
		roots.push(view);
		const wrapper = view.container.querySelector('[data-ordinary-activity]') as HTMLElement;
		expect(wrapper).not.toBeNull();
		expect(wrapper.dataset.ordinaryActivity).toBe('hidden');
		expect(wrapper.style.display).toBe('');
		expect(child(wrapper, 'ordinary').textContent).toBe('ordinary:0');
	});

	it('merges spread props in source order and lets nested children override children props', () => {
		const view = mount(Fixture.ActivityPropPrecedence, {
			mode: 'visible',
			label: 'unused',
			config: { mode: 'visible', children: 'overridden' },
		});
		roots.push(view);
		expect(child(view.container, 'spread-wins').style.display).toBe('');
		expect(child(view.container, 'explicit-wins').style.display).toBe('none');
		expect(child(view.container, 'nested-wins').textContent).toBe('nested-wins:0');
		expect(view.container.textContent).not.toContain('overridden');
	});

	for (const name of ['KeyedActivity', 'SpreadActivity', 'DynamicSpreadActivity'] as const) {
		it(`${name} resets child state when its key changes`, () => {
			const Component = Fixture[name];
			const props = {
				mode: 'visible' as const,
				activityKey: 'first',
				config: { mode: 'visible' as const, key: 'first' },
				label: 'keyed',
			};
			const view = mount(Component, props);
			roots.push(view);
			const original = child(view.container, 'keyed');
			flushSync(() => original.click());
			view.update(Component, {
				...props,
				mode: 'hidden',
				config: { ...props.config, mode: 'hidden' },
			});
			view.update(Component, props);
			expect(child(view.container, 'keyed')).toBe(original);
			expect(original.textContent).toBe('keyed:1');
			view.update(Component, {
				...props,
				activityKey: 'second',
				config: { ...props.config, key: 'second' },
			});
			const replacement = child(view.container, 'keyed');
			expect(replacement).not.toBe(original);
			expect(replacement.textContent).toBe('keyed:0');
		});
	}

	for (const [name, Component, ServerComponent, spreadWins] of [
		[
			'DynamicSpreadWinsActivity',
			Fixture.DynamicSpreadWinsActivity,
			server.DynamicSpreadWinsActivity,
			true,
		],
		[
			'DynamicExplicitWinsActivity',
			Fixture.DynamicExplicitWinsActivity,
			server.DynamicExplicitWinsActivity,
			false,
		],
		[
			'ReturnedDynamicSpreadWinsActivity',
			ReturnedFixture.ReturnedDynamicSpreadWinsActivity,
			returnedServer.ReturnedDynamicSpreadWinsActivity,
			true,
		],
		[
			'ReturnedDynamicExplicitWinsActivity',
			ReturnedFixture.ReturnedDynamicExplicitWinsActivity,
			returnedServer.ReturnedDynamicExplicitWinsActivity,
			false,
		],
	] as const) {
		it(`${name} reconciles by the last authored key after hydration`, () => {
			const props = {
				mode: 'visible' as const,
				activityKey: 'explicit',
				config: { mode: 'visible' as const, key: 'spread' },
				label: 'ordered-key',
			};
			const host = container();
			host.innerHTML = Server.renderToString(ServerComponent, props).html;
			const original = child(host, props.label);
			const root = hydrateRoot(host, Component, props);
			roots.push(root);
			flushSync(() => {});
			expect(child(host, props.label)).toBe(original);
			flushSync(() => original.click());

			const changedLosingKey = spreadWins
				? { ...props, activityKey: 'ignored-change' }
				: { ...props, config: { ...props.config, key: 'ignored-change' } };
			root.render(Component, changedLosingKey);
			flushSync(() => {});
			expect(child(host, props.label)).toBe(original);
			expect(original.textContent).toBe('ordered-key:1');

			root.render(Component, {
				...changedLosingKey,
				config: { ...changedLosingKey.config, mode: 'hidden' },
			});
			flushSync(() => {});
			expect(child(host, props.label)).toBe(original);
			expect(original.style.display).toBe('none');
			root.render(Component, changedLosingKey);
			flushSync(() => {});
			expect(child(host, props.label)).toBe(original);
			expect(original.style.display).toBe('');

			const changedEffectiveKey = spreadWins
				? { ...props, config: { ...props.config, key: 'replacement' } }
				: { ...props, activityKey: 'replacement' };
			root.render(Component, changedEffectiveKey);
			flushSync(() => {});
			expect(child(host, props.label)).not.toBe(original);
			expect(child(host, props.label).textContent).toBe('ordered-key:0');
		});
	}

	it('evaluates a dynamic tag’s explicit key before a later spread config', () => {
		function propsFor(events: string[]) {
			return {
				config: {
					get key() {
						events.push('spread:key');
						return 'effective';
					},
				},
				readKey() {
					events.push('key');
					return 'overridden';
				},
				readMode() {
					events.push('mode');
					return 'visible' as const;
				},
				readLabel() {
					events.push('child');
					return 'ordered';
				},
			};
		}
		const expected = ['key', 'spread:key', 'mode', 'child'];
		const clientEvents: string[] = [];
		const view = mount(Fixture.DynamicActivityConfigOrder, propsFor(clientEvents));
		roots.push(view);
		expect(child(view.container, 'ordered').textContent).toBe('ordered:0');
		expect(clientEvents).toEqual(expected);
		const serverEvents: string[] = [];
		expect(
			Server.renderToStaticMarkup(server.DynamicActivityConfigOrder, propsFor(serverEvents)).html,
		).toContain('ordered:0');
		expect(serverEvents).toEqual(expected);
	});

	it('retains template directives inside a spread-configured Activity', () => {
		const props = {
			mode: 'hidden' as const,
			config: { mode: 'hidden' as const },
			label: 'branch',
			show: true,
		};
		const view = mount(Fixture.ActivityDirectiveChildren, props);
		roots.push(view);
		expect(child(view.container, 'branch').style.display).toBe('none');
		view.update(Fixture.ActivityDirectiveChildren, { ...props, show: false });
		const empty = view.container.querySelector('[data-activity-empty]') as HTMLElement;
		expect(empty.textContent).toBe('empty');
		expect(empty.style.display).toBe('none');
		view.update(Fixture.ActivityDirectiveChildren, {
			...props,
			config: { mode: 'visible' },
			show: false,
		});
		expect(view.container.querySelector('[data-activity-empty]')).toBe(empty);
		expect(empty.style.display).toBe('');
	});

	for (const suspends of [false, true]) {
		it(`bounds render-phase update loops in hidden content${suspends ? ' that suspends' : ''}`, () => {
			const pending = suspends ? new Promise<never>(() => {}) : undefined;
			expect(() => {
				const view = mount(Fixture.ActivityRenderLoop, { pending });
				roots.push(view);
			}).toThrow(/Too many re-renders|error #9/);
		});
	}
});

describe('<Activity> element descriptors', () => {
	for (const placement of ['root', 'host', 'list', 'portal'] as const) {
		it(`preserves descriptor children at a ${placement} position`, () => {
			const host = container();
			const portal = placement === 'portal' ? container() : host;
			const root = createRoot(host);
			roots.push(root);
			function output(mode: 'visible' | 'hidden', key = 'saved') {
				const activity = createElement(
					Activity,
					{ mode, key },
					createElement(Fixture.ActivityAuthoringChild, { label: placement }),
				);
				if (placement === 'root') return activity;
				if (placement === 'portal') return createPortal(activity, portal);
				return createElement(
					'section',
					null,
					placement === 'list' ? [activity, createElement('i', { key: 'tail' }, 'tail')] : activity,
				);
			}
			root.render(output('visible'));
			flushSync(() => {});
			const button = child(portal, placement);
			expect(button).not.toBeNull();
			flushSync(() => button.click());
			root.render(output('hidden'));
			flushSync(() => {});
			expect(child(portal, placement)).toBe(button);
			expect(button.style.display).toBe('none');
			root.render(output('visible'));
			flushSync(() => {});
			expect(child(portal, placement)).toBe(button);
			expect(button.textContent).toBe(`${placement}:1`);
			expect(button.style.display).toBe('');
			root.render(output('visible', 'replacement'));
			flushSync(() => {});
			expect(child(portal, placement)).not.toBe(button);
			expect(child(portal, placement).textContent).toBe(`${placement}:0`);
		});
	}
});

describe('<Activity> returned JSX', () => {
	for (const name of ['ReturnedActivity', 'NestedReturnedActivity'] as const) {
		it(`${name} preserves state, key precedence, and server node identity`, () => {
			const Component = ReturnedFixture[name];
			const props = {
				mode: 'visible' as const,
				label: 'returned',
				activityKey: 'overridden',
				config: { mode: 'visible' as const, key: 'effective' },
			};
			const host = container();
			host.innerHTML = Server.renderToString(returnedServer[name], props).html;
			const original = child(host, 'returned');
			const tail = host.querySelector('[data-activity-tail]');
			expect(original).not.toBeNull();
			const root = hydrateRoot(host, Component, props);
			roots.push(root);
			flushSync(() => {});
			expect(child(host, 'returned')).toBe(original);
			flushSync(() => original.click());
			root.render(Component, {
				...props,
				activityKey: 'still-overridden',
				config: { ...props.config, mode: 'hidden' },
			});
			flushSync(() => {});
			expect(child(host, 'returned')).toBe(original);
			expect(original.style.display).toBe('none');
			root.render(Component, props);
			flushSync(() => {});
			expect(child(host, 'returned')).toBe(original);
			expect(original.textContent).toBe('returned:1');
			root.render(Component, { ...props, config: { ...props.config, key: 'replacement' } });
			flushSync(() => {});
			expect(child(host, 'returned')).not.toBe(original);
			expect(child(host, 'returned').textContent).toBe('returned:0');
			if (tail !== null) expect(host.querySelector('[data-activity-tail]')).toBe(tail);
		});
	}

	it('evaluates spread getters and explicit props in authored order', () => {
		function propsFor(events: string[]) {
			return {
				config: {
					get mode() {
						events.push('spread:mode');
						return 'hidden' as const;
					},
					get key() {
						events.push('spread:key');
						return 'overridden';
					},
				},
				readName() {
					events.push('name');
					return 'instrumented';
				},
				readKey() {
					events.push('key');
					return 'effective';
				},
				readMode() {
					events.push('mode');
					return 'visible' as const;
				},
				readLabel() {
					events.push('child');
					return 'ordered';
				},
			};
		}
		const expected = ['name', 'spread:mode', 'spread:key', 'key', 'mode', 'child'];
		const clientEvents: string[] = [];
		const view = mount(ReturnedFixture.ActivityConfigOrder, propsFor(clientEvents));
		roots.push(view);
		expect(child(view.container, 'ordered').style.display).toBe('');
		expect(clientEvents).toEqual(expected);
		const serverEvents: string[] = [];
		const html = Server.renderToStaticMarkup(
			returnedServer.ActivityConfigOrder,
			propsFor(serverEvents),
		).html;
		expect(html).toContain('ordered:0');
		expect(serverEvents).toEqual(expected);
	});

	it('does not reserve a module-local Activity component name', () => {
		const view = mount(ModuleShadowedActivity);
		roots.push(view);
		const wrapper = view.container.querySelector('[data-ordinary-activity]') as HTMLElement;
		expect(wrapper).not.toBeNull();
		expect(wrapper.style.display).toBe('');
		expect(wrapper.textContent).toBe('ordinary');
		expect(Server.renderToStaticMarkup(shadowedServer.ModuleShadowedActivity).html).toBe(
			'<div data-ordinary-activity="hidden"><span>ordinary</span></div>',
		);
	});

	it('resolves named and namespace imports through module callback scopes', () => {
		const view = mount(CallbackShadowedActivity);
		roots.push(view);
		const wrappers = Array.from(
			view.container.querySelectorAll<HTMLElement>('[data-ordinary-activity]'),
		);
		expect(wrappers.map((wrapper) => wrapper.textContent)).toEqual(['callback', 'namespace']);
		expect(wrappers.every((wrapper) => wrapper.style.display === '')).toBe(true);
		const html = Server.renderToStaticMarkup(shadowedServer.CallbackShadowedActivity).html;
		expect(html).toContain('<div data-ordinary-activity="hidden"><span>callback</span></div>');
		expect(html).toContain('<div data-ordinary-activity="hidden"><span>namespace</span></div>');
	});

	it('does not lower a block-scoped import shadow as the builtin', () => {
		const view = mount(BlockShadowedActivity, { ordinary: true });
		roots.push(view);
		const wrapper = view.container.querySelector('[data-ordinary-activity]') as HTMLElement;
		expect(wrapper).not.toBeNull();
		expect(wrapper.textContent).toBe('block');
		expect(wrapper.style.display).toBe('');
		expect(
			Server.renderToStaticMarkup(shadowedServer.BlockShadowedActivity, { ordinary: true }).html,
		).toBe('<div data-ordinary-activity="hidden"><span>block</span></div>');
		view.update(BlockShadowedActivity, { ordinary: false });
		expect(view.container.querySelector('[data-ordinary-activity]')).toBeNull();
		expect(view.container.textContent).toBe('builtin');
	});
});

describe('<Activity> server rendering and hydration', () => {
	// Per ReactDOMServerPartialHydrationActivity-test.internal.js:1083 and
	// React's documented server Activity contract: hidden children are omitted.
	for (const name of [
		'DirectActivity',
		'AliasedActivity',
		'NamespacedActivity',
		'DynamicActivity',
		'DynamicSpreadActivity',
		'SpreadActivity',
		'KeyedActivity',
		'ActivityChildrenProp',
	] as const) {
		it(`${name} omits hidden HTML and adopts visible server nodes`, () => {
			const props = { mode: 'visible' as const, config: { mode: 'visible' as const }, label: name };
			const visible = Server.renderToString(server[name], props).html;
			const hidden = Server.renderToStaticMarkup(server[name], {
				...props,
				mode: 'hidden',
				config: { mode: 'hidden' },
			}).html;
			expect(hidden).toBe('');
			const host = container();
			host.innerHTML = visible;
			const button = child(host, name);
			expect(button).not.toBeNull();
			const root = hydrateRoot(host, Fixture[name], props);
			roots.push(root);
			flushSync(() => {});
			expect(child(host, name)).toBe(button);
			flushSync(() => button.click());
			expect(button.textContent).toBe(`${name}:1`);
		});
	}

	it('matches React static markup for a public Activity descriptor', () => {
		for (const mode of ['visible', 'hidden'] as const) {
			const expected = reactStaticMarkup(
				React.createElement(React.Activity, {
					mode,
					children: React.createElement('span', null, 'child'),
				}),
			);
			const actual = Server.renderToStaticMarkup(() =>
				Server.createElement(
					Server.Activity,
					{ mode },
					Server.createElement('span', null, 'child'),
				),
			).html;
			expect(actual).toBe(expected);
		}
	});

	it('finishes both stream transports without evaluating hidden descriptor children', async () => {
		const fail = () => {
			throw new Error('hidden child must not render');
		};
		const App = () =>
			Server.createElement(
				'main',
				null,
				Server.createElement(Server.Activity, { mode: 'hidden' }, Server.createElement(fail)),
				Server.createElement('span', { id: 'visible-stream-tail' }, 'ready'),
			);
		for (const collect of [collectPipeableStream, collectReadableStream]) {
			const result = await collect(App);
			expect(result.errors).toEqual([]);
			const host = container();
			host.innerHTML = result.html;
			expect(host.querySelector('#visible-stream-tail')?.textContent).toBe('ready');
			expect(host.textContent).toBe('ready');
		}
	});

	for (const initialMode of ['visible', 'hidden'] as const) {
		for (const content of ['host', 'text'] as const) {
			it(`hydrates initially ${initialMode} Activity ${content} children inside host descriptors without replacing DOM`, async () => {
				function App(props: { mode: 'visible' | 'hidden'; label: string }) {
					return createElement(
						'main',
						null,
						createElement('input', { id: 'before-activity', defaultValue: 'before' }),
						createElement(
							'section',
							null,
							createElement(
								Activity,
								{ mode: props.mode },
								content === 'host'
									? createElement('span', { style: { display: 'inline-block' } }, props.label)
									: props.label,
							),
						),
						createElement('input', { id: 'after-activity', defaultValue: 'after' }),
					);
				}
				const props = { mode: initialMode, label: 'initial' };
				const host = container();
				host.innerHTML = Server.renderToString(App, props).html;
				const shell = host.querySelector('main') as HTMLElement;
				const activityHost = host.querySelector('section') as HTMLElement;
				const before = host.querySelector('#before-activity') as HTMLInputElement;
				const after = host.querySelector('#after-activity') as HTMLInputElement;
				before.value = 'edited before hydration';
				after.value = 'edited after hydration';
				function contentNode(): Node | null {
					return content === 'host'
						? activityHost.querySelector('span')
						: (Array.from(activityHost.childNodes).find(
								(node) => node.nodeType === Node.TEXT_NODE,
							) ?? null);
				}
				const serverContent = contentNode();
				if (initialMode === 'hidden') expect(serverContent).toBeNull();
				else expect(serverContent?.textContent).toBe('initial');

				const recoveries: unknown[] = [];
				const root = hydrateRoot(host, App, props, {
					onRecoverableError: (error) => recoveries.push(error),
				});
				roots.push(root);
				flushSync(() => {});
				await Promise.resolve();
				expect(recoveries).toEqual([]);
				const preservedContent = contentNode();
				expect(preservedContent).not.toBeNull();
				if (initialMode === 'visible') expect(preservedContent).toBe(serverContent);

				function expectPreserved(mode: 'visible' | 'hidden', label: string) {
					expect(host.querySelector('main')).toBe(shell);
					expect(host.querySelector('section')).toBe(activityHost);
					expect(host.querySelector('#before-activity')).toBe(before);
					expect(host.querySelector('#after-activity')).toBe(after);
					expect(Array.from(shell.children)).toEqual([before, activityHost, after]);
					expect(before.value).toBe('edited before hydration');
					expect(after.value).toBe('edited after hydration');
					expect(contentNode()).toBe(preservedContent);
					if (content === 'host') {
						expect(preservedContent?.textContent).toBe(label);
						expect((preservedContent as HTMLElement).style.display).toBe(
							mode === 'hidden' ? 'none' : 'inline-block',
						);
					} else {
						expect(preservedContent?.textContent).toBe(mode === 'hidden' ? '' : label);
					}
				}
				expectPreserved(initialMode, 'initial');
				flushSync(() => root.render(App, { mode: 'hidden', label: 'updated' }));
				expectPreserved('hidden', 'updated');
				flushSync(() => root.render(App, { mode: 'visible', label: 'updated' }));
				expectPreserved('visible', 'updated');
				root.unmount();
				expect(host.querySelector('main')).toBeNull();
				expect(host.textContent).toBe('');
			});
		}
	}

	it('hydrates generic hidden ranges without consuming a visible sibling', () => {
		function serverApp() {
			return Server.createElement(
				'section',
				null,
				Server.createElement(
					Server.Activity,
					{ mode: 'hidden' },
					Server.createElement(server.ActivityAuthoringChild, { label: 'hidden' }),
				),
				Server.createElement('i', { id: 'descriptor-tail' }, 'tail'),
			);
		}
		function clientApp(props: { mode: 'visible' | 'hidden' }) {
			return createElement(
				'section',
				null,
				createElement(
					Activity,
					{ mode: props.mode },
					createElement(Fixture.ActivityAuthoringChild, { label: 'hidden' }),
				),
				createElement('i', { id: 'descriptor-tail' }, 'tail'),
			);
		}
		const host = container();
		host.innerHTML = Server.renderToString(serverApp).html;
		const tail = host.querySelector('#descriptor-tail');
		const root = hydrateRoot(host, clientApp, { mode: 'hidden' });
		roots.push(root);
		flushSync(() => {});
		const button = child(host, 'hidden');
		expect(button).not.toBeNull();
		expect(button.style.display).toBe('none');
		expect(host.querySelector('#descriptor-tail')).toBe(tail);
		root.render(clientApp, { mode: 'visible' });
		flushSync(() => {});
		expect(child(host, 'hidden')).toBe(button);
		expect(button.style.display).toBe('');
		expect(host.querySelector('#descriptor-tail')).toBe(tail);
	});
});
