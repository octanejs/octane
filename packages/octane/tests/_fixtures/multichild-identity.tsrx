import { useState } from 'octane';

// A keyed list driven entirely by props, each row tagged with `data-k` so the
// identity harness can map node identity by key. Re-render via `update(...)`
// to drive reorders/inserts/removes.
export function IdentityList(props) @{
	<ul>
		@for (const item of props.items; key item.id) {
			<li data-k={String(item.id) as string}>{item.label as string}</li>
		}
	</ul>
}

// Same list, but mutated via an exposed setter so a single mounted tree can be
// driven through a multi-step sequence (e.g. remove-then-readd) without a
// remount of the root.
export function StatefulIdentityList(props) @{
	const [items, setItems] = useState(props.initial);
	props.expose?.(setItems);
	<ul>
		@for (const item of items; key item.id) {
			<li data-k={String(item.id) as string}>{item.label as string}</li>
		}
	</ul>
}
