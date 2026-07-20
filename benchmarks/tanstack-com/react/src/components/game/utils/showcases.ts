// Showcase data fetching for the game
import type { ShowcaseSlim } from './islandGenerator';
import { getFeaturedShowcases } from '~/utils/showcase.functions';

// Fallback showcases in case fetch fails
const FALLBACK_SHOWCASES: ShowcaseSlim[] = [
	{
		id: 'fallback-1',
		name: 'TanStack Showcase',
		url: 'https://tanstack.com',
		screenshotUrl: '',
		tagline: 'Modern web development tools',
	},
	{
		id: 'fallback-2',
		name: 'Query Demo',
		url: 'https://tanstack.com/query',
		screenshotUrl: '',
		tagline: 'Powerful data synchronization',
	},
	{
		id: 'fallback-3',
		name: 'Router Demo',
		url: 'https://tanstack.com/router',
		screenshotUrl: '',
		tagline: 'Type-safe routing',
	},
	{
		id: 'fallback-4',
		name: 'Table Demo',
		url: 'https://tanstack.com/table',
		screenshotUrl: '',
		tagline: 'Headless table logic',
	},
	{
		id: 'fallback-5',
		name: 'Form Demo',
		url: 'https://tanstack.com/form',
		screenshotUrl: '',
		tagline: 'Type-safe forms',
	},
	{
		id: 'fallback-6',
		name: 'Virtual Demo',
		url: 'https://tanstack.com/virtual',
		screenshotUrl: '',
		tagline: 'Virtualized lists',
	},
];

// Fetch showcases from API and transform to game format
export async function fetchGameShowcases(): Promise<ShowcaseSlim[]> {
	try {
		const result = await getFeaturedShowcases({ data: { limit: 10 } });

		if (result.showcases.length === 0) {
			console.warn('[Game] No showcases returned, using fallbacks');
			return FALLBACK_SHOWCASES;
		}

		return result.showcases.map((item) => ({
			id: item.showcase.id,
			name: item.showcase.name,
			url: item.showcase.url,
			screenshotUrl: item.showcase.screenshotUrl,
			tagline: item.showcase.tagline,
		}));
	} catch (error) {
		console.error('[Game] Failed to fetch showcases, using fallbacks:', error);
		return FALLBACK_SHOWCASES;
	}
}
