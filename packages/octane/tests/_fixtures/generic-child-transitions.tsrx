import { createElement, use, useSyncExternalStore, useTransition, type OctaneNode } from 'octane';

export interface GenericChildSnapshot {
	value: OctaneNode;
	request: Promise<string>;
}

export interface GenericChildStore {
	get: () => GenericChildSnapshot;
	subscribe: (listener: () => void) => () => void;
}

function PendingProbe() @{
	const [pending] = useTransition();
	<output id="pending">
		{pending ? 'pending' : 'idle'}
	</output>
}

function OnlyChild(props: { value: OctaneNode }) @{
	<main id="only-child">{props.value}</main>
}

function DescriptorChild(props: { value: OctaneNode }) {
	return createElement('p', { id: 'descriptor-child' }, props.value);
}

function AnchoredChild(props: { value: OctaneNode }) @{
	<section id="anchored-child">
		<span>{'before:'}</span>
		{props.value}
		<input id="retained-input" defaultValue="initial" />
		<span>{':after'}</span>
	</section>
}

function ReadyValue(props: { request: Promise<string> }) @{
	const value = use(props.request);
	<output id="ready">{value as string}</output>
}

function Contents(props: { snapshot: GenericChildSnapshot }) @{
	<div>
		<OnlyChild value={props.snapshot.value} />
		<DescriptorChild value={props.snapshot.value} />
		<AnchoredChild value={props.snapshot.value} />
		<ReadyValue request={props.snapshot.request} />
	</div>
}

export function GenericChildTransition(props: { store: GenericChildStore }) @{
	const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get);
	<div>
		<PendingProbe />
		@try {
			<Contents snapshot={snapshot} />
		} @pending {
			<output id="fallback">{'loading'}</output>
		}
	</div>
}
