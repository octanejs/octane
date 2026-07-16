import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';

const baseRenderer = {
	id: 'object',
	module: 'octane/universal',
	target: 'universal',
} as const;

describe('universal compiler renderer capabilities', () => {
	it('requires an explicit policy for authored host text', () => {
		expect(() =>
			compile(
				'export function Scene() @{ <label>authored text</label> }',
				'/src/Scene.object.tsrx',
				{ renderer: baseRenderer, hmr: false },
			),
		).toThrow(
			/renderer "object" rejects authored text children\. at \/src\/Scene\.object\.tsrx:1:/,
		);
	});

	it('lowers or omits authored text according to the typed renderer policy', () => {
		const source = 'export function Scene() @{ <label>authored text</label> }';
		const host = compile(source, '/src/Scene.object.tsrx', {
			renderer: { ...baseRenderer, text: 'host' as const },
			hmr: false,
		}).code;
		const ignored = compile(source, '/src/Scene.object.tsrx', {
			renderer: { ...baseRenderer, text: 'ignore' as const },
			hmr: false,
		}).code;

		expect(host).toContain('"kind": "text", "value": "authored text"');
		expect(ignored).not.toContain('"kind": "text"');
	});

	it('lowers Activity only for renderers that advertise visibility', () => {
		const source = `
			import { Activity } from 'octane';
			export function Scene({mode}) @{
				<Activity mode={mode}><node /></Activity>
			}
		`;

		expect(() =>
			compile(source, '/src/Scene.object.tsrx', {
				renderer: { ...baseRenderer, text: 'host' },
				hmr: false,
			}),
		).toThrow(/Activity requires an explicit renderer visibility capability/);

		const output = compile(source, '/src/Scene.object.tsrx', {
			renderer: {
				...baseRenderer,
				text: 'host' as const,
				capabilities: ['visibility'],
			},
			hmr: false,
		}).code;

		expect(output).toContain('universalActivity as __octaneUniversalActivity');
		expect(output).toContain('__octaneUniversalActivity(mode, () =>');
		expect(output).not.toContain('<Activity');
	});

	it('diagnoses invalid static Activity modes at the authored source', () => {
		expect(() =>
			compile(
				`import { Activity } from 'octane';
				 export function Scene() @{ <Activity mode="collapsed"><node /></Activity> }`,
				'/src/Scene.object.tsrx',
				{
					renderer: {
						...baseRenderer,
						text: 'host',
						capabilities: ['visibility'],
					},
					hmr: false,
				},
			),
		).toThrow(
			/Activity mode must be either "visible" or "hidden"\. at \/src\/Scene\.object\.tsrx:2:/,
		);
	});
});
