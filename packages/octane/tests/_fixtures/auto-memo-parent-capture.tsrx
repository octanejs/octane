import { useState } from 'octane';

function Cell(props) @{
	<span class="cell">
		{props.text as string}
	</span>
}

// The keyed item body closes over PARENT state (`suffix`) beside the item
// itself. The whole-list guard and the survivor short-circuit must both treat
// that capture as a compared dependency — identity-equal items may never skip
// a render that a changed parent capture should reach.
export function ParentCaptureApp() @{
	const [items, setItems] = useState([
		{ id: 1, v: 'a' },
		{ id: 2, v: 'b' },
	]);
	const [suffix, setSuffix] = useState('!');
	<div>
		<button
			id="capture-suffix"
			onClick={() => setSuffix((value) => value + '!')}
		>{'suffix'}</button>
		<button
			id="capture-item"
			onClick={() => setItems(
				(current) => current.map((item) => (item.id === 1 ? { ...item, v: item.v + 'x' } : item)),
			)}
		>{'item'}</button>
		<ul>
			@for (const it of items; key it.id) {
				<Cell text={it.v + suffix} />
			}
		</ul>
	</div>
}
