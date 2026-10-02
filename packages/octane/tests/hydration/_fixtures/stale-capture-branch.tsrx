import { Hydrate, use } from 'octane';
import { condition, load } from 'octane/hydration';

function Em() @{
	<em>{'e'}</em>
}

// The server renders case 'a', which the client's case 'a' adopts before its
// `<u>` suspends. The case can then change while the boundary is still pending.
export function Ranged(props: { server?: boolean; k: string; leaf: Promise<string> }) @{
	<div>
		<Hydrate split={false} when={load()}>
			<section>
				@switch (props.k) {
					@case 'a': {
						<u>{(props.server ? 'z' : use(props.leaf)) as string}</u>
					}
					@case 'c': {
						<b>{'c'}</b>
					}
				}
				<Em />
			</section>
		</Hydrate>
	</div>
}

// A dormant boundary: changing its captures activates it early.
export function Dormant(props: { k: string }) @{
	<div>
		<Hydrate split={false} when={condition(false)}>
			<section>
				@switch (props.k) {
					@case 'a': {
						<u>{'z'}</u>
					}
					@case 'c': {
						<b>{'c'}</b>
					}
				}
				<Em />
			</section>
		</Hydrate>
	</div>
}
