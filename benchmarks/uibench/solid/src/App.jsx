import { For, createSignal } from 'solid-js';
import { bindSetter } from '../../shared/bridge.js';
import { INITIAL_SNAPSHOT } from '../../shared/workloads.js';

// The Vue Vapor / Octane shape, in Solid: ONE signal holding the raw immutable
// snapshot (no store, no reconcile — the data is never diffed or copied),
// keyed `<For keyed={by id}>` over the plain arrays, and row bodies that read
// through the row ACCESSOR so a surviving row whose object was replaced
// (`{...row, active: true}`) re-runs its own bindings and writes only what
// changed. The list diff is the only diff. This is the idiomatic Solid 2.0
// authoring for immutable snapshots handed to the view (ruled 2026-09-17);
// ../solid-reconcile keeps the Solid 1-era store + reconcile shape for the
// record — it pays a walk over every row per commit for stable proxies and
// per-leaf notifications this workload never uses (2.6x vs 1.2x of Octane).

const byId = (item) => item.id;

function TableView(props) {
	return (
		<table class="uibench-table" data-kind="table">
			<tbody>
				<For each={props.rows} keyed={byId}>
					{(row) => (
						<tr data-id={row().id} class={row().active ? 'active' : 'inactive'}>
							<th textContent={row().label} />
							<For each={row().cells} keyed={byId}>
								{(cell) => <td textContent={cell().text} />}
							</For>
						</tr>
					)}
				</For>
			</tbody>
		</table>
	);
}

function AnimView(props) {
	return (
		<div class="uibench-anim" data-kind="anim">
			<For each={props.boxes} keyed={byId}>
				{(box) => (
					<div class="box" data-id={box().id} style={{ transform: box().transform }} />
				)}
			</For>
		</div>
	);
}

function TreeItem(props) {
	const node = props.node; // the row accessor from the parent <For>
	return (
		<li data-id={node().id} class={node().children.length === 0 ? 'leaf' : 'container'}>
			<span textContent={node().label} />
			{node().children.length > 0 ? (
				<ul>
					<For each={node().children} keyed={byId}>
						{(child) => <TreeItem node={child} />}
					</For>
				</ul>
			) : null}
		</li>
	);
}

function TreeView(props) {
	return (
		<ul class="uibench-tree" data-kind="tree">
			<For each={props.nodes} keyed={byId}>
				{(node) => <TreeItem node={node} />}
			</For>
		</ul>
	);
}

export default function App() {
	const [snapshot, setSnapshot] = createSignal(INITIAL_SNAPSHOT);
	bindSetter(setSnapshot);

	return (
		<>
			{snapshot().kind === 'table' ? (
				<TableView rows={snapshot().rows} />
			) : snapshot().kind === 'anim' ? (
				<AnimView boxes={snapshot().boxes} />
			) : (
				<TreeView nodes={snapshot().nodes} />
			)}
		</>
	);
}
