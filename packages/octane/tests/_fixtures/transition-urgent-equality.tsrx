import { use, useReducer, useState, useTransition } from 'octane';

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
	const [value, update, read] =
		props.reducer
			? useReducer(
					(previous: number, action: ValueAction) => typeof action === 'function'
						? action(previous)
						: action,
					1,
				)
			: useState(1);
	const [pending, start] = useTransition();
	props.bind({
		transition: (next) => start(() => update(next)),
		asyncTransition: (next, wait) => start(async () => {
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
