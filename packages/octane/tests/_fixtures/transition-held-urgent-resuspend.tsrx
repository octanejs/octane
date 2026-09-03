import { use, useState, useTransition, useSyncExternalStore } from 'octane';

interface StoreProps {
	store: { get: () => number; subscribe: (listener: () => void) => () => void };
	promiseFor: (value: number) => PromiseLike<number>;
	bindStart: (start: (fn: () => void) => void) => void;
}

function PendingProbe() @{
	const [isPending] = useTransition();
	<span id="pending">
		{isPending ? 'pending' : 'idle'}
	</span>
}

function Child(props: StoreProps) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.get);
	const [, start] = useTransition();
	props.bindStart(start);
	const v = use(props.promiseFor(value));
	<span id="content">{'content-' + v as string}</span>
}

export function HeldUrgentResuspend(props: StoreProps) @{
	<div>
		<PendingProbe />
		@try {
			<Child promiseFor={props.promiseFor} store={props.store} bindStart={props.bindStart} />
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

interface HeldStateProps {
	promiseFor: (value: number) => PromiseLike<number>;
	bindSetters: (transition: (value: number) => void, urgent: (value: number) => void) => void;
}

function StateChild(props: HeldStateProps) @{
	const [value, setValue] = useState(1);
	const [, start] = useTransition();
	props.bindSetters((next) => start(() => setValue(next)), setValue);
	const resolved = use(props.promiseFor(value));
	<span id="content">{'content-' + resolved as string}</span>
}

export function HeldStateUrgentResuspend(props: HeldStateProps) @{
	<div>
		<PendingProbe />
		@try {
			<StateChild promiseFor={props.promiseFor} bindSetters={props.bindSetters} />
		} @pending {
			<span id="fallback">fallback</span>
		}
	</div>
}

export function HeldUrgentBodyResuspend(props: StoreProps) @{
	const [, start] = useTransition();
	props.bindStart(start);
	<div>
		<PendingProbe />
		@try {
			const value = useSyncExternalStore(props.store.subscribe, props.store.get);
			const v = use(props.promiseFor(value));
			<span id="content">{'content-' + v as string}</span>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

export function FreshUrgentSuspend(props: {
	promiseFor: (value: number) => PromiseLike<number>;
	value: number;
}) @{
	<div>
		@try {
			const v = use(props.promiseFor(props.value));
			<span id="content">{'content-' + v as string}</span>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
