import { Hydrate, type ComponentBody } from 'octane';
import type { HydrationStrategy } from 'octane/hydration';

function Leaf(props: { v: string }) @{
	<em>{props.v}</em>
}

// The server's else arm renders two components where the client's then arm
// renders one, which adopts the first of them.
export function IfComponents(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<Leaf v="x" />
		} @else {
			<>
				<Leaf v="y" />
				<Leaf v="z" />
			</>
		}
	</div>
}

// The two cases share their first component, so the server's extra one is the
// only difference.
export function SwitchComponents(props: { k: string }) @{
	<div id="r">
		@switch (props.k) {
			@case 'one': {
				<Leaf v="x" />
			}
			@default: {
				<>
					<Leaf v="x" />
					<Leaf v="z" />
				</>
			}
		}
	</div>
}

// The client's empty arm claims nothing of the server's other arm, the shape
// the router binding renders its server-only scroll restoration script with.
export function EmptyArm(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<Leaf v="x" />
		} @else {
			<></>
		}
	</div>
}

// The arm ends with elements after its component, which the arm adopts.
export function TrailingHosts(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<>
				<Leaf v="x" />
				<b>{'b' as string}</b>
				<i>{'i' as string}</i>
			</>
		}
	</div>
}

export function Tail() @{
	<u>{'tail' as string}</u>
}

// The arm ends with a boundary whose child is still loading on the client.
export function TrailingTry(props: { on: boolean; Child: ComponentBody }) @{
	const Child = props.Child;
	<div id="r">
		@if (props.on) {
			<>
				<Leaf v="x" />
				@try {
					<Child />
				} @pending {
					<p>{'loading' as string}</p>
				}
			</>
		}
	</div>
}

// A pending child after the branch holds the first attempt, which then replays.
export function IfThenChild(props: { on: boolean; Child: ComponentBody }) @{
	const Child = props.Child;
	<div id="r">
		@if (props.on) {
			<Leaf v="x" />
		} @else {
			<>
				<Leaf v="x" />
				<Leaf v="z" />
			</>
		}
		<Child />
	</div>
}

// Inside a boundary, the suspended attempt leaves what it built for the next one.
export function TryIfThenChild(props: { on: boolean; Child: ComponentBody }) @{
	const Child = props.Child;
	<div id="r">
		@try {
			<section>
				@if (props.on) {
					<Leaf v="x" />
				} @else {
					<>
						<Leaf v="x" />
						<Leaf v="z" />
					</>
				}
				<Child />
			</section>
		} @pending {
			<p>{'loading' as string}</p>
		}
	</div>
}

export function DormantIf(props: { on: boolean; when: HydrationStrategy }) @{
	<div id="r">
		<Hydrate when={props.when} split={false}>
			<section>
				@if (props.on) {
					<Leaf v="x" />
				} @else {
					<>
						<Leaf v="x" />
						<Leaf v="z" />
					</>
				}
			</section>
		</Hydrate>
	</div>
}
