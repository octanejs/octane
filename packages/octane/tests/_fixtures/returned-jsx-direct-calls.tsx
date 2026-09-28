/** @jsxImportSource octane */

import { createContext, use, type OctaneNode } from 'octane';

const ValueContext = createContext('outer');
const setupCalls: string[] = [];

export function takeSetupCalls(): string[] {
	return setupCalls.splice(0);
}

function ContextLabel(props: { value: string }) {
	return <strong data-returned="component">{props.value}</strong>;
}

export function HostValue() {
	return (
		<span data-returned="host" data-value={use(ValueContext)}>
			{use(ValueContext)}
		</span>
	);
}

function LocalValue() {
	return <span data-returned="local">{use(ValueContext)}</span>;
}

export function callLocalValue() {
	return LocalValue();
}

export default function DefaultValue() {
	return <span data-returned="default">{use(ValueContext)}</span>;
}

export function FragmentValue() {
	return (
		<>
			<span data-returned="fragment">{use(ValueContext)}</span>
		</>
	);
}

export function MappedValue() {
	return (
		<ul>
			{['row'].map((key) => (
				<li key={key} data-returned="mapped" data-value={use(ValueContext)}>
					{use(ValueContext)}
				</li>
			))}
		</ul>
	);
}

export function ComponentValue() {
	return <ContextLabel value={use(ValueContext)} />;
}

export function TitledValue() {
	return (
		<article data-returned="titled">
			<title>Returned value</title>
			<span>{use(ValueContext)}</span>
		</article>
	);
}

export function RowValue(label: string, index: number) {
	return (
		<li data-returned="row" data-index={index}>
			{label + ':' + use(ValueContext)}
		</li>
	);
}

export function BlockScopedValue(flag: boolean) {
	if (flag) {
		var label: string | undefined = 'block';
	}
	return (
		<span data-returned="block" data-label={label}>
			{use(ValueContext)}
		</span>
	);
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
	return (
		<span data-returned="reassigned" data-count={count}>
			{use(ValueContext)}
		</span>
	);
}

export function SetupValue() {
	setupCalls.push('setup');
	const built = use(ValueContext);
	return (
		<span data-returned="setup" data-built={built}>
			{use(ValueContext)}
		</span>
	);
}

export function ProvidedValue(props: { build: () => OctaneNode }) {
	const value = props.build();
	return (
		<ValueContext value="inner">
			<section data-outlet="provided">{value}</section>
		</ValueContext>
	);
}

export function ComponentProvidedValue() {
	return (
		<ValueContext value="inner">
			<section data-outlet="component">
				<HostValue />
			</section>
		</ValueContext>
	);
}

export function SharedValueProviders(props: { value: OctaneNode; first: string; second: string }) {
	return (
		<section data-outlet="shared">
			<ValueContext value={props.first}>{props.value}</ValueContext>
			<ValueContext value={props.second}>{props.value}</ValueContext>
		</section>
	);
}
