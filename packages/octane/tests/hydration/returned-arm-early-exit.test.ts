import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// An early exit inside a directive arm (`if (c) return;`, or `continue;` in an
// `@for` body) ends that arm's output. The arm is template position wherever
// its directive sits, so returned JSX lowers it exactly like a template body:
// the rest of the arm becomes a nested range that the server emits and the
// client claims. The exit never belongs to the function returning the JSX.

type Props = { x: number; label: string };
type Modules = ReturnType<typeof load>;

function load(source: string, id: string, dev: boolean) {
	const compileOptions = { dev };
	return {
		client: loadCompiledFixtureSource(source, { id, mode: 'client', compileOptions }),
		server: loadCompiledFixtureSource(source, { id, mode: 'server', compileOptions }),
	};
}

const OUTPUT = '<b>{label as string}</b>';
const DIRECTIVES = {
	If: `@if (x > 0) { if (label === '') return; ${OUTPUT} }`,
	Else: `@if (x < 0) { <i /> } @else { if (label === '') return; ${OUTPUT} }`,
	Switch: `@switch (x) { @case 1: { if (label === '') return; ${OUTPUT} } @default: { <i /> } }`,
	ForContinue: `@for (const item of [label]; key 0) { if (item === '') continue; <b>{item as string}</b> }`,
	ForReturn: `@for (const item of [label]; key 0) { if (item === '') return; <b>{item as string}</b> }`,
	// Setup on both sides of the exit, and a braced exit.
	Setup: `@if (x > 0) { const text = label.toUpperCase(); if (text === '') { return; } const shown = text.toLowerCase(); <b>{shown as string}</b> }`,
} as const;
type Directive = keyof typeof DIRECTIVES;

const LIST = (directive: string) => `<div class="list">${directive}</div>`;
const list = (inner: string) => `<div class="list">${inner}</div>`;

const FORMS: {
	name: string;
	source: (name: string, directive: string) => string;
	html: (inner: string) => string;
}[] = [
	{
		name: 'returned JSX',
		source: (name, directive) => `export function ${name}({ x, label }: Props) {
	return ${LIST(directive)};
}`,
		html: list,
	},
	{
		name: 'returned JSX after setup and an own exit',
		source: (name, directive) => `export function ${name}({ x, label }: Props) {
	const [seen] = useState(label);
	if (seen === 'never') return;
	return ${LIST(directive)};
}`,
		html: list,
	},
	{
		name: 'returned nested JSX',
		source: (name, directive) => `export function ${name}({ x, label }: Props) {
	return <section>{x as number}${LIST(directive)}</section>;
}`,
		html: (inner) => `<section>1${list(inner)}</section>`,
	},
	{
		name: 'returned component children',
		source: (name, directive) => `export function ${name}({ x, label }: Props) {
	return <Box>${LIST(directive)}</Box>;
}`,
		html: (inner) => `<em>${list(inner)}</em>`,
	},
	{
		name: 'a returned fragment',
		source: (name, directive) => `export function ${name}({ x, label }: Props) {
	return <>${directive}</>;
}`,
		html: (inner) => inner,
	},
	{
		name: 'a JSX value that returned JSX renders',
		source: (name, directive) => `export function ${name}({ x, label }: Props) {
	const out = ${LIST(directive)};
	return <>{out}</>;
}`,
		html: list,
	},
	{
		name: 'a directive value that returned JSX renders',
		source: (name, directive) => `export function ${name}({ x, label }: Props) {
	const out = ${directive};
	return <div class="list">{out}</div>;
}`,
		html: list,
	},
	{
		name: 'a JSX value in a template body with a returned exit',
		source: (name, directive) => `export function ${name}({ x, label }: Props) @{
	if (x < -9) return <i />;
	const out = ${LIST(directive)};
	<>{out}</>
}`,
		html: list,
	},
	{
		name: 'a template body',
		source: (name, directive) => `export function ${name}({ x, label }: Props) @{
	${LIST(directive)}
}`,
		html: list,
	},
];

function source(form: (typeof FORMS)[number]) {
	const components = Object.entries(DIRECTIVES)
		.map(([name, directive]) => form.source(name, directive))
		.join('\n');
	return `import { useState } from 'octane';
type Props = { x: number; label: string };
function Box({ children }: { children: any }) @{
	<em>{children}</em>
}
${components}
`;
}

function html(form: (typeof FORMS)[number], label: string, directive: Directive): string {
	const text = directive === 'Setup' ? label.toLowerCase() : label;
	return form.html(label === '' ? '' : `<b>${text}</b>`);
}

// A same-arm text update, the exit taking effect, and the exit clearing again.
const STATES: Props[] = [
	{ x: 1, label: 'a' },
	{ x: 1, label: 'b' },
	{ x: 1, label: '' },
	{ x: 1, label: 'c' },
];

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
	vi.restoreAllMocks();
});

function newContainer(): HTMLElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	containers.push(container);
	return container;
}

// Hydration and range markers are not part of the rendered content.
function content(container: HTMLElement): string {
	return container.innerHTML.replace(/<!--[^]*?-->/g, '');
}

function serverHtml(modules: Modules, name: string, props: Props): string {
	return ServerRT.renderToString(modules.server[name], props).html.replace(/<!--[^]*?-->/g, '');
}

function mount(modules: Modules, name: string) {
	const container = newContainer();
	const root = createRoot(container);
	const seen: string[] = [];
	const bolds: (Element | null)[] = [];
	for (const props of STATES) {
		flushSync(() => root.render(modules.client[name], props));
		seen.push(content(container));
		bolds.push(container.querySelector('b'));
	}
	root.unmount();
	return { seen, bolds };
}

async function hydrate(modules: Modules, name: string, states: Props[]) {
	const container = newContainer();
	container.innerHTML = ServerRT.renderToString(modules.server[name], states[0]).html;
	const serverElements = Array.from(container.querySelectorAll('*'));
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, modules.client[name], states[0], {
		onRecoverableError: (error) => recoverable.push(error),
	});
	await act(() => {});
	const seen = [content(container)];
	const hydratedElements = Array.from(container.querySelectorAll('*'));
	const bolds = [container.querySelector('b')];
	for (const props of states.slice(1)) {
		flushSync(() => root.render(modules.client[name], props));
		seen.push(content(container));
		bolds.push(container.querySelector('b'));
	}
	root.unmount();
	return {
		seen,
		bolds,
		serverElements,
		hydratedElements,
		recoverable,
		errors: errors.mock.calls,
	};
}

describe.each([false, true])('an early exit in a directive arm (dev: %s)', (dev) => {
	for (const [index, form] of FORMS.entries()) {
		describe(`under ${form.name}`, () => {
			let shared: Modules | undefined;
			const modules = () =>
				(shared ??= load(source(form), `returned-arm-early-exit-${index}.tsrx`, dev));

			for (const directive of Object.keys(DIRECTIVES) as Directive[]) {
				const expected = STATES.map((props) => html(form, props.label, directive));

				it(`renders ${directive} on the server and on mount and update`, () => {
					const compiled = modules();
					expect(STATES.map((props) => serverHtml(compiled, directive, props))).toEqual(expected);
					const mounted = mount(compiled, directive);
					expect(mounted.seen).toEqual(expected);
					expect(mounted.bolds[1]).toBe(mounted.bolds[0]);
				});

				it(`hydrates ${directive} and keeps the server DOM through updates`, async () => {
					const result = await hydrate(modules(), directive, STATES);
					expect(result.recoverable).toEqual([]);
					expect(result.errors).toEqual([]);
					expect(result.seen).toEqual(expected);
					expect(result.hydratedElements).toEqual(result.serverElements);
					expect(result.bolds[0]).not.toBeNull();
					expect(result.bolds[1]).toBe(result.bolds[0]);
				});

				it(`hydrates ${directive} with the exit taken on the server`, async () => {
					const result = await hydrate(modules(), directive, [STATES[2], STATES[3], STATES[2]]);
					expect(result.recoverable).toEqual([]);
					expect(result.errors).toEqual([]);
					expect(result.seen).toEqual([expected[2], expected[3], expected[2]]);
					expect(result.hydratedElements).toEqual(result.serverElements);
				});
			}
		});
	}
});
