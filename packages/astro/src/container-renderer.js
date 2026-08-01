/**
 * Renderer descriptor for Astro's container API (Content Layer / test harnesses).
 * Import from `@octanejs/astro/container-renderer`.
 *
 * @returns {{ name: string; clientEntrypoint: string; serverEntrypoint: string }}
 */
export function getContainerRenderer() {
	return {
		// Short name so Astro's `client:only="octane"` hint matches
		// (`name === hint` or `@astrojs/${hint}`). Integration package remains
		// `@octanejs/astro`.
		name: 'octane',
		clientEntrypoint: '@octanejs/astro/client.js',
		serverEntrypoint: '@octanejs/astro/server.js',
	};
}

/**
 * @returns {{ name: string; clientEntrypoint: string; serverEntrypoint: string }}
 */
export function getRenderer() {
	return getContainerRenderer();
}
