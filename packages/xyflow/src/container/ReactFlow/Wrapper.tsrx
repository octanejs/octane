import { useContext, type OctaneNode } from 'octane';

import StoreContext from '../../contexts/StoreContext';
import { ReactFlowProvider } from '../../components/ReactFlowProvider/index.tsrx';
import type { Node, Edge, FitViewOptions } from '../../types';
import type { CoordinateExtent, NodeOrigin, ZIndexMode } from '@xyflow/system';

export function Wrapper({
	children,
	nodes,
	edges,
	defaultNodes,
	defaultEdges,
	width,
	height,
	fitView,
	fitViewOptions,
	minZoom,
	maxZoom,
	nodeOrigin,
	nodeExtent,
	zIndexMode,
}: {
	children: OctaneNode;
	nodes?: Node[] | undefined;
	edges?: Edge[] | undefined;
	defaultNodes?: Node[];
	defaultEdges?: Edge[];
	width?: number | undefined;
	height?: number | undefined;
	fitView?: boolean | undefined;
	fitViewOptions?: FitViewOptions | undefined;
	minZoom?: number;
	maxZoom?: number;
	nodeOrigin?: NodeOrigin;
	nodeExtent?: CoordinateExtent | undefined;
	zIndexMode?: ZIndexMode;
}) {
	const isWrapped = useContext(StoreContext);

	if (isWrapped) {
		/*
		 * we need to wrap it with a fragment because it's not allowed for children to be a OctaneNode
		 * https://github.com/DefinitelyTyped/DefinitelyTyped/issues/18051
		 */
		return <>{children}</>;
	}

	return (
		<ReactFlowProvider
			initialNodes={nodes}
			initialEdges={edges}
			defaultNodes={defaultNodes}
			defaultEdges={defaultEdges}
			initialWidth={width}
			initialHeight={height}
			fitView={fitView}
			initialFitViewOptions={fitViewOptions}
			initialMinZoom={minZoom}
			initialMaxZoom={maxZoom}
			nodeOrigin={nodeOrigin}
			nodeExtent={nodeExtent}
			zIndexMode={zIndexMode}
		>
			{children}
		</ReactFlowProvider>
	);
}
