import {
	ReactFlow,
	ReactFlowProvider,
	addEdge,
	useNodesState,
	useEdgesState,
} from '@octanejs/xyflow';
import type { Node, Edge } from '@octanejs/xyflow';

const initialNodes: Node[] = [
	{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
	{ id: '2', position: { x: 120, y: 80 }, data: { label: 'B' } },
];

const initialEdges: Edge[] = [
	{ id: 'e1-2', source: '1', target: '2' },
];

export function XyflowDiff() {
	return <div id="root" style={{ width: '320px', height: '240px' }}>
		<ReactFlowProvider>
			<ReactFlow nodes={initialNodes} edges={initialEdges} fitView />
		</ReactFlowProvider>
	</div>;
}

export function XyflowHelpersProbe() {
	const [nodes, , onNodesChange] = useNodesState(initialNodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
	return <div id="helpers">
		<ReactFlow
			nodes={nodes}
			edges={edges}
			onNodesChange={onNodesChange}
			onEdgesChange={onEdgesChange}
			onConnect={(connection) => {
				setEdges(function add(connectionEdges) {
					return addEdge(connection, connectionEdges);
				});
			}}
		/>
	</div>;
}
