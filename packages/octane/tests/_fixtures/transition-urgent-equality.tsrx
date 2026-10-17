import { use, useLayoutEffect, useReducer, useState, useTransition } from 'octane';

export type ValueAction = number | ((previous: number) => number);
export interface EqualityControls {
	transition: (value: number) => void;
	asyncTransition: (value: ValueAction, wait: Promise<void>) => void;
	read: () => number;
	urgent: (action: ValueAction) => void;
}

function HeldValue(props: { value: number; wait: Promise<void> }) @{
	if (props.value === 2) use(props.wait);
	<span>{String(props.value)}</span>
}

export function TransitionUrgentEquality(props: {
	reducer: boolean;
	boundary: boolean;
	wait: Promise<void>;
	bind: (controls: EqualityControls) => void;
}) @{
	const [value, update, read] = props.reducer
		? useReducer(
				(previous: number, action: ValueAction) =>
					typeof action === 'function' ? action(previous) : action,
				1,
			)
		: useState(1);
	const [pending, start] = useTransition();
	props.bind({
		transition: (next) => start(() => update(next)),
		asyncTransition: (next, wait) =>
			start(async () => {
				update(next);
				await wait;
			}),
		read,
		urgent: update,
	});
	<section>
		<b>{String(pending)}</b>
		@if (props.boundary) {
			@try {
				<HeldValue value={value} wait={props.wait} />
			} @pending {
				<p>loading</p>
			}
		} @else {
			<HeldValue value={value} wait={props.wait} />
		}
	</section>
}

export interface RebaseControls {
	transition: () => void;
	urgent: () => void;
	count: () => void;
}

function HeldText(props: { text: string; wait: Promise<void> }) @{
	if (props.text.includes('A')) use(props.wait);
	<span>{props.text}</span>
}

// One cell takes a transition update that suspends and an urgent update after
// it; a second cell takes only urgent updates. Each commit logs what it showed.
export function TransitionRebaseOrder(props: {
	reducer: boolean;
	boundary: boolean;
	wait: Promise<void>;
	bind: (controls: RebaseControls) => void;
	log: (entry: string) => void;
}) @{
	const [text, update] = props.reducer
		? useReducer((previous: string, letter: string) => previous + letter, '')
		: useState('');
	const [count, setCount] = useState(0);
	const [pending, start] = useTransition();
	const dispatch = update as (action: string | ((previous: string) => string)) => void;
	const append = (letter: string) =>
		dispatch(props.reducer ? letter : (previous: string) => previous + letter);
	props.bind({
		transition: () => start(() => append('A')),
		urgent: () => append('b'),
		count: () => setCount((previous) => previous + 1),
	});
	useLayoutEffect(() => {
		props.log(text + '|' + count + '|' + pending);
	}, null);
	<section>
		<b>{String(pending)}</b>
		<i>{String(count)}</i>
		@if (props.boundary) {
			@try {
				<HeldText text={text} wait={props.wait} />
			} @pending {
				<p>loading</p>
			}
		} @else {
			<HeldText text={text} wait={props.wait} />
		}
	</section>
}
