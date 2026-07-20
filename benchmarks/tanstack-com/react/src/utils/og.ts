import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import type { LibraryId } from '~/libraries';
import { MAX_OG_DESCRIPTION_LENGTH, MAX_OG_TITLE_LENGTH, clampOgText } from './og-limits';
import { SITE_URL } from './site';

type OgImageOptions = {
	title?: string | null;
	description?: string | null;
};

/**
 * Absolute origin to use for og:image URLs.
 *
 * Unlike canonical links (which always point to production), og:image
 * URLs MUST be reachable on the same deploy that emitted them — social-
 * card validators fetch the URL from the meta tag verbatim, so on a
 * staging deploy the og:image must point at the preview origin, not at
 * production.
 *
 * The incoming request URL is the source of truth. Read the origin from the
 * live request via TanStack Start's `getRequest()`. The server import is
 * referenced only inside
 * `.server()`, which the start compiler treats as a client-safe boundary
 * — the import is tree-shaken from the client bundle.
 */
const getOgOrigin = createIsomorphicFn()
	.server((): string => {
		try {
			const request = getRequest();
			if (request?.url) return new URL(request.url).origin;
		} catch {
			// getRequest() throws if called outside an SSR request context.
		}
		return SITE_URL;
	})
	.client((): string => (typeof window !== 'undefined' ? window.location.origin : SITE_URL));

/**
 * Absolute URL for a package-themed OG image.
 * Defaults to the library's name + tagline. Pass a title/description
 * to override (used by docs pages).
 */
export function ogImageUrl(libraryId: LibraryId, options: OgImageOptions = {}): string {
	// Clamp client-side to the same limits as the server-side generator so
	// <meta og:image> URLs stay bounded and CDN cache keys stay stable.
	const params = new URLSearchParams();
	if (options.title) {
		params.set('title', clampOgText(options.title, MAX_OG_TITLE_LENGTH));
	}
	if (options.description) {
		params.set('description', clampOgText(options.description, MAX_OG_DESCRIPTION_LENGTH));
	}

	const qs = params.toString();
	const path = `/api/og/${libraryId}.png${qs ? `?${qs}` : ''}`;

	return `${getOgOrigin()}${path}`;
}
