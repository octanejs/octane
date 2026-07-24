// The Components tab: subscribes to the app-side bridge's `tree`/`inspect` events
// (Task 5's startBridge) and renders the live component tree plus a selected-node
// state inspector. Read-only — selecting a node only asks the app to describe it
// (`inspect-request`); it never mutates app state (see docs/devtools.md P1 scope).
import { useEffect, useState } from 'octane';
import type { OctaneNode } from 'octane';
import { OctaneDevtoolsEventClient, type NodeDetail, type WireTreeNode } from '../client';

function TreeRow(props: {
	node: WireTreeNode;
	onSelect: (id: number) => void;
	selected: number | null;
}) @{
	<div style={{ paddingLeft: '12px' }}>
		<button
			onClick={() => props.onSelect(props.node.id)}
			style={{ fontWeight: props.selected === props.node.id ? 'bold' : 'normal' }}
		>{props.node.name}</button>
		@for (const child of props.node.children; key child.id) {
			<TreeRow node={child} onSelect={props.onSelect} selected={props.selected} />
		}
	</div>
}

export function ComponentsTab(props: { client: OctaneDevtoolsEventClient }): OctaneNode {
	const { client } = props;
	const [nodes, setNodes] = useState<WireTreeNode[]>([]);
	const [selected, setSelected] = useState<number | null>(null);
	const [detail, setDetail] = useState<NodeDetail | null>(null);

	useEffect(() => {
		const offTree = client.on('tree', (e) => setNodes(e.payload.nodes));
		const offInspect = client.on('inspect', (e) => setDetail(e.payload));
		return () => {
			offTree();
			offInspect();
		};
	});

	const onSelect = (id: number) => {
		setSelected(id);
		client.emit('inspect-request', { id });
	};

	return <div style={{ display: 'flex', gap: '16px', fontFamily: 'monospace', fontSize: '12px' }}>
		<div style={{ flex: '1', overflow: 'auto' }}>
			@if (nodes.length === 0) {
				<em>No mounted roots yet.</em>
			} @else {
				@for (const node of nodes; key node.id) {
					<TreeRow node={node} onSelect={onSelect} selected={selected} />
				}
			}
		</div>
		<div style={{ flex: '1', overflow: 'auto' }}>
			@if (detail) {
				<div>
					<h4>{detail.name}</h4>
					<div>effects: {detail.effectCount as string}</div>
					@for (const cell of detail.hooks; index i) {
						<div>{cell.kind}: {JSON.stringify(cell.value)}</div>
					}
					@if (detail.context.length > 0) {
						@for (const c of detail.context; index i) {
							<div>{c.name}: {JSON.stringify(c.value)}</div>
						}
					}
				</div>
			} @else {
				<em>Select a component.</em>
			}
		</div>
	</div>;
}
