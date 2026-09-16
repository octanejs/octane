import { expect, it } from 'vitest';
import { octane } from 'octane/compiler/vite';
import { createClientBuildState } from '../src/client-build.js';

it('rejects actual compiler output for first post-HMR signal discovery before returning runnable code', async () => {
	const reloads: string[] = [];
	const builds = createClientBuildState((buildId) => reloads.push(buildId));
	const plugin = octane({
		hmr: false,
		__onIndependentWidgets(id: string, _environment: string, widgets: any[], signals: boolean) {
			builds.record('/project', id, widgets, signals);
		},
	} as any);
	(plugin.config as any)({ root: '/project' });
	(plugin.configResolved as any)({ root: '/project', command: 'serve', build: {}, define: {} });
	const source = `import { signal$ } from 'octane/signals'; export const draft$ = signal$('');`;
	const transform = () => (plugin.transform as any).call({}, source, '/project/src/state.ts');
	builds.noteHotUpdate();
	await expect(Promise.resolve().then(transform)).rejects.toThrow(/Reload this document/);
	expect(reloads).toEqual([builds.buildId]);
	const fresh = await transform();
	expect(fresh.code).toContain('__signalAt');
	expect(reloads).toHaveLength(1);
});
