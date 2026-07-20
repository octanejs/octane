import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as rootApi from '../src/index.js';
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

describe('@octanejs/lynx Milestone 4 public surface', () => {
	it('keeps every required package subpath private and addressable', () => {
		expect(packageJson.private).toBe(true);
		expect(packageJson.version).toBe('0.0.0');
		expect(Object.keys(packageJson.exports)).toEqual([
			'.',
			'./config',
			'./renderer',
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
			available: false,
			plannedMilestone: 5,
		});
		expect(rootApi.root.renderer).toBe('lynx');
		expect(rootApi.createLynxRoot).toBeTypeOf('function');
		expect(rootApi.createLynxNativeResource).toBeTypeOf('function');
		expect(mainThreadApi.installLynxMainThread).toBeTypeOf('function');
		expect(platformApi.useInitData).toBeTypeOf('function');
		expect(platformApi.useGlobalProps).toBeTypeOf('function');
		expect(platformApi.getNativeModules).toBeTypeOf('function');
		expect(platformApi.reload).toBeTypeOf('function');
		expect(platformApi).not.toHaveProperty('getInitData');
		expect(testingApi).not.toHaveProperty('createRoot');
	});
});
