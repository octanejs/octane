import { afterEach, describe, expect, it } from 'vitest';
import { parseModule } from '@tsrx/core';
import { compile } from 'octane/compiler';
import { renderToString } from 'octane/server';
import * as Signals from 'octane/signals';
import { loadCompiledFixtureSource } from '../_server-fixture.js';
import { initializeHydrationEventCapture } from '../../src/hydration/event-capture.js';
import { registerSignalOwnerDocument } from '../../src/signals/early-values.js';

const SOURCE = `
import { signal$ } from 'octane/signals';
const draft$ = signal$('hello');
const enabled$ = signal$(true);
export function App() @{
	<>
		<input value={draft$} />
		<input type="checkbox" checked={enabled$} />
		<p title={draft$} aria-hidden={enabled$} style={{ color: draft$, opacity: enabled$ }}>
			{draft$}
		</p>
	</>
}
`;

function controlSites(code: string) {
	return [...code.matchAll(/data-octane-input=\\?"(i:[^"\\]+)\\?"/g)].map((match) => match[1]);
}

function callArguments(code: string) {
	const argumentsList: any[][] = [];
	const visit = (node: any) => {
		if (node === null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node.type === 'CallExpression') argumentsList.push(node.arguments);
		for (const [key, value] of Object.entries(node)) {
			if (key !== 'metadata' && key !== 'loc' && key !== 'parent') visit(value);
		}
	};
	visit(parseModule(code, 'compiled.js'));
	return argumentsList;
}

describe('direct signal bindings', () => {
	it.each([
		['textarea alias', '<textarea value={props.read(handle)} />', 'draft$', 'edited'],
		['textarea spread', '<textarea {...{ value: props.read(handle) }} />', 'draft$', 'edited'],
		[
			'textarea final alias',
			'<textarea {...{ value: "old" }} value={props.read(handle)} />',
			'draft$',
			'edited',
		],
		[
			'select alias',
			'<select value={props.read(choice$)}><option value="a">A</option><option value="b">B</option></select>',
			'choice$',
			'b',
		],
		[
			'select spread',
			'<select {...{ value: props.read(choice$) }}><option value="a">A</option><option value="b">B</option></select>',
			'choice$',
			'b',
		],
		['input alias', '<input value={props.read(handle)} />', 'draft$', 'edited'],
		[
			'checkbox alias',
			'<input type="checkbox" checked={props.read(enabled$)} />',
			'enabled$',
			true,
		],
		[
			'checkbox spread',
			'<input type="checkbox" {...{ checked: props.read(enabled$) }} />',
			'enabled$',
			true,
		],
		[
			'textarea scalar winner',
			'<textarea value={props.read(handle)} {...{ value: "last" }} />',
			null,
			'last',
		],
		[
			'textarea duplicate scalar winner',
			'<textarea value={props.read(handle)} value="last" />',
			null,
			'last',
		],
		[
			'select scalar winner',
			'<select value={props.read(choice$)} {...{ value: "b" }}><option value="a">A</option><option value="b">B</option></select>',
			null,
			'b',
		],
		[
			'checkbox scalar winner',
			'<input type="checkbox" checked={props.read(enabled$)} {...{ checked: true }} />',
			null,
			true,
		],
	] as const)(
		'hands compiled %s metadata to the first browser signal read',
		(name, markup, binding, edit) => {
			const source = `import { signal$ } from 'octane/signals';
export const draft$ = signal$('server');
export const choice$ = signal$('a');
export const enabled$ = signal$(false);
export function App(props) @{ const handle = draft$; ${markup} }`;
			for (const dev of [false, true]) {
				const id = `/src/control-${name}-${dev}.tsrx`;
				const options = {
					id,
					compileOptions: { dev },
					runtimeModules: { 'octane/signals': Signals },
				};
				const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
				let reads = 0;
				const { html } = renderToString(server.App, {
					read: (value: unknown) => {
						reads++;
						return value;
					},
				});
				expect(reads).toBe(1);
				const container = document.createElement('div');
				container.innerHTML = html;
				document.body.appendChild(container);
				try {
					const control = container.querySelector('input,textarea,select') as HTMLInputElement;
					const encoded = control.getAttribute('data-octane-signal-control');
					if (binding === null) {
						expect(encoded).toBeNull();
						expect(typeof edit === 'boolean' ? control.checked : control.value).toBe(edit);
						continue;
					}
					expect(encoded).not.toBeNull();
					const [, scopeKey, entries] = JSON.parse(encoded!);
					expect(entries).toHaveLength(1);
					expect(entries[0][2]).toBe(typeof edit === 'boolean' ? 'checked' : 'value');
					const documentOwner = Object.freeze({ scopeKey });
					const owner = { scopeKey, documentOwner, instanceOwner: {}, instanceKey: 'root' };
					registerSignalOwnerDocument(owner, document);
					initializeHydrationEventCapture(document);
					if (typeof edit === 'boolean') control.checked = edit;
					else control.value = edit as string;
					control.dispatchEvent(new Event('input', { bubbles: true }));
					if (control.tagName === 'SELECT')
						control.dispatchEvent(new Event('change', { bubbles: true }));
					// The client declaration is evaluated only after the native edit. Its
					// first read must adopt that edit through the SSR-emitted identity.
					const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
					expect(Signals.runWithSignalOwner(owner, () => client[binding as string].get())).toBe(
						edit,
					);
				} finally {
					container.remove();
				}
			}
		},
	);

	it('serializes direct signal values in text, attributes, styles and controls', () => {
		const { App } = loadCompiledFixtureSource(SOURCE, {
			id: '/src/signal-bindings.tsrx',
			mode: 'server',
			runtimeModules: { 'octane/signals': Signals },
		});
		const { html } = renderToString(App, {});
		expect(html).toContain('value="hello"');
		expect(html).toContain('checked');
		expect(html).toContain('title="hello"');
		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain('color:hello');
		const fragment = document.createElement('template');
		fragment.innerHTML = html;
		expect(fragment.content.querySelector('p')?.textContent).toBe('hello');
	});

	it('emits the same stable writable-control sites on client and server', () => {
		const client = compile(SOURCE, '/src/signal-bindings.tsrx', { hmr: false }).code;
		const server = compile(SOURCE, '/src/signal-bindings.tsrx', {
			mode: 'server',
			hmr: false,
		}).code;
		expect(controlSites(client)).toEqual(controlSites(server));
		expect(new Set(controlSites(client)).size).toBe(2);
		expect(server).toContain('ssrSignalControlValue');
		expect(server).toContain('ssrSignalControlAttrs');
		expect(server).toContain('enableServerSignalBindings(1)');
	});

	it('treats explicit get reads as one-way scalar bindings', () => {
		const { code } = compile(
			`import { signal$ } from 'octane/signals';
const draft$ = signal$('hello');
export function App() @{ <input value={draft$.get()} /> }`,
			'/src/signal-get.tsrx',
			{ hmr: false },
		);
		expect(code).not.toContain('bindSignalValue');
		expect(code).not.toContain('data-octane-input');
		expect(code).toContain('setValue');
	});

	it('recognizes prop-passed capability names without factory heuristics', () => {
		const { code } = compile(
			`export function Field(props) @{
				const label = props.label;
				<label title={label}>{label as string}</label>
			}`,
			'/src/signal-prop.tsrx',
			{ hmr: false },
		);
		expect(code).toContain('bindSignalAttribute');
		expect(code).toContain('bindSignalText');
		expect(code).toContain('enableSignalBindings(1)');
	});

	it('routes a non-suffixed writable alias through runtime capability validation', () => {
		const { code } = compile(
			`import { signal$ } from 'octane/signals';
			const draft$ = signal$('hello');
			export function Field() @{
				const handle = draft$;
				<textarea value={handle} />
			}`,
			'/src/signal-alias.tsrx',
			{ hmr: false },
		);
		expect(code).toContain('bindSignalValue');
		expect(code).toContain('data-octane-input');
	});

	it('emits stable structural component invocation sites in client and server output', () => {
		const source = `function Child() @{ <span /> }
		export function App() @{ <main><Child /><Child /></main> }`;
		const client = compile(source, '/src/component-sites.tsrx', { hmr: false }).code;
		const server = compile(source, '/src/component-sites.tsrx', {
			mode: 'server',
			hmr: false,
		}).code;
		const sites = (code: string) =>
			callArguments(code).flatMap((args) =>
				args.flatMap((argument) =>
					argument.type === 'Literal' && /^c:/.test(argument.value) ? [argument.value] : [],
				),
			);
		expect(new Set(sites(client)).size).toBe(2);
		expect(sites(client)).toEqual(sites(server));
	});

	it('routes spreads and mixed style sources through the capability-aware host collector', () => {
		const source = `export function Field(props) @{
		<>
			<input {...props.control} />
			<div {...props.host} />
			<section style={{ ...props.style, left: props.left$, opacity: props.opacity }} />
		</>
	}`;
		const client = compile(source, '/src/signal-spread.tsrx', { hmr: false }).code;
		const server = compile(source, '/src/signal-spread.tsrx', {
			mode: 'server',
			hmr: false,
		}).code;
		expect(client).toContain('bindSignalHostPropSources');
		expect(client).toContain('snapshotSpread');
		expect(client).toContain('data-octane-input');
		expect(server).toContain('ssrSnapshotSpread');
		expect(server).toContain('ssrSignalControlAttrs');
		expect(
			callArguments(server).some(
				(args) =>
					args[0]?.type === 'MemberExpression' &&
					args[0].object?.name === 'props' &&
					args[0].property?.name === 'control' &&
					args[1]?.type === 'Literal' &&
					/^b:/.test(args[1].value),
			),
		).toBe(true);
		expect(server).toContain('enableServerSignalBindings(1)');
	});

	it('keeps signal-free server modules on the cold path', () => {
		const server = compile(`export function App() @{ <p>plain</p> }`, '/src/plain.tsrx', {
			mode: 'server',
			hmr: false,
		}).code;
		expect(server).not.toContain('enableServerSignalBindings');
	});

	it('keeps the adopted parser tree immutable', () => {
		process.env.OCTANE_COMPILE_FROZEN_AST = '1';
		expect(() => compile(SOURCE, '/src/signal-frozen.tsrx', { hmr: false })).not.toThrow();
	});

	afterEach(() => {
		delete process.env.OCTANE_COMPILE_FROZEN_AST;
	});
});
