import { use } from 'octane';

// A replaced sibling stands before a branch arm that suspended before it
// inserted anything, inside a Suspense primary (#1698). The arm owns no DOM
// while it is pending, so superseding it must leave the sibling's content alone.

export interface SupersededArmProps {
	selection: string;
	wait?: PromiseLike<unknown>;
	second?: PromiseLike<unknown>;
}

function SelectionChild(props: { selection: string }) @{
	<span>{props.selection as string}</span>
}

function WaitFor(props: { wait: PromiseLike<unknown>; label: string }) @{
	use(props.wait);
	<i>{props.label as string}</i>
}

export function KeyedComponentSibling(props: SupersededArmProps) @{
	<main>
		<b>{props.selection as string}</b>
		@try {
			<>
				<SelectionChild key={props.selection} selection={props.selection} />
				@if (props.wait) {
					<WaitFor wait={props.wait} label="ready" />
				}
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</main>
}

export function KeyedForSibling(props: SupersededArmProps) @{
	<main>
		<b>{props.selection as string}</b>
		@try {
			<>
				@for (const selection of [props.selection]; key selection) {
					<span>{selection as string}</span>
				}
				@if (props.wait) {
					<WaitFor wait={props.wait} label="ready" />
				}
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</main>
}

export function BranchSibling(props: SupersededArmProps) @{
	<main>
		<b>{props.selection as string}</b>
		@try {
			<>
				@if (props.selection === 'A') {
					<span>{'A'}</span>
				} @else {
					<span>{props.selection as string}</span>
				}
				@switch (props.wait === undefined) {
					@case false: {
						<WaitFor wait={props.wait!} label="ready" />
					}
				}
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</main>
}

// The arm's retry inserts its first root, then suspends on its second.
export function PartialRetryArm(props: SupersededArmProps) @{
	<main>
		<b>{props.selection as string}</b>
		@try {
			<>
				<SelectionChild key={props.selection} selection={props.selection} />
				@if (props.wait) {
					<>
						<WaitFor wait={props.wait} label="first" />
						<WaitFor wait={props.second!} label="second" />
					</>
				}
			</>
		} @pending {
			<p>{'pending'}</p>
		}
	</main>
}

function RootGate(props: { gate?: PromiseLike<unknown> }) @{
	if (props.gate) use(props.gate);
	<u>{'gate'}</u>
}

// A root update that supersedes the arm and then suspends outside the boundary
// rolls back to the pending screen.
export function RootGatedSibling(props: SupersededArmProps & { gate?: PromiseLike<unknown> }) @{
	<main>
		<b>{props.selection as string}</b>
		@try {
			<>
				<SelectionChild key={props.selection} selection={props.selection} />
				@if (props.wait) {
					<WaitFor wait={props.wait} label="ready" />
				}
				@if (props.second) {
					<WaitFor wait={props.second} label="second" />
				}
			</>
		} @pending {
			<p>{'pending'}</p>
		}
		<RootGate gate={props.gate} />
	</main>
}
