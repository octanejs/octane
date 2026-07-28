/** @jsxImportSource octane */

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

const proxyValue = new Proxy(
	{ current: 'outer' },
	{
		get(target, key, receiver) {
			return key === 'current' ? use(ValueContext) : Reflect.get(target, key, receiver);
		},
	},
);

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
const sharedContextChild = <span data-context="shared">{getterValue.current}</span>;

function Slot(props: { content: OctaneNode }) {
	return <section data-outlet="slot">{props.content}</section>;
}

function ContextAttributeComponent(props: { value: string }) {
	return (
		<strong data-context="root-component-attribute" data-value={props.value}>
			attribute
		</strong>
	);
}

function InspectContextAttribute(props: { child: OctaneNode }) {
	const child = Children.only(props.child) as ElementDescriptor;
	const cloned = cloneElement(child, { 'data-inspected': 'yes' });
	return (
		<section
			data-root-valid={String(isValidElement(child))}
			data-root-type={String(child.type)}
			data-observed-value={String(child.props['data-value'])}
		>
			{cloned}
		</section>
	);
}

function InnerFragmentComponent() {
	return <strong data-context="fragment-component-tag">inner</strong>;
}

function OuterFragmentComponent() {
	return <strong data-context="fragment-component-tag">outer</strong>;
}

const contextualFragmentComponent = {
	get current() {
		return use(ValueContext) === 'inner' ? InnerFragmentComponent : OuterFragmentComponent;
	},
};

function WrappedErrorBoundary(props: { children: OctaneNode }) {
	return (
		<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>
			{props.children}
		</ErrorBoundary>
	);
}

function WrappedSuspense(props: { children: OctaneNode }) {
	return <Suspense fallback={<i data-fallback="pending">pending</i>}>{props.children}</Suspense>;
}

function readFailure(): string {
	throw new Error('scoped failure');
}

const throwingGetter = {
	get current(): string {
		throw new Error('scoped getter failure');
	},
};

export function DirectContext() {
	return (
		<ValueContext.Provider value="inner">
			<span data-context="direct">{use(ValueContext)}</span>
		</ValueContext.Provider>
	);
}

export function DirectGetterAttributeContext() {
	return (
		<ValueContext.Provider value="inner">
			<span data-context="direct-attribute" data-value={getterValue.current}>
				attribute
			</span>
		</ValueContext.Provider>
	);
}

export function DirectSpreadAttributeContext() {
	return (
		<ValueContext.Provider value="inner">
			<span data-context="direct-spread-attribute" {...contextualAttributes}>
				attribute
			</span>
		</ValueContext.Provider>
	);
}

export function DirectDynamicComponentContext() {
	return (
		<ValueContext.Provider value="inner">
			<contextualFragmentComponent.current />
		</ValueContext.Provider>
	);
}

export function RootHostAttributeContext() {
	const content = (
		<span data-context="root-host-attribute" data-value={getterValue.current}>
			attribute
		</span>
	);
	return <ValueContext.Provider value="inner">{content}</ValueContext.Provider>;
}

export function RootSpreadAttributeContext() {
	const content = (
		<span data-context="root-spread-attribute" {...contextualAttributes}>
			attribute
		</span>
	);
	return <ValueContext.Provider value="inner">{content}</ValueContext.Provider>;
}

export function RootComponentAttributeContext() {
	const content = <ContextAttributeComponent value={getterValue.current} />;
	return <ValueContext.Provider value="inner">{content}</ValueContext.Provider>;
}

export function RootDynamicComponentContext() {
	const content = <contextualFragmentComponent.current />;
	return <ValueContext.Provider value="inner">{content}</ValueContext.Provider>;
}

export function RootInspectedAttributeContext() {
	const content = (
		<span data-context="root-inspected-attribute" data-value={getterValue.current}>
			attribute
		</span>
	);
	return (
		<ValueContext.Provider value="inner">
			<InspectContextAttribute child={content} />
		</ValueContext.Provider>
	);
}

export function VariableContext() {
	const content = (
		<ValueContext.Provider value="inner">
			<span data-context="variable">{use(ValueContext)}</span>
		</ValueContext.Provider>
	);
	return <section data-outlet="variable">{content}</section>;
}

export function PropContext() {
	return (
		<Slot
			content={
				<ValueContext.Provider value="inner">
					<span data-context="prop">{use(ValueContext)}</span>
				</ValueContext.Provider>
			}
		/>
	);
}

export function NestedContext() {
	const nested = {
		items: [
			<ValueContext.Provider value="inner">
				<span data-context="nested">{use(ValueContext)}</span>
			</ValueContext.Provider>,
		],
	};
	return <section data-outlet="nested">{nested.items[0]}</section>;
}

export function GetterContext() {
	const content = (
		<ValueContext.Provider value="inner">
			<span data-context="getter">{getterValue.current}</span>
		</ValueContext.Provider>
	);
	return <section>{content}</section>;
}

export function FragmentContext() {
	const content = <>{use(ValueContext)}</>;
	return (
		<ValueContext.Provider value="inner">
			<span data-context="fragment">{content}</span>
		</ValueContext.Provider>
	);
}

export function FragmentGetterContext() {
	const content = <>{getterValue.current}</>;
	return (
		<ValueContext.Provider value="inner">
			<span data-context="fragment-getter">{content}</span>
		</ValueContext.Provider>
	);
}

export function NestedFragmentContext() {
	const content = (
		<>
			<>{getterValue.current}</>
		</>
	);
	return (
		<ValueContext.Provider value="inner">
			<span data-context="fragment-nested">{content}</span>
		</ValueContext.Provider>
	);
}

export function FragmentPropContext() {
	const content = <Slot content={<>{getterValue.current}</>} />;
	return (
		<ValueContext.Provider value="inner">
			<section data-context="fragment-prop">{content}</section>
		</ValueContext.Provider>
	);
}

export function FragmentArrayContext() {
	const content = [<>{getterValue.current}</>];
	return (
		<ValueContext.Provider value="inner">
			<span data-context="fragment-array">{content[0]}</span>
		</ValueContext.Provider>
	);
}

export function FragmentNestedExpressionContext() {
	const content = (
		<>
			<strong data-context="fragment-nested-expression">{getterValue.current}</strong>
		</>
	);
	return <ValueContext.Provider value="inner">{content}</ValueContext.Provider>;
}

export function FragmentNestedAttributeContext() {
	const content = (
		<>
			<strong data-context="fragment-nested-attribute" data-value={getterValue.current}>
				attribute
			</strong>
		</>
	);
	return <ValueContext.Provider value="inner">{content}</ValueContext.Provider>;
}

export function FragmentDynamicComponentContext() {
	const content = (
		<>
			<contextualFragmentComponent.current />
		</>
	);
	return <ValueContext.Provider value="inner">{content}</ValueContext.Provider>;
}

export function ProxyContext() {
	const content = (
		<ValueContext.Provider value="inner">
			<span data-context="proxy">{proxyValue.current}</span>
		</ValueContext.Provider>
	);
	return <section>{content}</section>;
}

export function CoercionContext() {
	const content = (
		<ValueContext.Provider value="inner">
			<span data-context="coercion">{'' + coercibleValue}</span>
		</ValueContext.Provider>
	);
	return <section>{content}</section>;
}

export function IterableContext() {
	const content = (
		<ValueContext.Provider value="inner">
			<span data-context="iterable">{[...iterableValue]}</span>
		</ValueContext.Provider>
	);
	return <section>{content}</section>;
}

export function OptionalComputedKeyContext() {
	const content = (
		<ValueContext.Provider value="inner">
			<span data-context="optional-key">{valuesByContext?.[computedKey as unknown as string]}</span>
		</ValueContext.Provider>
	);
	return <section>{content}</section>;
}

export function GetterAttributeContext() {
	const content = (
		<ValueContext.Provider value="inner">
			<span data-context="attribute" data-value={getterValue.current}>
				attribute
			</span>
		</ValueContext.Provider>
	);
	return <section>{content}</section>;
}

export function MappedContext() {
	const content = <span data-context="mapped">{getterValue.current}</span>;
	const mapped = Children.map(content, (child) => child);
	return <ValueContext.Provider value="inner">{mapped}</ValueContext.Provider>;
}

export function FlattenedContext() {
	const content = <span data-context="flattened">{getterValue.current}</span>;
	const flattened = Children.toArray(content);
	return <ValueContext.Provider value="inner">{flattened}</ValueContext.Provider>;
}

export function ClonedContext() {
	const content = <span data-context="cloned">{getterValue.current}</span>;
	const cloned = cloneElement(content as ElementDescriptor, { 'data-cloned': 'yes' });
	return <ValueContext.Provider value="inner">{cloned}</ValueContext.Provider>;
}

export function MappedClonedContext() {
	const content = <span data-context="mapped-cloned">{getterValue.current}</span>;
	const mapped = Children.map(content, (child) =>
		cloneElement(child as ElementDescriptor, { 'data-cloned': 'yes' }),
	);
	return <ValueContext.Provider value="inner">{mapped}</ValueContext.Provider>;
}

export function ConfigReplacedScopedChild() {
	const content = <span data-replacement="config">{throwingGetter.current}</span>;
	const replaced = cloneElement(content as ElementDescriptor, { children: 'configured' });
	return <section>{replaced}</section>;
}

export function ConfigUndefinedReplacedScopedChild() {
	const content = <span data-replacement="config-undefined">{throwingGetter.current}</span>;
	const replaced = cloneElement(content as ElementDescriptor, { children: undefined });
	return <section>{replaced}</section>;
}

export function PositionalReplacedScopedChild() {
	const content = <span data-replacement="positional">{throwingGetter.current}</span>;
	const replaced = cloneElement(content as ElementDescriptor, {}, 'first-', 'second');
	return <section>{replaced}</section>;
}

export function UndefinedReplacedScopedChild() {
	const content = <span data-replacement="undefined">{throwingGetter.current}</span>;
	const replaced = cloneElement(content as ElementDescriptor, {}, undefined);
	return <section>{replaced}</section>;
}

export function SharedDescriptorProviders(props: { first: string; second: string }) {
	return (
		<section data-outlet="shared">
			<ValueContext.Provider value={props.first}>{sharedContextChild}</ValueContext.Provider>
			<ValueContext.Provider value={props.second}>{sharedContextChild}</ValueContext.Provider>
		</section>
	);
}

export function SharedRootAttributeProviders(props: { first: string; second: string }) {
	const content = (
		<span data-context="shared-root" data-value={getterValue.current}>
			{getterValue.current}
		</span>
	);
	return (
		<section data-outlet="shared-root">
			<ValueContext.Provider value={props.first}>{content}</ValueContext.Provider>
			<ValueContext.Provider value={props.second}>{content}</ValueContext.Provider>
		</section>
	);
}

export function BuiltInErrorValue() {
	const content = (
		<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>
			<span>{readFailure()}</span>
		</ErrorBoundary>
	);
	return (
		<ErrorBoundary fallback={<strong data-fallback="outer">outer</strong>}>{content}</ErrorBoundary>
	);
}

export function WrappedErrorValue() {
	const content = (
		<WrappedErrorBoundary>
			<span>{readFailure()}</span>
		</WrappedErrorBoundary>
	);
	return (
		<ErrorBoundary fallback={<strong data-fallback="outer">outer</strong>}>{content}</ErrorBoundary>
	);
}

export function WrappedGetterErrorValue() {
	const content = (
		<WrappedErrorBoundary>
			<span>{throwingGetter.current}</span>
		</WrappedErrorBoundary>
	);
	return (
		<ErrorBoundary fallback={<strong data-fallback="outer">outer</strong>}>{content}</ErrorBoundary>
	);
}

export function FragmentErrorValue() {
	const content = <>{throwingGetter.current}</>;
	return (
		<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>{content}</ErrorBoundary>
	);
}

export function RootGetterErrorValue() {
	const content = <span data-root-error={throwingGetter.current}>unreachable</span>;
	return (
		<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>{content}</ErrorBoundary>
	);
}

export function MappedErrorValue() {
	const content = <span>{throwingGetter.current}</span>;
	const mapped = Children.map(content, (child) => child);
	return (
		<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>{mapped}</ErrorBoundary>
	);
}

export function FlattenedErrorValue() {
	const content = <span>{throwingGetter.current}</span>;
	const flattened = Children.toArray(content);
	return (
		<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>
			{flattened}
		</ErrorBoundary>
	);
}

export function ClonedErrorValue() {
	const content = <span>{throwingGetter.current}</span>;
	const cloned = cloneElement(content as ElementDescriptor, {});
	return (
		<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>{cloned}</ErrorBoundary>
	);
}

export function DirectSuspense(props: { promise: Promise<string> }) {
	return (
		<Suspense fallback={<i data-fallback="pending">pending</i>}>
			<span data-resolved="direct">{use(props.promise)}</span>
		</Suspense>
	);
}

export function VariableSuspense(props: { promise: Promise<string> }) {
	const content = (
		<Suspense fallback={<i data-fallback="pending">pending</i>}>
			<span data-resolved="variable">{use(props.promise)}</span>
		</Suspense>
	);
	return <section data-outlet="suspense">{content}</section>;
}

export function WrappedSuspenseValue(props: { promise: Promise<string> }) {
	const content = (
		<WrappedSuspense>
			<span data-resolved="wrapped">{use(props.promise)}</span>
		</WrappedSuspense>
	);
	return <section data-outlet="suspense">{content}</section>;
}

export function GetterSuspenseValue(props: { promise: Promise<string> }) {
	const suspendedValue = {
		get current() {
			return use(props.promise);
		},
	};
	const content = (
		<WrappedSuspense>
			<span data-resolved="getter">{suspendedValue.current}</span>
		</WrappedSuspense>
	);
	return <section data-outlet="suspense">{content}</section>;
}

export function FragmentSuspense(props: { promise: Promise<string> }) {
	const content = <>{use(props.promise)}</>;
	return (
		<Suspense fallback={<i data-fallback="pending">pending</i>}>
			<span data-resolved="fragment">{content}</span>
		</Suspense>
	);
}

export function RootGetterSuspense(props: { promise: Promise<string> }) {
	const suspendedValue = {
		get current() {
			return use(props.promise);
		},
	};
	const content = (
		<span data-resolved="root-attribute" data-value={suspendedValue.current}>
			{'resolved'}
		</span>
	);
	return <Suspense fallback={<i data-fallback="pending">pending</i>}>{content}</Suspense>;
}

export function MappedSuspense(props: { promise: Promise<string> }) {
	const content = <span data-resolved="mapped">{use(props.promise)}</span>;
	const mapped = Children.map(content, (child) => child);
	return <Suspense fallback={<i data-fallback="pending">pending</i>}>{mapped}</Suspense>;
}

export function FlattenedSuspense(props: { promise: Promise<string> }) {
	const content = <span data-resolved="flattened">{use(props.promise)}</span>;
	const flattened = Children.toArray(content);
	return <Suspense fallback={<i data-fallback="pending">pending</i>}>{flattened}</Suspense>;
}

export function ClonedSuspense(props: { promise: Promise<string> }) {
	const content = <span data-resolved="cloned">{use(props.promise)}</span>;
	const cloned = cloneElement(content as ElementDescriptor, {});
	return <Suspense fallback={<i data-fallback="pending">pending</i>}>{cloned}</Suspense>;
}

function InspectChild(props: { child: OctaneNode }) {
	const child = Children.only(props.child) as ElementDescriptor;
	const cloned = cloneElement(child, { 'data-inspected': 'yes' });
	return (
		<section
			data-valid={String(isValidElement(child))}
			data-element-type={String(child.type)}
			data-child-type={typeof child.props.children}
		>
			{cloned}
		</section>
	);
}

function InspectIndexedChildren(props: { children: OctaneNode }) {
	const children = Children.toArray(props.children);
	const indexed = children[1];
	return (
		<section
			data-fragment-count={String(children.length)}
			data-fragment-type={isValidElement(indexed) ? String(indexed.type) : 'missing'}
		>
			{indexed}
		</section>
	);
}

function collectionLabel() {
	return 'inspected';
}

export function IndexedFragmentChildren(props: { name: string }) {
	return (
		<InspectIndexedChildren
			children={
				<>
					Hello <strong data-indexed="yes">{props.name}</strong>
				</>
			}
		/>
	);
}

export function OrdinaryElementValue() {
	const content = <span data-ordinary="yes">ordinary</span>;
	return <InspectChild child={content} />;
}

export function InspectableExpressionValue() {
	const content = <span data-ordinary="expression">{collectionLabel()}</span>;
	return <InspectChild child={content} />;
}

export function DirectCreateElementValue() {
	const content = createElement('span', { 'data-ordinary': 'create-element' }, 'direct');
	return <InspectChild child={content} />;
}
