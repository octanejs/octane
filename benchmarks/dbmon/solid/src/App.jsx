import { For, createStore } from 'solid-js';
import { bindSetData } from './ops.js';
import { makeData, DB_COUNT } from './data.js';

// dbmon table authored in the Solid 2.0 SHALLOW-STORE idiom. Each tick hands
// the framework a fresh, non-reference-checkable row array, so a deep
// `reconcile` would diff every leaf of every row; `shallow: true` instead
// keeps the row records RAW and makes the array slot the reactive unit. The
// list is keyed by id and each row receives an ACCESSOR: replacing the slot
// (same id, new object) re-runs that row's grouped effect, which reads the
// fresh raw row and writes the changed cells — no per-leaf signals, no
// row-object rebuild, and `<For>` still moves nodes on a sort. The shared ops
// driver feeds the same seeded data, so the DOM matches the other frameworks.

export default function App() {
	const [state, setState] = createStore({ rows: makeData(DB_COUNT, 0, 1) }, { shallow: true });
	// Shallow idiom: replace the slot; keyed For + item accessors do retention.
	bindSetData((d) =>
		setState((s) => {
			s.rows = d;
		}),
	);

	return (
		<table class="dbmon">
			<tbody>
				<For each={state.rows} keyed={(r) => r.id}>
					{(row) => (
						<tr>
							<td class="dbname" textContent={row().name} />
							<td class={row().countClass} textContent={row().count} />
							<td class={row().queries[0].className} textContent={row().queries[0].elapsed} />
							<td class={row().queries[1].className} textContent={row().queries[1].elapsed} />
							<td class={row().queries[2].className} textContent={row().queries[2].elapsed} />
							<td class={row().queries[3].className} textContent={row().queries[3].elapsed} />
							<td class={row().queries[4].className} textContent={row().queries[4].elapsed} />
						</tr>
					)}
				</For>
			</tbody>
		</table>
	);
}
