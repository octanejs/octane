// `octane/compiler` is authored in JSDoc'd JS with no shipped declarations —
// minimal ambient surface for the entry this app's config consumes (the same
// shape @octanejs/mdx declares locally in its own program; that sibling
// .d.ts isn't pulled in when packages/mdx/src is type-checked transitively
// from here, so the website program declares them itself).
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
