/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.upstream file in the root directory of this package.
 */

// Adapted from use-sync-external-store@1.7.0 src/useSyncExternalStore.js: the
// main entry point re-exports the framework's built-in hook and warns once, at
// module load in development, that it is not the supported entry point.
//
// Declared locally so consumers need no Node types; bundlers replace it.
declare const process: { env: { NODE_ENV?: string } };

export { useSyncExternalStore } from 'octane';

if (process.env.NODE_ENV !== 'production') {
	console['error'](
		"The main '@octanejs/use-sync-external-store' entry point is not supported; " +
			"all it does is re-export useSyncExternalStore from the 'octane' package." +
			'\n\n' +
			"Import from '@octanejs/use-sync-external-store/shim' instead, or import " +
			"useSyncExternalStore from 'octane' directly.",
	);
}
