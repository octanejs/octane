// SSR Phase 6 (M2) — @for hydration. The server wraps the whole @for in a
// `<!--[-->…<!--]-->` range. Each proven direct-host item self-delimits via its
// <li>, so the server emits no per-item pairs; the client adopts those roots as
// keyed boundaries instead of cloning fresh or creating markers.

export function List(props) @{
	<ul id="list">
		@for (const item of props.items; key item.id) {
			<li class="row">
				<span class="name">
					{item.name as string}
				</span>
				<button class="pick" onClick={() => props.onPick(item.id)}>{'pick'}</button>
			</li>
		}
	</ul>
}
