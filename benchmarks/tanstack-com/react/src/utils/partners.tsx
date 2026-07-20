import agGridDarkSvg from '~/images/ag-grid-dark.svg';
import agGridLightSvg from '~/images/ag-grid-light.svg';
import nozzleImage from '~/images/nozzle.png';
import bytesFireshipImage from '~/images/bytes-fireship.png';
import vercelLightSvg from '~/images/vercel-light.svg';
import vercelDarkSvg from '~/images/vercel-dark.svg';
import netlifyLightSvg from '~/images/netlify-light.svg';
import netlifyDarkSvg from '~/images/netlify-dark.svg';
import lovableBlackSvg from '~/images/lovable-black.svg';
import lovableWhiteSvg from '~/images/lovable-white.svg';
import convexWhiteSvg from '~/images/convex-white.svg';
import convexColorSvg from '~/images/convex-color.svg';
import clerkLightSvg from '~/images/clerk-logo-light.svg';
import clerkDarkSvg from '~/images/clerk-logo-dark.svg';
import sentryWordMarkLightSvg from '~/images/sentry-wordmark-light.svg';
import sentryWordMarkDarkSvg from '~/images/sentry-wordmark-dark.svg';
import speakeasyLightSvg from '~/images/speakeasy-light.svg';
import speakeasyDarkSvg from '~/images/speakeasy-dark.svg';
import neonLightSvg from '~/images/neon-light.svg';
import neonDarkSvg from '~/images/neon-dark.svg';
import unkeyBlackSvg from '~/images/unkey-black.svg';
import unkeyWhiteSvg from '~/images/unkey-white.svg';
import electricDarkSvg from '~/images/electric-dark.svg';
import electricLightSvg from '~/images/electric-light.svg';
import prismaLightSvg from '~/images/prisma-light.svg';
import prismaDarkSvg from '~/images/prisma-dark.svg';
import codeRabbitLightSvg from '~/images/coderabbit-light.svg';
import codeRabbitDarkSvg from '~/images/coderabbit-dark.svg';
import strapiLightSvg from '~/images/strapi-light.svg';
import strapiDarkSvg from '~/images/strapi-dark.svg';
import serpapiWhiteSvg from '~/images/serpapi-white.svg';
import serpapiBlackSvg from '~/images/serpapi-black.svg';
import { libraries, type Library } from '~/libraries';
import cloudflareWhiteSvg from '~/images/cloudflare-white.svg';
import cloudflareBlackSvg from '~/images/cloudflare-black.svg';
import workosBlackSvg from '~/images/workos-black.svg';
import workosWhiteSvg from '~/images/workos-white.svg';
import powersyncBlackSvg from '~/images/powersync-black.svg';
import powersyncWhiteSvg from '~/images/powersync-white.svg';
import railwayBlackSvg from '~/images/railway-black.svg';
import railwayWhiteSvg from '~/images/railway-white.svg';
import openrouterBlackSvg from '~/images/openrouter-black.svg';
import openrouterWhiteSvg from '~/images/openrouter-white.svg';
import {
	getPartnerPlacementContext,
	getPartnersForPlacement,
	type PartnerPlacementContext,
} from '~/utils/partner-placement';

function LearnMoreButton() {
	return <span className="text-blue-500 uppercase font-black text-sm">Learn More</span>;
}

type PartnerImageConfig =
	| { light: string; dark: string; scale?: number }
	| { src: string; scale?: number };

type PartnerApplicationStarterIcon = {
	mode: 'contain' | 'left-crop';
	src: string;
};

type ApplicationStarterPartnerTier = 1 | 2 | 3;

export const partnerUniqueConstraints = ['auth-provider', 'hosting'] as const;
export type PartnerUniqueConstraint = (typeof partnerUniqueConstraints)[number];

export const partnerTiers = ['gold', 'silver', 'bronze'] as const;
export type PartnerTier = (typeof partnerTiers)[number];

export const partnerTierLabels: Record<PartnerTier, string> = {
	gold: 'Gold',
	silver: 'Silver',
	bronze: 'Bronze',
};

export const partnerTierOrder: Record<PartnerTier, number> = {
	gold: 0,
	silver: 1,
	bronze: 2,
};

const partnerTierToBuilderTier: Record<PartnerTier, ApplicationStarterPartnerTier> = {
	gold: 1,
	silver: 2,
	bronze: 3,
};

export const partnerTierFlares: Record<
	PartnerTier,
	{
		gradientStops: string;
		iconColor: string;
		labelColor: string;
		icon: React.ReactNode;
	}
> = {
	gold: {
		gradientStops:
			'from-yellow-400 via-amber-500 to-orange-600 dark:from-yellow-300 dark:via-amber-400 dark:to-orange-400',
		iconColor: 'text-amber-500 dark:text-amber-300',
		labelColor: 'text-amber-600 dark:text-amber-300',
		// 5-point star
		icon: (
			<svg viewBox="0 0 12 12" className="h-3 w-3 fill-current" aria-hidden>
				<path d="M6 0.5 L7.5 4.2 L11.5 4.6 L8.5 7.2 L9.4 11.2 L6 9.2 L2.6 11.2 L3.5 7.2 L0.5 4.6 L4.5 4.2 Z" />
			</svg>
		),
	},
	silver: {
		gradientStops:
			'from-slate-200 via-zinc-400 to-slate-300 dark:from-slate-300 dark:via-zinc-400 dark:to-slate-400',
		iconColor: 'text-slate-400 dark:text-slate-300',
		labelColor: 'text-slate-500 dark:text-slate-300',
		// 4-point sparkle
		icon: (
			<svg viewBox="0 0 12 12" className="h-3 w-3 fill-current" aria-hidden>
				<path d="M6 0 L7.2 4.8 L12 6 L7.2 7.2 L6 12 L4.8 7.2 L0 6 L4.8 4.8 Z" />
			</svg>
		),
	},
	bronze: {
		gradientStops:
			'from-amber-700 via-amber-800 to-amber-950 dark:from-amber-600 dark:via-amber-800 dark:to-amber-950',
		iconColor: 'text-amber-800 dark:text-amber-600',
		labelColor: 'text-amber-800 dark:text-amber-600',
		// diamond
		icon: (
			<svg viewBox="0 0 12 12" className="h-3 w-3 fill-current" aria-hidden>
				<path d="M6 0.5 L11.5 6 L6 11.5 L0.5 6 Z" />
			</svg>
		),
	},
};

export function PartnerImage({
	className,
	config,
	alt,
}: {
	className?: string;
	config: PartnerImageConfig;
	alt: string;
}) {
	const scaleStyle = config.scale ? { transform: `scale(${config.scale})` } : {};

	if ('light' in config && 'dark' in config) {
		return (
			<div className="w-full flex items-center justify-center" style={scaleStyle}>
				<img
					src={config.light}
					alt={alt}
					loading="lazy"
					className={className ? `${className} dark:hidden` : 'w-full dark:hidden'}
					width={200}
					height={100}
					sizes="(max-width: 640px) 80px, (max-width: 1024px) 150px, 200px"
				/>
				<img
					src={config.dark}
					alt={alt}
					loading="lazy"
					className={className ? `${className} hidden dark:block` : 'w-full hidden dark:block'}
					width={200}
					height={100}
					sizes="(max-width: 640px) 80px, (max-width: 1024px) 150px, 200px"
				/>
			</div>
		);
	}

	return (
		<div className="w-full flex items-center justify-center" style={scaleStyle}>
			<img
				src={config.src}
				alt={alt}
				className={className ?? 'w-full'}
				width={200}
				height={100}
				loading="lazy"
				sizes="(max-width: 640px) 80px, (max-width: 1024px) 150px, 200px"
			/>
		</div>
	);
}

export const partnerCategories = [
	'code-review',
	'deployment',
	'data-grid',
	'auth',
	'database',
	'monitoring',
	'cms',
	'api',
	'ai',
	'learning',
] as const;

type PartnerCategory = (typeof partnerCategories)[number];

export const partnerCategoryLabels: Record<PartnerCategory, string> = {
	'code-review': 'Code Review',
	deployment: 'Deployment/Hosting',
	'data-grid': 'Data Grids',
	auth: 'Authentication',
	database: 'Databases',
	monitoring: 'Error Monitoring',
	cms: 'CMS',
	api: 'API Management',
	ai: 'AI/LLM',
	learning: 'Learning Resources',
};

export type Partner = {
	applicationStarterPromptInstructions?: Array<string>;
	name: string;
	id: string;
	libraries?: Library['id'][];
	href: string;
	applicationStarterIcon?: PartnerApplicationStarterIcon;
	image: PartnerImageConfig;
	content: JSX.Element;
	llmDescription: string;
	category: PartnerCategory;
	status?: 'active' | 'inactive';
	startDate?: string;
	endDate?: string;
	score: number;
	uniqueConstraints?: Array<PartnerUniqueConstraint>;
	tier?: PartnerTier;
	brandColor?: string; // Primary brand color for game elements
	tagline?: string; // Short tagline for game info cards
};

export type ApplicationStarterPartnerSuggestion = {
	brandColor?: Partner['brandColor'];
	description: string;
	hint: string;
	iconMode?: 'contain' | 'left-crop';
	id: string;
	iconSrc?: string;
	image: Partner['image'];
	label: string;
	tags: Array<string>;
	tier: ApplicationStarterPartnerTier;
	uniqueConstraints: Array<PartnerUniqueConstraint>;
};

const APPLICATION_STARTER_GUIDANCE_MARKER = 'Starter guidance:';
const APPLICATION_STARTER_SELECTED_PARTNERS_MARKER = 'Selected partner ids:';
const APPLICATION_STARTER_INFERRED_PARTNERS_MARKER = 'Inferred partner ids:';
const APPLICATION_STARTER_FORCE_ROUTER_ONLY_MARKER = 'Force router-only: true';

export function getApplicationStarterUserBrief(input: string) {
	const [brief] = input.split(`\n\n${APPLICATION_STARTER_GUIDANCE_MARKER}\n`);
	return brief?.trim() ?? '';
}

export function getApplicationStarterGuidanceLines(input: string) {
	const [, guidance] = input.split(`\n\n${APPLICATION_STARTER_GUIDANCE_MARKER}\n`);

	if (!guidance) {
		return [];
	}

	return guidance
		.split('\n')
		.map((line) => line.trim())
		.filter(
			(line) =>
				!line.startsWith(APPLICATION_STARTER_SELECTED_PARTNERS_MARKER) &&
				!line.startsWith(APPLICATION_STARTER_INFERRED_PARTNERS_MARKER) &&
				line !== APPLICATION_STARTER_FORCE_ROUTER_ONLY_MARKER,
		)
		.filter(Boolean);
}

export function getApplicationStarterForceRouterOnly(input: string) {
	return input.includes(APPLICATION_STARTER_FORCE_ROUTER_ONLY_MARKER);
}

function extractApplicationStarterPartnerIdsFromMarker({
	input,
	marker,
}: {
	input: string;
	marker: string;
}) {
	const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`${escapedMarker}\\s*([^\\n]+)`, 'i');
	const value = input.match(pattern)?.[1]?.trim();

	if (!value) {
		return [];
	}

	return value
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
}

export function getApplicationStarterSelectedPartnerIds(input: string) {
	return extractApplicationStarterPartnerIdsFromMarker({
		input,
		marker: APPLICATION_STARTER_SELECTED_PARTNERS_MARKER,
	});
}

export function getApplicationStarterInferredPartnerIds(input: string) {
	return extractApplicationStarterPartnerIdsFromMarker({
		input,
		marker: APPLICATION_STARTER_INFERRED_PARTNERS_MARKER,
	});
}

const neon = (() => {
	const href = 'https://neon.tech?utm_source=tanstack';

	return {
		name: 'Neon',
		id: 'neon',
		libraries: ['start', 'router'],
		status: 'inactive' as const,
		endDate: 'Apr 2026',
		score: 0.297,
		href,
		brandColor: '#00E599',
		tagline: 'Serverless Postgres',
		image: {
			light: neonLightSvg,
			dark: neonDarkSvg,
		},
		llmDescription:
			'Serverless Postgres platform with branching, autoscaling compute, and separate storage and compute. Neon also publishes a TanStack Start setup prompt and docs for getting TanStack apps running on Postgres quickly.',
		category: 'database',
		content: (
			<>
				<div className="text-xs">
					Neon provides <strong>serverless Postgres</strong> with branching, autoscaling compute,
					and separate storage and compute. That makes it especially useful for preview
					environments, branch-based workflows, and fast iteration with TanStack Start.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const convex = (() => {
	const href = 'https://convex.dev?utm_source=tanstack';

	return {
		name: 'Convex',
		id: 'convex',
		libraries: ['start', 'router'],
		status: 'inactive' as const,
		startDate: 'May 2024',
		endDate: 'Mar 2026',
		score: 0.286,
		href,
		brandColor: '#F3A712',
		tagline: 'Real-time Database',
		image: {
			light: convexColorSvg,
			dark: convexWhiteSvg,
		},
		llmDescription:
			'Reactive backend platform with a document database, relational data model, TypeScript functions, and realtime query updates. Convex also has an official TanStack Start quickstart.',
		category: 'database',
		content: (
			<>
				<div className="text-xs">
					Convex provides a <strong>reactive backend</strong> with TypeScript queries, mutations,
					and realtime updates to clients. For TanStack apps, it is a useful option when you want
					live data behavior without wiring your own sync layer by hand.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const clerk = (() => {
	const href = 'https://go.clerk.com/wOwHtuJ';

	return {
		name: 'Clerk',
		id: 'clerk',
		href,
		libraries: ['start', 'router'],
		status: 'active' as const,
		score: 0.286,
		tier: 'silver' as const,
		uniqueConstraints: ['auth-provider'] satisfies Array<PartnerUniqueConstraint>,
		brandColor: '#6C47FF',
		tagline: 'Authentication',
		image: {
			light: clerkLightSvg,
			dark: clerkDarkSvg,
			scale: 0.72,
		},
		llmDescription:
			'Authentication and user management platform with prebuilt UI, sessions, organizations, and MFA. Clerk has official SDKs and quickstarts for TanStack React Start and React Router.',
		category: 'auth',
		content: (
			<>
				<div className="text-xs">
					Clerk provides <strong>authentication and user management</strong>
					with prebuilt UI, sessions, organizations, and MFA. It also publishes official guides for{' '}
					<strong>TanStack React Start and React Router</strong>, which makes integration
					straightforward.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const workos = (() => {
	const href = 'https://workos.com?utm_source=tanstack';

	return {
		name: 'WorkOS',
		id: 'workos',
		href,
		libraries: ['start', 'router'] as const,
		status: 'active' as const,
		score: 0.314,
		tier: 'silver' as const,
		uniqueConstraints: ['auth-provider'] satisfies Array<PartnerUniqueConstraint>,
		brandColor: '#6363F1',
		tagline: 'Enterprise Auth',
		applicationStarterIcon: {
			mode: 'left-crop',
			src: workosBlackSvg,
		},
		image: {
			light: workosBlackSvg,
			dark: workosWhiteSvg,
		},
		llmDescription:
			'Enterprise identity platform with SSO, Directory Sync, MFA for AuthKit, RBAC, audit logs, and admin onboarding tools. It is a strong fit for B2B apps that need enterprise auth features.',
		category: 'auth',
		content: (
			<>
				<div className="text-xs">
					WorkOS focuses on <strong>enterprise identity</strong> features like SSO, Directory Sync,
					RBAC, audit logs, and admin onboarding, plus MFA in AuthKit. That makes it a practical fit
					for B2B TanStack apps with organization-level access requirements.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const agGrid = (() => {
	const href =
		'https://ag-grid.com/react-data-grid/?utm_source=reacttable&utm_campaign=githubreacttable';

	return {
		name: 'AG Grid',
		id: 'ag-grid',
		libraries: ['table'] as const,
		status: 'active' as const,
		score: 0.497,
		tier: 'silver' as const,
		href,
		brandColor: '#FF8C00',
		tagline: 'Enterprise Data Grid',
		applicationStarterIcon: {
			mode: 'contain',
			src: 'https://www.ag-grid.com/_astro/favicon-32.WDuB-104.png',
		},
		applicationStarterPromptInstructions: [
			'Install ag-grid-react and ag-grid-community and use AG Grid Community by default for a real working demo.',
			'Only add ag-grid-enterprise if a license key is explicitly provided or explicitly requested.',
			'Render a real grid with explicit columns, row data, and a container height so the integration is visibly demonstrated in the app.',
		],
		image: {
			light: agGridDarkSvg,
			dark: agGridLightSvg,
			scale: 1.1,
		},
		llmDescription:
			'Data grid library with Community and Enterprise editions. Enterprise features include row grouping, pivoting, aggregation, Excel export, integrated charts, and the server-side row model.',
		category: 'data-grid',
		content: (
			<>
				<div className="text-xs">
					AG Grid covers the heavier end of the grid spectrum. Its
					<strong> Enterprise</strong> offering adds row grouping, pivoting, aggregation, Excel
					export, integrated charts, and a server-side row model when a basic table UI is not
					enough.
				</div>
				{/* Has to be button for separate link than parent anchor to be valid HTML */}
				<button
					type="button"
					onClick={() => {
						window.location.href = '/blog/ag-grid-partnership';
					}}
					className="text-blue-500 uppercase font-black text-sm"
				>
					Learn More
				</button>
			</>
		),
	};
})();

const netlify = (() => {
	const href = 'https://netlify.com?utm_source=tanstack';

	return {
		name: 'Netlify',
		id: 'netlify',
		libraries: ['start', 'router'],
		status: 'active' as const,
		score: 0.343,
		tier: 'gold' as const,
		uniqueConstraints: ['hosting'] satisfies Array<PartnerUniqueConstraint>,
		href,
		brandColor: '#00C7B7',
		tagline: 'Web Deployment',
		applicationStarterIcon: {
			mode: 'contain',
			src: 'https://www.netlify.com/favicon/icon.svg',
		},
		image: {
			light: netlifyLightSvg,
			dark: netlifyDarkSvg,
			scale: 1.25,
		},
		llmDescription:
			'Deployment platform for web applications with Deploy Previews, Functions, Edge Functions, and an official TanStack Start integration guide.',
		category: 'deployment',
		content: (
			<>
				<div className="text-xs">
					Netlify provides <strong>Deploy Previews</strong>, Functions, Edge Functions, and a
					concrete TanStack Start integration path. That makes it useful when the deployment
					workflow is part of the product workflow, not an afterthought.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const cloudflare = (() => {
	const href = 'https://www.cloudflare.com?utm_source=tanstack';

	return {
		name: 'Cloudflare',
		id: 'cloudflare',
		href,
		// Show on every repo
		libraries: libraries.map((l) => l.id),
		status: 'active' as const,
		score: 0.857,
		tier: 'gold' as const,
		uniqueConstraints: ['hosting'] satisfies Array<PartnerUniqueConstraint>,
		startDate: 'Sep 2025',
		brandColor: '#F6821F',
		tagline: 'Edge Deployment',
		image: {
			light: cloudflareBlackSvg,
			dark: cloudflareWhiteSvg,
		},
		llmDescription:
			'Global network and developer platform with Workers, KV, CDN, and security services. Cloudflare also documents deploying TanStack Start apps on Workers.',
		category: 'deployment',
		content: (
			<>
				<div className="text-xs">
					Cloudflare combines <strong>Workers</strong>, KV, CDN, and security services on a global
					network. It also documents deploying TanStack Start apps on Workers, including bindings
					and prerendering support.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const lovable = (() => {
	const href = 'https://lovable.dev?utm_source=tanstack';

	return {
		name: 'Lovable',
		id: 'lovable',
		href,
		libraries: ['start', 'router'] as const,
		status: 'active' as const,
		score: 0.714,
		tier: 'gold' as const,
		uniqueConstraints: ['hosting'] satisfies Array<PartnerUniqueConstraint>,
		brandColor: '#FF7EB0',
		tagline: 'AI App Builder',
		applicationStarterPromptInstructions: [
			'Treat Lovable as the AI app-building and hosting path, not as a TanStack CLI deployment flag or npm package.',
			'Keep the generated app portable: start with the TanStack CLI output, preserve GitHub/project ownership notes, and call out any Lovable Cloud setup that cannot be automated from code.',
			'When Lovable is selected, do not add a separate Cloudflare, Netlify, or Railway deployment target unless the user explicitly asks for a handoff path.',
		],
		image: {
			light: lovableBlackSvg,
			dark: lovableWhiteSvg,
		},
		llmDescription:
			'AI app-building platform for generating, editing, and shipping web apps from prompts, with GitHub sync, visual editing, Lovable Cloud hosting, and new TanStack Start-powered SSR projects.',
		category: 'ai',
		content: (
			<>
				<div className="text-xs">
					Lovable helps teams move from prompt to working app with{' '}
					<strong>AI-assisted building</strong>, visual editing, GitHub sync, and Lovable Cloud
					hosting. New Lovable projects are powered by TanStack Start, which makes it especially
					relevant for teams that want generated apps to keep strong routing, SSR, and type-safety
					foundations.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const sentry = (() => {
	const href = 'https://sentry.io?utm_source=tanstack';

	return {
		name: 'Sentry',
		id: 'sentry',
		libraries: ['start', 'router'],
		status: 'active' as const,
		score: 0.229,
		tier: 'bronze' as const,
		href,
		brandColor: '#362D59',
		tagline: 'Error Monitoring',
		image: {
			light: sentryWordMarkDarkSvg,
			dark: sentryWordMarkLightSvg,
		},
		llmDescription:
			'Application monitoring platform for error tracking, tracing, replay, profiling, and logs. It also offers TanStack Router integration and an alpha TanStack Start React SDK.',
		category: 'monitoring',
		content: (
			<>
				<div className="text-xs">
					Sentry goes beyond basic error collection with <strong>tracing</strong>, replay,
					profiling, and logs. For TanStack apps, that makes it easier to debug issues across client
					behavior, routing, and performance.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const fireship = (() => {
	const href = 'https://bytes.dev?utm_source-tanstack&utm_campaign=tanstack';

	return {
		name: 'Fireship',
		id: 'fireship',
		libraries: [],
		status: 'inactive' as const,
		score: 0.014,
		href,
		tagline: 'Dev Education',
		image: {
			src: bytesFireshipImage,
		},
		llmDescription:
			'Developer education brand behind Fireship courses and content, plus the Bytes JavaScript newsletter. Useful for staying current on web development and ecosystem trends.',
		category: 'learning',
		content: (
			<>
				<div className="text-xs">
					Fireship produces developer education and Bytes publishes a JavaScript newsletter.
					Together they are useful for helping more developers stay current on web tooling,
					patterns, and ecosystem changes. Learn more about{' '}
					{/* Has to be button for separate link than parent anchor to be valid HTML */}
					<button
						type="button"
						className="text-blue-500 underline cursor-pointer p-0 m-0 bg-transparent border-none inline"
						onClick={() =>
							window.open(
								'https://fireship.dev/?utm_source=tanstack&utm_campaign=tanstack',
								'_blank',
								'noopener,noreferrer',
							)
						}
						tabIndex={0}
					>
						Fireship
					</button>{' '}
					and{' '}
					<button
						type="button"
						className="text-blue-500 underline cursor-pointer p-0 m-0 bg-transparent border-none inline"
						onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
						tabIndex={0}
					>
						Bytes.dev
					</button>
					.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const nozzle = (() => {
	const href = 'https://nozzle.io/?utm_source=tanstack&utm_campaign=tanstack';

	return {
		name: 'Nozzle.io',
		id: 'nozzle',
		href,
		status: 'inactive' as const,
		score: 0.014,
		tagline: 'Enterprise SEO',
		image: {
			src: nozzleImage,
		},
		llmDescription:
			'Enterprise keyword rank tracking and SERP monitoring platform with large-scale SEO reporting, share-of-voice analysis, historical data, and export capabilities.',
		category: 'learning',
		content: (
			<>
				<div className="text-xs">
					Nozzle is an <strong>enterprise SEO</strong> product focused on rank tracking,
					share-of-voice reporting, historical SERP data, and large- scale exports. It remains
					relevant here because it represents a demanding, data-heavy product category with serious
					analytics needs.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const speakeasy = (() => {
	const href =
		'https://www.speakeasy.com/product/react-query?utm_source=tanstack&utm_campaign=tanstack';

	return {
		name: 'Speakeasy',
		id: 'speakeasy',
		href,
		libraries: ['query'] as const,
		status: 'inactive' as const,
		startDate: 'Feb 2025',
		endDate: 'Jul 2025',
		image: {
			light: speakeasyLightSvg,
			dark: speakeasyDarkSvg,
		},
		llmDescription:
			'API tooling focused on generating idiomatic SDKs, CLIs, Terraform providers, and hosted MCP servers from OpenAPI specs.',
		category: 'api',
		content: (
			<>
				<div className="text-xs">
					Speakeasy focuses on generating{' '}
					<strong>SDKs, CLIs, Terraform providers, and hosted MCP servers</strong> from OpenAPI
					specs. That is useful when TanStack frontends depend on well-generated client libraries
					instead of hand-maintained API code.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const unkey = (() => {
	const href = 'https://www.unkey.com/?utm_source=tanstack';

	return {
		name: 'Unkey',
		id: 'unkey',
		libraries: ['pacer'] as const,
		status: 'active' as const,
		score: 0.051,
		tier: 'bronze' as const,
		href,
		brandColor: '#222222',
		tagline: 'API Key Management',
		applicationStarterPromptInstructions: [
			'Use Unkey server-side only and never expose root keys or management credentials in client code.',
			'Choose one concrete integration path based on the app: API key verification with @unkey/api or endpoint rate limiting with @unkey/ratelimit.',
			'If the product need is unclear, prefer a minimal server-side TODO or example wrapper instead of inventing both paths at once.',
		],
		image: {
			light: unkeyBlackSvg,
			dark: unkeyWhiteSvg,
			scale: 0.7,
		},
		llmDescription:
			'API infrastructure for API key management, rate limiting, usage tracking, audit logs, and access controls.',
		category: 'api',
		content: (
			<>
				<div className="text-xs">
					Unkey provides <strong>API key management</strong>, rate limiting, usage tracking, audit
					logs, and access controls. That makes it a practical fit for TanStack-built products that
					expose APIs and need straightforward platform controls.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const serpApi = (() => {
	const href = 'https://serpapi.com?utm_source=tanstack';

	return {
		name: 'SerpApi',
		id: 'serpapi',
		libraries: libraries.map((l) => l.id),
		status: 'active' as const,
		score: 0.41,
		tier: 'silver' as const,
		href,
		brandColor: '#6361EC',
		tagline: 'Real-time SERP API',
		applicationStarterPromptInstructions: [
			'Install the official serpapi package and keep all SerpApi usage server-side behind an app-owned endpoint or server function.',
			'Read SERPAPI_API_KEY from environment variables and choose one explicit search engine instead of pretending to support every engine at once.',
			'Normalize the response into app-owned data types before sending it to the UI.',
		],
		image: {
			light: serpapiBlackSvg,
			dark: serpapiWhiteSvg,
			scale: 0.92,
		},
		llmDescription:
			'Search engine results API with structured JSON output, geo-targeting controls, CAPTCHA solving, and support for Google, Maps, Shopping, News, and other engines.',
		category: 'api',
		content: (
			<>
				<div className="text-xs">
					SerpApi handles search-engine access and returns structured results for Google and other
					engines, with <strong>geo-targeting</strong>, proxies, and CAPTCHA solving handled for
					you. That is useful for SEO products, search intelligence, and AI workflows built with
					TanStack.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const electric = (() => {
	const href = 'https://electric-sql.com';

	return {
		name: 'Electric',
		id: 'electric',
		libraries: ['db'] as const,
		status: 'active' as const,
		score: 0.283,
		tier: 'bronze' as const,
		href,
		brandColor: '#7e78db',
		tagline: 'Sync Engine',
		applicationStarterPromptInstructions: [
			'Treat Electric as a platform-level integration, not a small drop-in add-on.',
			'Do not hand-roll full sync plumbing unless the prompt explicitly asks for that; prefer clear setup notes or TODOs that point to the official Electric starter path.',
			'If you demonstrate Electric at all, keep it to thin scaffolding and make missing local tooling or service setup explicit.',
		],
		image: {
			light: electricLightSvg,
			dark: electricDarkSvg,
		},
		llmDescription:
			'Sync-focused data platform for Postgres-backed apps, including Postgres Sync and the partnered TanStack DB project. It is built for reactive and collaborative applications that need live data sync.',
		category: 'database',
		content: (
			<>
				<div className="text-xs">
					Electric is focused on <strong>sync and reactive data delivery</strong>
					for Postgres-backed apps, including Postgres Sync and its work with TanStack DB. It is
					especially relevant for collaborative or local- first apps where live data movement is
					part of the core product.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const vercel = (() => {
	const href = 'https://vercel.com?utm_source=tanstack';

	return {
		name: 'Vercel',
		id: 'vercel',
		href,
		libraries: ['start', 'router'] as const,
		status: 'inactive' as const,
		startDate: 'May 2024',
		endDate: 'Oct 2024',
		uniqueConstraints: ['hosting'] satisfies Array<PartnerUniqueConstraint>,
		image: {
			light: vercelLightSvg,
			dark: vercelDarkSvg,
		},
		llmDescription:
			'Cloud platform for deploying and scaling web applications with Git-based workflows, preview environments, global delivery, and Vercel Functions.',
		category: 'deployment',
		content: (
			<>
				<div className="text-xs">
					Vercel provides <strong>Git-based deployments</strong>, preview environments, global
					delivery, and server-side compute through Vercel Functions. That makes it a familiar
					deployment option for TanStack Start and Router teams building full-stack apps.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const prisma = (() => {
	const href = 'https://www.prisma.io/?utm_source=tanstack&via=tanstack';

	return {
		name: 'Prisma',
		id: 'prisma',
		href,
		status: 'active' as const,
		libraries: ['db', 'start'] as const,
		startDate: 'Aug 2025',
		score: 0.143,
		tier: 'bronze' as const,
		brandColor: '#2D3748',
		tagline: 'Database ORM',
		image: {
			light: prismaLightSvg,
			dark: prismaDarkSvg,
		},
		llmDescription:
			'Open-source TypeScript ORM with Prisma Client, migrations, Prisma Studio, and Prisma Postgres for managed PostgreSQL.',
		category: 'database',
		content: (
			<>
				<div className="text-xs">
					Prisma combines <strong>type-safe database access</strong>, migrations, Prisma Studio, and
					Prisma Postgres into one workflow. It also publishes a TanStack Start guide, which makes
					it a practical option for full-stack apps that want a polished database layer.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const codeRabbit = (() => {
	const href = 'https://coderabbit.link/tanstack?utm_source=tanstack&via=tanstack';

	return {
		name: 'CodeRabbit',
		id: 'coderabbit',
		href,
		status: 'active' as const,
		libraries: libraries.map((l) => l.id),
		startDate: 'Aug 2025',
		score: 1,
		tier: 'gold' as const,
		brandColor: '#FF6B2B',
		tagline: 'AI Code Review',
		applicationStarterPromptInstructions: [
			'Do not add runtime app code for CodeRabbit.',
			'Treat CodeRabbit as external repository tooling configured through the GitHub App, with optional .coderabbit.yaml guidance if useful.',
			'Mention the GitHub App install/setup path briefly instead of pretending CodeRabbit is an in-app SDK integration.',
		],
		image: {
			light: codeRabbitLightSvg,
			dark: codeRabbitDarkSvg,
		},
		llmDescription:
			'AI code review platform for pull requests, IDEs, and CLI workflows, with automated review comments, one-click fixes, and configurable review rules.',
		category: 'code-review',
		content: (
			<>
				<div className="text-xs">
					CodeRabbit adds automated review, scanner context, and one-click fixes across{' '}
					<strong>pull requests, IDEs, and CLI workflows</strong>. That is useful in TanStack
					codebases where fast feedback on correctness and API usage helps keep review cycles tight.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const strapi = (() => {
	const href = 'https://strapi.link/tanstack-start';

	return {
		name: 'Strapi',
		id: 'strapi',
		libraries: ['start', 'router'] as const,
		status: 'inactive' as const,
		score: 0.069,
		tier: 'bronze' as const,
		href,
		brandColor: '#4945FF',
		tagline: 'Headless CMS',
		image: {
			light: strapiLightSvg,
			dark: strapiDarkSvg,
			scale: 0.8,
		},
		llmDescription:
			'Open-source headless CMS with content modeling, generated REST and GraphQL APIs, TypeScript tooling, and self-hosted or cloud deployment options.',
		category: 'cms',
		content: (
			<>
				<div className="text-xs">
					Strapi gives teams a <strong>headless CMS</strong> with content modeling, generated REST
					and GraphQL APIs, TypeScript tooling, and self-hosted or cloud deployment options. That
					works well when a TanStack Start app needs a real content system behind it.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const powerSync = (() => {
	const href = 'https://powersync.com?utm_source=tanstack&utm_campaign=tanstack_partner';

	return {
		name: 'PowerSync',
		id: 'powersync',
		libraries: ['db', 'query'] as const,
		status: 'inactive' as const,
		startDate: 'Jan 2026',
		score: 0.143,
		tier: 'bronze' as const,
		href,
		tagline: 'Offline-first Sync',
		applicationStarterPromptInstructions: [
			'Install the official PowerSync web client packages such as @powersync/web and @journeyapps/wa-sqlite when PowerSync is explicitly requested.',
			'If TanStack collections or query integration fits, wire the official TanStack PowerSync packages rather than inventing a custom bridge.',
			'Leave backend connector, auth token, and sync infrastructure setup explicit instead of pretending PowerSync can be fully demoed without backend prerequisites.',
		],
		image: {
			light: powersyncBlackSvg,
			dark: powersyncWhiteSvg,
			scale: 1.2,
		},
		llmDescription:
			'Sync engine that keeps backend databases in sync with embedded client-side SQLite for offline-first and realtime applications. Postgres and MongoDB are supported, with MySQL and SQL Server in beta.',
		category: 'database',
		content: (
			<>
				<div className="text-xs">
					PowerSync syncs backend data into <strong>embedded client-side SQLite</strong> for
					offline-first and realtime apps. That makes it relevant for TanStack users who care about
					local-first UX, live updates, and resilient client state.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const railway = (() => {
	const href = 'https://railway.com/?utm_medium=sponsor&utm_source=oss&utm_campaign=tanstack';

	return {
		name: 'Railway',
		id: 'railway',
		libraries: libraries.map((l) => l.id),
		status: 'active' as const,
		score: 0.145,
		tier: 'gold' as const,
		uniqueConstraints: ['hosting'] satisfies Array<PartnerUniqueConstraint>,
		href,
		brandColor: '#0B0D0E',
		tagline: 'Instant Deployment',
		image: {
			light: railwayBlackSvg,
			dark: railwayWhiteSvg,
		},
		llmDescription:
			'Application deployment platform for shipping from GitHub, the CLI, Docker images, or templates, with managed networking, observability, and configurable scaling.',
		category: 'deployment',
		content: (
			<>
				<div className="text-xs">
					Railway gives teams a simple way to deploy app services, databases, and supporting
					infrastructure from <strong>GitHub, the CLI, Docker, or templates</strong>. That is
					appealing for TanStack teams that want to move quickly without building deployment
					plumbing first.
				</div>
				<LearnMoreButton />
			</>
		),
	};
})();

const openRouter = (() => {
	const href = 'https://openrouter.ai?utm_source=tanstack';

	return {
		name: 'OpenRouter',
		id: 'openrouter',
		href,
		libraries: libraries.map((l) => l.id),
		status: 'active' as const,
		startDate: 'Mar 2026',
		score: 0.344,
		tier: 'silver' as const,
		brandColor: '#7C3AED',
		tagline: 'Unified LLM API',
		applicationStarterPromptInstructions: [
			'Use the official @openrouter/sdk on the server and read OPENROUTER_API_KEY from environment variables.',
			'Keep model selection explicit and easy to swap, and do not expose provider keys in client code.',
			'If AI functionality is demoed, route requests through app-owned server functions instead of calling OpenRouter directly from the browser.',
		],
		image: {
			light: openrouterBlackSvg,
			dark: openrouterWhiteSvg,
			scale: 1.25,
		},
		llmDescription:
			'Unified API for accessing hundreds of AI models from dozens of providers through a single OpenAI-compatible endpoint, with routing, fallbacks, and privacy controls.',
		category: 'ai' as const,
		content: (
			<>
				<div className="text-xs">
					OpenRouter provides a <strong>unified API</strong> for many model providers, with routing,
					fallbacks, and privacy controls behind a single endpoint. That is useful for TanStack apps
					experimenting with AI features where provider choice may change over time.
				</div>
				<button
					type="button"
					onClick={() => {
						window.location.href = '/blog/openrouter-partnership';
					}}
					className="text-blue-500 uppercase font-black text-sm"
				>
					Learn More
				</button>
			</>
		),
	};
})();

export const partners: Partner[] = [
	codeRabbit,
	cloudflare,
	lovable,
	agGrid,
	serpApi,
	netlify,
	openRouter,
	neon,
	workos,
	clerk,
	convex,
	electric,
	powerSync,
	sentry,
	railway,
	prisma,
	strapi,
	unkey,
	fireship,
	nozzle,
	vercel,
	speakeasy,
] as Partner[];

const applicationStarterBrandColorOverrides = new Map<string, string>([
	['powersync', '#00D5FF'],
	['prisma', '#10B981'],
	['railway', '#9B4DCA'],
	['sentry', '#7C6BFF'],
	['unkey', '#7C3AED'],
]);

const applicationStarterPlacementContext = getPartnerPlacementContext({
	orderStrategy: 'contextual-recommendation',
	surface: 'application_starter_suggestions',
});

function getPartnerUniqueConstraints(partner: Pick<Partner, 'uniqueConstraints'>) {
	return partner.uniqueConstraints ?? [];
}

function hasSharedUniqueConstraint(
	left: Pick<ApplicationStarterPartnerSuggestion, 'uniqueConstraints'>,
	right: Pick<ApplicationStarterPartnerSuggestion, 'uniqueConstraints'>,
) {
	return left.uniqueConstraints.some((constraint) => right.uniqueConstraints.includes(constraint));
}

function findApplicationStarterPartnerSuggestion(
	partnerId: string,
	partnerSuggestions: Array<ApplicationStarterPartnerSuggestion>,
) {
	return partnerSuggestions.find((partner) => partner.id === partnerId);
}

export function hasApplicationStarterPartnerConflictWithAny(
	partnerId: string,
	partnerIds: Array<string>,
	partnerSuggestions: Array<ApplicationStarterPartnerSuggestion> = applicationStarterPartnerSuggestions,
) {
	const partner = findApplicationStarterPartnerSuggestion(partnerId, partnerSuggestions);

	if (!partner) {
		return false;
	}

	return partnerIds.some((candidateId) => {
		if (candidateId === partner.id) {
			return false;
		}

		const candidate = findApplicationStarterPartnerSuggestion(candidateId, partnerSuggestions);

		return candidate ? hasSharedUniqueConstraint(partner, candidate) : false;
	});
}

export function getApplicationStarterConflictingPartnerIds(
	partner: ApplicationStarterPartnerSuggestion,
	partnerSuggestions: Array<ApplicationStarterPartnerSuggestion>,
) {
	return partnerSuggestions.flatMap((candidate) => {
		if (candidate.id === partner.id || !hasSharedUniqueConstraint(partner, candidate)) {
			return [];
		}

		return [candidate.id];
	});
}

export function getApplicationStarterCompatiblePartnerIds(
	partnerIds: Array<string>,
	partnerSuggestions: Array<ApplicationStarterPartnerSuggestion> = applicationStarterPartnerSuggestions,
) {
	const normalized = Array<string>();

	for (const partnerId of partnerIds) {
		if (normalized.includes(partnerId)) {
			continue;
		}

		const partner = findApplicationStarterPartnerSuggestion(partnerId, partnerSuggestions);

		if (!partner) {
			continue;
		}

		if (partner.uniqueConstraints.length === 0) {
			normalized.push(partner.id);
			continue;
		}

		const conflictingPartnerIds = normalized.filter((candidateId) => {
			const candidate = findApplicationStarterPartnerSuggestion(candidateId, partnerSuggestions);

			return candidate ? hasSharedUniqueConstraint(partner, candidate) : false;
		});

		const hasSameOrHigherTierConflict = conflictingPartnerIds.some((candidateId) => {
			const candidate = findApplicationStarterPartnerSuggestion(candidateId, partnerSuggestions);

			return candidate ? candidate.tier <= partner.tier : false;
		});

		if (hasSameOrHigherTierConflict) {
			continue;
		}

		for (const conflictingPartnerId of conflictingPartnerIds) {
			const candidate = findApplicationStarterPartnerSuggestion(
				conflictingPartnerId,
				partnerSuggestions,
			);

			if (!candidate || candidate.tier <= partner.tier) {
				continue;
			}

			const conflictingIndex = normalized.indexOf(conflictingPartnerId);

			if (conflictingIndex >= 0) {
				normalized.splice(conflictingIndex, 1);
			}
		}

		normalized.push(partner.id);
	}

	return normalized;
}

export function getApplicationStarterVisiblePartnerSuggestions(
	partnerSuggestions: Array<ApplicationStarterPartnerSuggestion>,
	_selectedPartnerIds: Array<string>,
) {
	return partnerSuggestions;
}

export function hasApplicationStarterPartnerUniqueConstraint(
	partnerId: string,
	uniqueConstraint: PartnerUniqueConstraint,
	partnerSuggestions: Array<ApplicationStarterPartnerSuggestion> = applicationStarterPartnerSuggestions,
) {
	const partner = findApplicationStarterPartnerSuggestion(partnerId, partnerSuggestions);

	return partner?.uniqueConstraints.includes(uniqueConstraint) ?? false;
}

const applicationStarterInferenceRules: Array<{
	partnerId: string;
	patterns: Array<RegExp>;
}> = [
	{
		partnerId: 'workos',
		patterns: [/\b(sso|saml|scim|directory sync|enterprise auth|enterprise identity|b2b auth)\b/i],
	},
	{
		partnerId: 'clerk',
		patterns: [
			/\b(authentication|sign[ -]?in|sign[ -]?up|login|oauth|mfa|user management|sessions?)\b/i,
		],
	},
	{
		partnerId: 'cloudflare',
		patterns: [/\b(cloudflare|workers?|durable objects|r2|d1|kv)\b/i],
	},
	{
		partnerId: 'lovable',
		patterns: [/\b(lovable|lovable cloud|vibe[- ]?coding|ai app builder|visual editor)\b/i],
	},
	{
		partnerId: 'netlify',
		patterns: [/\b(netlify|deploy previews?|netlify functions?|edge functions?)\b/i],
	},
	{
		partnerId: 'railway',
		patterns: [/\brailway\b/i],
	},
	{
		partnerId: 'sentry',
		patterns: [
			/\b(error tracking|exception monitoring|observability|tracing|trace(s|ing)?|session replay|profiling|application monitoring)\b/i,
		],
	},
	{
		partnerId: 'strapi',
		patterns: [
			/\b(headless cms|content management system|cms|editorial workflow|content modeling|admin content)\b/i,
		],
	},
	{
		partnerId: 'neon',
		patterns: [/\b(serverless postgres|postgresql|postgres|database branching|branch database)\b/i],
	},
	{
		partnerId: 'openrouter',
		patterns: [
			/\b(openrouter|openai-compatible|model routing|provider fallbacks?|multiple ai models?)\b/i,
		],
	},
	{
		partnerId: 'serpapi',
		patterns: [/\b(serpapi|search engine results?|google shopping|google maps|serp)\b/i],
	},
	{
		partnerId: 'unkey',
		patterns: [/\b(unkey|api keys?|rate limit(ing)?|usage limits?|access controls?)\b/i],
	},
	{
		partnerId: 'ag-grid',
		patterns: [
			/\b(ag[ -]?grid|enterprise data grid|excel export|pivoting|spreadsheet-like grid)\b/i,
		],
	},
	{
		partnerId: 'powersync',
		patterns: [/\b(powersync|offline-first sync)\b/i],
	},
	{
		partnerId: 'electric',
		patterns: [/\b(electric|postgres sync|reactive postgres)\b/i],
	},
	{
		partnerId: 'coderabbit',
		patterns: [/\b(coderabbit|ai code review|pr review bot)\b/i],
	},
];

function normalizeApplicationStarterPartnerKey(value: string) {
	return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getApplicationStarterPartnerTier(
	partner: Pick<Partner, 'tier'>,
): ApplicationStarterPartnerTier {
	return partner.tier ? partnerTierToBuilderTier[partner.tier] : 3;
}

function getApplicationStarterPartnerFaviconUrl(href: string) {
	return `${new URL(href).origin}/favicon.ico`;
}

function getApplicationStarterPartnerDescription(partner: Pick<Partner, 'llmDescription'>) {
	const [firstSentence] = partner.llmDescription.split(/(?<=[.!?])\s+/);
	return firstSentence?.trim() || partner.llmDescription.trim();
}

function getApplicationStarterPartnerTags(partner: Pick<Partner, 'category' | 'tagline'>) {
	if (partner.tagline?.trim()) {
		return [partner.tagline.trim()];
	}

	return [partnerCategoryLabels[partner.category]];
}

function inferApplicationStarterPartnerIds(input: string, selectedPartnerIds: Array<string>) {
	const selectedSourcePartners = partners.filter(
		(partner) => partner.status === 'active' && selectedPartnerIds.includes(partner.id),
	);
	const blockedCategories = new Set(
		selectedSourcePartners
			.filter((partner) => getPartnerUniqueConstraints(partner).length === 0)
			.map((partner) => partner.category),
	);
	const blockedUniqueConstraints = new Set(
		selectedSourcePartners.flatMap(getPartnerUniqueConstraints),
	);
	const inferredCategories = new Set<PartnerCategory>();
	const inferredUniqueConstraints = new Set<PartnerUniqueConstraint>();
	const inferredPartnerIds = Array<string>();

	for (const rule of applicationStarterInferenceRules) {
		const partner = partners.find(
			(candidate) => candidate.status === 'active' && candidate.id === rule.partnerId,
		);

		if (!partner) {
			continue;
		}

		if (selectedPartnerIds.includes(partner.id)) {
			continue;
		}

		const partnerUniqueConstraints = getPartnerUniqueConstraints(partner);
		const hasUniqueConstraint = partnerUniqueConstraints.length > 0;
		const isBlockedByUniqueConstraint = partnerUniqueConstraints.some(
			(uniqueConstraint) =>
				blockedUniqueConstraints.has(uniqueConstraint) ||
				inferredUniqueConstraints.has(uniqueConstraint),
		);

		if (isBlockedByUniqueConstraint) {
			continue;
		}

		if (
			partner.id === 'clerk' &&
			/\bavoid\s+adding\s+auth\s+and\s+api\s+key\s+providers?\s+that\s+overlap\s+in\s+purpose\b/i.test(
				input,
			)
		) {
			continue;
		}

		if (
			!hasUniqueConstraint &&
			(blockedCategories.has(partner.category) || inferredCategories.has(partner.category))
		) {
			continue;
		}

		if (!rule.patterns.some((pattern) => pattern.test(input))) {
			continue;
		}

		inferredPartnerIds.push(partner.id);

		if (hasUniqueConstraint) {
			for (const uniqueConstraint of partnerUniqueConstraints) {
				inferredUniqueConstraints.add(uniqueConstraint);
			}
		} else {
			inferredCategories.add(partner.category);
		}
	}

	return getApplicationStarterCompatiblePartnerIds(inferredPartnerIds);
}

export function getInferredApplicationStarterPartnerIdsFromUserInput(
	input: string,
	selectedPartnerIds: Array<string>,
) {
	return inferApplicationStarterPartnerIds(input, selectedPartnerIds);
}

function createApplicationStarterPartnerSuggestion(
	partner: Partner,
): ApplicationStarterPartnerSuggestion {
	const tier = getApplicationStarterPartnerTier(partner);
	const normalizedPartnerKey = normalizeApplicationStarterPartnerKey(partner.id);
	const iconMode: ApplicationStarterPartnerSuggestion['iconMode'] =
		tier === 2 ? (partner.applicationStarterIcon?.mode ?? 'contain') : undefined;

	return {
		id: partner.id,
		label: partner.name,
		description: getApplicationStarterPartnerDescription(partner),
		hint: `${partner.name} (${partnerCategoryLabels[partner.category]})`,
		iconMode,
		iconSrc:
			tier === 2
				? (partner.applicationStarterIcon?.src ??
					getApplicationStarterPartnerFaviconUrl(partner.href))
				: undefined,
		image: partner.image,
		tags: getApplicationStarterPartnerTags(partner),
		brandColor:
			applicationStarterBrandColorOverrides.get(normalizedPartnerKey) ?? partner.brandColor,
		tier,
		uniqueConstraints: getPartnerUniqueConstraints(partner),
	};
}

function createApplicationStarterPartnerSuggestions(placementContext: PartnerPlacementContext) {
	return getPartnersForPlacement(
		partners.filter((partner) => partner.status === 'active'),
		placementContext,
	).map(createApplicationStarterPartnerSuggestion);
}

const applicationStarterPartnerSuggestions = createApplicationStarterPartnerSuggestions(
	applicationStarterPlacementContext,
);

export function getApplicationStarterPartnerSuggestions(
	placementContext: PartnerPlacementContext = applicationStarterPlacementContext,
) {
	if (placementContext === applicationStarterPlacementContext) {
		return applicationStarterPartnerSuggestions;
	}

	return createApplicationStarterPartnerSuggestions(placementContext);
}

export function composeApplicationStarterInput(
	input: string,
	selectedPartnerIds: Array<string>,
	inferredPartnerIds: Array<string>,
	options?: { forceRouterOnly?: boolean },
) {
	const trimmedInput = input.trim();
	const compatibleSelectedPartnerIds =
		getApplicationStarterCompatiblePartnerIds(selectedPartnerIds);
	const compatibleInferredPartnerIds = getApplicationStarterCompatiblePartnerIds(
		inferredPartnerIds.filter(
			(partnerId) =>
				!hasApplicationStarterPartnerConflictWithAny(partnerId, compatibleSelectedPartnerIds),
		),
	);
	const selectedPartners = applicationStarterPartnerSuggestions.filter((partner) =>
		compatibleSelectedPartnerIds.includes(partner.id),
	);
	const inferredPartners = applicationStarterPartnerSuggestions.filter((partner) =>
		compatibleInferredPartnerIds.includes(partner.id),
	);
	const selectedSourcePartners = partners.filter(
		(partner) => partner.status === 'active' && compatibleSelectedPartnerIds.includes(partner.id),
	);
	const inferredSourcePartners = partners.filter(
		(partner) => partner.status === 'active' && compatibleInferredPartnerIds.includes(partner.id),
	);

	if (selectedPartners.length === 0 && inferredPartners.length === 0) {
		return trimmedInput;
	}

	const selectedPartnerLine = selectedPartners.length
		? `Prefer these integrations where they fit: ${selectedPartners
				.map((partner) => partner.hint)
				.join(', ')}.`
		: null;
	const inferredPartnerLine = inferredPartners.length
		? `The request clearly calls for these integrations where they fit: ${inferredPartners
				.map((partner) => partner.hint)
				.join(', ')}.`
		: null;

	const partnerInstructions = Array<string>();

	if (selectedPartners.length > 0 || inferredPartners.length > 0) {
		partnerInstructions.push(
			'Make sure each requested or clearly implied partner integration is represented in the resulting project somehow. If one cannot be implemented cleanly, explain what was omitted and why instead of silently dropping it.',
		);
	}

	const allPromptInstructionPartners = [...selectedSourcePartners, ...inferredSourcePartners];
	const partnerPromptInstructions = allPromptInstructionPartners.flatMap(
		(partner) => partner.applicationStarterPromptInstructions ?? [],
	);

	if (partnerPromptInstructions.length > 0) {
		partnerInstructions.push(
			"If a requested or inferred partner is not available as a real TanStack CLI add-on, do not invent one. Follow the partner's official install path, keep secrets server-side, and fall back to setup notes or TODOs when the integration depends on external infra, dashboards, licenses, or GitHub App installs.",
			...partnerPromptInstructions,
		);
	}

	const allPartnerIds = [...compatibleSelectedPartnerIds, ...compatibleInferredPartnerIds];

	if (allPartnerIds.includes('coderabbit')) {
		partnerInstructions.push(
			'Prefer the standard repository integration for pull request reviews first instead of inventing a custom workflow.',
			'Only add CodeRabbit IDE or CLI workflows if they clearly support the requested developer workflow.',
		);
	}

	return [
		trimmedInput,
		'',
		APPLICATION_STARTER_GUIDANCE_MARKER,
		`${APPLICATION_STARTER_SELECTED_PARTNERS_MARKER} ${compatibleSelectedPartnerIds.join(', ') || 'none'}`,
		`${APPLICATION_STARTER_INFERRED_PARTNERS_MARKER} ${compatibleInferredPartnerIds.join(', ') || 'none'}`,
		options?.forceRouterOnly ? APPLICATION_STARTER_FORCE_ROUTER_ONLY_MARKER : null,
		selectedPartnerLine,
		inferredPartnerLine,
		...partnerInstructions,
	]
		.filter(Boolean)
		.join('\n\n');
}

export function getPartnerById(partnerId: string) {
	return partners.find((partner) => partner.id === partnerId);
}
