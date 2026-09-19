import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRoot, hydrateRoot, flushSync } from '../../src/index.js';
import { createScope } from '../../src/signals/index.js';
import { compile } from 'octane/compiler';
import * as ServerRT from 'octane/server';
import * as DomBindings from '../../src/dom-bindings.js';
import { TextAfterComp, TextBetweenComps, TextAfterIf } from './_fixtures/text-sibling.tsrx';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// Regression for the website-tsrx-new migration: a `{x as string}` text hole
// among sibling holes (component / control flow) must ADOPT the server text node
// on hydration. The old raw `childNodes[childIndex]` swap landed inside an
// earlier sibling's `<!--[-->…<!--]-->` range, clobbering it (or threw
// removeChild). Now the position is resolved with the hole-aware child/sibling
// walk + htextSwap adopts.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/text-sibling.tsrx');
function serverModule(): Record<string, any> {
	return loadCompiledFixtureSource(readFileSync(FIXTURE, 'utf8'), {
		id: 'text-sibling.tsrx',
		mode: 'server',
		compileOptions: { mode: 'server' },
	});
}
const server = serverModule();

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

describe('hydrateRoot — text hole among sibling holes', () => {
	it('preserves literal and binding-view text, native identity, and class receipts during hydration', () => {
		const source = `export function Text() @{ <p><3 and 1 < 2 and <= 3</p> }`;
		const compileOptions = { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' };
		const client = loadCompiledFixtureSource(source, {
			id: 'text.tsrx',
			mode: 'client',
			compileOptions,
		});
		const server = loadCompiledFixtureSource(source, {
			id: 'text.tsrx',
			mode: 'server',
			compileOptions,
		});
		container.innerHTML = ServerRT.renderToString(server.Text).html;
		const paragraph = container.querySelector('p');
		expect(paragraph?.textContent).toBe('<3 and 1 < 2 and <= 3');
		const root = hydrateRoot(container, client.Text);
		try {
			flushSync(() => {});
			expect(container.querySelector('p')).toBe(paragraph);
			expect(paragraph?.textContent).toBe('<3 and 1 < 2 and <= 3');
		} finally {
			root.unmount();
		}

		// The same authored presentation has two consumers: renderer-free adoption
		// and ordinary hydrateRoot. Its SSR receipts must not become extra content
		// or hide the existing native controls from the normal hydration cursor.
		for (const dev of [false, true]) {
			const slotSource = `function Icon(props) @{ <svg data-icon><use href={props.icon} /></svg> }
function ProviderLink(props) @{ <a href={props.href}><span aria-hidden="true" data-slot>{props.children}</span><span data-label>{props.label as string}</span></a> }
export function Slot(props) @{ 'use dom bindings'; <section><ProviderLink href={props.href} label={props.label}><Icon icon={props.icon} /></ProviderLink><aside>{props.show ? <Icon icon={props.icon} /> : null}</aside><em>tail</em></section> }`;
			const slotOptions = { id: '/src/binding-slot.tsrx', compileOptions: { dev, hmr: false } };
			const slotClient = loadCompiledFixtureSource(slotSource, { ...slotOptions, mode: 'client' });
			const slotServer = loadCompiledFixtureSource(slotSource, { ...slotOptions, mode: 'server' });
			const slotProps = { href: '/auth', label: 'Continue', icon: '#provider', show: true };
			container.innerHTML = ServerRT.renderToString(slotServer.Slot, slotProps).html;
			const slotLink = container.querySelector('a')!;
			const slotIcon = container.querySelector('svg')!;
			const conditionalIcon = container.querySelector('aside svg')!;
			const slotRoot = hydrateRoot(container, slotClient.Slot, slotProps);
			try {
				flushSync(() => {});
				expect(container.querySelector('a')).toBe(slotLink);
				expect(container.querySelector('svg')).toBe(slotIcon);
				expect(container.querySelectorAll('svg')).toHaveLength(2);
				expect(container.querySelector('aside svg')).toBe(conditionalIcon);
				flushSync(() =>
					slotRoot.render(slotClient.Slot, {
						href: '/next',
						label: 'Next',
						icon: '#next',
						show: false,
					}),
				);
				expect(container.querySelector('a')).toBe(slotLink);
				expect(container.querySelector('svg')).toBe(slotIcon);
				expect(slotLink.getAttribute('href')).toBe('/next');
				expect(slotIcon.querySelector('use')!.getAttribute('href')).toBe('#next');
				expect(slotLink.querySelector('[data-label]')!.textContent).toBe('Next');
				expect(container.querySelector('aside svg')).toBeNull();
				flushSync(() => slotRoot.render(slotClient.Slot, slotProps));
				expect(container.querySelector('aside svg')).not.toBeNull();
				expect(container.querySelector('aside svg')).not.toBe(conditionalIcon);
				expect(container.querySelector('svg')).toBe(slotIcon);
				expect(container.querySelector('em')!.textContent).toBe('tail');
			} finally {
				slotRoot.unmount();
			}
			const aliasSource = `export function Alias(props) @{ 'use dom bindings'; <div><span>{props.alias}</span><em>tail</em></div> }
export function Content() @{ <b>renderable</b> }`;
			const aliasOptions = { id: '/src/binding-alias.tsrx', compileOptions: { dev, hmr: false } };
			const aliasClient = loadCompiledFixtureSource(aliasSource, {
				...aliasOptions,
				mode: 'client',
			});
			const aliasServer = loadCompiledFixtureSource(aliasSource, {
				...aliasOptions,
				mode: 'server',
			});
			for (const hydrate of [true, false]) {
				const scope = createScope({ scopeKey: `binding-alias-${dev}-${hydrate}` });
				const first = scope.signal$('first', 'seed');
				const second = scope.signal$('second', 'replacement');
				container.innerHTML = hydrate
					? ServerRT.renderToString(aliasServer.Alias, { alias: first }).html
					: '';
				const serverSpan = container.querySelector('span');
				const aliasRoot = hydrate
					? hydrateRoot(container, aliasClient.Alias, { alias: first })
					: createRoot(container);
				try {
					if (!hydrate) aliasRoot.render(aliasClient.Alias, { alias: first });
					flushSync(() => {});
					const span = container.querySelector('span')!;
					if (hydrate) expect(span).toBe(serverSpan);
					expect(span.textContent).toBe('seed');
					flushSync(() => first.set('live'));
					expect(span.textContent).toBe('live');
					flushSync(() => aliasRoot.render(aliasClient.Alias, { alias: second }));
					flushSync(() => first.set('obsolete'));
					expect(span.textContent).toBe('replacement');
					flushSync(() => aliasRoot.render(aliasClient.Alias, { alias: aliasClient.Content }));
					expect(span.querySelector('b')?.textContent).toBe('renderable');
					flushSync(() => second.set('detached'));
					expect(span.querySelector('b')?.textContent).toBe('renderable');
					flushSync(() => aliasRoot.render(aliasClient.Alias, { alias: null }));
					expect(span.textContent).toBe('');
					expect(container.querySelector('em')?.textContent).toBe('tail');
				} finally {
					aliasRoot.unmount();
					scope.dispose();
				}
			}
			const nestedSource = `export function Child(props) @{ 'use dom bindings'; <p>{props.text as string}</p> }
export function Parent(props) @{ <Child text={props.text} /> }`;
			const nestedOptions = {
				id: '/src/nested-binding-root.tsrx',
				compileOptions: { dev, hmr: false },
			};
			const nestedClient = loadCompiledFixtureSource(nestedSource, {
				...nestedOptions,
				mode: 'client',
			});
			const nestedServer = loadCompiledFixtureSource(nestedSource, {
				...nestedOptions,
				mode: 'server',
			});
			for (const name of ['Parent', 'Child']) {
				container.innerHTML = ServerRT.renderToString(nestedServer[name], { text: 'before' }).html;
				const child = container.querySelector('p')!;
				const nestedRoot = hydrateRoot(container, nestedClient[name], { text: 'before' });
				try {
					flushSync(() => {});
					expect(container.querySelectorAll('p')).toHaveLength(1);
					expect(container.querySelector('p')).toBe(child);
					flushSync(() => nestedRoot.render(nestedClient[name], { text: 'after' }));
					expect(child.textContent).toBe('after');
				} finally {
					nestedRoot.unmount();
				}
			}
			const presentationSource = readFileSync(
				join(process.cwd(), 'packages/octane/tests/_fixtures/dom-presentation.tsrx'),
				'utf8',
			);
			const options = {
				id: '/src/dom-presentation.tsrx',
				compileOptions: { dev, hmr: false },
				runtimeModules: { 'octane/behavior': DomBindings },
			};
			const client = loadCompiledFixtureSource(presentationSource, { ...options, mode: 'client' });
			const server = loadCompiledFixtureSource(presentationSource, { ...options, mode: 'server' });
			const login = { label: 'Email', error: '', pending: false, submitLabel: 'Continue' };
			container.innerHTML = ServerRT.renderToString(server.LoginPresentation, login).html;
			const form = container.querySelector('form')!;
			const input = form.querySelector('input')!;
			const button = form.querySelector('button')!;
			input.value = 'early@example.com';
			const loginRoot = hydrateRoot(container, client.LoginPresentation, login);
			try {
				flushSync(() => {});
				expect(container.querySelectorAll('form')).toHaveLength(1);
				expect(container.querySelector('form')).toBe(form);
				expect(form.querySelector('input')).toBe(input);
				expect(form.querySelector('button')).toBe(button);
				expect(input.value).toBe('early@example.com');
				flushSync(() =>
					loginRoot.render(client.LoginPresentation, {
						...login,
						pending: true,
						submitLabel: 'Signing in…',
					}),
				);
				expect(form.querySelector('button')).toBe(button);
				expect(button.disabled).toBe(true);
				expect(button.querySelectorAll('svg')).toHaveLength(1);
				expect(button.querySelector('span')!.textContent).toBe('Signing in…');
				expect(input.value).toBe('early@example.com');
			} finally {
				loginRoot.unmount();
			}

			const adjacent = { first: '', last: '' };
			container.innerHTML = ServerRT.renderToString(server.AdjacentPresentation, adjacent).html;
			const paragraph = container.querySelector('p')!;
			const adjacentRoot = hydrateRoot(container, client.AdjacentPresentation, adjacent);
			try {
				flushSync(() =>
					adjacentRoot.render(client.AdjacentPresentation, { first: '<one>', last: '&two' }),
				);
				expect(container.querySelectorAll('p')).toHaveLength(1);
				expect(container.querySelector('p')).toBe(paragraph);
				expect(paragraph.textContent).toBe('Before <one>&two after');
				flushSync(() => adjacentRoot.render(client.AdjacentPresentation, adjacent));
				expect(paragraph.textContent).toBe('Before  after');
			} finally {
				adjacentRoot.unmount();
			}
			const preSource = `export function Pre(props) { 'use dom bindings'; return <pre>{props.value as string}</pre>; }`;
			const preClient = loadCompiledFixtureSource(preSource, {
				...options,
				id: '/src/pre.tsrx',
				mode: 'client',
			});
			const preServer = loadCompiledFixtureSource(preSource, {
				...options,
				id: '/src/pre.tsrx',
				mode: 'server',
			});
			container.innerHTML = ServerRT.renderToString(preServer.Pre, { value: '\nline' }).html;
			const pre = container.querySelector('pre')!;
			expect(pre.textContent).toBe('\nline');
			const preRoot = hydrateRoot(container, preClient.Pre, { value: '\nline' });
			try {
				flushSync(() => {});
				expect(container.querySelector('pre')).toBe(pre);
				expect(pre.textContent).toBe('\nline');
			} finally {
				preRoot.unmount();
			}

			const items = ['a', 'b'].map((id) => ({
				id,
				name: id.toUpperCase(),
				preview: null,
				state: 'ready',
				error: '',
			}));
			const attachments = { items, locked: false, onRemove() {}, onRetry() {} };
			container.innerHTML = ServerRT.renderToString(
				server.AttachmentPresentation,
				attachments,
			).html;
			const figures = [...container.querySelectorAll('figure')];
			const draft = figures[0].querySelector('input')!;
			draft.value = 'native draft';
			const attachmentRoot = hydrateRoot(container, client.AttachmentPresentation, attachments);
			try {
				flushSync(() => {});
				expect([...container.querySelectorAll('figure')]).toEqual(figures);
				flushSync(() =>
					attachmentRoot.render(client.AttachmentPresentation, {
						...attachments,
						items: [items[1], items[0]],
					}),
				);
				expect([...container.querySelectorAll('figure')]).toEqual([figures[1], figures[0]]);
				expect(figures[0].querySelector('input')).toBe(draft);
				expect(draft.value).toBe('native draft');
				flushSync(() =>
					attachmentRoot.render(client.AttachmentPresentation, {
						...attachments,
						items: [items[1]],
					}),
				);
				expect([...container.querySelectorAll('figure')]).toEqual([figures[1]]);
			} finally {
				attachmentRoot.unmount();
			}

			const classSource = `import { unbound } from 'octane/behavior';
export function ClassView(props) { 'use dom bindings'; return <button class={[unbound(props.base), props.on ? 'yes' : 'no']}>Action</button>; }`;
			const classClient = loadCompiledFixtureSource(classSource, {
				...options,
				id: '/src/class-view.tsrx',
				mode: 'client',
			});
			const classServer = loadCompiledFixtureSource(classSource, {
				...options,
				id: '/src/class-view.tsrx',
				mode: 'server',
			});
			let reads = 0;
			const classes = {
				get base() {
					reads++;
					return 'base';
				},
				get on() {
					reads++;
					return true;
				},
			};
			container.innerHTML = ServerRT.renderToString(classServer.ClassView, classes).html;
			expect(reads).toBe(2);
			const classButton = container.querySelector('button')!;
			const receipt = classButton
				.getAttributeNames()
				.find((name) => name.startsWith('data-octane-class-'))!;
			expect(JSON.parse(classButton.getAttribute(receipt)!)).toEqual(['base', ['yes']]);
			reads = 0;
			const classRoot = hydrateRoot(container, classClient.ClassView, classes);
			try {
				flushSync(() => {});
				expect(reads).toBe(2);
				expect(container.querySelector('button')).toBe(classButton);
				flushSync(() => classRoot.render(classClient.ClassView, { base: 'base', on: false }));
				expect(classButton.className).toBe('base no');
				expect(JSON.parse(classButton.getAttribute(receipt)!)).toEqual(['base', ['no']]);
			} finally {
				classRoot.unmount();
			}

			for (const factory of ['attrs', 'props'] as const) {
				for (const named of [false, true]) {
					const imported = named ? `{ ${factory} as nativeAttrs }` : '* as sx';
					const callee = named ? 'nativeAttrs' : `sx.${factory}`;
					const knownSource = `import 'octane/signals';
import ${imported} from 'binding-styles';
export function Known(props) @{ 'use dom bindings'; <ul>@for (const row of props.rows; key row.id) { <li {...${callee}(row)}>{row.label as string}</li> }</ul> }`;
					const scale = createScope({
						scopeKey: `style-spread-${dev}-${factory}-${named}`,
					}).signal$<number | null>('scale', 2);
					const knownAttributeSpreads = [
						{
							source: 'binding-styles',
							imported: named ? factory : '*',
							members: named ? [] : [factory],
							fields: [factory === 'props' ? 'className' : 'class', 'style', 'data-style-src'],
							...(factory === 'props' ? { style: 'object' as const } : {}),
						},
					];
					const calls: string[] = [];
					const knownOptions = {
						id: '/src/known-attributes.tsrx',
						compileOptions: { dev, hmr: false, knownAttributeSpreads },
						runtimeModules: {
							'binding-styles': {
								[factory](row: { id: string; label: string; tone: string | null }) {
									calls.push(row.id);
									return row.tone === null
										? null
										: {
												[factory === 'props' ? 'className' : 'class']: row.tone,
												style:
													factory === 'props'
														? { '--tone': row.tone, '--scale': scale }
														: `--tone:${row.tone}`,
												'data-style-src': row.id,
											};
								},
							},
						},
					};
					const knownClient = loadCompiledFixtureSource(knownSource, {
						...knownOptions,
						mode: 'client',
					});
					const knownServer = loadCompiledFixtureSource(knownSource, {
						...knownOptions,
						mode: 'server',
					});
					const rows = [
						{ id: 'a', label: 'First', tone: 'red' },
						{ id: 'b', label: 'Second', tone: 'blue' },
					];
					container.innerHTML = ServerRT.renderToString(knownServer.Known, { rows }).html;
					expect(calls.splice(0)).toEqual(['a', 'b']);
					const elements = [...container.querySelectorAll('li')];
					if (factory === 'props') expect(elements[0]!.style.getPropertyValue('--scale')).toBe('2');
					const knownRoot = hydrateRoot(container, knownClient.Known, { rows });
					try {
						flushSync(() => {});
						expect(calls.splice(0)).toEqual(['a', 'b']);
						expect([...container.querySelectorAll('li')]).toEqual(elements);
						if (factory === 'props') {
							flushSync(() => scale.set(3));
							expect(elements.map((element) => element.style.getPropertyValue('--scale'))).toEqual([
								'3',
								'3',
							]);
						}
						flushSync(() =>
							knownRoot.render(knownClient.Known, {
								rows: [
									{ id: 'b', label: 'Updated second', tone: 'green' },
									{ id: 'a', label: 'Updated first', tone: null },
								],
							}),
						);
						expect(calls.splice(0).sort()).toEqual(['a', 'b']);
						expect([...container.querySelectorAll('li')]).toEqual([elements[1], elements[0]]);
						expect(elements[1]!.textContent).toBe('Updated second');
						expect(elements[1]!.className).toBe('green');
						expect(elements[1]!.style.getPropertyValue('--tone')).toBe('green');
						expect(elements[0]!.className).toBe('');
						expect(elements[0]!.style.cssText).toBe('');
						expect(elements[0]!.getAttribute('data-style-src')).toBe(null);
					} finally {
						knownRoot.unmount();
					}
					if (factory === 'props') {
						flushSync(() => scale.set(4));
						expect(elements[1]!.style.getPropertyValue('--scale')).toBe('3');
					}
					const selected = compile(
						knownSource,
						knownOptions.id + '?octane-bindings=Known',
						knownOptions.compileOptions,
					).code;
					expect(selected).toContain('dom-binding-program');
					expect(selected).not.toContain('octane/internal/client');
					if (factory === 'props') expect(selected).toContain('octane/dom-binding-styles');
					else expect(selected).not.toContain('octane/dom-binding-styles');
					const shadowName = named ? 'nativeAttrs' : 'sx';
					const shadow = knownSource
						.replace('Known(props)', `Known(${shadowName})`)
						.replace('props.rows', `${shadowName}.rows`);
					expect(() =>
						compile(
							shadow,
							knownOptions.id + '?octane-bindings=Known',
							knownOptions.compileOptions,
						),
					).toThrow(/DOM bindings/);
					expect(() =>
						compile(knownSource, knownOptions.id, {
							...knownOptions.compileOptions,
							knownAttributeSpreads: [
								...knownAttributeSpreads,
								{ ...knownAttributeSpreads[0]!, fields: ['class', 'style'] },
							],
						}),
					).toThrow(/Duplicate knownAttributeSpreads contract/);
					for (const invalid of [
						{ ...knownAttributeSpreads[0]!, style: 'unknown' },
						{ ...knownAttributeSpreads[0]!, fields: ['class'], style: 'object' },
					]) {
						expect(() =>
							compile(knownSource, knownOptions.id, {
								...knownOptions.compileOptions,
								knownAttributeSpreads: [invalid] as any,
							}),
						).toThrow(/Invalid knownAttributeSpreads/);
					}
				}
			}
		}
	});

	it('text after a component: adopts the server text, keeps the component', async () => {
		const { html } = await ServerRT.renderToString(server.TextAfterComp, { label: 'LBL' });
		container.innerHTML = html;
		const inner = container.querySelector('#inner') as HTMLElement;
		const root = hydrateRoot(container, TextAfterComp, { label: 'LBL' });
		flushSync(() => {});
		// The component's content survived (NOT clobbered) and the text is present.
		expect(container.querySelector('#inner')).toBe(inner);
		expect(container.querySelector('#inner')!.textContent).toBe('I');
		expect(container.querySelector('#host')!.textContent).toContain('LBL');
		root.unmount();
	});

	it('text between two components: both components intact + text present', async () => {
		const { html } = await ServerRT.renderToString(server.TextBetweenComps, { label: 'MID' });
		container.innerHTML = html;
		const root = hydrateRoot(container, TextBetweenComps, { label: 'MID' });
		flushSync(() => {});
		expect(container.querySelectorAll('#host2 #inner').length).toBe(2);
		expect(container.querySelector('#host2')!.textContent).toContain('MID');
		root.unmount();
	});

	it('text after a taken @if branch: adopts the branch + the text', async () => {
		const { html } = await ServerRT.renderToString(server.TextAfterIf, {
			on: true,
			label: 'AFTER',
		});
		container.innerHTML = html;
		const onSpan = container.querySelector('.on') as HTMLElement;
		const root = hydrateRoot(container, TextAfterIf, { on: true, label: 'AFTER' });
		flushSync(() => {});
		expect(container.querySelector('.on')).toBe(onSpan); // branch adopted
		expect(container.querySelector('.on')!.textContent).toBe('on');
		expect(container.querySelector('#host3')!.textContent).toContain('AFTER');
		root.unmount();
	});
});
