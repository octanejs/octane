import { createServerFn } from '@tanstack/react-start';
import { setResponseHeaders } from '@tanstack/react-start/server';
import { extent, scaleLinear } from 'd3';
import sponsorMetaData from '~/utils/gh-sponsor-meta.json';
import { fetchCached } from '~/utils/cache.server';

export type SponsorMeta = {
	login: string;
	name?: string;
	imageUrl?: string;
	linkUrl?: string;
	private?: boolean;
	amount?: number;
};

export type Sponsor = {
	login: string;
	name: string;
	imageUrl: string;
	linkUrl: string;
	private: boolean;
	amount: number;
	createdAt: string;
};

type DisplaySponsor = {
	linkUrl: string;
	login: string;
	imageUrl: string;
	name: string;
	size: number;
};

const sponsorMaintainerLogin = 'tannerlinsley';

export const getSponsorsForSponsorPack = createServerFn({
	method: 'GET',
}).handler(async (): Promise<Array<DisplaySponsor>> => {
	const sponsors = await fetchCached({
		key: 'sponsors',
		ttl: 60 * 1000,
		fn: getSponsors,
	});

	setResponseHeaders(
		new Headers({
			'Cache-Control': 'public, max-age=0, must-revalidate',
			'Cloudflare-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
		}),
	);

	const amountExtent = extent(sponsors, (d) => d.amount) as [number, number];
	const scale = scaleLinear().domain(amountExtent).range([0, 1]);

	return sponsors
		.filter((d) => !d.private)
		.map((d) => ({
			linkUrl: d.linkUrl,
			login: d.login,
			imageUrl: d.imageUrl,
			name: d.name,
			size: scale(d.amount),
		}));
});

async function getSponsors() {
	const [sponsors, sponsorsMeta] = await Promise.all([getGithubSponsors(), getSponsorsMeta()]);

	sponsorsMeta.forEach((sponsorMeta: SponsorMeta) => {
		const matchingSponsor = sponsors.find((d) => d.login == sponsorMeta.login);

		if (matchingSponsor) {
			Object.assign(matchingSponsor, {
				name: sponsorMeta.name ?? matchingSponsor.name,
				imageUrl: sponsorMeta.imageUrl ?? matchingSponsor.imageUrl,
				linkUrl: sponsorMeta.linkUrl ?? matchingSponsor.linkUrl,
				private: sponsorMeta.private ?? matchingSponsor.private,
			});
		} else if (sponsorMeta.amount) {
			sponsors.push({
				login: sponsorMeta.login,
				name: sponsorMeta.name || '',
				imageUrl: sponsorMeta.imageUrl || '',
				linkUrl: sponsorMeta.linkUrl || '',
				private: sponsorMeta.private || false,
				createdAt: new Date().toISOString(),
				amount: sponsorMeta.amount || 0,
			});
		}
	});

	sponsors.sort((a, b) => (b.amount || 0) - (a.amount || 0) || a.login.localeCompare(b.login));

	return sponsors;
}

async function getGithubSponsors() {
	// Bench delta: upstream pages GitHub's GraphQL sponsorships API (needs
	// GITHUB_AUTH_TOKEN, changes over time). The benchmark uses a fixed,
	// seed-free synthetic roster with the same shape and a similar size/amount
	// distribution; avatars are inline SVGs so no external image is fetched.
	const sponsors: Array<Sponsor> = [];
	const tiers = [500, 250, 100, 50, 25, 10, 5];

	for (let i = 0; i < 63; i++) {
		const login = `sponsor-${String(i + 1).padStart(2, '0')}`;
		const hue = (i * 47) % 360;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="hsl(${hue},60%,55%)"/></svg>`;

		sponsors.push({
			name: `Sponsor ${i + 1}`,
			login,
			amount: tiers[i % tiers.length],
			createdAt: '2026-01-01T00:00:00.000Z',
			private: false,
			imageUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
			linkUrl: `https://example.com/${login}`,
		});
	}

	return sponsors;
}

async function getSponsorsMeta() {
	return sponsorMetaData as Array<SponsorMeta>;
}
