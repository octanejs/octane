import { useSignal$ } from 'octane/signals/client';

type Observe = { readonly observe: (entry: string) => void };
type Toggle = Observe & { readonly show: boolean };

// Issue #1472: the form owns a local signal and writes it from onBlur.
export function SignalForm({ observe }: Observe) @{
	const count$ = useSignal$(0);
	<form
		onBlur={() => {
			observe('blur');
			count$.set(1);
			observe('write');
		}}
	>
		<input />
		<output>{count$.get() as number}</output>
	</form>
}

export function PlainForm({ observe }: Observe) @{
	<form onBlur={() => observe('blur')}>
		<input />
	</form>
}

function SignalChild({ observe }: Observe) @{
	const count$ = useSignal$(0);
	<div
		onBlur={() => {
			observe('child');
			count$.set(1);
		}}
	>
		<input />
	</div>
}

// The arm disposes the child component that owns the focused input.
export function ChildArm({ observe, show }: Toggle) @{
	<section onBlur={() => observe('parent')}>
		@if (show) {
			<SignalChild observe={observe} />
		}
	</section>
}

// The arm's host belongs to the arm, while its handler writes the live
// component's signal.
export function HostArm({ observe, show }: Toggle) @{
	const count$ = useSignal$(0);
	<section onBlur={() => observe('parent')}>
		@if (show) {
			<div
				onBlur={() => {
					observe('arm');
					count$.set(1);
				}}
			>
				<input />
			</div>
		}
	</section>
}

// A bare-function row handler is republished whenever the list updates.
export function Rows({ observe, rows, onRowBlur }: Observe & {
	readonly rows: readonly number[];
	readonly onRowBlur: () => void;
}) @{
	<section onBlur={() => observe('parent')}>
		@for (const row of rows; key row) {
			<div onBlur={onRowBlur}>
				<input data-row={row} />
			</div>
		}
	</section>
}

export function Captured({ observe, remove }: Observe & { readonly remove: () => void }) @{
	<section onClick={() => observe('section')}>
		<button onClick={remove}>{'remove'}</button>
	</section>
}
