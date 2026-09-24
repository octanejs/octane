import { Hydrate, useLayoutEffect } from 'octane';
import type { HydrateWhen } from 'octane/hydration';
import { signal$ } from 'octane/signals';

export const route$ = signal$('home');

type Accepted = (name: string, presented: string, live: string) => void;
type Props = { first: HydrateWhen; second: HydrateWhen; accepted?: Accepted };

function Region(props: { name: string; accepted?: Accepted }) @{
	const value = route$.get();
	useLayoutEffect(() => props.accepted?.(props.name, value, route$.get()), [value, props.accepted]);
	<output data-region={props.name}>{value as string}</output>
}

export function DocumentView({ first, second, accepted }: Props) @{
	<main>
		<Region name="eager" accepted={accepted} />
		<Hydrate when={first} split={false}>
			<Region name="first" accepted={accepted} />
		</Hydrate>
		<Hydrate when={second} split={false}>
			<Region name="second" accepted={accepted} />
		</Hydrate>
	</main>
}
