export declare function withAssetsFallthrough(
	fetch: (...args: unknown[]) => Promise<Response>,
): (...args: unknown[]) => Promise<Response>;
