import {
	createElement,
	use,
	useState,
	useSyncExternalStore,
	useTransition,
	type OctaneNode,
} from 'octane';

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
	<output id="pending">{pending ? 'pending' : 'idle'}</output>
}

function OnlyChild(props: { value: OctaneNode; wide: boolean }) @{
	@if (props.wide) {
		<main
			id="only-child"
			data-a0={String(props.value)}
			data-a1={String(props.value)}
			data-a2={String(props.value)}
			data-a3={String(props.value)}
			data-a4={String(props.value)}
			data-a5={String(props.value)}
			data-a6={String(props.value)}
			data-a7={String(props.value)}
			data-a8={String(props.value)}
			data-a9={String(props.value)}
			data-a10={String(props.value)}
			data-a11={String(props.value)}
			data-a12={String(props.value)}
			data-a13={String(props.value)}
			data-a14={String(props.value)}
			data-a15={String(props.value)}
			data-a16={String(props.value)}
		>
			{props.value}
		</main>
	} @else {
		<main id="only-child">{props.value}</main>
	}
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

function Contents(props: { snapshot: GenericChildSnapshot; wide: boolean }) @{
	<div>
		<OnlyChild value={props.snapshot.value} wide={props.wide} />
		<DescriptorChild value={props.snapshot.value} />
		<AnchoredChild value={props.snapshot.value} />
		<ReadyValue request={props.snapshot.request} />
	</div>
}

export function GenericChildTransition(props: { store: GenericChildStore; wide: boolean }) @{
	const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get);
	<div>
		<PendingProbe />
		@try {
			<Contents snapshot={snapshot} wide={props.wide} />
		} @pending {
			<output id="fallback">{'loading'}</output>
		}
	</div>
}

export function GenericChildStateTransition(props: {
	initial: GenericChildSnapshot;
	wide: boolean;
	bind: (set: (snapshot: GenericChildSnapshot) => void) => void;
}) @{
	const [snapshot, setSnapshot] = useState(props.initial);
	const [pending, start] = useTransition();
	props.bind((next) => start(() => setSnapshot(next)));
	<div>
		<output id="pending">{pending ? 'pending' : 'idle'}</output>
		@try {
			<Contents snapshot={snapshot} wide={props.wide} />
		} @pending {
			<output id="fallback">loading</output>
		}
	</div>
}
