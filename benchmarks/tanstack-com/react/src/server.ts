// Bench server entry. Upstream (src/server.upstream.ts.txt) wraps the Start
// handler in Sentry, request diagnostics, a database ALS context, a Google
// Analytics proxy, and a Workers `scheduled` cron export. None of that is app
// rendering; all of it is removed for the benchmark. What IS kept — because it
// shapes responses the correctness gate compares — is the security headers and
// the docs markdown content negotiation.
import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import { docsContentNegotiationVaryHeader } from '~/utils/http';

const SECURITY_HEADERS = {
	'X-Frame-Options': 'DENY',
	'X-Content-Type-Options': 'nosniff',
	'X-XSS-Protection': '1; mode=block',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
} as const;

const STATIC_RESPONSE_LINK_HEADERS = {
	filter: ({ phase }: { phase: 'static' | 'dynamic' }) => phase === 'static',
};

function isBrowserDocumentRequest(request: Request) {
	return (
		request.headers.get('Sec-Fetch-Dest') === 'document' ||
		request.headers.get('Sec-Fetch-Mode') === 'navigate'
	);
}

function shouldRewriteDocsRequestToMarkdown(request: Request, url: URL) {
	const acceptHeader = request.headers.get('Accept') || '';

	return (
		acceptHeader.includes('text/markdown') &&
		url.pathname.includes('/docs/') &&
		!url.pathname.endsWith('.md') &&
		!isBrowserDocumentRequest(request)
	);
}

function applyHostingHeaders(response: Response, url: URL) {
	const headers = new Headers(response.headers);

	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		headers.set(key, value);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

const server = createServerEntry({
	async fetch(request) {
		const url = new URL(request.url);

		if (shouldRewriteDocsRequestToMarkdown(request, url)) {
			const mdUrl = new URL(request.url);
			mdUrl.pathname = `${url.pathname}.md`;
			const mdRequest = new Request(mdUrl, request);
			const mdResponse = await handler.fetch(mdRequest);
			const markdownHeaders = new Headers(mdResponse.headers);
			markdownHeaders.set('Vary', docsContentNegotiationVaryHeader);

			const markdownResponse = new Response(mdResponse.body, {
				status: mdResponse.status,
				statusText: mdResponse.statusText,
				headers: markdownHeaders,
			});

			return applyHostingHeaders(markdownResponse, url);
		}

		const response = await handler.fetch(request, {
			responseLinkHeader: STATIC_RESPONSE_LINK_HEADERS,
		});
		return applyHostingHeaders(response, url);
	},
});

export default server;
