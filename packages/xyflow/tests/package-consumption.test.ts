// @vitest-environment node

import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { octane } from 'octane/compiler/vite';
import { build } from 'vite';
import { expect, it } from 'vitest';

it('preserves flow components and change helpers in a production consumer bundle', async () => {
	const root = resolve(import.meta.dirname, '../../..');
	const result = await build({
		configFile: false,
		root,
		logLevel: 'error',
		plugins: [octane({ hmr: false })],
		define: {
			__OCTANE_PROFILE_ENABLED__: 'false',
			'process.env.NODE_ENV': JSON.stringify('production'),
		},
		build: {
			write: false,
			minify: false,
			target: 'esnext',
			lib: {
				entry: resolve(import.meta.dirname, '../src/index.ts'),
				formats: ['iife'],
				name: 'FlowConsumer',
			},
		},
	});
	const chunks = (Array.isArray(result) ? result : [result]).flatMap((bundle) => {
		if (!('output' in bundle)) throw new Error('Expected a library bundle.');
		return bundle.output.filter((output) => output.type === 'chunk');
	});
	expect(chunks).toHaveLength(1);
	expect(chunks[0].imports).toEqual([]);
	expect(chunks[0].dynamicImports).toEqual([]);
	const dom = new JSDOM('<!doctype html><html><body></body></html>', {
		runScripts: 'outside-only',
		url: 'https://octane.test/',
	});
	try {
		dom.window.eval(chunks[0].code);
		const flow = (dom.window as unknown as { FlowConsumer: Record<string, any> }).FlowConsumer;
		for (const name of ['ReactFlow', 'ReactFlowProvider', 'Handle', 'useReactFlow']) {
			expect(typeof flow[name]).toBe('function');
		}
		const nodes = [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }];
		expect(flow.applyNodeChanges([{ id: 'a', type: 'select', selected: true }], nodes)).toEqual([
			{ ...nodes[0], selected: true },
		]);
		expect(flow.isNode(nodes[0])).toBe(true);
		const edges = flow.addEdge({ source: 'a', target: 'b' }, []);
		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({ source: 'a', target: 'b' });
		expect(flow.isEdge(edges[0])).toBe(true);
	} finally {
		dom.window.close();
	}
}, 60_000);
