// The Components tab: subscribes to the app-side bridge's `tree`/`inspect` events
// (startBridge) and renders the live component tree plus a selected-node state
// inspector. Read-only — selecting a node only asks the app to describe it
// (`inspect-request`); it never mutates app state (see docs/devtools.md P1 scope).
import { useEffect, useState } from 'octane';
import type { OctaneNode } from 'octane';
import { OctaneDevtoolsEventClient, type NodeDetail, type WireTreeNode } from '../client';

function TreeRow(props: {
	node: WireTreeNode;
	onSelect: (id: number) => void;
	selected: number | null;
}) @{
	<div>
		<button
			class={['odt-tree-row', props.selected === props.node.id && 'odt-selected']}
			onClick={() => props.onSelect(props.node.id)}
		>
			<span
				class={['odt-kind', props.node.kind === 'root' && 'odt-kind-root']}
			>{props.node.kind}</span>
			<span>{props.node.name}</span>
		</button>
		@if (props.node.children.length > 0) {
			<div class="odt-child">
				@for (const child of props.node.children; key child.id) {
					<TreeRow node={child} onSelect={props.onSelect} selected={props.selected} />
				}
			</div>
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

	return <div class="odt-split">
		<div class="odt-col odt-col-tree">
			<div class="odt-h">Component tree</div>
			@if (nodes.length === 0) {
				<div class="odt-empty">No mounted roots yet.</div>
			} @else {
				@for (const node of nodes; key node.id) {
					<TreeRow node={node} onSelect={onSelect} selected={selected} />
				}
			}
		</div>
		<div class="odt-col">
			@if (detail) {
				<div>
					<div class="odt-node-name">
						{detail.name}
						<span class="odt-badge">{detail.effectCount} effects</span>
					</div>
					<div class="odt-h">Hooks</div>
					@if (detail.hooks.length === 0) {
						<div class="odt-empty odt-muted">No tracked hooks.</div>
					} @else {
						@for (const cell of detail.hooks; index i) {
							<div class="odt-kv">
								<span class="odt-kv-key">{cell.kind}</span>
								<span class="odt-kv-val"> {JSON.stringify(cell.value)}</span>
							</div>
						}
					}
					@if (detail.context.length > 0) {
						<>
							<div class="odt-h">Context</div>
							@for (const c of detail.context; index i) {
								<div class="odt-kv">
									<span class="odt-kv-key">{c.name}</span>
									<span class="odt-kv-val"> {JSON.stringify(c.value)}</span>
								</div>
							}
						</>
					}
				</div>
			} @else {
				<div class="odt-empty">Select a component.</div>
			}
		</div>
	</div>;
}
