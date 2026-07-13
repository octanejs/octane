// Vendored from react-router@8.2.0 packages/react-router/lib/server-runtime/mode.ts — unmodified.
// Re-vendor with `node scripts/vendor-remix-router.mjs`; never hand-edit.
/**
 * The mode to use when running the server.
 */
export enum ServerMode {
	Development = 'development',
	Production = 'production',
	Test = 'test',
}

export function isServerMode(value: any): value is ServerMode {
	return (
		value === ServerMode.Development || value === ServerMode.Production || value === ServerMode.Test
	);
}
