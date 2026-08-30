import {
	ReactFlowProvider,
	ReactFlow,
	experimental_useOnEdgesChangeMiddleware as useExperimentalOnEdgesChangeMiddleware,
	experimental_useOnNodesChangeMiddleware as useExperimentalOnNodesChangeMiddleware,
	useHandleConnections,
	useNodeConnections,
	useNodesState,
	useEdgesState,
	useOnViewportChange,
	useReactFlow,
	useStoreApi,
	type Edge,
	type EdgeChange,
	type Node,
	type NodeChange,
} from '@octanejs/xyflow';
import { useState } from 'octane';

const nodes: Node[] = [
	{ id: 'connected', position: { x: 0, y: 0 }, data: {} },
	{ id: 'target', position: { x: 100, y: 0 }, data: {} },
	{ id: 'isolated', position: { x: 200, y: 0 }, data: {} },
];

const edges: Edge[] = [
	{ id: 'connected-target', source: 'connected', target: 'target' },
];

function ConnectionCounts() {
	const connectedNode = useNodeConnections({ id: 'connected' });
	const isolatedNode = useNodeConnections({ id: 'isolated' });
	const connectedHandle = useHandleConnections({ nodeId: 'connected', type: 'source' });
	const isolatedHandle = useHandleConnections({ nodeId: 'isolated', type: 'source' });

	return <div>
		<output data-testid="connected-node">{String(connectedNode.length) as string}</output>
		<output data-testid="isolated-node">{String(isolatedNode.length) as string}</output>
		<output data-testid="connected-handle">{String(connectedHandle.length) as string}</output>
		<output data-testid="isolated-handle">{String(isolatedHandle.length) as string}</output>
	</div>;
}

export function ConnectionSlotProbe() {
	return <ReactFlowProvider initialNodes={nodes} initialEdges={edges}>
		<ConnectionCounts />
	</ReactFlowProvider>;
}

export function ColorModeSlotProbe() {
	return <div style={{ width: '320px', height: '240px' }}>
		<ReactFlowProvider>
			<ReactFlow nodes={[]} edges={[]} colorMode="system" />
		</ReactFlowProvider>
	</div>;
}

function ViewportChangeCallbacks() {
	const [phases, setPhases] = useState('');
	const store = useStoreApi();

	useOnViewportChange({
		onStart() {
			setPhases((value) => value + 'start,');
		},
		onChange() {
			setPhases((value) => value + 'change,');
		},
		onEnd() {
			setPhases((value) => value + 'end');
		},
	});

	return <div>
		<button
			data-testid="fire-viewport-phases"
			type="button"
			onClick={() => {
				const state = store.getState();
				const viewport = { x: 1, y: 2, zoom: 3 };
				state.onViewportChangeStart?.(viewport);
				state.onViewportChange?.(viewport);
				state.onViewportChangeEnd?.(viewport);
			}}
		>
			fire viewport phases
		</button>
		<output data-testid="viewport-phases">{phases}</output>
	</div>;
}

export function ViewportChangeSlotProbe() {
	return <ReactFlowProvider>
		<ViewportChangeCallbacks />
	</ReactFlowProvider>;
}

function ReactFlowHelpers() {
	const [snapshot, setSnapshot] = useState('');
	const reactFlow = useReactFlow();
	const [initialReactFlow] = useState(reactFlow);

	return <div>
		<button
			data-testid="read-react-flow"
			type="button"
			onClick={() => {
				const viewport = reactFlow.getViewport();
				setSnapshot(
					`${reactFlow.getNodes().length}:${reactFlow.getEdges().length}:${viewport.x}:${viewport.y}:${viewport.zoom}`,
				);
			}}
		>
			read react flow
		</button>
		<output data-testid="react-flow-snapshot">{snapshot}</output>
		<output data-testid="react-flow-identity">
			{reactFlow === initialReactFlow ? 'stable' : 'changed'}
		</output>
	</div>;
}

export function ReactFlowSlotProbe() {
	return <ReactFlowProvider initialNodes={nodes} initialEdges={edges}>
		<ReactFlowHelpers />
	</ReactFlowProvider>;
}

const stateNodes: Node[] = [
	{ id: 'node-a', position: { x: 0, y: 0 }, data: {} },
	{ id: 'node-b', position: { x: 100, y: 0 }, data: {} },
];

const stateEdges: Edge[] = [
	{ id: 'edge-a-b', source: 'node-a', target: 'node-b' },
];

export function NodesEdgesStateSlotProbe() {
	const [currentNodes, , onNodesChange] = useNodesState(stateNodes);
	const [currentEdges, , onEdgesChange] = useEdgesState(stateEdges);

	return <div>
		<button
			data-testid="remove-node"
			type="button"
			onClick={() => onNodesChange([
				{ id: 'node-a', type: 'remove' },
			])}
		>
			remove node
		</button>
		<button
			data-testid="remove-edge"
			type="button"
			onClick={() => onEdgesChange([
				{ id: 'edge-a-b', type: 'remove' },
			])}
		>
			remove edge
		</button>
		<output data-testid="state-node-ids">{currentNodes.map((node) => node.id).join(',')}</output>
		<output data-testid="state-edge-ids">{currentEdges.map((edge) => edge.id).join(',')}</output>
	</div>;
}

function MiddlewareRegistrations() {
	const [snapshot, setSnapshot] = useState('');
	const store = useStoreApi();

	useExperimentalOnNodesChangeMiddleware((changes) => changes.slice(0, 0));
	useExperimentalOnEdgesChangeMiddleware((changes) => changes.slice(0, 0));

	return <div>
		<button
			data-testid="run-middlewares"
			type="button"
			onClick={() => {
				const state = store.getState();
				const nodeChanges: NodeChange[] = [
					{ id: 'node-a', type: 'remove' },
				];
				const edgeChanges: EdgeChange[] = [
					{ id: 'edge-a-b', type: 'remove' },
				];
				const filteredNodes = Array.from(state.onNodesChangeMiddlewareMap.values()).reduce(
					(changes, middleware) => middleware(changes),
					nodeChanges,
				);
				const filteredEdges = Array.from(state.onEdgesChangeMiddlewareMap.values()).reduce(
					(changes, middleware) => middleware(changes),
					edgeChanges,
				);
				setSnapshot(`${filteredNodes.length}:${filteredEdges.length}`);
			}}
		>
			run middlewares
		</button>
		<output data-testid="middleware-snapshot">{snapshot}</output>
	</div>;
}

export function MiddlewareSlotProbe() {
	return <ReactFlowProvider>
		<MiddlewareRegistrations />
	</ReactFlowProvider>;
}
