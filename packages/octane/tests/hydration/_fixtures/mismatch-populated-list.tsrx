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
