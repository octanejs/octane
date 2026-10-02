import type { ComponentBody } from 'octane';

function label(): string {
	return 'ok';
}

export function ListLabel(props: { items: string[] }) @{
	<div>
		<i>
			@for (const x of props.items; key x) {
				<s>{x as string}</s>
			}
			{label() as string}
		</i>
	</div>
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
export function ListThenChild(props: { items: string[]; Child: ComponentBody }) @{
	const Child = props.Child;
	<div>
		<i>
			@for (const x of props.items; key x) {
				<s>{x as string}</s>
			}
			{label() as string}
		</i>
		<Child />
	</div>
}
