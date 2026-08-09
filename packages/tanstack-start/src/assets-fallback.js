// The stream handler answers requests it does not own with a 404 Response.
// On Cloudflare, the client bundle and other static assets live in the
// `ASSETS` binding, so hand 404s to `env.ASSETS.fetch` before giving up.
// Platforms without an assets binding receive the original 404.
export function withAssetsFallthrough(fetch) {
	return async (...args) => {
		const response = await fetch(...args);
		if (response.status !== 404) {
			return response;
		}
		const request = args[0];
		const env = args[1] ?? {};
		if (env.ASSETS) {
			return env.ASSETS.fetch(request);
		}
		return response;
	};
}
