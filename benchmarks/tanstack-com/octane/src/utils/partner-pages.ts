import { libraries } from '~/libraries';
import { getPartnerById, partnerCategoryLabels, type Partner } from '~/utils/partners.tsrx';

const libraryLabelMap = new Map(
	libraries
		.filter((library) => library.name)
		.map((library) => [library.id, library.name!.replace('TanStack ', '')]),
);

const partnerGuidance: Record<string, { whyGreat: string; whyTanStack: string }> = {
	neon: {
		whyGreat:
			'Neon gives teams real Postgres with lightweight branching and autoscaling compute, which is unusually useful for preview environments, testing, and fast iteration.',
		whyTanStack:
			'That lines up well with TanStack Start because apps often want standard Postgres semantics without giving up fast deploy workflows or branch-based development.',
	},
	convex: {
		whyGreat:
			'Convex combines a reactive database with TypeScript backend functions and automatic client updates, which removes a lot of glue code from realtime apps.',
		whyTanStack:
			'That is a strong fit for TanStack apps when you want server and client state to stay synchronized without wiring subscriptions and cache invalidation by hand.',
	},
	clerk: {
		whyGreat:
			'Clerk packages the painful parts of auth, including sign-in, sign-up, sessions, organizations, and MFA, into a well-documented product with good UI primitives.',
		whyTanStack:
			'Their official TanStack React Start and React Router support makes it easier to add auth without fighting route protection, session handling, and user flows.',
	},
	workos: {
		whyGreat:
			'WorkOS is built around the enterprise identity features B2B teams usually end up needing later: SSO, directory sync, RBAC, audit logs, and admin onboarding.',
		whyTanStack:
			'That complements TanStack well for B2B apps where auth and org-level access rules shape both routing and data access.',
	},
	'ag-grid': {
		whyGreat:
			'AG Grid earns its place when basic table rendering is not enough and you need serious grid behavior like grouping, pivoting, or a server-side row model.',
		whyTanStack:
			'It pairs naturally with TanStack Table when you want TanStack flexibility for state and data modeling alongside a heavier-duty grid UI.',
	},
	netlify: {
		whyGreat:
			'Netlify makes deployment workflows simple, especially when preview environments and edge or server functions are part of the product workflow.',
		whyTanStack:
			'Their published TanStack Start support means the integration story is concrete, not hand-wavy.',
	},
	cloudflare: {
		whyGreat:
			'Cloudflare stands out when global distribution, edge compute, caching, and security need to be part of the platform rather than bolted on later.',
		whyTanStack:
			'That can be a strong fit for TanStack Start apps that want to run close to users on Workers and take advantage of bindings and prerendering support.',
	},
	lovable: {
		whyGreat:
			'Lovable is useful when the shortest path from idea to working app matters, especially because it combines AI-assisted building, visual editing, GitHub sync, and hosted deployment.',
		whyTanStack:
			'Its move to TanStack Start for new SSR projects makes the generated app foundation much closer to the stack TanStack teams already want to own.',
	},
	sentry: {
		whyGreat:
			'Sentry turns production issues into actionable debugging data instead of just error logs, especially once tracing and replay are in the mix.',
		whyTanStack:
			'That matters for TanStack apps with richer client behavior, and Sentry already documents TanStack Router support plus an alpha TanStack Start React SDK.',
	},
	fireship: {
		whyGreat:
			'Fireship and Bytes are useful because they help developers stay current quickly through short-form education, courses, and newsletter coverage.',
		whyTanStack:
			'That makes them a good ecosystem fit when you want more developers to discover and understand TanStack patterns.',
	},
	nozzle: {
		whyGreat:
			'Nozzle is a serious SEO product with enterprise rank tracking, share-of-voice reporting, and deep SERP data, not a generic marketing dashboard.',
		whyTanStack:
			'It is relevant here because it has long been part of the broader TanStack story and shows the kind of data-heavy product surfaces this ecosystem can support.',
	},
	speakeasy: {
		whyGreat:
			'Speakeasy is specific and useful: it generates SDKs, CLIs, Terraform providers, and hosted MCP servers from OpenAPI specs.',
		whyTanStack:
			'That lines up well with TanStack apps when your frontend depends on well-generated client libraries instead of hand-maintained API integrations.',
	},
	unkey: {
		whyGreat:
			'Unkey focuses on the practical API infrastructure teams need early: keys, rate limits, access policies, and usage tracking.',
		whyTanStack:
			'That is a good fit for TanStack-built products that expose APIs or need straightforward platform controls around API access.',
	},
	serpapi: {
		whyGreat:
			'SerpApi handles the ugly parts of search data access, including proxies, CAPTCHA solving, localization, and structured parsing.',
		whyTanStack:
			'That pairs well with TanStack when search intelligence, SEO tooling, or agent workflows are part of the product.',
	},
	electric: {
		whyGreat:
			'Electric is interesting because it focuses on sync and reactive data delivery rather than asking teams to rebuild their stack around a new database abstraction.',
		whyTanStack:
			'Its partnership around TanStack DB makes it especially relevant for apps that want local-first or sync-heavy behavior with a strong client-side data experience.',
	},
	vercel: {
		whyGreat:
			'Vercel is strongest when preview workflows, Git-based deployment, global delivery, and server-side compute are central to the team workflow.',
		whyTanStack:
			'That has been a natural fit for TanStack Start and Router teams building full-stack apps with modern deployment workflows.',
	},
	prisma: {
		whyGreat:
			'Prisma is useful because it combines type-safe database access, migrations, and a strong developer workflow instead of only being a query builder.',
		whyTanStack:
			'Its official TanStack Start guide and Prisma Postgres workflow make it a practical option for full-stack TanStack apps that want a polished DB layer.',
	},
	coderabbit: {
		whyGreat:
			'CodeRabbit adds automated review, scanner context, and one-click fixes directly into pull request and IDE workflows.',
		whyTanStack:
			'That is relevant for TanStack because these codebases benefit from fast feedback on correctness and usage patterns, not just formatting.',
	},
	strapi: {
		whyGreat:
			'Strapi is a pragmatic headless CMS choice for teams that want structured content, generated APIs, and strong customization without locking themselves into a closed stack.',
		whyTanStack:
			'That works well with TanStack Start when you want a real content system behind an app-shaped frontend.',
	},
	powersync: {
		whyGreat:
			'PowerSync is built for one of the harder app problems: keeping client-side SQLite in sync with backend data for offline-first and realtime behavior.',
		whyTanStack:
			'That makes it relevant for TanStack DB and Query users who care about local-first UX and reactive client state.',
	},
	railway: {
		whyGreat:
			'Railway reduces deployment friction and gives teams a single place to run app services, databases, networking, and observability.',
		whyTanStack:
			'That simplicity is a good match for TanStack teams that want to ship full-stack apps quickly without building a platform team first.',
	},
	openrouter: {
		whyGreat:
			'OpenRouter normalizes access to many model providers behind one API and gives teams routing and fallback controls they would otherwise build themselves.',
		whyTanStack:
			'That is a strong fit for TanStack apps experimenting with AI features where provider choice, latency, cost, and fallback behavior change over time.',
	},
};

export function findPartnerForPage(partnerId: string) {
	return getPartnerById(partnerId);
}

export function getPartnerLibraryLabels(partner: Partner) {
	return (partner.libraries ?? []).map((libraryId) => libraryLabelMap.get(libraryId) ?? libraryId);
}

export function getPartnerPageTitle(partner: Partner) {
	return `${partner.name} for TanStack`;
}

export function getPartnerPageDescription(partner: Partner) {
	const libraries = getPartnerLibraryLabels(partner);
	const librariesSuffix = libraries.length ? ` Best fit for ${libraries.join(', ')} teams.` : '';

	return `${partner.name} is a ${partnerCategoryLabels[partner.category].toLowerCase()} partner in the TanStack ecosystem. ${partner.llmDescription}${librariesSuffix}`;
}

export function getPartnerPageCopy(partner: Partner) {
	const libraryLabels = getPartnerLibraryLabels(partner);
	const guidance = partnerGuidance[partner.id] ?? {
		whyGreat: `${partner.name} offers a clearly defined product in the ${partnerCategoryLabels[partner.category].toLowerCase()} space.`,
		whyTanStack:
			'It can be a strong fit alongside TanStack depending on your stack and product needs.',
	};
	const libraryLine = libraryLabels.length
		? ` It is especially relevant for teams building with ${libraryLabels.join(', ')}.`
		: '';
	const statusLine =
		partner.status === 'active'
			? `${partner.name} is a current TanStack partner, and we think they are a strong option for teams building in this part of the stack.`
			: `${partner.name} has supported TanStack previously, and we still think they are worth knowing about if their strengths match your stack.`;

	return {
		description: `${partner.llmDescription}${libraryLine}`,
		status: statusLine,
		whyGreat: guidance.whyGreat,
		whyTanStack: guidance.whyTanStack,
	};
}

export function getPartnerJsonLd(partner: Partner) {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		about: {
			'@type': 'Organization',
			name: partner.name,
			sameAs: partner.href,
		},
		description: getPartnerPageDescription(partner),
		name: getPartnerPageTitle(partner),
		url: `https://tanstack.com/partners/${partner.id}`,
	};
}
