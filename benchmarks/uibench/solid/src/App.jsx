import { For, createStore, reconcile } from 'solid-js';
import { bindSetter } from '../../shared/bridge.js';
import { INITIAL_SNAPSHOT } from '../../shared/workloads.js';

// Authored in the canonical Solid 2.0 shape (the same one Solid's own UIbench
// entry uses): one keyed `reconcile` of the whole snapshot into a store each
// commit, `<For>` over the store arrays (row/box/node proxies are stable across
// a reconcile, so the list is keyed by reference), `textContent` for text
// leaves, and a plain `.map` for a row's cells — the cells of a row never
// change independently in this matrix, so a keyed list per row would only add
// per-row list machinery.

function TableView(props) {
	return (
		<table class="uibench-table" data-kind="table">
			<tbody>
				<For each={props.rows}>
					{(row) => (
						<tr data-id={row.id} class={row.active ? 'active' : 'inactive'}>
							<th textContent={row.label} />
							{row.cells.map((cell) => <td textContent={cell.text} />)}
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
			<For each={props.boxes}>
				{(box) => <div class="box" data-id={box.id} style={{ transform: box.transform }} />}
			</For>
		</div>
	);
}

function TreeItem(props) {
	return (
		<li data-id={props.node.id} class={props.node.children.length === 0 ? 'leaf' : 'container'}>
			<span textContent={props.node.label} />
			{props.node.children.length > 0 ? (
				<ul>
					<For each={props.node.children}>{(child) => <TreeItem node={child} />}</For>
				</ul>
			) : null}
		</li>
	);
}

function TreeView(props) {
	return (
		<ul class="uibench-tree" data-kind="tree">
			<For each={props.nodes}>{(node) => <TreeItem node={node} />}</For>
		</ul>
	);
}

export default function App() {
	// A private copy: the store owns its backing, and the shared snapshot is
	// the other fixtures' too.
	const [snapshot, setSnapshot] = createStore(structuredClone(INITIAL_SNAPSHOT));
	// Each commit is a fresh immutable snapshot; `reconcile(_, 'id')` diffs it
	// into the store by key so surviving rows/boxes/nodes keep their proxies
	// (and their DOM) and only changed leaves notify.
	bindSetter((next) => setSnapshot(reconcile(next, 'id')));

	return (
		<>
			{snapshot.kind === 'table' ? (
				<TableView rows={snapshot.rows} />
			) : snapshot.kind === 'anim' ? (
				<AnimView boxes={snapshot.boxes} />
			) : (
				<TreeView nodes={snapshot.nodes} />
			)}
		</>
	);
}
