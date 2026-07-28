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

function WrappedErrorBoundary(props: { children: OctaneNode }) @{
	<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>
		{props.children}
	</ErrorBoundary>
}

function WrappedSuspense(props: { children: OctaneNode }) @{
	<Suspense fallback={<i data-fallback="pending">pending</i>}>
		{props.children}
	</Suspense>
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
	const content = (
		<ValueContext.Provider value="inner">
			<span data-context="variable">{use(ValueContext) as string}</span>
		</ValueContext.Provider>
	);
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
	const content = (
		<ValueContext.Provider value="inner">
			<div data-outlet="directive">
				@if (props.visible) {
					<span data-context="directive">{use(ValueContext) as string}</span>
				} @else {
					<span data-context="directive">hidden</span>
				}
			</div>
		</ValueContext.Provider>
	);
	<section>{content}</section>
}

export function BuiltInErrorValue() @{
	const content = (
		<ErrorBoundary fallback={<strong data-fallback="inner">inner</strong>}>
			<span>{readFailure() as string}</span>
		</ErrorBoundary>
	);
	<ErrorBoundary fallback={<strong data-fallback="outer">outer</strong>}>
		{content}
	</ErrorBoundary>
}

export function WrappedErrorValue() @{
	const content = (
		<WrappedErrorBoundary>
			<span>{readFailure() as string}</span>
		</WrappedErrorBoundary>
	);
	<ErrorBoundary fallback={<strong data-fallback="outer">outer</strong>}>
		{content}
	</ErrorBoundary>
}

export function DirectSuspense(props: { promise: Promise<string> }) @{
	<Suspense fallback={<i data-fallback="pending">pending</i>}>
		<span data-resolved="direct">{use(props.promise) as string}</span>
	</Suspense>
}

export function VariableSuspense(props: { promise: Promise<string> }) @{
	const content = (
		<Suspense fallback={<i data-fallback="pending">pending</i>}>
			<span data-resolved="variable">{use(props.promise) as string}</span>
		</Suspense>
	);
	<section data-outlet="suspense">{content}</section>
}

export function WrappedSuspenseValue(props: { promise: Promise<string> }) @{
	const content = (
		<WrappedSuspense>
			<span data-resolved="wrapped">{use(props.promise) as string}</span>
		</WrappedSuspense>
	);
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
