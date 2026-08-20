import { createElement, Fragment, type OctaneNode } from 'octane';
import { Head } from '@octanejs/unhead';

// Per packages/unhead/upstream/canonical/test/fixtures/SimpleHead.tsx
export function SimpleHead(): OctaneNode {
	return createElement(Fragment, {
		children: [
			createElement(Head, {
				children: [
					createElement('title', { 'data-tagPriority': 'high' }, 'Default Title'),
					createElement('meta', { name: 'description', content: 'Default Description' }),
					createElement('link', { rel: 'stylesheet', href: 'default-styles.css' }),
					createElement('meta', {
						name: 'viewport',
						content: 'width=device-width, initial-scale=1',
					}),
					createElement('meta', {
						httpEquiv: 'Content-Security-Policy',
						content: "default-src 'self'",
					}),
					createElement('link', { rel: 'icon', href: 'favicon.ico' }),
					createElement('link', {
						rel: 'preload',
						href: 'https://example.com/font.woff2',
						as: 'font',
						type: 'font/woff2',
					}),
					createElement('link', { rel: 'dns-prefetch', href: '//example.com' }),
					createElement('link', { rel: 'prefetch', href: 'https://example.com/next-page' }),
					createElement('link', { rel: 'prerender', href: 'https://example.com/next-page' }),
					createElement(
						'script',
						{ type: 'application/ld+json' },
						JSON.stringify({
							'@context': 'https://schema.org',
							'@type': 'WebSite',
							name: 'Example',
							url: 'https://www.example.com',
						}),
					),
					createElement('script', { type: 'module', src: 'https://example.com/module.js' }),
					createElement('script', { noModule: true, src: 'https://example.com/nomodule.js' }),
					createElement('script', { async: true, src: 'https://example.com/async-script.js' }),
					createElement('script', { defer: true, src: 'https://example.com/defer-script.js' }),
					createElement('style', null, 'body { background-color: #f0f0f0; }'),
				],
			}),
			createElement(Head, {
				children: createElement('title', null, 'Default Title 2'),
			}),
		],
	});
}
