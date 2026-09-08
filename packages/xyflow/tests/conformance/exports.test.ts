import { describe, expect, it } from 'vitest';
import * as binding from '@octanejs/xyflow';
import * as upstream from '@xyflow/react';

describe('@octanejs/xyflow — exports', () => {
	it('matches core upstream runtime exports', () => {
		for (const name of [
			'ReactFlow',
			'ReactFlowProvider',
			'Handle',
			'useReactFlow',
			'useNodes',
			'useEdges',
			'addEdge',
			'applyNodeChanges',
			'applyEdgeChanges',
			'isNode',
			'isEdge',
		] as const) {
			const bindingType = typeof binding[name];
			const upstreamType = typeof upstream[name];
			if (name === 'ReactFlow' || name === 'ReactFlowProvider' || name === 'Handle') {
				expect(bindingType).toBe('function');
				continue;
			}
			expect(bindingType).toBe(upstreamType);
		}
	});
});
