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
	createElement,
	isValidElement,
	use,
	type ElementDescriptor,
	type OctaneNode,
} from 'octane';

const ValueContext = createContext('outer');

const getterValue = {
	get current() {
		return use(ValueContext);
	},
};

const contextualAttributes = {
	get 'data-value'() {
		return use(ValueContext);
	},
};

const proxyValue = new Proxy({ current: 'outer' }, {
	get(target, key, receiver) {
		return key === 'current' ? use(ValueContext) : Reflect.get(target, key, receiver);
	},
});

const coercibleValue = {
	[Symbol.toPrimitive]() {
		return use(ValueContext);
	},
};

const iterableValue = {
	*[Symbol.iterator]() {
		yield use(ValueContext);
	},
};

const computedKey = {
	[Symbol.toPrimitive]() {
		return use(ValueContext);
	},
};

const valuesByContext: Record<string, string> = { inner: 'inner', outer: 'outer' };
const sharedContextChild = <span data-context="shared">{getterValue.current as string}</span>;

function Slot(props: { content: OctaneNode }) @{
	<section data-outlet="slot">{props.content}</section>
}

function ContextAttributeComponent(props: { value: string }) @{
	<strong data-context="root-component-attribute" data-value={props.value}>
		attribute
	</strong>
}

function InspectContextAttribute(props: { child: OctaneNode }) @{
	const child = Children.only(props.child) as ElementDescriptor;
	const cloned = cloneElement(child, { 'data-inspected': 'yes' });
	<section
		data-root-valid={String(isValidElement(child))}
		data-root-type={String(child.type)}
		data-observed-value={String(child.props['data-value'])}
	>
		{cloned}
	</section>
}

function InspectChildrenThenProvide(props: { child: OctaneNode }) @{
	const child = Children.only(props.child) as ElementDescriptor;
	const inspected = String(child.props.children);
	<ValueContext.Provider value={inspected === 'outer' ? 'inner' : 'unexpected'}>
		{child}
	</ValueContext.Provider>
}

function InspectRecordThenProvide(props: { child: OctaneNode }) @{
	const child = Children.only(props.child) as ElementDescriptor;
	const inspected = String(child.props['data-value']);
	<ValueContext.Provider value={inspected === 'outer' ? 'inner' : 'unexpected'}>
		{child}
	</ValueContext.Provider>
}

function InnerFragmentComponent() @{
	<strong data-context="fragment-component-tag">inner</strong>
}

function OuterFragmentComponent() @{
	<strong data-context="fragment-component-tag">outer</strong>
}

const contextualFragmentComponent = {
	get current() {
		return use(ValueContext) === 'inner' ? InnerFragmentComponent : OuterFragmentComponent;
	},
};

function WrappedErrorBoundary({ children }: { children: OctaneNode }) @{
	<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>{children}</ErrorBoundary>
}

function WrappedSuspense(props: { children: OctaneNode }) @{
	<Suspense fallback={<i data-fallback="pending">pending</i>}>{props.children}</Suspense>
}

function readFailure(): string {
	throw new Error('scoped failure');
}

const throwingGetter = {
	get current(): string {
		throw new Error('scoped getter failure');
	},
};

export function DirectContext() @{
	<ValueContext.Provider value="inner">
		<span data-context="direct">{use(ValueContext) as string}</span>
	</ValueContext.Provider>
}

export function DirectGetterAttributeContext() @{
	<ValueContext.Provider value="inner">
		<span data-context="direct-attribute" data-value={getterValue.current}>
			attribute
		</span>
	</ValueContext.Provider>
}

export function DirectSpreadAttributeContext() @{
	<ValueContext.Provider value="inner">
		<span data-context="direct-spread-attribute" {...contextualAttributes}>
			attribute
		</span>
	</ValueContext.Provider>
}

export function DirectDynamicComponentContext() @{
	<ValueContext.Provider value="inner">
		<contextualFragmentComponent.current />
	</ValueContext.Provider>
}

export function RootHostAttributeContext() @{
	const content = <span data-context="root-host-attribute" data-value={getterValue.current}>
		attribute
	</span>;
	<ValueContext.Provider value="inner">{content}</ValueContext.Provider>
}

export function RootSpreadAttributeContext() @{
	const content = <span data-context="root-spread-attribute" {...contextualAttributes}>
		attribute
	</span>;
	<ValueContext.Provider value="inner">{content}</ValueContext.Provider>
}

export function RootComponentAttributeContext() @{
	const content = <ContextAttributeComponent value={getterValue.current} />;
	<ValueContext.Provider value="inner">{content}</ValueContext.Provider>
}

export function RootDynamicComponentContext() @{
	const content = <contextualFragmentComponent.current />;
	<ValueContext.Provider value="inner">{content}</ValueContext.Provider>
}

export function RootInspectedAttributeContext() @{
	const content = <span data-context="root-inspected-attribute" data-value={getterValue.current}>
		attribute
	</span>;
	<ValueContext.Provider value="inner">
		<InspectContextAttribute child={content} />
	</ValueContext.Provider>
}

export function InspectedChildrenProviderContext() @{
	const content = <span data-context="inspected-provider-children">
		{getterValue.current as string}
	</span>;
	<InspectChildrenThenProvide child={content} />
}

export function InspectedRecordProviderContext() @{
	const content = <span data-context="inspected-provider-record" data-value={getterValue.current}>
		attribute
	</span>;
	<InspectRecordThenProvide child={content} />
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

export function GetterContext() @{
	const content = <ValueContext.Provider value="inner">
		<span data-context="getter">{getterValue.current as string}</span>
	</ValueContext.Provider>;
	<section>{content}</section>
}

export function FragmentContext() @{
	const content = <>{use(ValueContext) as string}</>;
	<ValueContext.Provider value="inner">
		<span data-context="fragment">{content}</span>
	</ValueContext.Provider>
}

export function FragmentGetterContext() @{
	const content = <>{getterValue.current as string}</>;
	<ValueContext.Provider value="inner">
		<span data-context="fragment-getter">{content}</span>
	</ValueContext.Provider>
}

export function NestedFragmentContext() @{
	const content = <><>{getterValue.current as string}</></>;
	<ValueContext.Provider value="inner">
		<span data-context="fragment-nested">{content}</span>
	</ValueContext.Provider>
}

export function FragmentPropContext() @{
	const content = <Slot content={<>{getterValue.current as string}</>} />;
	<ValueContext.Provider value="inner">
		<section data-context="fragment-prop">{content}</section>
	</ValueContext.Provider>
}

export function FragmentArrayContext() @{
	const content = [<>{getterValue.current as string}</>];
	<ValueContext.Provider value="inner">
		<span data-context="fragment-array">{content[0]}</span>
	</ValueContext.Provider>
}

export function FragmentNestedExpressionContext() @{
	const content = <>
		<strong data-context="fragment-nested-expression">{getterValue.current as string}</strong>
	</>;
	<ValueContext.Provider value="inner">{content}</ValueContext.Provider>
}

export function FragmentNestedAttributeContext() @{
	const content = <>
		<strong data-context="fragment-nested-attribute" data-value={getterValue.current}>
			attribute
		</strong>
	</>;
	<ValueContext.Provider value="inner">{content}</ValueContext.Provider>
}

export function FragmentDynamicComponentContext() @{
	const content = <><contextualFragmentComponent.current /></>;
	<ValueContext.Provider value="inner">{content}</ValueContext.Provider>
}

export function ProxyContext() @{
	const content = <ValueContext.Provider value="inner">
		<span data-context="proxy">{proxyValue.current as string}</span>
	</ValueContext.Provider>;
	<section>{content}</section>
}

export function CoercionContext() @{
	const content = <ValueContext.Provider value="inner">
		<span data-context="coercion">{('' + coercibleValue) as string}</span>
	</ValueContext.Provider>;
	<section>{content}</section>
}

export function IterableContext() @{
	const content = <ValueContext.Provider value="inner">
		<span data-context="iterable">{[...iterableValue]}</span>
	</ValueContext.Provider>;
	<section>{content}</section>
}

export function OptionalComputedKeyContext() @{
	const content = <ValueContext.Provider value="inner">
		<span data-context="optional-key">
			{valuesByContext?.[computedKey as unknown as string] as string}
		</span>
	</ValueContext.Provider>;
	<section>{content}</section>
}

export function GetterAttributeContext() @{
	const content = <ValueContext.Provider value="inner">
		<span data-context="attribute" data-value={getterValue.current}>attribute</span>
	</ValueContext.Provider>;
	<section>{content}</section>
}

export function MappedContext() @{
	const content = <span data-context="mapped">{getterValue.current as string}</span>;
	const mapped = Children.map(content, (child) => child);
	<ValueContext.Provider value="inner">{mapped}</ValueContext.Provider>
}

export function FlattenedContext() @{
	const content = <span data-context="flattened">{getterValue.current as string}</span>;
	const flattened = Children.toArray(content);
	<ValueContext.Provider value="inner">{flattened}</ValueContext.Provider>
}

export function ClonedContext() @{
	const content = <span data-context="cloned">{getterValue.current as string}</span>;
	const cloned = cloneElement(content as ElementDescriptor, { 'data-cloned': 'yes' });
	<ValueContext.Provider value="inner">{cloned}</ValueContext.Provider>
}

export function MappedClonedContext() @{
	const content = <span data-context="mapped-cloned">{getterValue.current as string}</span>;
	const mapped = Children.map(content, (child) =>
		cloneElement(child as ElementDescriptor, { 'data-cloned': 'yes' }),
	);
	<ValueContext.Provider value="inner">{mapped}</ValueContext.Provider>
}

export function ConfigReplacedScopedChild() @{
	const content = <span data-replacement="config">{throwingGetter.current as string}</span>;
	const replaced = cloneElement(content as ElementDescriptor, { children: 'configured' });
	<section>{replaced}</section>
}

export function ConfigUndefinedReplacedScopedChild() @{
	const content = <span data-replacement="config-undefined">{throwingGetter.current as string}</span>;
	const replaced = cloneElement(content as ElementDescriptor, { children: undefined });
	<section>{replaced}</section>
}

export function PositionalReplacedScopedChild() @{
	const content = <span data-replacement="positional">{throwingGetter.current as string}</span>;
	const replaced = cloneElement(content as ElementDescriptor, {}, 'first-', 'second');
	<section>{replaced}</section>
}

export function UndefinedReplacedScopedChild() @{
	const content = <span data-replacement="undefined">{throwingGetter.current as string}</span>;
	const replaced = cloneElement(content as ElementDescriptor, {}, undefined);
	<section>{replaced}</section>
}

export function SharedDescriptorProviders(props: { first: string; second: string }) @{
	<section data-outlet="shared">
		<ValueContext.Provider value={props.first}>{sharedContextChild}</ValueContext.Provider>
		<ValueContext.Provider value={props.second}>{sharedContextChild}</ValueContext.Provider>
	</section>
}

export function SharedRootAttributeProviders(props: { first: string; second: string }) @{
	const content = <span data-context="shared-root" data-value={getterValue.current}>
		{getterValue.current as string}
	</span>;
	<section data-outlet="shared-root">
		<ValueContext.Provider value={props.first}>{content}</ValueContext.Provider>
		<ValueContext.Provider value={props.second}>{content}</ValueContext.Provider>
	</section>
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

export function WrappedGetterErrorValue() @{
	const content = <WrappedErrorBoundary>
		<span>{throwingGetter.current as string}</span>
	</WrappedErrorBoundary>;
	<ErrorBoundary fallback={<strong data-fallback="outer">outer</strong>}>{content}</ErrorBoundary>
}

export function FragmentErrorValue() @{
	const content = <>{throwingGetter.current as string}</>;
	<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>{content}</ErrorBoundary>
}

export function RootGetterErrorValue() @{
	const content = <span data-root-error={throwingGetter.current}>unreachable</span>;
	<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>{content}</ErrorBoundary>
}

export function MappedErrorValue() @{
	const content = <span>{throwingGetter.current as string}</span>;
	const mapped = Children.map(content, (child) => child);
	<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>{mapped}</ErrorBoundary>
}

export function FlattenedErrorValue() @{
	const content = <span>{throwingGetter.current as string}</span>;
	const flattened = Children.toArray(content);
	<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>{flattened}</ErrorBoundary>
}

export function ClonedErrorValue() @{
	const content = <span>{throwingGetter.current as string}</span>;
	const cloned = cloneElement(content as ElementDescriptor, {});
	<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>{cloned}</ErrorBoundary>
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

export function GetterSuspenseValue(props: { promise: Promise<string> }) @{
	const suspendedValue = {
		get current() {
			return use(props.promise);
		},
	};
	const content = <WrappedSuspense>
		<span data-resolved="getter">{suspendedValue.current as string}</span>
	</WrappedSuspense>;
	<section data-outlet="suspense">{content}</section>
}

export function FragmentSuspense(props: { promise: Promise<string> }) @{
	const content = <>{use(props.promise) as string}</>;
	<Suspense fallback={<i data-fallback="pending">pending</i>}>
		<span data-resolved="fragment">{content}</span>
	</Suspense>
}

export function RootGetterSuspense(props: { promise: Promise<string> }) @{
	const suspendedValue = {
		get current() {
			return use(props.promise);
		},
	};
	const content = <span data-resolved="root-attribute" data-value={suspendedValue.current}>
		{'resolved' as string}
	</span>;
	<Suspense fallback={<i data-fallback="pending">pending</i>}>{content}</Suspense>
}

export function MappedSuspense(props: { promise: Promise<string> }) @{
	const content = <span data-resolved="mapped">{use(props.promise) as string}</span>;
	const mapped = Children.map(content, (child) => child);
	<Suspense fallback={<i data-fallback="pending">pending</i>}>{mapped}</Suspense>
}

export function FlattenedSuspense(props: { promise: Promise<string> }) @{
	const content = <span data-resolved="flattened">{use(props.promise) as string}</span>;
	const flattened = Children.toArray(content);
	<Suspense fallback={<i data-fallback="pending">pending</i>}>{flattened}</Suspense>
}

export function ClonedSuspense(props: { promise: Promise<string> }) @{
	const content = <span data-resolved="cloned">{use(props.promise) as string}</span>;
	const cloned = cloneElement(content as ElementDescriptor, {});
	<Suspense fallback={<i data-fallback="pending">pending</i>}>{cloned}</Suspense>
}

function InspectChild(props: { child: OctaneNode }) @{
	const child = Children.only(props.child) as ElementDescriptor;
	const cloned = cloneElement(child, { 'data-inspected': 'yes' });
	<section
		data-valid={String(isValidElement(child))}
		data-element-type={String(child.type)}
		data-child-type={typeof child.props.children}
	>
		{cloned}
	</section>
}

function InspectIndexedChildren(props: { children: OctaneNode }) @{
	const children = Children.toArray(props.children);
	const indexed = children[1];
	<section
		data-fragment-count={String(children.length)}
		data-fragment-type={isValidElement(indexed) ? String(indexed.type) : 'missing'}
	>
		{indexed}
	</section>
}

function collectionLabel() {
	return 'inspected';
}

export function IndexedFragmentChildren(props: { name: string }) @{
	<InspectIndexedChildren
		children={<>
			Hello <strong data-indexed="yes">{props.name as string}</strong>
		</>}
	/>
}

export function OrdinaryElementValue() @{
	const content = <span data-ordinary="yes">ordinary</span>;
	<InspectChild child={content} />
}

export function InspectableExpressionValue() @{
	const content = <span data-ordinary="expression">{collectionLabel() as string}</span>;
	<InspectChild child={content} />
}

export function DirectCreateElementValue() @{
	const content = createElement('span', { 'data-ordinary': 'create-element' }, 'direct');
	<InspectChild child={content} />
}
`;

type ScopedTsRxFixture = typeof tsx & {
	DirectiveContext: ComponentBody<{ visible: boolean }>;
};

const tsrxFixtureId = '/packages/octane/tests/_fixtures/scoped-jsx-values.tsrx';
const compileOptions = {
	dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod',
	hmr: false,
};
const tsrx = loadCompiledFixtureSource<ScopedTsRxFixture>(tsrxSource, {
	id: tsrxFixtureId,
	mode: 'client',
	compileOptions,
});

const fixtures = [
	{
		name: 'TSRX',
		client: tsrx,
		server: loadCompiledFixtureSource<ScopedTsRxFixture>(tsrxSource, {
			id: tsrxFixtureId,
			mode: 'server',
			compileOptions,
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

function expectSharedValues(
	elements: Iterable<Element>,
	expected: string[],
	inspectAttributes: boolean,
) {
	const values = Array.from(elements);
	expect(values.map((element) => element.textContent)).toEqual(expected);
	if (inspectAttributes) {
		expect(values.map((element) => element.getAttribute('data-value'))).toEqual(expected);
	}
}

const contextScenarios = [
	['DirectContext', '[data-context="direct"]'],
	['DirectDynamicComponentContext', '[data-context="fragment-component-tag"]'],
	['RootDynamicComponentContext', '[data-context="fragment-component-tag"]'],
	['InspectedChildrenProviderContext', '[data-context="inspected-provider-children"]'],
	['VariableContext', '[data-context="variable"]'],
	['PropContext', '[data-context="prop"]'],
	['NestedContext', '[data-context="nested"]'],
	['GetterContext', '[data-context="getter"]'],
	['FragmentContext', '[data-context="fragment"]'],
	['FragmentGetterContext', '[data-context="fragment-getter"]'],
	['NestedFragmentContext', '[data-context="fragment-nested"]'],
	['FragmentPropContext', '[data-context="fragment-prop"]'],
	['FragmentArrayContext', '[data-context="fragment-array"]'],
	['FragmentNestedExpressionContext', '[data-context="fragment-nested-expression"]'],
	['FragmentDynamicComponentContext', '[data-context="fragment-component-tag"]'],
	['ProxyContext', '[data-context="proxy"]'],
	['CoercionContext', '[data-context="coercion"]'],
	['IterableContext', '[data-context="iterable"]'],
	['OptionalComputedKeyContext', '[data-context="optional-key"]'],
	['MappedContext', '[data-context="mapped"]'],
	['FlattenedContext', '[data-context="flattened"]'],
	['ClonedContext', '[data-context="cloned"]'],
	['MappedClonedContext', '[data-context="mapped-cloned"]'],
] as const;

for (const fixture of fixtures) {
	describe(`${fixture.name} JSX values follow the represented render scope`, () => {
		for (const [exportName, selector] of contextScenarios) {
			it(`${exportName} reads its nearest represented provider`, () => {
				const result = mount(fixture.client[exportName]);
				expect(result.find(selector).textContent).toBe('inner');
				result.unmount();
			});

			it(`${exportName} server-renders its nearest represented provider`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server[exportName]);
				expect(html).toContain('inner');
				expect(html).not.toContain('outer');
			});

			it(`${exportName} hydrates its existing provider and child`, () => {
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

		it('evaluates nested host attributes inside their represented provider', () => {
			const result = mount(fixture.client.GetterAttributeContext);
			expect(result.find('[data-context="attribute"]').getAttribute('data-value')).toBe('inner');
			result.unmount();
		});

		it('server-renders nested host attributes inside their represented provider', () => {
			const { html } = ServerRuntime.renderToString(fixture.server.GetterAttributeContext);
			expect(html).toContain('data-value="inner"');
			expect(html).not.toContain('data-value="outer"');
		});

		for (const [exportName, selector] of [
			['DirectGetterAttributeContext', '[data-context="direct-attribute"]'],
			['DirectSpreadAttributeContext', '[data-context="direct-spread-attribute"]'],
			['RootHostAttributeContext', '[data-context="root-host-attribute"]'],
			['RootSpreadAttributeContext', '[data-context="root-spread-attribute"]'],
			['RootComponentAttributeContext', '[data-context="root-component-attribute"]'],
			['InspectedRecordProviderContext', '[data-context="inspected-provider-record"]'],
		] as const) {
			it(`${exportName} evaluates host attributes inside its provider`, () => {
				const result = mount(fixture.client[exportName]);
				expect(result.find(selector).getAttribute('data-value')).toBe('inner');
				result.unmount();
			});

			it(`${exportName} server-renders host attributes inside its provider`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server[exportName]);
				expect(html).toContain('data-value="inner"');
				expect(html).not.toContain('data-value="outer"');
			});

			it(`${exportName} hydrates host attributes inside its provider`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server[exportName]);
				const container = document.createElement('div');
				container.innerHTML = html;
				document.body.appendChild(container);
				const existing = container.querySelector(selector);
				expect(existing?.getAttribute('data-value')).toBe('inner');

				const root = hydrateRoot(container, fixture.client[exportName]);
				flushSync(() => {});
				expect(container.querySelector(selector)).toBe(existing);
				expect(existing?.getAttribute('data-value')).toBe('inner');
				root.unmount();
				container.remove();
			});
		}

		it('RootInspectedAttributeContext preserves inspectable descriptors under its provider', () => {
			const result = mount(fixture.client.RootInspectedAttributeContext);
			const parent = result.find('[data-root-valid]');
			const child = result.find('[data-context="root-inspected-attribute"]');
			expect(parent.getAttribute('data-root-valid')).toBe('true');
			expect(parent.getAttribute('data-root-type')).toBe('span');
			expect(parent.getAttribute('data-observed-value')).toBe('inner');
			expect(child.getAttribute('data-value')).toBe('inner');
			expect(child.getAttribute('data-inspected')).toBe('yes');
			result.unmount();
		});

		it('RootInspectedAttributeContext server-renders inspected descriptors under its provider', () => {
			const { html } = ServerRuntime.renderToString(fixture.server.RootInspectedAttributeContext);
			const markup = document.createElement('div');
			markup.innerHTML = html;
			const parent = markup.querySelector('[data-root-valid]');
			const child = markup.querySelector('[data-context="root-inspected-attribute"]');
			expect(parent?.getAttribute('data-root-valid')).toBe('true');
			expect(parent?.getAttribute('data-root-type')).toBe('span');
			expect(parent?.getAttribute('data-observed-value')).toBe('inner');
			expect(child?.getAttribute('data-value')).toBe('inner');
			expect(child?.getAttribute('data-inspected')).toBe('yes');
		});

		it('RootInspectedAttributeContext hydrates inspected descriptors under its provider', () => {
			const { html } = ServerRuntime.renderToString(fixture.server.RootInspectedAttributeContext);
			const container = document.createElement('div');
			container.innerHTML = html;
			document.body.appendChild(container);
			const existing = container.querySelector('[data-context="root-inspected-attribute"]');
			expect(existing?.getAttribute('data-value')).toBe('inner');

			const root = hydrateRoot(container, fixture.client.RootInspectedAttributeContext);
			flushSync(() => {});
			expect(container.querySelector('[data-context="root-inspected-attribute"]')).toBe(existing);
			expect(
				container.querySelector('[data-root-valid]')?.getAttribute('data-observed-value'),
			).toBe('inner');
			expect(existing?.getAttribute('data-value')).toBe('inner');
			expect(existing?.getAttribute('data-inspected')).toBe('yes');
			root.unmount();
			container.remove();
		});

		it('evaluates fragment-nested host attributes inside their represented provider', () => {
			const result = mount(fixture.client.FragmentNestedAttributeContext);
			expect(
				result.find('[data-context="fragment-nested-attribute"]').getAttribute('data-value'),
			).toBe('inner');
			result.unmount();
		});

		it('server-renders fragment-nested host attributes inside their represented provider', () => {
			const { html } = ServerRuntime.renderToString(fixture.server.FragmentNestedAttributeContext);
			expect(html).toContain('data-value="inner"');
			expect(html).not.toContain('data-value="outer"');
		});

		it('hydrates fragment-nested host attributes inside their represented provider', () => {
			const { html } = ServerRuntime.renderToString(fixture.server.FragmentNestedAttributeContext);
			const container = document.createElement('div');
			container.innerHTML = html;
			document.body.appendChild(container);
			const existing = container.querySelector('[data-context="fragment-nested-attribute"]');
			expect(existing?.getAttribute('data-value')).toBe('inner');

			const root = hydrateRoot(container, fixture.client.FragmentNestedAttributeContext);
			flushSync(() => {});
			expect(container.querySelector('[data-context="fragment-nested-attribute"]')).toBe(existing);
			expect(existing?.getAttribute('data-value')).toBe('inner');
			root.unmount();
			container.remove();
		});

		for (const [exportName, selector, inspectAttributes] of [
			['SharedDescriptorProviders', '[data-context="shared"]', false],
			['SharedRootAttributeProviders', '[data-context="shared-root"]', true],
		] as const) {
			it(`${exportName} isolates one descriptor across providers and updates`, () => {
				const result = mount(fixture.client[exportName], {
					first: 'first',
					second: 'second',
				});
				expectSharedValues(result.findAll(selector), ['first', 'second'], inspectAttributes);

				result.update(fixture.client[exportName], {
					first: 'updated-first',
					second: 'updated-second',
				});
				expectSharedValues(
					result.findAll(selector),
					['updated-first', 'updated-second'],
					inspectAttributes,
				);
				result.unmount();
			});

			it(`${exportName} isolates one descriptor across providers and server requests`, () => {
				const first = ServerRuntime.renderToString(fixture.server[exportName], {
					first: 'first',
					second: 'second',
				});
				const next = ServerRuntime.renderToString(fixture.server[exportName], {
					first: 'next-first',
					second: 'next-second',
				});

				const firstMarkup = document.createElement('div');
				firstMarkup.innerHTML = first.html;
				const nextMarkup = document.createElement('div');
				nextMarkup.innerHTML = next.html;
				expectSharedValues(
					firstMarkup.querySelectorAll(selector),
					['first', 'second'],
					inspectAttributes,
				);
				expectSharedValues(
					nextMarkup.querySelectorAll(selector),
					['next-first', 'next-second'],
					inspectAttributes,
				);
			});

			it(`${exportName} hydrates one descriptor without leaking provider values`, () => {
				const props = { first: 'first', second: 'second' };
				const { html } = ServerRuntime.renderToString(fixture.server[exportName], props);
				const container = document.createElement('div');
				container.innerHTML = html;
				document.body.appendChild(container);
				const existing = Array.from(container.querySelectorAll(selector));
				expectSharedValues(existing, ['first', 'second'], inspectAttributes);

				const root = hydrateRoot(container, fixture.client[exportName], props);
				flushSync(() => {});
				const adopted = Array.from(container.querySelectorAll(selector));
				expect(adopted).toEqual(existing);
				expectSharedValues(adopted, ['first', 'second'], inspectAttributes);
				root.unmount();
				container.remove();
			});
		}

		for (const [exportName, kind, expected] of [
			['ConfigReplacedScopedChild', 'config', 'configured'],
			['ConfigUndefinedReplacedScopedChild', 'config-undefined', ''],
			['PositionalReplacedScopedChild', 'positional', 'first-second'],
			['UndefinedReplacedScopedChild', 'undefined', ''],
		] as const) {
			const selector = `[data-replacement="${kind}"]`;

			it(`${exportName} replaces children without evaluating the original subtree`, () => {
				const result = mount(fixture.client[exportName]);
				expect(result.find(selector).textContent).toBe(expected);
				result.unmount();
			});

			it(`${exportName} server-renders only its explicitly replaced children`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server[exportName]);
				const markup = document.createElement('div');
				markup.innerHTML = html;
				expect(markup.querySelector(selector)?.textContent).toBe(expected);
			});

			it(`${exportName} hydrates its explicitly replaced children`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server[exportName]);
				const container = document.createElement('div');
				container.innerHTML = html;
				document.body.appendChild(container);
				const existing = container.querySelector(selector);
				expect(existing?.textContent).toBe(expected);

				const root = hydrateRoot(container, fixture.client[exportName]);
				flushSync(() => {});
				expect(container.querySelector(selector)).toBe(existing);
				expect(existing?.textContent).toBe(expected);
				root.unmount();
				container.remove();
			});
		}

		for (const exportName of [
			'BuiltInErrorValue',
			'WrappedErrorValue',
			'WrappedGetterErrorValue',
			'FragmentErrorValue',
			'RootGetterErrorValue',
			'MappedErrorValue',
			'FlattenedErrorValue',
			'ClonedErrorValue',
		] as const) {
			it(`${exportName} assigns a synchronous error to its nearest boundary`, () => {
				const result = mount(fixture.client[exportName]);
				expect(result.find('[data-fallback="inner"]').textContent).toBe('inner');
				expect(result.findAll('[data-fallback="outer"]')).toHaveLength(0);
				result.unmount();
			});

			it(`${exportName} server-renders its nearest error fallback`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server[exportName]);
				expect(html).toContain('data-fallback="inner"');
				expect(html).not.toContain('data-fallback="outer"');
			});
		}

		for (const [exportName, resolved] of [
			['DirectSuspense', 'direct'],
			['VariableSuspense', 'variable'],
			['WrappedSuspenseValue', 'wrapped'],
			['GetterSuspenseValue', 'getter'],
			['FragmentSuspense', 'fragment'],
			['RootGetterSuspense', 'root-attribute'],
			['MappedSuspense', 'mapped'],
			['FlattenedSuspense', 'flattened'],
			['ClonedSuspense', 'cloned'],
		] as const) {
			it(`${exportName} suspends and resolves inside its represented boundary`, async () => {
				const pending = deferred();
				const result = mount(fixture.client[exportName], { promise: pending.promise });
				expect(result.find('[data-fallback="pending"]').textContent).toBe('pending');

				await act(() => {
					pending.resolve('resolved');
				});

				const resolvedElement = result.find(`[data-resolved="${resolved}"]`);
				expect(resolvedElement.textContent).toBe('resolved');
				if (exportName === 'RootGetterSuspense') {
					expect(resolvedElement.getAttribute('data-value')).toBe('resolved');
				}
				expect(result.findAll('[data-fallback="pending"]')).toHaveLength(0);
				result.unmount();
			});

			it(`${exportName} server-renders its own pending fallback`, () => {
				const pending = deferred();
				const { html } = ServerRuntime.renderToString(fixture.server[exportName], {
					promise: pending.promise,
				});
				expect(html).toContain('data-fallback="pending"');
			});
		}

		for (const [exportName, value, expected] of [
			['OrdinaryElementValue', 'yes', 'ordinary'],
			['InspectableExpressionValue', 'expression', 'inspected'],
			['DirectCreateElementValue', 'create-element', 'direct'],
		] as const) {
			it(`${exportName} preserves inspectable, cloneable element descriptors`, () => {
				const result = mount(fixture.client[exportName]);
				const parent = result.find('[data-valid="true"]');
				const child = result.find(`[data-ordinary="${value}"]`);
				expect(parent.getAttribute('data-element-type')).toBe('span');
				expect(parent.getAttribute('data-child-type')).toBe('string');
				expect(child.textContent).toBe(expected);
				expect(child.getAttribute('data-inspected')).toBe('yes');
				result.unmount();
			});

			it(`${exportName} preserves descriptor inspection during server rendering`, () => {
				const { html } = ServerRuntime.renderToString(fixture.server[exportName]);
				expect(html).toContain('data-valid="true"');
				expect(html).toContain('data-element-type="span"');
				expect(html).toContain('data-child-type="string"');
				expect(html).toContain(`data-ordinary="${value}"`);
				expect(html).toContain('data-inspected="yes"');
				expect(html).toContain(expected);
			});
		}

		it('preserves positional fragment siblings when nested child expressions are dynamic', () => {
			const result = mount(fixture.client.IndexedFragmentChildren, { name: 'Ada' });
			const parent = result.find('[data-fragment-count]');
			expect(parent.getAttribute('data-fragment-count')).toBe('2');
			expect(parent.getAttribute('data-fragment-type')).toBe('strong');
			expect(result.find('[data-indexed="yes"]').textContent).toBe('Ada');
			result.unmount();
		});

		it('server-renders inspectable positional fragment siblings', () => {
			const { html } = ServerRuntime.renderToString(fixture.server.IndexedFragmentChildren, {
				name: 'Ada',
			});
			const markup = document.createElement('div');
			markup.innerHTML = html;
			const parent = markup.querySelector('[data-fragment-count]');
			expect(parent?.getAttribute('data-fragment-count')).toBe('2');
			expect(parent?.getAttribute('data-fragment-type')).toBe('strong');
			expect(parent?.querySelector('[data-indexed="yes"]')?.textContent).toBe('Ada');
		});

		it('hydrates inspectable positional fragment siblings', () => {
			const props = { name: 'Ada' };
			const { html } = ServerRuntime.renderToString(fixture.server.IndexedFragmentChildren, props);
			const container = document.createElement('div');
			container.innerHTML = html;
			document.body.appendChild(container);
			const parent = container.querySelector('[data-fragment-count]');
			const existing = parent?.querySelector('[data-indexed="yes"]');
			expect(parent?.getAttribute('data-fragment-count')).toBe('2');
			expect(parent?.getAttribute('data-fragment-type')).toBe('strong');
			expect(existing?.textContent).toBe('Ada');

			const root = hydrateRoot(container, fixture.client.IndexedFragmentChildren, props);
			flushSync(() => {});
			expect(container.querySelector('[data-indexed="yes"]')).toBe(existing);
			expect(existing?.textContent).toBe('Ada');
			root.unmount();
			container.remove();
		});
	});
}

describe('TSRX directives nested in JSX values', () => {
	it('retains the provider inside an active directive arm', () => {
		const result = mount(tsrx.DirectiveContext, { visible: true });
		expect(result.find('[data-context="directive"]').textContent).toBe('inner');
		result.update(tsrx.DirectiveContext, { visible: false });
		expect(result.find('[data-context="directive"]').textContent).toBe('hidden');
		result.unmount();
	});

	it('server-renders a nested directive under its represented provider', () => {
		const server = fixtures[0].server as ScopedTsRxFixture;
		const { html } = ServerRuntime.renderToString(server.DirectiveContext, {
			visible: true,
		});
		expect(html).toContain('data-context="directive"');
		expect(html).toContain('inner');
		expect(html).not.toContain('outer');
	});
});
