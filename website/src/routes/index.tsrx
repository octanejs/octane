import { createFileRoute } from '@octanejs/tanstack-router';
import { Home } from '../pages/home/Home.tsrx';

export const Route = createFileRoute('/')({
	head: () => ({
		meta: [
			{ 'script:ld+json': {
				'@context': 'https://schema.org',
				'@type': 'WebSite',
				name: 'Octane',
				alternateName: ['OctaneJS', 'octanejs.dev'],
				url: 'https://octanejs.dev/',
			} },
		],
	}),
	component: Home,
});
