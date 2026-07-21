import { createFileRoute } from '@octanejs/tanstack-router';
import { setResponseHeader } from '@octanejs/tanstack-start/server';
import { generateRobotsTxt, getSiteOrigin } from '~/utils/sitemap';

export const Route = createFileRoute('/robots.txt')({
	server: {
		handlers: {
			GET: async () => {
				const content = generateRobotsTxt(getSiteOrigin());

				setResponseHeader('Content-Type', 'text/plain; charset=utf-8');
				setResponseHeader('Cache-Control', 'public, max-age=300, must-revalidate');
				setResponseHeader(
					'Cloudflare-CDN-Cache-Control',
					'public, max-age=3600, stale-while-revalidate=3600',
				);

				return new Response(content);
			},
		},
	},
});
