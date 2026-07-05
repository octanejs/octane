// `octane/compiler` is authored in JSDoc'd JS with no shipped declarations —
// a minimal ambient surface for the one entry point this package consumes.
declare module 'octane/compiler' {
	export function compile(
		source: string,
		id: string,
		options?: {
			mode?: 'client' | 'server';
			hmr?: boolean;
			dev?: boolean;
		},
	): { code: string; map: unknown };
}
