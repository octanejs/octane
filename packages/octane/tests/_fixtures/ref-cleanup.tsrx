import { useState } from 'octane';

// React 19 callback-ref cleanup. CleanupRef's ref RETURNS a cleanup function;
// it must run on detach (with the captured node) instead of `ref(null)`.
// LegacyRef's ref returns nothing, so the legacy `ref(null)` contract holds.
// The @if branch toggles so we can detach/re-attach without unmounting the root.

export function CleanupRef(props) @{
	const [shown, setShown] = useState(true);
	<div>
		<button id="toggle" onClick={() => setShown(!shown)}>{'toggle'}</button>
		@if (shown) {
			<span
				id="target"
				ref={(el) => {
					props.onAttach(el);
					return () => props.onCleanup(el);
				}}
			>{'x'}</span>
		}
	</div>
}

// The SAME callback ref attached to every @for row (the `ref={registerItem}` list
// pattern). React 19 keeps one cleanup per ATTACH SITE, so removing one row must run
// THAT row's cleanup — attachRef keys cleanups per (ref, element) to match.
export function SharedRefList(props) @{
	const [items, setItems] = useState([{ id: 1 }, { id: 2 }]);
	<div>
		<button id="remove-first" onClick={() => setItems(items.slice(1))}>{'rm'}</button>
		<ul>
			@for (const item of items; key item.id) {
				<li ref={props.register}>{'item-' + item.id}</li>
			}
		</ul>
	</div>
}

export function LegacyRef(props) @{
	const [shown, setShown] = useState(true);
	<div>
		<button id="toggle" onClick={() => setShown(!shown)}>{'toggle'}</button>
		@if (shown) {
			<span
				id="target"
				ref={(el) => {
					props.observe(el);
				}}
			>{'x'}</span>
		}
	</div>
}
