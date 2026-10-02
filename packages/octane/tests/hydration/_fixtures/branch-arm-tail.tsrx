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
// the router binding once rendered its server-only scroll restoration script with.
export function EmptyArm(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<Leaf v="x" />
		} @else {
			<></>
		}
	</div>
}

// An arm with no body: the client renders nothing in the slot.
export function NoElseArm(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<Leaf v="x" />
		}
	</div>
}

export function EmptyArmThenChild(props: { on: boolean; Child: ComponentBody }) @{
	const Child = props.Child;
	<div id="r">
		@if (props.on) {
			<Leaf v="x" />
		} @else {
			<></>
		}
		<Child />
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

function Boom(props: { boom: boolean }) @{
	if (props.boom) throw new Error('client throws');
	<u>{'ok' as string}</u>
}

// The arm ends with a boundary whose body throws on the client, so the client
// builds the catch arm where the server rendered the body.
export function CaughtLast(props: { on: boolean; boom: boolean }) @{
	<div id="r">
		@if (props.on) {
			<>
				<Leaf v="x" />
				@try {
					<Boom boom={props.boom} />
				} @catch (e) {
					<p>{'caught' as string}</p>
				}
			</>
		} @else {
			<>
				<Leaf v="x" />
				@try {
					<Boom boom={props.boom} />
				} @catch (e) {
					<p>{'caught' as string}</p>
				}
				<Leaf v="z" />
			</>
		}
	</div>
}

// The client's arm is one element, which adopts the first of the server's.
export function IfHosts(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<em>{'x' as string}</em>
		} @else {
			<>
				<em>{'x' as string}</em>
				<b>{'z' as string}</b>
			</>
		}
	</div>
}

// The two cases share their first elements, so the server's last one is the
// only difference.
export function SwitchHosts(props: { k: string }) @{
	<div id="r">
		@switch (props.k) {
			@case 'one': {
				<>
					<em>{'x' as string}</em>
					<b>{'z' as string}</b>
				</>
			}
			@default: {
				<>
					<em>{'x' as string}</em>
					<b>{'z' as string}</b>
					<i>{'i' as string}</i>
				</>
			}
		}
	</div>
}

// The server's arm ends with static text after the element both arms share.
export function IfTextTail(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<em>{'x' as string}</em>
		} @else {
			<>
				<em>{'x' as string}</em>
				tail
			</>
		}
	</div>
}

// The client's root holds a component, whose range moves the cursor inside it.
export function IfNestedRoot(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<p>
				<Leaf v="x" />
			</p>
		} @else {
			<>
				<p>
					<Leaf v="x" />
				</p>
				<b>{'z' as string}</b>
			</>
		}
	</div>
}

// The client's arm ends with an element after a component range, and the
// server's arm has another component after it.
export function IfRangeAfterHost(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<>
				<Leaf v="x" />
				<b>{'b' as string}</b>
			</>
		} @else {
			<>
				<Leaf v="x" />
				<b>{'b' as string}</b>
				<Leaf v="z" />
			</>
		}
	</div>
}

// The client's arm is a component that borrows the arm's range, so its
// template adopts the first of the server's elements.
export function IfInheritedHost(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<Leaf v="x" />
		} @else {
			<>
				<em>{'x' as string}</em>
				<b>{'z' as string}</b>
			</>
		}
	</div>
}

// The arm's second component finds no server range, so it adopts the element
// there in place, and the server's arm has another element after it.
export function IfLaterHost(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<>
				<Leaf v="x" />
				<Leaf v="y" />
			</>
		} @else {
			<>
				<Leaf v="x" />
				<em>{'y' as string}</em>
				<b>{'z' as string}</b>
			</>
		}
	</div>
}

// A component in a hole of the arm's own template finds no server range and
// adopts the element there in place. The template already recorded where the
// arm ends, after its last root.
export function HoleWithoutRange(props: { on: boolean }) @{
	<div id="r">
		@if (props.on) {
			<>
				<Leaf v="x" />
				<b>{'b' as string}</b>
			</>
		} @else {
			<>
				<em>{'x' as string}</em>
				<b>{'b' as string}</b>
			</>
		}
	</div>
}

// A branch inside the arm's template, at its start and inside an element,
// records where its own template ends without disturbing the arm's.
export function NestedArms(props: { on: boolean; inner: boolean }) @{
	<div id="r">
		@if (props.on) {
			<>
				@if (props.inner) {
					<em>{'x' as string}</em>
				}
				<p>
					@if (props.inner) {
						<i>{'i' as string}</i>
					}
				</p>
				<b>{'b' as string}</b>
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
