import { Hydrate, type ComponentBody } from 'octane';
import type { HydrationStrategy } from 'octane/hydration';

function label(): string {
	return 'ok';
}

export function EmptyArmLabel(props: { items: string[] }) @{
	<div>
		<i>
			@for (const x of props.items; key x) {
				<s>{x as string}</s>
			} @empty {
				<b>{'none' as string}</b>
			}
			{label() as string}
		</i>
	</div>
}

export function Tail() @{
	<u>{'tail' as string}</u>
}

// A pending child after the list holds the first attempt, which then replays.
export function EmptyArmThenChild(props: { items: string[]; Child: ComponentBody }) @{
	const Child = props.Child;
	<div>
		<i>
			@for (const x of props.items; key x) {
				<s>{x as string}</s>
			} @empty {
				<b>{'none' as string}</b>
			}
			{label() as string}
		</i>
		<Child />
	</div>
}

// Inside a boundary, the suspended attempt leaves what it built for the next one.
export function TryEmptyArmThenChild(props: { items: string[]; Child: ComponentBody }) @{
	const Child = props.Child;
	<div>
		@try {
			<section>
				<i>
					@for (const x of props.items; key x) {
						<s>{x as string}</s>
					} @empty {
						<b>{'none' as string}</b>
					}
					{label() as string}
				</i>
				<Child />
			</section>
		} @pending {
			<p>{'loading' as string}</p>
		}
	</div>
}

export function DormantEmptyArm(props: { items: string[]; when: HydrationStrategy }) @{
	<div>
		<Hydrate when={props.when} split={false}>
			<i>
				@for (const x of props.items; key x) {
					<s>{x as string}</s>
				} @empty {
					<b>{'none' as string}</b>
				}
				{label() as string}
			</i>
		</Hydrate>
	</div>
}

// The server rendered more items than the client renders.
export function FewerItems(props: { items: string[] }) @{
	<div>
		<i>
			@for (const x of props.items; key x) {
				<s>{x as string}</s>
			}
			{label() as string}
		</i>
	</div>
}

function Item(props: { x: string }) @{
	<s>{props.x as string}</s>
}

// The same, from an array of keyed elements.
export function FewerChildren(props: { items: string[] }) {
	const children = props.items.map((x) => <Item key={x} x={x} />);
	return (
		<div>
			<i>
				{children}
				{label() as string}
			</i>
		</div>
	);
}
