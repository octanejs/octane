import {
	Handle,
	Position,
	ReactFlow,
	ReactFlowProvider,
	useEdgesState,
	useNodeConnections,
	useNodesState,
	useReactFlow,
	type Edge,
	type Node,
	type NodeProps,
	type NodeTypes,
	type ReactFlowInstance,
} from '@octanejs/xyflow';
import '@octanejs/xyflow/dist/style.css';
import { createRoot } from 'octane';

const mode = new URLSearchParams(location.search).get('mode');
const controlled = mode === 'controlled';
const connectionProbe = mode === 'connections';
const initialNodes: Node[] =
	connectionProbe
		? [
				{ id: '1', type: 'connection', position: { x: 0, y: 0 }, data: { label: 'node 1' } },
				{ id: '2', type: 'connection', position: { x: 240, y: 70 }, data: { label: 'node 2' } },
			]
		: [
				{ id: '1', position: { x: 0, y: 0 }, data: { label: 'node 1' } },
			];
const initialEdges: Edge[] =
	connectionProbe
		? [
				{
					id: '1-2',
					source: '1',
					target: '2',
					sourceHandle: 'source',
					targetHandle: 'target',
				},
			]
		: [];

function ConnectionNode({ id }: NodeProps) {
	const first = useNodeConnections();
	const second = useNodeConnections();
	const explicit = useNodeConnections({ id });
	return <div style={{ padding: '15px', background: 'white', border: '1px solid black' }}>
		<Handle id="target" type="target" position={Position.Top} />
		<output
			className="connection-count"
		>{`${first.length}:${second.length}:${explicit.length}`}</output>
		<Handle id="source" type="source" position={Position.Bottom} />
	</div>;
}

const nodeTypes: NodeTypes = connectionProbe ? { connection: ConnectionNode } : {};

function Flow() {
	const flow = useReactFlow();
	const [nodes, , onNodesChange] = useNodesState(initialNodes);
	const [edges, , onEdgesChange] = useEdgesState(initialEdges);
	window.xyflowConsumer = flow;

	return <>
		<div id="controls">
			<button
				id="batch"
				onClick={() => {
					flow.setNodes(
						(previous) => [
							...previous,
							{ id: '2', position: { x: 240, y: 70 }, data: { label: 'node 2' } },
						],
					);
					flow.setNodes(
						(previous) => previous.map(
							(node) => node.id === '1' ? { ...node, data: { label: 'updated node 1' } } : node,
						),
					);
					flow.setEdges((previous) => [...previous, { id: '1-2', source: '1', target: '2' }]);
				}}
			>batch updates</button>
			<output>
				{controlled ? 'Controlled nodes' : 'Default nodes'}
			</output>
		</div>
		<div id="canvas">
			@if (controlled) {
				<ReactFlow
					nodes={nodes}
					edges={edges}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
				/>
			} @else {
				<ReactFlow defaultNodes={initialNodes} defaultEdges={initialEdges} nodeTypes={nodeTypes} />
			}
		</div>
	</>;
}

createRoot(document.getElementById('root')!).render(
	<ReactFlowProvider>
		<Flow />
	</ReactFlowProvider>,
);

declare global {
	interface Window {
		xyflowConsumer: ReactFlowInstance;
	}
}
