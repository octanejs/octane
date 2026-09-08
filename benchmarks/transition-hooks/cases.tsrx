import { use, useState, useTransition } from 'octane';

export type Observe = (component: string, value: number, pending: boolean) => void;
export type StateSetter = (next: number | ((previous: number) => number)) => void;
export type StartTransition = (fn: () => void | Promise<unknown>) => void;
export type PromiseFor = (value: number) => PromiseLike<number>;

// The runner composes `start(() => setValue(next))` itself, so the fixtures
// create no per-render closures of their own: every application creation event
// belongs to the compiled template or the Octane runtime.

export function TransitionCycle(props: {
	observe: Observe;
	bind: (setValue: StateSetter, start: StartTransition) => void;
}) @{
	const [value, setValue] = useState(0);
	const [isPending, start] = useTransition();
	props.bind(setValue, start);
	props.observe('cycle', value, isPending);
	<output>{value + ':' + (isPending ? 'pending' : 'idle')}</output>
}

function HeldValue(props: { value: number; promiseFor: PromiseFor }) @{
	const resolved = use(props.promiseFor(props.value));
	<span>{'value-' + resolved as string}</span>
}

export function HeldTransition(props: {
	observe: Observe;
	promiseFor: PromiseFor;
	bind: (setValue: StateSetter, start: StartTransition) => void;
}) @{
	const [value, setValue] = useState(0);
	const [isPending, start] = useTransition();
	props.bind(setValue, start);
	props.observe('held', value, isPending);
	<section>
		<b>
			{isPending ? 'pending' : 'idle'}
		</b>
		@try {
			<HeldValue value={value} promiseFor={props.promiseFor} />
		} @pending {
			<p>loading</p>
		}
	</section>
}

export function FunctionalDispatch(props: {
	observe: Observe;
	bind: (setValue: StateSetter) => void;
}) @{
	const [value, setValue] = useState(0);
	props.bind(setValue);
	props.observe('dispatch', value, false);
	<output>{String(value)}</output>
}

function QueuedChild(props: {
	count: number;
	observe: Observe;
	bind: (setValue: StateSetter, start: StartTransition) => void;
}) @{
	const [value, setValue] = useState(0);
	const [isPending, start] = useTransition();
	props.bind(setValue, start);
	props.observe('child', value, isPending);
	<span>{props.count + '/' + value + ':' + (isPending ? 'pending' : 'idle')}</span>
}

export function UrgentWhileQueued(props: {
	observe: Observe;
	bind: (setValue: StateSetter, start: StartTransition) => void;
	bindUrgent: (setCount: StateSetter) => void;
}) @{
	const [count, setCount] = useState(0);
	props.bindUrgent(setCount);
	props.observe('parent', count, false);
	<div>
		<output>{String(count)}</output>
		<QueuedChild count={count} observe={props.observe} bind={props.bind} />
	</div>
}

export function ClickDispatch(props: {
	observe: Observe;
	onClick: (event: MouseEvent) => void;
	bind: (setValue: StateSetter) => void;
}) @{
	const [value, setValue] = useState(0);
	props.bind(setValue);
	props.observe('click', value, false);
	<button onClick={props.onClick}>{String(value)}</button>
}
