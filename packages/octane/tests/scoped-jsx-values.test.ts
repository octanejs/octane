import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';

import { flushSync, hydrateRoot, type ComponentBody } from '../src/index.js';
import { act, mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';
import * as tsx from './_fixtures/scoped-jsx-values.tsx';

const tsrxSource = String.raw`
import {
	Children,
	ErrorBoundary,
	Suspense,
	cloneElement,
	createContext,
	isValidElement,
	use,
	type ElementDescriptor,
	type OctaneNode,
} from 'octane';

const ValueContext = createContext('outer');

function Slot(props: { content: OctaneNode }) @{
	<section data-outlet="slot">{props.content}</section>
}

function WrappedErrorBoundary({ children }: { children: OctaneNode }) @{
	<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>{children}</ErrorBoundary>
}

function WrappedSuspense(props: { children: OctaneNode }) @{
	<Suspense fallback={<i data-fallback="pending">pending</i>}>{props.children}</Suspense>
}

function readFailure(): string {
	throw new Error('scoped failure');
}

export function DirectContext() @{
	<ValueContext.Provider value="inner">
		<span data-context="direct">{use(ValueContext) as string}</span>
	</ValueContext.Provider>
}

export function VariableContext() @{
	const content = <ValueContext.Provider value="inner">
		<span data-context="variable">{use(ValueContext) as string}</span>
	</ValueContext.Provider>;
	<section data-outlet="variable">{content}</section>
}

export function PropContext() @{
	<Slot
		content={
			<ValueContext.Provider value="inner">
				<span data-context="prop">{use(ValueContext) as string}</span>
			</ValueContext.Provider>
		}
	/>
}

export function NestedContext() @{
	const nested = {
		items: [
			<ValueContext.Provider value="inner">
				<span data-context="nested">{use(ValueContext) as string}</span>
			</ValueContext.Provider>,
		],
	};
	<section data-outlet="nested">{nested.items[0]}</section>
}

export function DirectiveContext(props: { visible: boolean }) @{
	const content = <ValueContext.Provider value="inner">
		<div data-outlet="directive">
			@if (props.visible) {
				<span data-context="directive">{use(ValueContext) as string}</span>
			} @else {
				<span data-context="directive">hidden</span>
			}
		</div>
	</ValueContext.Provider>;
	<section>{content}</section>
}

export function BuiltInErrorValue() @{
	const content = <ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>
		<span>{readFailure() as string}</span>
	</ErrorBoundary>;
	<ErrorBoundary fallback={<strong data-fallback="outer">outer</strong>}>{content}</ErrorBoundary>
}

export function WrappedErrorValue() @{
	const content = <WrappedErrorBoundary>
		<span>{readFailure() as string}</span>
	</WrappedErrorBoundary>;
	<ErrorBoundary fallback={<strong data-fallback="outer">outer</strong>}>{content}</ErrorBoundary>
}

export function DirectSuspense(props: { promise: Promise<string> }) @{
	<Suspense fallback={<i data-fallback="pending">pending</i>}>
		<span data-resolved="direct">{use(props.promise) as string}</span>
	</Suspense>
}

export function VariableSuspense(props: { promise: Promise<string> }) @{
	const content = <Suspense fallback={<i data-fallback="pending">pending</i>}>
		<span data-resolved="variable">{use(props.promise) as string}</span>
	</Suspense>;
	<section data-outlet="suspense">{content}</section>
}

export function WrappedSuspenseValue(props: { promise: Promise<string> }) @{
	const content = <WrappedSuspense>
		<span data-resolved="wrapped">{use(props.promise) as string}</span>
	</WrappedSuspense>;
	<section data-outlet="suspense">{content}</section>
}

function InspectChild(props: { children: OctaneNode }) @{
	const child = Children.only(props.children) as ElementDescriptor;
	const cloned = cloneElement(child, { 'data-inspected': 'yes' });
	<section data-valid={String(isValidElement(child))}>{cloned}</section>
}

export function OrdinaryElementValue() @{
	const content = <span data-ordinary="yes">ordinary</span>;
	<InspectChild>{content}</InspectChild>
}
`;

type ScopedTsRxFixture = typeof tsx & {
	DirectiveContext: ComponentBody<{ visible: boolean }>;
};

const tsrxFixtureId = '/packages/octane/tests/_fixtures/scoped-jsx-values.tsrx';
const tsrxCompileOptions = {
	dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod',
	hmr: false,
};
const tsrx = loadCompiledFixtureSource<ScopedTsRxFixture>(tsrxSource, {
	id: tsrxFixtureId,
	mode: 'client',
	compileOptions: tsrxCompileOptions,
});

const fixtures = [
	{
		name: 'TSRX',
		client: tsrx,
		server: loadCompiledFixtureSource<ScopedTsRxFixture>(tsrxSource, {
			id: tsrxFixtureId,
			mode: 'server',
			compileOptions: tsrxCompileOptions,
		}),
	},
	{
		name: 'TSX',
		client: tsx,
		server: loadServerFixture<typeof tsx>('packages/octane/tests/_fixtures/scoped-jsx-values.tsx'),
	},
];

function deferred() {
	let resolve!: (value: string) => void;
	const promise = new Promise<string>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

for (const fixture of fixtures) {
	describe(`${fixture.name} scoped JSX values`, () => {
		for (const [exportName, selector] of [
			['DirectContext', '[data-context="direct"]'],
			['VariableContext', '[data-context="variable"]'],
			['PropContext', '[data-context="prop"]'],
			['NestedContext', '[data-context="nested"]'],
		] as const) {
			it(`${exportName} reads the nearest represented provider`, () => {
				const result = mount(fixture.client[exportName]);
				expect(result.find(selector).textContent).toBe('inner');
				result.unmount();
			});

			it(`${exportName} server-renders the nearest represented provider`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server[exportName]);
				expect(html).toContain('inner');
				expect(html).not.toContain('outer');
			});

			it(`${exportName} hydrates the existing provider and child`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server[exportName]);
				const container = document.createElement('div');
				container.innerHTML = html;
				document.body.appendChild(container);
				const existing = container.querySelector(selector);
				expect(existing?.textContent).toBe('inner');

				const root = hydrateRoot(container, fixture.client[exportName]);
				flushSync(() => {});
				expect(container.querySelector(selector)).toBe(existing);
				expect(existing?.textContent).toBe('inner');
				root.unmount();
				container.remove();
			});
		}

		for (const exportName of ['BuiltInErrorValue', 'WrappedErrorValue'] as const) {
			it(`${exportName} assigns a synchronous error to the nearest boundary`, () => {
				const result = mount(fixture.client[exportName]);
				expect(result.find('[data-fallback="inner"]').textContent).toBe('inner');
				expect(result.findAll('[data-fallback="outer"]')).toHaveLength(0);
				result.unmount();
			});

			it(`${exportName} server-renders the nearest error fallback`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server[exportName]);
				expect(html).toContain('data-fallback="inner"');
				expect(html).not.toContain('data-fallback="outer"');
			});
		}

		for (const [exportName, resolved] of [
			['DirectSuspense', 'direct'],
			['VariableSuspense', 'variable'],
			['WrappedSuspenseValue', 'wrapped'],
		] as const) {
			it(`${exportName} suspends and resolves inside the represented boundary`, async () => {
				const pending = deferred();
				const result = mount(fixture.client[exportName], { promise: pending.promise });
				expect(result.find('[data-fallback="pending"]').textContent).toBe('pending');

				await act(() => {
					pending.resolve('resolved');
				});

				expect(result.find(`[data-resolved="${resolved}"]`).textContent).toBe('resolved');
				expect(result.findAll('[data-fallback="pending"]')).toHaveLength(0);
				result.unmount();
			});

			it(`${exportName} server-renders its own pending fallback`, () => {
				const pending = deferred();
				const { html } = ServerRuntime.renderToString(fixture.server[exportName], {
					promise: pending.promise,
				});
				expect(html).toContain('data-fallback="pending"');
				expect(html).toContain('pending');
			});
		}

		it('preserves ordinary element inspection and cloning', () => {
			const result = mount(fixture.client.OrdinaryElementValue);
			expect(result.find('[data-valid="true"] [data-ordinary="yes"]').textContent).toBe('ordinary');
			expect(result.find('[data-inspected="yes"]').textContent).toBe('ordinary');
			result.unmount();
		});

		it('preserves ordinary element inspection and cloning during server rendering', () => {
			const { html } = ServerRuntime.renderToString(fixture.server.OrdinaryElementValue);
			expect(html).toContain('data-valid="true"');
			expect(html).toContain('data-ordinary="yes"');
			expect(html).toContain('data-inspected="yes"');
		});
	});
}

describe('TSRX directives nested in scoped JSX values', () => {
	it('retains the provider inside an active directive arm', () => {
		const result = mount(tsrx.DirectiveContext, { visible: true });
		expect(result.find('[data-context="directive"]').textContent).toBe('inner');
		result.update(tsrx.DirectiveContext, { visible: false });
		expect(result.find('[data-context="directive"]').textContent).toBe('hidden');
		result.unmount();
	});

	it('server-renders a nested directive under the represented provider', () => {
		const server = fixtures[0].server as typeof tsrx;
		const { html } = ServerRuntime.renderToString(server.DirectiveContext, { visible: true });
		expect(html).toContain('data-context="directive"');
		expect(html).toContain('inner');
		expect(html).not.toContain('outer');
	});
});
