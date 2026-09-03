import { use, useTransition, useSyncExternalStore, useEffect } from 'octane';

interface StoreProps {
	store: { get: () => number; subscribe: (listener: () => void) => () => void };
	promiseFor: (value: number) => PromiseLike<number>;
}
interface BoundStoreProps extends StoreProps {
	bindStart: (start: (fn: () => void) => void) => void;
}
interface EffectProps extends BoundStoreProps {
	log: (message: string) => void;
}

function PendingProbe() @{
	const [isPending] = useTransition();
	<span id="pending">
		{isPending ? 'pending' : 'idle'}
	</span>
}

function InnerChild(props: BoundStoreProps) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.get);
	const [, start] = useTransition();
	props.bindStart(start);
	const v = use(props.promiseFor(value));
	<span id="inner-content">{'inner-' + v as string}</span>
}

export function NestedHeldBoundary(props: BoundStoreProps) @{
	<div>
		<PendingProbe />
		@try {
			<div id="outer-content">
				<span>outer</span>
				@try {
					<InnerChild
						promiseFor={props.promiseFor}
						store={props.store}
						bindStart={props.bindStart}
					/>
				} @pending {
					<span id="inner-fallback">{'inner-fallback'}</span>
				}
			</div>
		} @pending {
			<span id="outer-fallback">{'outer-fallback'}</span>
		}
	</div>
}

function ThrowableChild(props: BoundStoreProps) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.get);
	const [, start] = useTransition();
	props.bindStart(start);
	if (value < 0) {
		throw new Error('boom-' + -value as string);
	}
	const v = use(props.promiseFor(value));
	<span id="content">{'content-' + v as string}</span>
}

export function ErrorWhileHeld(props: BoundStoreProps) @{
	<div>
		<PendingProbe />
		@try {
			<ThrowableChild
				promiseFor={props.promiseFor}
				store={props.store}
				bindStart={props.bindStart}
			/>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		} @catch (e) {
			<span id="error">{'error:' + (e.message) as string}</span>
		}
	</div>
}

export function RapidTransitions(props: StoreProps) @{
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

function EffectChild(props: EffectProps) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.get);
	const [, start] = useTransition();
	props.bindStart(start);
	const v = use(props.promiseFor(value));
	useEffect(() => {
		props.log('mount-' + v);
		return () => props.log('cleanup-' + v);
	}, [v]);
	<span id="content">{'content-' + v as string}</span>
}

export function EffectOrdering(props: EffectProps) @{
	<div>
		<PendingProbe />
		@try {
			<EffectChild
				promiseFor={props.promiseFor}
				store={props.store}
				bindStart={props.bindStart}
				log={props.log}
			/>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}
