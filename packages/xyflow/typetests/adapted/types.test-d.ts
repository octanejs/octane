// Adapted side: @octanejs/xyflow, compiled with tsrx-tsc. Assertion groups
// stay one-for-one with the pristine probe.
import {
	Handle,
	Position,
	ReactFlow,
	addEdge,
	useEdgesState,
	useNodesState,
	type Connection,
	type Edge,
	type HandleProps,
	type MiniMapNodeProps,
	type MiniMapProps,
	type Node,
	type NodeResizerProps,
	type OnConnect,
	type ReactFlowProps,
	type ResizeControlProps,
} from '@octanejs/xyflow';

// 1. Node requires an id, position, and data payload.
const node: Node<{ label: string }> = {
	id: 'node-1',
	position: { x: 10, y: 20 },
	data: { label: 'One' },
};
void node;
// @ts-expect-error position coordinates must be numbers
const badNode: Node = { id: 'node-1', position: { x: '10', y: 20 }, data: {} };
void badNode;

// 2. Edge requires string source and target ids.
const edge: Edge = { id: 'edge-1', source: 'node-1', target: 'node-2' };
void edge;
// @ts-expect-error source ids are strings
const badEdge: Edge = { id: 'edge-1', source: 1, target: 'node-2' };
void badEdge;

// 3. ReactFlow props accept typed nodes, edges, and viewport options.
const flowProps: ReactFlowProps<Node<{ label: string }>, Edge> = {
	nodes: [node],
	edges: [edge],
	fitView: true,
	minZoom: 0.25,
};
void flowProps;
void ReactFlow;
// @ts-expect-error unknown props are rejected
const badFlowProps: ReactFlowProps = { notAFlowProp: true };
void badFlowProps;

// 4. Handle props require a handle type and position.
const handleProps: HandleProps = { type: 'source', position: Position.Left };
void handleProps;
void Handle;
// @ts-expect-error position is required
const badHandleProps: HandleProps = { type: 'source' };
void badHandleProps;

// 5. Connection callbacks receive the public Connection shape.
const onConnect: OnConnect = (connection) => {
	const source: string = connection.source;
	const target: string = connection.target;
	void source;
	void target;
};
void onConnect;

// 6. addEdge preserves the caller's edge subtype.
type WeightedEdge = Edge<{ weight: number }>;
declare const connection: Connection;
declare const weightedEdges: WeightedEdge[];
const nextEdges: WeightedEdge[] = addEdge<WeightedEdge>(connection, weightedEdges);
void nextEdges;

// 7. useNodesState exposes nodes, a setter, and a typed change callback.
const [nodes, setNodes, onNodesChange] = useNodesState([node]);
const firstLabel: string = nodes[0].data.label;
setNodes((current) => current);
onNodesChange([{ type: 'select', id: 'node-1', selected: true }]);
void firstLabel;

// 8. useEdgesState exposes edges, a setter, and a typed change callback.
const [edges, setEdges, onEdgesChange] = useEdgesState([edge]);
const firstSource: string = edges[0].source;
setEdges((current) => current);
onEdgesChange([{ type: 'select', id: 'edge-1', selected: true }]);
void firstSource;

// 9. Additional-component prop types remain available from the public root.
const miniMapProps: MiniMapProps = { pannable: true, zoomable: true };
const miniMapNodeProps: MiniMapNodeProps = {
	id: 'node-1',
	x: 0,
	y: 0,
	width: 100,
	height: 40,
	borderRadius: 4,
	className: 'node',
	shapeRendering: 'geometricPrecision',
	selected: false,
};
const nodeResizerProps: NodeResizerProps = { minWidth: 20, keepAspectRatio: true };
const resizeControlProps: ResizeControlProps = { minHeight: 20 };
void miniMapProps;
void miniMapNodeProps;
void nodeResizerProps;
void resizeControlProps;
