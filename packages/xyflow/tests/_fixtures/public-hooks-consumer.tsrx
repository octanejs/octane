import {
	ReactFlowProvider,
	useConnection,
	useEdges,
	useKeyPress,
	useNodes,
	useNodesInitialized,
	useReactFlow,
	useStore,
	useStoreApi,
	type Edge,
	type Node,
} from '@octanejs/xyflow';

export { createRoot, flushSync } from 'octane';

const nodes: Node[] = [
	{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } },
	{ id: 'b', position: { x: 100, y: 0 }, data: { label: 'B' } },
];
const edges: Edge[] = [
	{ id: 'a-b', source: 'a', target: 'b', label: 'AB' },
];

function FlowMutations() {
	const flow = useReactFlow();
	const currentNodes = useNodes();
	const currentEdges = useEdges();

	return <div>
		<button
			data-testid="update-nodes"
			onClick={() => {
				flow.setNodes(
					(current) => current.map(
						(node) => node.id === 'a' ? { ...node, data: { label: 'updated A' } } : node,
					),
				);
				flow.addNodes({ id: 'c', position: { x: 200, y: 0 }, data: { label: 'C' } });
				flow.setNodes((current) => current.filter((node) => node.id !== 'b'));
			}}
		>update nodes</button>
		<button
			data-testid="update-edges"
			onClick={() => {
				flow.setEdges((current) => current.filter((edge) => edge.id !== 'a-b'));
				flow.addEdges({ id: 'c-a', source: 'c', target: 'a', label: 'CA' });
				flow.setEdges(
					(current) => current.map((edge) => ({ ...edge, label: `updated ${edge.label}` })),
				);
			}}
		>update edges</button>
		<output data-testid="node-snapshot">{currentNodes.map(
			(node) => `${node.id}:${node.data.label}`,
		).join(',')}</output>
		<output data-testid="edge-snapshot">{currentEdges.map(
			(edge) => `${edge.id}:${edge.label}`,
		).join(',')}</output>
	</div>;
}

export function QueueConsumer() {
	return <ReactFlowProvider defaultNodes={nodes} defaultEdges={edges}>
		<FlowMutations />
	</ReactFlowProvider>;
}

export function KeyPressConsumer(props: { target: HTMLElement }) {
	const noKey = useKeyPress();
	const first = useKeyPress('a');
	const second = useKeyPress('b');
	const defaults = useKeyPress('c', undefined);
	const explicit = useKeyPress('d', {});
	const targeted = useKeyPress('e', { target: props.target, preventDefault: false });
	const inputAllowed = useKeyPress('Control+j');
	const inputIgnored = useKeyPress('Control+k', { actInsideInputWithModifier: false });

	return <div>
		<input data-testid="key-input" />
		<output data-testid="key-snapshot">{[
			noKey,
			first,
			second,
			defaults,
			explicit,
			targeted,
			inputAllowed,
			inputIgnored,
		].map((pressed) => pressed ? '1' : '0').join('')}</output>
	</div>;
}

function StoreSubscriptions() {
	const omitted = useStore((state) => state.nodesDraggable);
	const defaults = useStore((state) => state.nodesDraggable, undefined);
	const explicit = useStore((state) => state.nodesDraggable, Object.is);
	const store = useStoreApi();

	return <div>
		<button
			data-testid="toggle-draggable"
			onClick={() => store.setState((state) => ({ nodesDraggable: !state.nodesDraggable }))}
		>toggle draggable</button>
		<output data-testid="draggable-snapshot">{[omitted, defaults, explicit].map(
			(draggable) => draggable ? '1' : '0',
		).join('')}</output>
	</div>;
}

export function StoreConsumer() {
	return <ReactFlowProvider>
		<StoreSubscriptions />
	</ReactFlowProvider>;
}

function ConnectionSubscriptions() {
	const connection = useConnection();
	const selected = useConnection((current) => current.inProgress);
	const initialized = useNodesInitialized();
	const explicitInitialized = useNodesInitialized({ includeHiddenNodes: false });

	return <output data-testid="connection-snapshot">{[
		connection.inProgress,
		selected,
		initialized,
		explicitInitialized,
	].map((active) => active ? '1' : '0').join('')}</output>;
}

export function ConnectionConsumer() {
	return <ReactFlowProvider initialNodes={nodes}>
		<ConnectionSubscriptions />
	</ReactFlowProvider>;
}
