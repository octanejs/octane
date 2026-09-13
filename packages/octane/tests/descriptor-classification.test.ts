import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRoot, flushSync, hydrateRoot } from '../src/index.js';
import * as ServerRuntime from 'octane/server';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { act, mount } from './_helpers.js';

const compileOptions = { hmr: false, dev: false, autoMemo: true, inlineHookMemo: true };
const modes = [
	{ hydrate: false, complete: false },
	{ hydrate: true, complete: false },
	{ hydrate: false, complete: true },
	{ hydrate: true, complete: true },
];
const source = readFileSync(
	'packages/octane/tests/_fixtures/descriptor-classification.tsrx',
	'utf8',
);
const nestedSource = readFileSync(
	'packages/octane/tests/_fixtures/descriptor-nested-ownership.tsrx',
	'utf8',
);

describe('descriptor classification contracts', () => {
	it('classifies one descriptor separately in each resolving Provider', () => {
		const client = loadCompiledFixtureSource(source, {
			id: 'descriptor-classification.tsrx',
			mode: 'client',
			compileOptions,
		});
		const view = mount(client.App, { first: false, second: true });
		try {
			const sections = view.container.querySelectorAll('section');
			expect(sections[0]!.querySelector('span')?.textContent).toBe('plain');
			expect(sections[0]!.querySelector('button')).toBeNull();
			expect(sections[1]!.querySelector('span')).toBeNull();
			expect(sections[1]!.querySelector('button')?.textContent).toBe('0');
			view.click('button');
			expect(sections[1]!.querySelector('button')?.textContent).toBe('1');
		} finally {
			view.unmount();
		}
	});

	it.each(modes)(
		'reclassifies a shared scoped descriptor after Provider changes (hydrate=$hydrate, complete=$complete)',
		({ hydrate, complete }) => {
			const client = loadCompiledFixtureSource(source, {
				id: 'descriptor-classification.tsrx',
				mode: 'client',
				compileOptions,
			});
			const props = { first: false, second: true, complete };
			const container = document.createElement('div');
			document.body.appendChild(container);
			if (hydrate) {
				const server = loadCompiledFixtureSource(source, {
					id: 'descriptor-classification.tsrx',
					mode: 'server',
					compileOptions,
				});
				container.innerHTML = ServerRuntime.renderToString(server.App, props).html;
			}
			const root = hydrate ? hydrateRoot(container, client.App, props) : createRoot(container);
			if (!hydrate) root.render(client.App, props);
			try {
				const sections = Array.from(container.querySelectorAll('section'));
				const inputs = Array.from(container.querySelectorAll('input'));
				expect(sections).toHaveLength(2);
				expect(sections[0]!.querySelector('span')?.textContent).toBe('plain');
				expect(sections[1]!.querySelector('button')?.textContent).toBe('0');
				inputs[0]!.value = 'first draft';
				inputs[1]!.value = 'second draft';
				flushSync(() => sections[1]!.querySelector('button')!.click());
				expect(sections[1]!.querySelector('button')!.textContent).toBe('1');
				flushSync(() => root.render(client.App, { first: true, second: false, complete }));
				expect(Array.from(container.querySelectorAll('section'))).toEqual(sections);
				expect(Array.from(container.querySelectorAll('input'))).toEqual(inputs);
				expect(inputs.map((input) => input.value)).toEqual(['first draft', 'second draft']);
				expect(sections[0]!.querySelector('button')?.textContent).toBe('0');
				expect(sections[0]!.querySelector('span')).toBeNull();
				expect(sections[1]!.querySelector('span')?.textContent, container.innerHTML).toBe('plain');
				expect(sections[1]!.querySelector('button')).toBeNull();
				if (complete)
					expect(sections.map((section) => section.getAttribute('data-mode'))).toEqual([
						'true',
						'false',
					]);
				flushSync(() => sections[0]!.querySelector('button')!.click());
				expect(sections[0]!.querySelector('button')!.textContent).toBe('1');
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);

	it.each(modes)(
		'keeps the accepted scoped children through suspension and retry (hydrate=$hydrate, complete=$complete)',
		async ({ hydrate, complete }) => {
			const client = loadCompiledFixtureSource(source, {
				id: 'descriptor-classification.tsrx',
				mode: 'client',
				compileOptions,
			});
			const props = { first: false, second: true, complete };
			const container = document.createElement('div');
			document.body.append(container);
			if (hydrate) {
				const server = loadCompiledFixtureSource(source, {
					id: 'descriptor-classification.tsrx',
					mode: 'server',
					compileOptions,
				});
				container.innerHTML = ServerRuntime.renderToString(server.App, props).html;
			}
			const root = hydrate ? hydrateRoot(container, client.App, props) : createRoot(container);
			if (!hydrate) root.render(client.App, props);
			let ready = false;
			let resolve!: () => void;
			const pending = new Promise<void>((done) => {
				resolve = done;
			});
			try {
				const sections = Array.from(container.querySelectorAll('section'));
				const inputs = Array.from(container.querySelectorAll('input'));
				const accepted = sections[1]!.querySelector('button')!;
				inputs[0]!.value = 'first draft';
				inputs[1]!.value = 'second draft';
				inputs[0]!.focus();
				flushSync(() => accepted.click());
				flushSync(() =>
					root.render(client.App, {
						first: true,
						second: false,
						complete,
						read: () => {
							if (!ready) throw pending;
						},
					}),
				);
				expect(Array.from(container.querySelectorAll('section'))).toEqual(sections);
				expect(Array.from(container.querySelectorAll('input'))).toEqual(inputs);
				expect(document.activeElement).toBe(inputs[0]);
				expect(sections[0]!.querySelector('span')?.textContent).toBe('plain');
				expect(sections[0]!.querySelector('button')).toBeNull();
				expect(sections[1]!.querySelector('button')).toBe(accepted);
				expect(accepted.textContent).toBe('1');
				expect(sections[1]!.querySelector('span')).toBeNull();
				if (complete)
					expect(sections.map((section) => section.getAttribute('data-mode'))).toEqual([
						'false',
						'true',
					]);
				await act(async () => {
					ready = true;
					resolve();
					await pending;
				});
				expect(Array.from(container.querySelectorAll('section'))).toEqual(sections);
				expect(Array.from(container.querySelectorAll('input'))).toEqual(inputs);
				expect(inputs.map((input) => input.value)).toEqual(['first draft', 'second draft']);
				expect(document.activeElement).toBe(inputs[0]);
				expect(sections[0]!.querySelector('span')).toBeNull();
				expect(sections[0]!.querySelector('button')?.textContent).toBe('0');
				expect(sections[1]!.querySelector('button')).toBeNull();
				expect(sections[1]!.querySelector('span')?.textContent).toBe('plain');
				if (complete)
					expect(sections.map((section) => section.getAttribute('data-mode'))).toEqual([
						'true',
						'false',
					]);
				flushSync(() => sections[0]!.querySelector('button')!.click());
				expect(sections[0]!.querySelector('button')!.textContent).toBe('1');
				flushSync(() => root.render(client.App, props));
				expect(sections[0]!.querySelector('button')).toBeNull();
				expect(sections[0]!.querySelector('span')?.textContent).toBe('plain');
				expect(sections[1]!.querySelector('span')).toBeNull();
				expect(sections[1]!.querySelector('button')?.textContent).toBe('0');
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);

	it.each([
		{ hydrate: false, kind: 'tag' },
		{ hydrate: true, kind: 'tag' },
		{ hydrate: false, kind: 'key' },
		{ hydrate: true, kind: 'key' },
		{ hydrate: false, kind: 'reorder' },
		{ hydrate: true, kind: 'reorder' },
	])(
		'adopts nested scoped hosts by accepted keys through retry (hydrate=$hydrate, kind=$kind)',
		async ({ hydrate, kind }) => {
			const client = loadCompiledFixtureSource(nestedSource, {
				id: 'descriptor-nested-ownership.tsrx',
				mode: 'client',
				compileOptions,
			});
			const props = { active: false, kind };
			const container = document.createElement('div');
			document.body.append(container);
			if (hydrate) {
				const server = loadCompiledFixtureSource(nestedSource, {
					id: 'descriptor-nested-ownership.tsrx',
					mode: 'server',
					compileOptions,
				});
				container.innerHTML = ServerRuntime.renderToString(server.App, props).html;
			}
			const root = hydrate ? hydrateRoot(container, client.App, props) : createRoot(container);
			if (!hydrate) root.render(client.App, props);
			let ready = false;
			let resolve!: () => void;
			const pending = new Promise<void>((done) => {
				resolve = done;
			});
			try {
				const section = container.querySelector('section')!;
				const inputs = Array.from(section.querySelectorAll('input'));
				const expectedInputs = kind === 'tag' ? 1 : kind === 'key' ? 2 : 3;
				expect(inputs).toHaveLength(expectedInputs);
				inputs.forEach((input, index) => {
					input.value = 'typed:' + index;
				});
				const focused = kind === 'reorder' ? inputs[0]! : inputs.at(-1)!;
				focused.focus();
				flushSync(() =>
					root.render(client.App, {
						active: true,
						kind,
						read: () => {
							if (!ready) throw pending;
						},
					}),
				);
				expect(container.querySelector('section')).toBe(section);
				const held = Array.from(section.querySelectorAll('input'));
				expect(held).toHaveLength(expectedInputs);
				held.forEach((input, index) => expect(input).toBe(inputs[index]));
				expect(section.querySelectorAll('span')).toHaveLength(1);
				expect(section.querySelectorAll('button')).toHaveLength(0);
				expect(document.activeElement).toBe(focused);
				await act(async () => {
					ready = true;
					resolve();
					await pending;
				});
				expect(container.querySelector('section')).toBe(section);
				const next = Array.from(section.querySelectorAll('input'));
				expect(next).toHaveLength(expectedInputs);
				expect(section.querySelectorAll('span')).toHaveLength(0);
				expect(section.querySelectorAll('button')).toHaveLength(1);
				expect(section.querySelector('button')!.textContent).toBe('0');
				expect(section.textContent).toBe('prefix0');
				expect(next.at(-1)).toBe(inputs.at(-1));
				expect(next.at(-1)!.value).toBe('typed:' + (expectedInputs - 1));
				if (kind === 'tag') {
					expect(Array.from(section.children, (node) => node.localName)).toEqual([
						'aside',
						'input',
						'button',
					]);
				} else if (kind === 'key') {
					expect(Array.from(section.children, (node) => node.localName)).toEqual([
						'input',
						'input',
						'button',
					]);
					expect(next[0]).not.toBe(inputs[0]);
					expect(next[0]!.value).toBe('nested');
				} else {
					expect(Array.from(section.children, (node) => node.localName)).toEqual([
						'input',
						'input',
						'input',
						'button',
					]);
					expect(next[0]).toBe(inputs[1]);
					expect(next[1]).toBe(inputs[0]);
					expect(next.map((input) => input.value)).toEqual(['typed:1', 'typed:0', 'typed:2']);
					expect(next.map((input) => input.getAttribute('data-position'))).toEqual([
						'left',
						'right',
						null,
					]);
				}
				expect(document.activeElement).toBe(focused);
				flushSync(() => section.querySelector('button')!.click());
				expect(section.querySelector('button')!.textContent).toBe('1');
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);

	it('observes an intrinsic override installed between sibling memo regions in one render', () => {
		const original = Object.getOwnPropertyDescriptor(Array.prototype, 'filter')!;
		const nativeFilter = Array.prototype.filter;
		function mutate() {
			Array.prototype.filter = function (predicate: any, receiver?: any): any[] {
				if (this.length === 2 && this[0]?.label === 'first' && this[1]?.label === 'second')
					return Array.from(this);
				return nativeFilter.call(this, predicate, receiver);
			};
		}
		const fixture = loadCompiledFixtureSource(
			readFileSync('packages/octane/tests/_fixtures/descriptor-intrinsics.tsrx', 'utf8'),
			{
				id: 'descriptor-intrinsics.tsrx',
				mode: 'client',
				compileOptions,
			},
		);
		const view = mount(fixture.App, { tick: 0, active: false, mutate });
		try {
			view.click('[data-list="left"] button');
			view.click('[data-list="right"] button');
			expect(view.find('[data-list="left"] output').textContent).toBe('1');
			expect(view.find('[data-list="right"] output').textContent).toBe('1');
			view.update(fixture.App, { tick: 1, active: true, mutate });
			Object.defineProperty(Array.prototype, 'filter', original);
			expect(view.find('[data-list="left"] output').textContent).toBe('1');
			expect(view.find('[data-list="right"] output').textContent).toBe('2');
			expect(
				Array.from(
					view.find('[data-list="right"]').querySelectorAll('span'),
					(node) => node.textContent,
				),
			).toEqual(['first', 'second']);
		} finally {
			Object.defineProperty(Array.prototype, 'filter', original);
			view.unmount();
		}
	});
});
