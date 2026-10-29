// The adapted lane: Octane and this binding, reached through its package exports.
import * as Octane from 'octane';
import * as OctaneServer from 'octane/server';
import * as Shim from '@octanejs/use-sync-external-store/shim';
import * as ShimNative from '@octanejs/use-sync-external-store/shim/index.native';
import * as ShimWithSelector from '@octanejs/use-sync-external-store/shim/with-selector';
import { createUpstreamHarness } from './harness.ts';

export const { __DEV__, gate, jest, require } = createUpstreamHarness({
	modules: {
		octane: () => Octane,
		'octane/server': () => OctaneServer,
		'@octanejs/use-sync-external-store/shim': () => Shim,
		'@octanejs/use-sync-external-store/shim/index.native': () => ShimNative,
		'@octanejs/use-sync-external-store/shim/with-selector': () => ShimWithSelector,
	},
	act: (callback) => Octane.act(callback),
	createRoot: (container) => Octane.createRoot(container),
	batchedUpdates: Octane.unstable_batchedUpdates,
});
