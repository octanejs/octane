/** @jsxImportSource octane */

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

function Slot(props: { content: OctaneNode }) {
	return <section data-outlet="slot">{props.content}</section>;
}

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

export function DirectContext() {
	return (
		<ValueContext.Provider value="inner">
			<span data-context="direct">{use(ValueContext)}</span>
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

function InspectChild(props: { children: OctaneNode }) {
	const child = Children.only(props.children) as ElementDescriptor;
	const cloned = cloneElement(child, { 'data-inspected': 'yes' });
	return <section data-valid={String(isValidElement(child))}>{cloned}</section>;
}

export function OrdinaryElementValue() {
	const content = <span data-ordinary="yes">ordinary</span>;
	return <InspectChild>{content}</InspectChild>;
}
