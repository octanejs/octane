import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ServerRuntime from 'octane/server';

import { flushSync, hydrateRoot, isValidElement } from '../src/index.js';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';
import * as tsx from './_fixtures/returned-jsx-direct-calls.tsx';

// A named function declaration that returns JSX is also a component. Rendering
// it as `<HostValue />` evaluates its output inside its own body call. Calling
// it directly returns an ordinary JSX value, which must resolve where it is
// rendered, exactly like the value an arrow function or method returns.
const tsrxSource = String.raw`
import { createContext, use, type OctaneNode } from 'octane';

const ValueContext = createContext('outer');
const setupCalls: string[] = [];

export function takeSetupCalls(): string[] {
	return setupCalls.splice(0);
}

function ContextLabel(props: { value: string }) @{
	<strong data-returned="component">{props.value}</strong>
}

export function HostValue() {
	return <span data-returned="host" data-value={use(ValueContext)}>
		{use(ValueContext) as string}
	</span>;
}

function LocalValue() {
	return <span data-returned="local">{use(ValueContext) as string}</span>;
}

export function callLocalValue() {
	return LocalValue();
}

export default function DefaultValue() {
	return <span data-returned="default">{use(ValueContext) as string}</span>;
}

export function FragmentValue() {
	return <>
		<span data-returned="fragment">{use(ValueContext) as string}</span>
	</>;
}

export function MappedValue() {
	return <ul>
		{['row'].map((key) => <li key={key} data-returned="mapped" data-value={use(ValueContext)}>
			{use(ValueContext) as string}
		</li>)}
	</ul>;
}

export function ComponentValue() {
	return <ContextLabel value={use(ValueContext)} />;
}

export function TitledValue() {
	return <article data-returned="titled">
		<title>Returned value</title>
		<span>{use(ValueContext) as string}</span>
	</article>;
}

export function DirectiveValue(show: boolean) {
	return <div data-returned="directive">
		@if (show) {
			<span>{use(ValueContext) as string}</span>
		}
	</div>;
}

export function RowValue(label: string, index: number) {
	return <li data-returned="row" data-index={index}>{(label + ':' + use(ValueContext)) as string}</li>;
}

export function BlockScopedValue(flag: boolean) {
	if (flag) {
		var label: string | undefined = 'block';
	}
	return <span data-returned="block" data-label={label}>{use(ValueContext) as string}</span>;
}

let bumpLastCount = () => {};

export function bumpCount() {
	bumpLastCount();
}

export function ReassignedValue() {
	let count = 1;
	bumpLastCount = () => {
		count++;
	};
	return <span data-returned="reassigned" data-count={count}>{use(ValueContext) as string}</span>;
}

export function SetupValue() {
	setupCalls.push('setup');
	const built = use(ValueContext);
	return <span data-returned="setup" data-built={built}>{use(ValueContext) as string}</span>;
}

export function ProvidedValue(props: { build: () => OctaneNode }) @{
	const value = props.build();
	<ValueContext value="inner">
		<section data-outlet="provided">{value}</section>
	</ValueContext>
}

export function ComponentProvidedValue() @{
	<ValueContext value="inner">
		<section data-outlet="component"><HostValue /></section>
	</ValueContext>
}

export function SharedValueProviders(props: { value: OctaneNode; first: string; second: string }) @{
	<section data-outlet="shared">
		<ValueContext value={props.first}>{props.value}</ValueContext>
		<ValueContext value={props.second}>{props.value}</ValueContext>
	</section>
}
`;

type Fixture = typeof tsx & {
	DirectiveValue?: (show: boolean) => ReturnType<typeof tsx.HostValue>;
};

const compileOptions = {
	dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod',
	hmr: false,
};

function compiledTsrx(mode: 'client' | 'server', native: boolean): Fixture {
	const id = `/packages/octane/tests/_fixtures/returned-jsx-direct-calls${native ? '.native' : ''}.tsrx`;
	const source = native ? `import 'octane/signals';\n${tsrxSource}` : tsrxSource;
	return loadCompiledFixtureSource<Fixture>(source, { id, mode, compileOptions });
}

const fixtures: { name: string; client: Fixture; server: Fixture }[] = [
	{ name: 'TSRX', client: compiledTsrx('client', false), server: compiledTsrx('server', false) },
	{
		name: 'TSX',
		client: tsx,
		server: loadServerFixture<Fixture>(
			'packages/octane/tests/_fixtures/returned-jsx-direct-calls.tsx',
		),
	},
	{
		name: 'native TSRX',
		client: compiledTsrx('client', true),
		server: compiledTsrx('server', true),
	},
];

type Scenario = {
	name: string;
	selector: string;
	build: (fixture: Fixture) => unknown;
	attribute?: string;
	fixedAttribute?: [name: string, value: string];
	text?: string;
	title?: string;
	tsrxOnly?: boolean;
};

const scenarios: Scenario[] = [
	{
		name: 'exported declaration',
		selector: '[data-returned="host"]',
		build: (fixture) => fixture.HostValue(),
		attribute: 'data-value',
	},
	{
		name: 'module-local declaration',
		selector: '[data-returned="local"]',
		build: (fixture) => fixture.callLocalValue(),
	},
	{
		name: 'default-exported declaration',
		selector: '[data-returned="default"]',
		build: (fixture) => fixture.default(),
	},
	{
		name: 'fragment root',
		selector: '[data-returned="fragment"]',
		build: (fixture) => fixture.FragmentValue(),
	},
	{
		name: 'mapped rows',
		selector: '[data-returned="mapped"]',
		build: (fixture) => fixture.MappedValue(),
		attribute: 'data-value',
	},
	{
		name: 'component root',
		selector: '[data-returned="component"]',
		build: (fixture) => fixture.ComponentValue(),
	},
	{
		name: 'document metadata',
		selector: '[data-returned="titled"] span',
		build: (fixture) => fixture.TitledValue(),
		title: 'Returned value',
	},
	{
		name: 'template directive',
		selector: '[data-returned="directive"] span',
		build: (fixture) => fixture.DirectiveValue!(true),
		tsrxOnly: true,
	},
	{
		name: 'block-scoped var',
		selector: '[data-returned="block"]',
		build: (fixture) => fixture.BlockScopedValue(true),
		fixedAttribute: ['data-label', 'block'],
	},
	{
		name: 'reassigned local',
		selector: '[data-returned="reassigned"]',
		build: (fixture) => fixture.ReassignedValue(),
		fixedAttribute: ['data-count', '1'],
	},
	{
		name: 'several parameters',
		selector: '[data-returned="row"]',
		build: (fixture) => fixture.RowValue('label', 3),
		text: 'label:inner',
	},
];

function expectInner(element: Element | null | undefined, scenario: Scenario) {
	expect(element?.textContent).toBe(scenario.text ?? 'inner');
	if (scenario.attribute !== undefined) {
		expect(element?.getAttribute(scenario.attribute)).toBe('inner');
	}
	if (scenario.fixedAttribute !== undefined) {
		const [name, value] = scenario.fixedAttribute;
		expect(element?.getAttribute(name)).toBe(value);
	}
}

function parse(html: string): HTMLElement {
	const container = document.createElement('div');
	container.innerHTML = html;
	return container;
}

// Server output leads with any hoisted document metadata; a page serves it in
// the document head, ahead of the root markup the client hydrates.
function serveDocument(html: string): HTMLElement {
	let body = html;
	for (
		let open = /^<!--(rnh-[^>]+)-->/.exec(body);
		open !== null;
		open = /^<!--(rnh-[^>]+)-->/.exec(body)
	) {
		const close = `<!--/${open[1]}-->`;
		const end = body.indexOf(close) + close.length;
		document.head.insertAdjacentHTML('beforeend', body.slice(0, end));
		body = body.slice(end);
	}
	const container = parse(body);
	document.body.appendChild(container);
	return container;
}

afterEach(() => {
	vi.restoreAllMocks();
	document.head.innerHTML = '';
});

for (const fixture of fixtures) {
	describe(`${fixture.name} returned JSX from a direct function call`, () => {
		for (const scenario of scenarios) {
			if (scenario.tsrxOnly && fixture.name === 'TSX') continue;

			it(`${scenario.name} resolves in the provider where it renders`, () => {
				const result = mount(fixture.client.ProvidedValue, {
					build: () => scenario.build(fixture.client),
				});
				expectInner(result.container.querySelector(scenario.selector), scenario);
				result.unmount();
			});

			it(`${scenario.name} server-renders in the provider where it renders`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server.ProvidedValue, {
					build: () => scenario.build(fixture.server),
				});
				expectInner(parse(html).querySelector(scenario.selector), scenario);
			});

			it(`${scenario.name} hydrates its server output in place`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server.ProvidedValue, {
					build: () => scenario.build(fixture.server),
				});
				const container = serveDocument(html);
				const existing = container.querySelector(scenario.selector);
				const title = document.head.querySelector('title');
				expect(title?.textContent).toBe(scenario.title);
				expectInner(existing, scenario);

				const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
				const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
				const root = hydrateRoot(container, fixture.client.ProvidedValue, {
					build: () => scenario.build(fixture.client),
				});
				flushSync(() => {});
				expect(container.querySelectorAll(scenario.selector)).toHaveLength(1);
				expect(container.querySelector(scenario.selector)).toBe(existing);
				expect(document.head.querySelectorAll('title')).toHaveLength(title === null ? 0 : 1);
				expect(document.head.querySelector('title')).toBe(title);
				expectInner(existing, scenario);
				expect(errors).not.toHaveBeenCalled();
				expect(warnings).not.toHaveBeenCalled();
				root.unmount();
				container.remove();
			});
		}

		it('keeps the same function rendered as a component inside its own provider', () => {
			const result = mount(fixture.client.ComponentProvidedValue);
			expectInner(result.container.querySelector('[data-returned="host"]'), scenarios[0]);
			result.unmount();

			const { html } = ServerRuntime.renderToString(fixture.server.ComponentProvidedValue);
			expectInner(parse(html).querySelector('[data-returned="host"]'), scenarios[0]);
		});

		it('hydrates the same function rendered as a component', () => {
			const { html } = ServerRuntime.renderToString(fixture.server.ComponentProvidedValue);
			const container = serveDocument(html);
			const existing = container.querySelector('[data-returned="host"]');

			const root = hydrateRoot(container, fixture.client.ComponentProvidedValue);
			flushSync(() => {});
			expect(container.querySelectorAll('[data-returned="host"]')).toHaveLength(1);
			expect(container.querySelector('[data-returned="host"]')).toBe(existing);
			expectInner(existing, scenarios[0]);
			root.unmount();
			container.remove();
		});

		it('runs setup statements during the call and defers only the returned JSX', () => {
			fixture.client.takeSetupCalls();
			const result = mount(fixture.client.ProvidedValue, {
				build: () => {
					const value = fixture.client.SetupValue();
					expect(fixture.client.takeSetupCalls()).toEqual(['setup']);
					return value;
				},
			});
			const element = result.container.querySelector('[data-returned="setup"]');
			expect(element?.getAttribute('data-built')).toBe('outer');
			expect(element?.textContent).toBe('inner');
			result.unmount();

			fixture.server.takeSetupCalls();
			const { html } = ServerRuntime.renderToString(fixture.server.ProvidedValue, {
				build: () => fixture.server.SetupValue(),
			});
			expect(fixture.server.takeSetupCalls()).toEqual(['setup']);
			const serverElement = parse(html).querySelector('[data-returned="setup"]');
			expect(serverElement?.getAttribute('data-built')).toBe('outer');
			expect(serverElement?.textContent).toBe('inner');
		});

		it('reads a local that changed after the call when the element renders', () => {
			const value = fixture.client.ReassignedValue();
			fixture.client.bumpCount();
			const result = mount(fixture.client.SharedValueProviders, {
				value,
				first: 'first',
				second: 'second',
			});
			expect(
				result
					.findAll('[data-returned="reassigned"]')
					.map((element) => [element.textContent, element.getAttribute('data-count')]),
			).toEqual([
				['first', '2'],
				['second', '2'],
			]);
			result.unmount();

			const serverValue = fixture.server.ReassignedValue();
			fixture.server.bumpCount();
			const { html } = ServerRuntime.renderToString(fixture.server.SharedValueProviders, {
				value: serverValue,
				first: 'first',
				second: 'second',
			});
			expect(
				Array.from(parse(html).querySelectorAll('[data-returned="reassigned"]')).map((element) => [
					element.textContent,
					element.getAttribute('data-count'),
				]),
			).toEqual([
				['first', '2'],
				['second', '2'],
			]);
		});

		it('returns an element built outside rendering that each provider resolves', () => {
			const value = fixture.client.HostValue();
			expect(isValidElement(value)).toBe(true);
			const result = mount(fixture.client.SharedValueProviders, {
				value,
				first: 'first',
				second: 'second',
			});
			const read = () =>
				result
					.findAll('[data-returned="host"]')
					.map((element) => [element.textContent, element.getAttribute('data-value')]);
			expect(read()).toEqual([
				['first', 'first'],
				['second', 'second'],
			]);
			result.update(fixture.client.SharedValueProviders, {
				value,
				first: 'next-first',
				second: 'next-second',
			});
			expect(read()).toEqual([
				['next-first', 'next-first'],
				['next-second', 'next-second'],
			]);
			result.unmount();
		});

		it('server-renders an element built outside rendering in each provider', () => {
			const value = fixture.server.HostValue();
			expect(ServerRuntime.isValidElement(value)).toBe(true);
			for (const [first, second] of [
				['first', 'second'],
				['next-first', 'next-second'],
			]) {
				const { html } = ServerRuntime.renderToString(fixture.server.SharedValueProviders, {
					value,
					first,
					second,
				});
				const values = Array.from(parse(html).querySelectorAll('[data-returned="host"]')).map(
					(element) => [element.textContent, element.getAttribute('data-value')],
				);
				expect(values).toEqual([
					[first, first],
					[second, second],
				]);
			}
		});
	});
}
