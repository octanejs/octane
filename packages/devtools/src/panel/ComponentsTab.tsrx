// The Components tab: subscribes to the app-side bridge's `tree`/`inspect` events
// (startBridge) and renders the live component tree plus a selected-node state
// inspector. Read-only — selecting a node only asks the app to describe it
// (`inspect-request`); it never mutates app state (see docs/devtools.md P1 scope).
import { useEffect, useState } from 'octane';
import type { OctaneNode } from 'octane';
import {
	OctaneDevtoolsEventClient,
	type NativeReadWire,
	type NodeDetail,
	type WireTreeNode,
} from '../client';

function NativeReadRows(props: { label: string; reads: readonly NativeReadWire[] }) @{
	<div>
		<div class="odt-h">{props.label}</div>
		@if (props.reads.length === 0) {
			<div class="odt-empty odt-muted">No native reads.</div>
		} @else {
			@for (const read of props.reads; index i) {
				<div class="odt-kv">
					@if (read.source) {
						<div>
							<div class="odt-kv-key">{read.source.scopeKey + ':' + read.source.key}</div>
							<div class="odt-muted">
								{read.source.kind + ' · ' + read.source.read + ' · ' + read.source.status}
							</div>
							@if (read.source.retired) {
								<span class="odt-badge">retired</span>
							}
							@if (read.source.historical) {
								<span class="odt-badge">historical</span>
							}
							@if (read.source.retained) {
								<span class="odt-badge">retained value</span>
							}
							@if (read.source.refreshing) {
								<span class="odt-badge">refreshing</span>
							}
							@if (read.source.connection !== 'none') {
								<span class="odt-badge">{'stream: ' + read.source.connection}</span>
							}
							@if (read.source.complete) {
								<span class="odt-badge">complete</span>
							}
							<div class="odt-muted">
								{'Node revision ' + read.source.revision + ', scope epoch ' + read.source.epoch}
							</div>
							@if (read.source.dependencies.length > 0) {
								<div class="odt-muted">
									{'Dependencies: ' +
										read.source.dependencies.map(
											(dependency) => dependency.scopeKey + ':' + dependency.key,
										).join(', ')}
								</div>
							}
						</div>
					} @else {
						<span class="odt-kv-key">Native source</span>
					}
					<span class="odt-kv-val">
						{'Read revision ' +
							(read.observedVersion === null ? 'uncommitted' : read.observedVersion) +
							' → ' +
							read.currentVersion}
					</span>
				</div>
			}
		}
	</div>
}

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
	const [selected, setSelected, getSelected] = useState<number | null>(null);
	const [detail, setDetail] = useState<NodeDetail | null>(null);

	useEffect(() => {
		const offTree = client.on('tree', (e) => setNodes(e.payload.nodes));
		const offInspect = client.on('inspect', (e) => {
			if (e.payload.id === getSelected()) setDetail(e.payload);
		});
		const offClear = client.on('inspect-clear', (e) => {
			if (e.payload.id === getSelected()) {
				setDetail(null);
				setSelected(null);
			}
		});
		return () => {
			offTree();
			offInspect();
			offClear();
		};
	});

	const onSelect = (id: number) => {
		setSelected(id);
		setDetail(null);
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
					@if (detail.nativeReads) {
						<div>
							<div class="odt-h">Native reads</div>
							<div class="odt-muted">{'Scheduled owner #' + detail.nativeReads.ownerId}</div>
							<NativeReadRows
								label="Accepted reads"
								reads={detail.nativeReads.committed?.reads ?? []}
							/>
							@if (detail.nativeReads.committed?.mixed) {
								<div class="odt-muted">Mixed revisions in this attempt.</div>
							}
							@for (const attempt of detail.nativeReads.pending; index i) {
								<div>
									<NativeReadRows label="Pending attempt" reads={attempt.reads} />
									@if (attempt.mixed) {
										<div class="odt-muted">Mixed revisions in this attempt.</div>
									}
								</div>
							}
							@if (detail.nativeReads.retry.length > 0) {
								<NativeReadRows label="Suspended retry sources" reads={detail.nativeReads.retry} />
							}
						</div>
					}
				</div>
			} @else {
				<div class="odt-empty">Select a component.</div>
			}
		</div>
	</div>;
}
