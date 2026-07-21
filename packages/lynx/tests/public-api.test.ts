import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as firstScreenApi from '../src/first-screen.js';
import * as rootApi from '../src/index.js';
import * as mainRendererApi from '../src/main-renderer.js';
import * as mainThreadApi from '../src/main-thread.js';
import * as platformApi from '../src/platform.js';
import * as testingApi from '../src/testing.js';

const packageJson = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
	private: boolean;
	version: string;
	exports: Record<string, string>;
};

describe('@octanejs/lynx Milestone 6 private surface', () => {
	it('keeps every required package subpath private and addressable', () => {
		expect(packageJson.private).toBe(true);
		expect(packageJson.version).toBe('0.0.0');
		expect(Object.keys(packageJson.exports)).toEqual([
			'.',
			'./config',
			'./renderer',
			'./main-renderer',
			'./first-screen',
			'./intrinsics',
			'./intrinsics/jsx-runtime',
			'./main-thread',
			'./platform',
			'./testing',
		]);
	});

	it('exposes the private host and platform source surface without claiming a preview', () => {
		expect(rootApi.lynxRootAvailability).toMatchObject({
			available: true,
			implementedMilestone: 4,
		});
		expect(platformApi.lynxPlatformAvailability).toMatchObject({
			available: false,
			plannedMilestone: 4,
			technicalPreviewMilestone: 5,
		});
		expect(testingApi.lynxTestingAvailability).toMatchObject({
			available: true,
			plannedMilestone: 5,
			implementedMilestone: 5,
			sourceTests: true,
			execution: 'javascript-host-emulation',
			nativeExecution: false,
			deviceExecution: false,
		});
		expect(rootApi.root.renderer).toBe('lynx');
		expect(firstScreenApi.lynxRootAvailability).toMatchObject({
			available: true,
			implementedMilestone: 6,
		});
		expect(firstScreenApi.root.renderer).toBe('lynx');
		expect(firstScreenApi.createLynxRoot()).toBe(firstScreenApi.root);
		expect(firstScreenApi.markFirstScreenSyncReady).toBeTypeOf('function');
		expect(firstScreenApi.createLynxNativeResource).toBe(rootApi.createLynxNativeResource);
		expect(firstScreenApi.LynxNodesRefError).toBe(rootApi.LynxNodesRefError);
		expect(mainRendererApi.renderLynxFirstScreen).toBeTypeOf('function');
		expect(mainRendererApi.firstScreenEvent).toBeTypeOf('symbol');
		expect(rootApi.createLynxRoot).toBeTypeOf('function');
		expect(rootApi.createLynxNativeResource).toBeTypeOf('function');
		expect(mainThreadApi.installLynxMainThread).toBeTypeOf('function');
		expect(platformApi.useInitData).toBeTypeOf('function');
		expect(platformApi.useGlobalProps).toBeTypeOf('function');
		expect(platformApi.getNativeModules).toBeTypeOf('function');
		expect(platformApi.reload).toBeTypeOf('function');
		expect(platformApi).not.toHaveProperty('getInitData');
		expect(testingApi.LynxTestingEnv).toBeTypeOf('function');
		expect(testingApi.installLynxTestingEnv).toBeTypeOf('function');
		expect(testingApi.uninstallLynxTestingEnv).toBeTypeOf('function');
		expect(testingApi.initElementTree).toBeTypeOf('function');
		expect(testingApi.GlobalEventEmitter).toBeTypeOf('function');
	});
});
