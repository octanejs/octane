import { createPortal, useLayoutEffect, useState } from 'octane';
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

type Restoring = Toggle & { readonly restore: HTMLElement };

// A child component, with a Block of its own, owns the focused input.
function Field({ observe, onCommit }: Observe & { readonly onCommit: () => void }) @{
	const [draft] = useState('draft');
	<input
		data-draft={draft}
		onBlur={() => {
			observe('field');
			onCommit();
		}}
	/>
}

// A dialog restores focus in its own layout cleanup, before its deletion
// reaches the Field child.
function Dialog({ observe, restore }: Observe & { readonly restore: HTMLElement }) @{
	const value$ = useSignal$(0);
	useLayoutEffect(() => () => restore.focus(), []);
	<form>
		<Field observe={observe} onCommit={() => value$.set(1)} />
		<output>{value$.get() as number}</output>
	</form>
}

export function DialogArm({ observe, show, restore }: Restoring) @{
	<section onBlur={() => observe('parent')}>
		@if (show) {
			<Dialog observe={observe} restore={restore} />
		}
	</section>
}

// A top-level portal: its DOM lies outside the range the arm's deletion removes.
function PortaledDialog({ observe, restore, target }: Observe & {
	readonly restore: HTMLElement;
	readonly target: HTMLElement;
}) {
	return createPortal(<Dialog observe={observe} restore={restore} />, target);
}

export function PortalDialogArm({ observe, show, restore, target }: Restoring & {
	readonly target: HTMLElement;
}) @{
	<section onBlur={() => observe('parent')}>
		@if (show) {
			<PortaledDialog observe={observe} restore={restore} target={target} />
		}
	</section>
}

function Restore({ restore }: { readonly restore: HTMLElement }) @{
	useLayoutEffect(() => () => restore.focus(), []);
	<i />
}

// A value hole's input has a Block below its row; an earlier row component
// restores focus as the row is deleted.
export function EditableRows({ observe, restore, rows }: Observe & {
	readonly restore: HTMLElement;
	readonly rows: readonly number[];
}) @{
	<section onBlur={() => observe('parent')}>
		@for (const row of rows; key row) {
			<div>
				<Restore restore={restore} />
				{row === 1 ? <input onBlur={() => observe('row')} /> : null}
			</div>
		}
	</section>
}
