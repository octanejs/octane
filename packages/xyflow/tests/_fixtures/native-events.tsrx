import { ReactFlow, ReactFlowProvider } from '@octanejs/xyflow';
import type { Node, OnConnectStart } from '@octanejs/xyflow';

const nodes: Node[] = [
	{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } },
	{ id: '2', position: { x: 200, y: 0 }, data: { label: 'B' } },
];

export function NativeEventConnectProbe(props: { onClickConnectStart: OnConnectStart }) {
	return <div style={{ width: '400px', height: '300px' }}>
		<ReactFlowProvider>
			<ReactFlow nodes={nodes} onClickConnectStart={props.onClickConnectStart} />
		</ReactFlowProvider>
	</div>;
}
