import { describe, expect, it } from 'vitest';
import { getOctaneRspackBuildInfo, inferRspackEnvironment } from '../src/index.js';
import { normalizeLoaderOptions, normalizePluginOptions } from '../src/shared.js';

describe('inferRspackEnvironment', () => {
	it.each([
		['web', 'client'],
		['webworker', 'client'],
		['electron-renderer', 'client'],
		['node', 'server'],
		['node22', 'server'],
		['async-node', 'server'],
		['electron-main', 'server'],
		[['es2022', 'node'], 'server'],
		[undefined, 'client'],
	] as const)('maps %j to %s', (target, expected) => {
		expect(inferRspackEnvironment(target)).toBe(expected);
	});
});

describe('declarative options', () => {
	it('copies and freezes loader option arrays', () => {
		const exclude = ['generated'];
		const options = normalizeLoaderOptions({ environment: 'client', exclude });
		exclude.push('later');
		expect(options).toEqual({ environment: 'client', exclude: ['generated'] });
		expect(Object.isFrozen(options)).toBe(true);
		expect(Object.isFrozen(options.exclude)).toBe(true);
	});

	it('accepts the plugin-only transpile switch', () => {
		expect(normalizePluginOptions({ transpile: false })).toEqual({ transpile: false });
		expect(() => normalizeLoaderOptions({ transpile: false })).toThrow(
			/unknown option `transpile`/,
		);
	});

	it('accepts and copies the declarative profiling switch', () => {
		expect(normalizePluginOptions({ profile: true })).toEqual({ profile: true });
		expect(normalizeLoaderOptions({ profile: false })).toEqual({ profile: false });
	});

	it.each([
		[{ environment: 'worker' }, /environment/],
		[{ hmr: 'webpack' }, /hmr/],
		[{ profile: 'yes' }, /profile/],
		[{ exclude: 'vendor' }, /exclude/],
		[{ transform: () => {} }, /unknown option/],
	] as const)('rejects invalid options %#', (value, message) => {
		expect(() => normalizePluginOptions(value)).toThrow(message);
	});
});

describe('getOctaneRspackBuildInfo', () => {
	it('returns only a complete serializable record', () => {
		const value = {
			canonicalId: '/src/App.tsrx',
			transformKind: 'compile' as const,
			serverRpc: true,
		};
		expect(getOctaneRspackBuildInfo({ buildInfo: { octane: value } })).toBe(value);
		expect(
			getOctaneRspackBuildInfo({ buildInfo: { octane: { ...value, serverRpc: 'yes' } } }),
		).toBeNull();
		expect(getOctaneRspackBuildInfo(null)).toBeNull();
	});
});
