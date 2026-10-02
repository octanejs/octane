import { use, useState } from 'octane';

function StreamedRowsValue(props) @{
	const value = use(props.promise);
	<span class="rows-ready">{value as string}</span>
}

// A streamed boundary whose @pending arm renders list ranges directly beside
// the stream sentinel. Revealing the content replaces the whole fallback arm,
// so the client adopts the content and the sibling after the boundary.
export function ListFallbackBoundary(props) @{
	const [count, setCount] = useState(0);
	<div id="list-fallback">
		@try {
			<StreamedRowsValue promise={props.promise} />
		} @pending {
			<>
				@for (const item of props.items; key item) {
					<i class="list-fallback-item">{item as string}</i>
				} @empty {
					<i class="list-fallback-empty">{'none'}</i>
				}
				<p class="list-fallback-tail">{'loading'}</p>
			</>
		}
		<button id="list-fallback-after" onClick={() => setCount(count + 1)}>{count as number}</button>
	</div>
}

export function BindingRowsFallback(props: { items: string[] }) @{
	'use dom bindings';
	@for (const item of props.items; key item) {
		<i class="list-fallback-item">{item as string}</i>
	}
}

export function BindingListFallbackBoundary(props) @{
	const [count, setCount] = useState(0);
	<div id="list-fallback">
		@try {
			<StreamedRowsValue promise={props.promise} />
		} @pending {
			<>
				<BindingRowsFallback items={props.items} />
				<p class="list-fallback-tail">{'loading'}</p>
			</>
		}
		<button id="list-fallback-after" onClick={() => setCount(count + 1)}>{count as number}</button>
	</div>
}
