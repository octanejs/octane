import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, flushSync, hydrateRoot, type Root } from '../src/index.js';
import * as ServerRuntime from 'octane/server';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { createTextTypeFixture, stringChildren } from './_text-type-project.js';

const consumers: ReturnType<typeof createTextTypeFixture>[] = [];

function compiledFixture(name: string, withFacts = true, dev = false, editedSource?: string) {
	const source =
		editedSource ??
		readFileSync(join(process.cwd(), 'packages/octane/tests/_fixtures', name), 'utf8');
	const consumer = createTextTypeFixture({ [name]: source });
	consumers.push(consumer);
	const filename = consumer.file(name);
	const facts = withFacts ? consumer.project.snapshot(filename) : undefined;
	const compileOptions = { hmr: false, dev, ...(facts && { textTypeFacts: facts }) };
	return {
		source,
		facts,
		client: loadCompiledFixtureSource(source, {
			id: filename,
			mode: 'client',
			compileOptions,
		}),
		server: loadCompiledFixtureSource(source, {
			id: filename,
			mode: 'server',
			compileOptions,
		}),
	};
}

afterEach(() => {
	for (const consumer of consumers.splice(0)) consumer.dispose();
});

describe.each([false, true])('text conversion semantics (TypeScript facts: %s)', (withFacts) => {
	it('keeps explicit String conversion for nullish, boolean, symbol, and object values', async () => {
		const { client, server } = compiledFixture('text-conversions.tsrx', withFacts);
		const values = [null, undefined, false, true, 0, Symbol('label')];
		const root = mount(client.StringConversion, { value: values[0] });
		try {
			for (const value of values) {
				root.update(client.StringConversion, { value });
				expect(root.find('#converted').textContent).toBe(String(value));
				const rendered = await ServerRuntime.renderToString(server.StringConversion, { value });
				expect(rendered.html).toContain(`<p id="converted">${String(value)}</p>`);
			}
			const calls: string[] = [];
			const first = { toString: () => (calls.push('first'), '<first>') };
			const second = { toString: () => (calls.push('second'), '<second>') };
			root.update(client.StringConversion, { value: first });
			root.update(client.StringConversion, { value: second });
			expect(root.find('#converted').textContent).toBe('<second>');
			expect(calls).toEqual(['first', 'second']);
		} finally {
			root.unmount();
		}
	});

	it('hydrates and updates a tracked String result between a component and static sibling', async () => {
		const { client, server } = compiledFixture('text-conversions.tsrx', withFacts);
		const { html } = await ServerRuntime.renderToString(server.TrackedString, { value: false });
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const host = container.querySelector('#tracked-string')!;
		const marker = container.querySelector('#tracked-string-marker');
		const text = [...host.childNodes].find(
			(node) => node.nodeType === Node.TEXT_NODE && node.nodeValue === 'false',
		);
		expect(text).toBeDefined();
		let root: Root | undefined;
		try {
			root = hydrateRoot(container, client.TrackedString, { value: false });
			flushSync(() => {});
			expect(container.querySelector('#tracked-string-marker')).toBe(marker);
			expect(text!.parentNode).toBe(host);
			flushSync(() => root!.render(client.TrackedString, { value: null }));
			expect(text!.parentNode).toBe(host);
			expect(text!.nodeValue).toBe('null');
			expect(host.textContent).toBe('markernullafter');
		} finally {
			root?.unmount();
			container.remove();
		}
	});

	it('does not let a tracked String local classify a shadowed nested-component parameter', async () => {
		const { client, server } = compiledFixture('text-conversions.tsrx', withFacts);
		const { html } = await ServerRuntime.renderToString(server.NestedString, {
			value: false,
			child: ServerRuntime.createElement('b', { id: 'nested-string-child' }, 'first'),
		});
		expect(html).toContain('<b id="nested-string-child">first</b>');
		expect(html).toContain('<span id="outer-string-value">false</span>');
		const rendered = mount(client.NestedString, {
			value: false,
			child: createElement('b', { id: 'nested-string-child' }, 'first'),
		});
		try {
			expect(rendered.find('#outer-string-value').textContent).toBe('false');
			expect(rendered.find('#nested-string-value b').textContent).toBe('first');
			rendered.update(client.NestedString, {
				value: null,
				child: createElement('i', { id: 'nested-string-child' }, 'second'),
			});
			expect(rendered.find('#outer-string-value').textContent).toBe('null');
			expect(rendered.find('#nested-string-value i').textContent).toBe('second');
		} finally {
			rendered.unmount();
		}
	});

	it('renders values returned by parameter, local, loop, and module bindings named String', () => {
		const { client } = compiledFixture('text-conversions.tsrx', withFacts);
		const module = compiledFixture('text-shadowed-string.tsrx', withFacts).client;
		const bold = (value: string) => createElement('b', { class: 'custom-string' }, value);
		const italic = (value: string) => createElement('i', { class: 'custom-string' }, value);
		const parameter = mount(client.ParameterString, { String: bold, value: 'one' });
		const local = mount(client.LocalString, { render: bold, value: 'one' });
		const loop = mount(client.LoopString, { renderers: [bold, italic], value: 'one' });
		const moduleRoot = mount(module.ModuleString, { value: 'one' });
		try {
			expect(parameter.find('#parameter-string b').textContent).toBe('one');
			expect(local.find('#local-string b').textContent).toBe('one');
			expect(loop.findAll('#loop-string .custom-string').map((node) => node.tagName)).toEqual([
				'B',
				'I',
			]);
			expect(moduleRoot.find('#module-string strong').textContent).toBe('one');
			parameter.update(client.ParameterString, { String: italic, value: 'two' });
			local.update(client.LocalString, { render: italic, value: 'two' });
			loop.update(client.LoopString, { renderers: [italic], value: 'two' });
			moduleRoot.update(module.ModuleString, { value: 'two' });
			expect(parameter.find('#parameter-string i').textContent).toBe('two');
			expect(local.find('#local-string i').textContent).toBe('two');
			expect(loop.findAll('#loop-string .custom-string').map((node) => node.textContent)).toEqual([
				'two',
			]);
			expect(moduleRoot.find('#module-string strong').textContent).toBe('two');
		} finally {
			parameter.unmount();
			local.unmount();
			loop.unmount();
			moduleRoot.unmount();
		}
	});

	it.each(['globalThis.String', 'String'])(
		'respects an authored replacement of the %s intrinsic',
		(binding) => {
			const authored = readFileSync(
				join(process.cwd(), 'packages/octane/tests/_fixtures/text-replaced-string.tsrx'),
				'utf8',
			);
			const source = authored.replaceAll('globalThis.String =', `${binding} =`);
			const { client } = compiledFixture('text-replaced-string.tsrx', withFacts, false, source);
			const original = globalThis.String;
			const sentinel = {};
			const replacement = (value?: unknown) =>
				value === sentinel
					? createElement('b', { id: 'replaced-string-child' }, 'replacement')
					: original(value);
			Object.setPrototypeOf(replacement, original);
			const restore = client.replaceString(replacement);
			let mounted: ReturnType<typeof mount> | undefined;
			try {
				mounted = mount(client.ReplacedString, { value: sentinel });
			} finally {
				restore();
			}
			try {
				expect(globalThis.String).toBe(original);
				expect(mounted!.find('#replaced-string-child').textContent).toBe('replacement');
			} finally {
				mounted?.unmount();
			}
		},
	);
});

describe.each([false, true])('inferred text hydration (development diagnostics: %s)', (dev) => {
	it('adopts sibling and only-child server text, updates it, and keeps uncertain children renderable', async () => {
		const fixture = compiledFixture('typescript-text.tsrx', true, dev);
		expect(stringChildren(fixture.source, fixture.facts!)).toEqual(
			expect.arrayContaining(['label', 'props.label', 'uppercase(props.label)', 'String(count)']),
		);
		expect(stringChildren(fixture.source, fixture.facts!)).not.toContain('props.maybe');
		expect(stringChildren(fixture.source, fixture.facts!)).not.toContain('props.child');
		const props = { label: 'First & <label>', maybe: null, child: 'plain' };
		const { html } = await ServerRuntime.renderToString(fixture.server.TextScene, props);
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const member = container.querySelector('#text-member')!;
		const memberText = member.firstChild;
		const before = container.querySelector('#text-before');
		const after = container.querySelector('#text-after');
		const siblingText = [...container.querySelector('#text-siblings')!.childNodes].find(
			(node) => node.nodeType === Node.TEXT_NODE && node.nodeValue === props.label,
		);
		expect(siblingText).toBeDefined();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: Root | undefined;
		try {
			root = hydrateRoot(container, fixture.client.TextScene, props);
			flushSync(() => {});
			expect(container.querySelector('#text-member')).toBe(member);
			expect(member.firstChild).toBe(memberText);
			expect(container.querySelector('#text-before')).toBe(before);
			expect(container.querySelector('#text-after')).toBe(after);
			expect(siblingText!.parentNode).toBe(container.querySelector('#text-siblings'));
			flushSync(() => (container.querySelector('#text-bump') as HTMLButtonElement).click());
			expect(container.querySelector('#text-count')!.textContent).toBe('1');
			flushSync(() =>
				root!.render(fixture.client.TextScene, {
					label: 'Second',
					maybe: 'present',
					child: createElement('strong', { id: 'uncertain-child' }, 'rendered'),
				}),
			);
			expect(member.firstChild).toBe(memberText);
			expect(member.textContent).toBe('Second');
			expect(siblingText!.nodeValue).toBe('Second');
			expect(container.querySelector('#text-return')!.textContent).toBe('SECOND');
			expect(container.querySelector('#text-nullable')!.textContent).toBe('present');
			expect(container.querySelector('#uncertain-child')!.textContent).toBe('rendered');
			flushSync(() =>
				root!.render(fixture.client.TextScene, { label: 'Third', maybe: null, child: null }),
			);
			expect(container.querySelector('#text-nullable')!.textContent).toBe('');
			expect(container.querySelector('#uncertain-child')).toBeNull();
			expect(error.mock.calls.flat().map(String).join('\n')).not.toMatch(/hydration.*mismatch/i);
		} finally {
			root?.unmount();
			error.mockRestore();
			container.remove();
		}
	});

	it('keeps original expression facts when TSX host trees are extracted through component children', async () => {
		const fixture = compiledFixture('typescript-text.tsx', true, dev);
		expect(stringChildren(fixture.source, fixture.facts!)).toContain('props.label');
		expect(stringChildren(fixture.source, fixture.facts!)).not.toContain('props.child');
		const props = { label: 'Initial', child: 'before' };
		const { html } = await ServerRuntime.renderToString(fixture.server.ExtractedText, props);
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const heading = container.querySelector('#extracted-label')!;
		const text = heading.firstChild;
		const root = hydrateRoot(container, fixture.client.ExtractedText, props);
		try {
			flushSync(() => {});
			expect(container.querySelector('#extracted-label')).toBe(heading);
			expect(heading.firstChild).toBe(text);
			flushSync(() =>
				root.render(fixture.client.ExtractedText, {
					label: 'Updated',
					child: createElement('em', { id: 'extracted-renderable' }, 'after'),
				}),
			);
			expect(heading.firstChild).toBe(text);
			expect(heading.textContent).toBe('Updated');
			expect(container.querySelector('#extracted-renderable')!.textContent).toBe('after');
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
