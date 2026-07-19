import { describe, expect, it } from 'vitest';
import { lynxRenderer } from '../../lynx/src/config.js';
import { compile } from '../src/compiler/compile.js';

const baseRenderer = {
	id: 'object',
	module: 'octane/universal',
	target: 'universal',
} as const;

const resolvedLynxRenderer = { id: 'lynx', ...lynxRenderer } as const;

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

	it('enforces legal raw-text topology with the Lynx renderer preset', () => {
		const legal = compile(
			'export function Scene() @{ <text>Hello <raw-text text="world" /></text> }',
			'/src/Scene.lynx.tsrx',
			{ renderer: resolvedLynxRenderer, hmr: false },
		).code;

		expect(legal).toContain('"kind": "text", "value": "Hello"');
		expect(legal).toContain('"type": "raw-text"');
		expect(() =>
			compile('export function Scene() @{ <view>illegal</view> }', '/src/Illegal.lynx.tsrx', {
				renderer: resolvedLynxRenderer,
				hmr: false,
			}),
		).toThrow(
			/renderer "lynx" does not allow authored JSX text under <view>\. at \/src\/Illegal\.lynx\.tsrx:1:/,
		);
		expect(() =>
			compile(
				'export function Scene() @{ <view><raw-text text="illegal" /></view> }',
				'/src/IllegalRawText.lynx.tsrx',
				{ renderer: resolvedLynxRenderer, hmr: false },
			),
		).toThrow(
			/renderer "lynx" does not allow <raw-text> under <view>\. at \/src\/IllegalRawText\.lynx\.tsrx:1:/,
		);

		const componentOwned = compile(
			`function Label({children}) @{ <text>{children}</text> }
			 export function Scene() @{ <Label><raw-text text="component-owned" /></Label> }`,
			'/src/ComponentOwnedRawText.lynx.tsrx',
			{ renderer: resolvedLynxRenderer, hmr: false },
		).code;
		expect(componentOwned).toContain('"type": "raw-text"');
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

	it('keeps scoped styles behind an explicit renderer style/assets capability', () => {
		expect(() =>
			compile(
				`export function Scene() @{
					<><node /><style>.node { color: red; }</style></>
				}`,
				'/src/Scene.object.tsrx',
				{ renderer: { ...baseRenderer, text: 'host' }, hmr: false },
			),
		).toThrow(
			/scoped <style> requires a renderer style\/assets capability\. at \/src\/Scene\.object\.tsrx:/,
		);
	});
});
