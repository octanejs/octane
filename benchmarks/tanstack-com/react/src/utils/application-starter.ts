import type { FrameworkId } from '~/builder/frameworks';
import type { LibraryId } from '~/libraries';
import {
	getApplicationStarterForceRouterOnly,
	getApplicationStarterCompatiblePartnerIds,
	getApplicationStarterGuidanceLines,
	getApplicationStarterInferredPartnerIds,
	getApplicationStarterSelectedPartnerIds,
	getApplicationStarterUserBrief,
	hasApplicationStarterPartnerConflictWithAny,
} from '~/utils/partners';

export type ApplicationStarterContext = 'builder' | 'home' | 'router' | 'start';
export type ApplicationStarterResultType = 'fallback' | 'migration' | 'scaffoldable';

export interface ApplicationStarterRecipe {
	deployment?: 'cloudflare' | 'netlify' | 'nitro' | 'railway';
	featureOptions: Record<string, Record<string, unknown>>;
	features: Array<string>;
	framework: FrameworkId;
	packageManager: 'bun' | 'npm' | 'pnpm' | 'yarn';
	projectName?: string;
	routerOnly: boolean;
	tailwind: boolean;
	target: 'router' | 'start';
	template?: string;
	toolchain?: 'biome' | 'eslint';
}

export interface ApplicationStarterRequest {
	context: ApplicationStarterContext;
	input: string;
}

export interface ApplicationStarterResult {
	advancedBuilderUrl?: string;
	cliCommand: string;
	downloadUrl?: string;
	headline: string;
	prompt: string;
	rationale: Array<string>;
	recipe: ApplicationStarterRecipe;
	resultType: ApplicationStarterResultType;
	summary: string;
}

export interface ApplicationStarterAnalysis {
	inferredLibraryIds: Array<LibraryId>;
	inferredPartnerIds: Array<string>;
	rationale: Array<string>;
	recipe: ApplicationStarterRecipe;
	summary: string;
}

export const STARTER_INTENT_INSTALL_COMMAND = 'npx @tanstack/intent@latest install';
export const STARTER_INTENT_LIST_COMMAND = 'npx @tanstack/intent@latest list';
export const STARTER_INTENT_USAGE_INSTRUCTION =
	'Use the installed TanStack Intent skills and package-shipped guidance before making architectural or library-specific changes. Do not guess when a shipped skill can tell you the current pattern.';
export const STARTER_AGENTS_CONTEXT_INSTRUCTION =
	'Update the repo agent config files that TanStack Intent targets (for example CLAUDE.md, .cursorrules, or equivalent) if needed. In AGENTS.md or the project equivalent, keep durable project context, the exact CLI command used, chosen stack and integrations, environment variable requirements, deployment notes, key architectural decisions, known gotchas, and next steps.';

export function getStarterPersistenceLine() {
	return 'Keep durable project context in AGENTS.md (or equivalent), including the exact TanStack CLI command used, any follow-up TanStack Intent commands, the chosen stack and integrations, environment variable requirements, deployment notes, key architectural decisions, known gotchas, and next steps.';
}

export function getStarterIntentInstructionLines() {
	return [
		'After scaffolding, install dependencies and then wire TanStack Intent into the repo with:',
		STARTER_INTENT_INSTALL_COMMAND,
		'Then inspect the installed package skills with:',
		STARTER_INTENT_LIST_COMMAND,
		STARTER_INTENT_USAGE_INSTRUCTION,
		STARTER_AGENTS_CONTEXT_INSTRUCTION,
	];
}

export function getStarterTemplateInteropInstructionLines() {
	return [
		'If the execution environment starts from an existing platform template or custom starter instead of the TanStack CLI output, still run the TanStack CLI command in a separate scratch directory.',
		'Then merge the generated integrations, dependencies, config, scripts, and relevant file structure into the actual project instead of skipping the TanStack CLI result.',
		'Do not drop requested partner integrations or stack choices just because the host platform bootstraps its own template. Represent them in the final project somehow, or explicitly call out what could not be represented and why.',
	];
}

const starterConstraintPatterns = [
	/(?:^|[\s,;])((?:do not|don't|avoid|without|never)\s+[^.;\n]+)/gi,
	/(?:^|[\s,;])((?<!do not )(?<!don't )(?<!avoid )(?<!without )(?<!never )(?:make it|keep it|must)\s+[^.;\n]+)/gi,
];

function normalizeStarterConstraint(constraint: string) {
	return constraint
		.trim()
		.replace(/\s+/g, ' ')
		.replace(/[.\s]+$/, '');
}

export function extractStarterConstraints(input: string) {
	const userBrief = getApplicationStarterUserBrief(input);
	const seen = new Set<string>();
	const constraints = Array<string>();

	for (const pattern of starterConstraintPatterns) {
		for (const match of userBrief.matchAll(pattern)) {
			const value = normalizeStarterConstraint(match[1] ?? '');

			if (!value) {
				continue;
			}

			const key = value.toLowerCase();

			if (seen.has(key)) {
				continue;
			}

			seen.add(key);
			constraints.push(value);
		}
	}

	return constraints;
}

export function getStarterConstraintInstructionLines(input: string) {
	const constraints = extractStarterConstraints(input);

	if (constraints.length === 0) {
		return [];
	}

	return [
		'Honor these user constraints unless they directly conflict with the scaffolded stack or requested integrations:',
		...constraints.map((constraint) => `- ${constraint}`),
	];
}

const migrationRepositoryUrlPattern =
	/(?:^|\n)Legacy repository URL:\s*(https?:\/\/\S+|git@\S+|ssh:\/\/\S+)/i;

export function extractMigrationRepositoryUrl(input: string) {
	return input.match(migrationRepositoryUrlPattern)?.[1]?.trim();
}

export function getMigrationRepositoryInstructionLines(input: string) {
	const repositoryUrl = extractMigrationRepositoryUrl(input);

	if (!repositoryUrl) {
		return [];
	}

	return [
		`Legacy repository URL: ${repositoryUrl}`,
		'After scaffolding, clone the legacy project into ./legacy-source and treat it as reference material only.',
		'Do not copy the legacy .git directory into the new app or overwrite the fresh scaffold with the old repo.',
		'Migrate the existing app incrementally from ./legacy-source into the new TanStack app, route by route and feature by feature.',
	];
}

export function getRequiredStarterPromptSections({
	cliCommand,
	input,
	resultType,
}: {
	cliCommand: string;
	input: string;
	resultType: ApplicationStarterResultType;
}) {
	return [
		resultType === 'migration' ? 'Do not incrementally mutate the old app in place.' : null,
		'Start by scaffolding the project with the TanStack CLI.',
		`Use this command: ${cliCommand}`,
		...getStarterTemplateInteropInstructionLines(),
		`After scaffolding, run ${STARTER_INTENT_INSTALL_COMMAND} and ${STARTER_INTENT_LIST_COMMAND}.`,
		STARTER_INTENT_USAGE_INSTRUCTION,
		getStarterPersistenceLine(),
		...getStarterConstraintInstructionLines(input),
		...getMigrationRepositoryInstructionLines(input),
		`Original user brief: ${input.trim()}`,
	].filter((section): section is string => !!section);
}

export function sanitizeStarterPrompt(prompt: string) {
	return prompt
		.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '')
		.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '')
		.replace(
			/^\s*(Context|User request|Resolved starter plan|Resolved CLI command|Resolved summary):.*$/gim,
			'',
		)
		.replace(
			/^\s*[-*]\s*(target|framework|template|package manager|add-ons|deployment|toolchain):.*$/gim,
			'',
		)
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

type IntentId =
	| 'ai'
	| 'api'
	| 'content'
	| 'dashboard'
	| 'ecommerce'
	| 'fallback'
	| 'migration'
	| 'realtime'
	| 'saas';

type ContextSuggestion = {
	input: string;
	label: string;
};

const DEFAULT_PROJECT_NAME = 'my-tanstack-app';

const sharedHomeAndBuilderPrompts: Array<ContextSuggestion> = [
	{
		label: 'Blank starter',
		input: 'Create a blank TanStack Start app with no extra integrations or feature scaffolding.',
	},
	{
		label: 'Migrate from Next.js',
		input:
			'Migrate an existing Next.js app to TanStack Start. Preserve the current UX, auth integration, routing structure, and data fetching behavior. Start by scaffolding a fresh TanStack Start app, then migrate the existing app incrementally route by route and feature by feature.',
	},
	{
		label: 'Build a blog',
		input:
			'Build a blog or content site with a CMS, great routing, and a clean editorial reading experience.',
	},
	{
		label: 'SaaS dashboard',
		input:
			'Build a SaaS dashboard app with auth, billing-ready structure, Postgres, nested routes, data tables, filters, forms, monitoring, and charts-ready data fetching.',
	},
	{
		label: 'Build a shop',
		input:
			'Build a Shopify-backed storefront with product catalog, shopping cart, customer accounts, and checkout.',
	},
];

export function getRecipeBuilderFeatures(recipe: ApplicationStarterRecipe) {
	const seen = new Set<string>();

	return [...recipe.features, recipe.deployment, recipe.toolchain].filter(
		(feature): feature is string => {
			if (!feature || seen.has(feature)) {
				return false;
			}

			seen.add(feature);
			return true;
		},
	);
}

const quickPrompts: Record<ApplicationStarterContext, Array<ContextSuggestion>> = {
	home: sharedHomeAndBuilderPrompts,
	start: [
		{
			label: 'Blank starter',
			input: 'Create a blank TanStack Start app with no extra integrations or feature scaffolding.',
		},
		{
			label: 'Full-stack app',
			input:
				'Build a full-stack TanStack Start app with auth, database access, forms, and monitoring.',
		},
		{
			label: 'Auth + database',
			input: 'Build a product app with authentication, Postgres, forms, and Sentry. Use pnpm.',
		},
		{
			label: 'Migrate from Next.js',
			input:
				'Migrate an existing Next.js app to TanStack Start. Preserve the current UX, auth integration, routing structure, and data fetching behavior. Start by scaffolding a fresh TanStack Start app, then migrate the existing app incrementally route by route and feature by feature.',
		},
		{
			label: 'Build a blog',
			input:
				'Build a content-driven TanStack Start app for a blog or CMS-backed publishing workflow.',
		},
	],
	router: [
		{
			label: 'Blank starter',
			input:
				'Create a blank TanStack Router app with no extra integrations or feature scaffolding.',
		},
		{
			label: 'Route-heavy app',
			input:
				'Build a route-heavy application with nested layouts, search params, data loaders, and protected routes.',
		},
		{
			label: 'Dashboard routes',
			input: 'Build a dashboard with nested routes, auth, tables, query-driven loaders, and forms.',
		},
		{
			label: 'Router-only mode',
			input:
				'Build a router-only React SPA with file-based routing, search params, and TanStack Query, no TanStack Start SSR.',
		},
		{
			label: 'Build a blog',
			input:
				'Build a content-focused app with strong routing, nested layouts, and a clean blog-style reading flow.',
		},
	],
	builder: sharedHomeAndBuilderPrompts,
};

const starterLibraryInferenceRules: Array<{
	libraryId: LibraryId;
	patterns: Array<RegExp>;
}> = [
	{
		libraryId: 'query',
		patterns: [
			/\btanstack query\b/i,
			/\bdata fetching\b/i,
			/\bserver state\b/i,
			/\bquery\b/i,
			/\bqueries\b/i,
		],
	},
	{
		libraryId: 'table',
		patterns: [
			/\btanstack table\b/i,
			/\bdata table\b/i,
			/\bdata tables\b/i,
			/\bdatagrid\b/i,
			/\bgrid\b/i,
		],
	},
	{
		libraryId: 'form',
		patterns: [/\btanstack form\b/i, /\bform\b/i, /\bforms\b/i, /\bvalidation\b/i],
	},
	{
		libraryId: 'store',
		patterns: [
			/\btanstack store\b/i,
			/\bstate management\b/i,
			/\bshared state\b/i,
			/\bclient state\b/i,
			/\bstore\b/i,
		],
	},
	{
		libraryId: 'db',
		patterns: [/\btanstack db\b/i],
	},
	{
		libraryId: 'ai',
		patterns: [/\btanstack ai\b/i, /\bai\b/i, /\bllm\b/i, /\bchat\b/i, /\bagent\b/i],
	},
	{
		libraryId: 'hotkeys',
		patterns: [/\btanstack hotkeys\b/i, /\bkeyboard shortcuts?\b/i, /\bhotkeys?\b/i],
	},
	{
		libraryId: 'pacer',
		patterns: [
			/\btanstack pacer\b/i,
			/\bdebounc(?:e|ing)\b/i,
			/\bthrottl(?:e|ing)\b/i,
			/\bqueue(?:ing)?\b/i,
			/\brate limit(?:ing)?\b/i,
		],
	},
	{
		libraryId: 'virtual',
		patterns: [
			/\btanstack virtual\b/i,
			/\bvirtual(?:ized|ization)?\b/i,
			/\blong lists?\b/i,
			/\binfinite list\b/i,
		],
	},
];

const scorerGroups: Record<Exclude<IntentId, 'fallback'>, Array<RegExp>> = {
	migration: [
		/\bmigrat(?:e|ing|ion)\b/i,
		/\bport\b/i,
		/\bconvert\b/i,
		/\bexisting app\b/i,
		/\bmove (?:it|this|everything|things) over\b/i,
		/\bfrom next(?:\.js)?\b/i,
		/\bfrom remix\b/i,
		/\bfrom react router\b/i,
		/\bfrom vite\b/i,
		/\bfrom cra\b/i,
	],
	saas: [
		/\bsaas\b/i,
		/\bb2b\b/i,
		/\bmulti[- ]tenant\b/i,
		/\bteam accounts?\b/i,
		/\bbilling\b/i,
		/\bsubscriptions?\b/i,
	],
	dashboard: [
		/\bdashboard\b/i,
		/\badmin\b/i,
		/\bbackoffice\b/i,
		/\bpanel\b/i,
		/\bmetrics\b/i,
		/\banalytics\b/i,
	],
	content: [
		/\bblog\b/i,
		/\bcms\b/i,
		/\bcontent\b/i,
		/\bmarketing site\b/i,
		/\bdocs?\b/i,
		/\bknowledge base\b/i,
	],
	api: [
		/\bapi\b/i,
		/\bapi keys?\b/i,
		/\bbackend\b/i,
		/\bdeveloper platform\b/i,
		/\btrpc\b/i,
		/\borpc\b/i,
		/\bgraphql\b/i,
		/\brate limit(?:ing)?\b/i,
		/\brpc\b/i,
	],
	ai: [/\bai\b/i, /\bllm\b/i, /\bchat\b/i, /\bagent\b/i, /\brag\b/i, /\bprompt\b/i],
	realtime: [
		/\brealtime\b/i,
		/\bcollaborat(?:e|ive|ion)\b/i,
		/\blive updates?\b/i,
		/\bsync\b/i,
		/\bmultiplayer\b/i,
		/\bpresence\b/i,
	],
	ecommerce: [
		/\bshopify\b/i,
		/\bstorefront\b/i,
		/\be[- ]?commerce\b/i,
		/\bonline store\b/i,
		/\bproduct catalog\b/i,
		/\bsell(?:ing)? products?\b/i,
		/\bcheckout\b/i,
		/\bshopping cart\b/i,
		/\bmerch(?:andise)?\b/i,
	],
};

const ecommerceCustomerAccountPatterns = [
	/\bcustomer accounts?\b/i,
	/\bcustomer login\b/i,
	/\border history\b/i,
	/\bsign[- ]?in\b/i,
	/\blogin\b/i,
	/\baddresses\b/i,
];

const migrationSources = [
	'astro',
	'cra',
	'next.js',
	'next',
	'react router',
	'remix',
	'vite',
] as const;

export function getApplicationStarterSuggestions(context: ApplicationStarterContext) {
	return quickPrompts[context];
}

export function getInferredApplicationStarterLibraryIds(input: string) {
	const userBrief = getApplicationStarterUserBrief(input);

	return starterLibraryInferenceRules.flatMap((rule) =>
		rule.patterns.some((pattern) => pattern.test(userBrief)) ? [rule.libraryId] : [],
	);
}

export async function resolveApplicationStarterDeterministically({
	context,
	input,
}: ApplicationStarterRequest) {
	const normalizedInput = normalizeText(getApplicationStarterUserBrief(input));
	const selectedPartnerIds = getApplicationStarterSelectedPartnerIds(input);
	const inferredPartnerIds = getApplicationStarterInferredPartnerIds(input);
	const intent = detectIntent(normalizedInput);
	const recipe = buildRecipe(normalizedInput, intent, context, {
		inferredPartnerIds,
		selectedPartnerIds,
	});
	const resultType = getResultType(intent);

	return composeApplicationStarterResult({
		input,
		rationale: buildRationale(normalizedInput, intent, recipe),
		recipe,
		resultType,
	});
}

export function composeApplicationStarterResult({
	input,
	prompt,
	rationale,
	recipe,
	resultType,
}: {
	input: string;
	prompt?: string;
	rationale: Array<string>;
	recipe: ApplicationStarterRecipe;
	resultType: ApplicationStarterResultType;
}): ApplicationStarterResult {
	return {
		advancedBuilderUrl: recipe.target === 'start' ? buildAdvancedBuilderUrl(recipe) : undefined,
		cliCommand: buildCliCommand(recipe),
		downloadUrl: recipe.target === 'start' ? buildDownloadUrl(recipe) : undefined,
		headline:
			resultType === 'migration' ? 'Your migration prompt is ready' : 'Your prompt is ready',
		prompt: sanitizeStarterPrompt(prompt || buildPrompt({ input, resultType, recipe })),
		rationale,
		recipe,
		resultType,
		summary: buildSummary(resultType, recipe),
	};
}

function normalizeText(input: string) {
	return input.replace(/\s+/g, ' ').trim();
}

function detectIntent(input: string) {
	const intentScores = new Map<IntentId, number>();

	for (const [intent, patterns] of Object.entries(scorerGroups)) {
		let score = 0;
		for (const pattern of patterns) {
			if (pattern.test(input)) {
				score += 1;
			}
		}
		intentScores.set(intent as IntentId, score);
	}

	if ((intentScores.get('migration') ?? 0) > 0) {
		return 'migration' as const;
	}

	const ranked = Array.from(intentScores.entries())
		.filter(([intent]) => intent !== 'migration')
		.sort((left, right) => right[1] - left[1]);

	if (!ranked[0] || ranked[0][1] === 0) {
		return 'fallback' as const;
	}

	return ranked[0][0];
}

function buildRecipe(
	input: string,
	intent: IntentId,
	context: ApplicationStarterContext,
	partnerConfig: {
		inferredPartnerIds: Array<string>;
		selectedPartnerIds: Array<string>;
	},
): ApplicationStarterRecipe {
	const minimalRequest = isMinimalRequest(input);
	const packageManager = detectPackageManager(input);
	const framework = detectFramework(input);
	const deployment = detectDeployment(input);
	const toolchain = detectToolchain(input);
	const tailwind = !/(?:\bwithout tailwind\b|\bno tailwind\b|\btailwind-heavy styling\b)/i.test(
		input,
	);
	const routerOnly =
		context !== 'builder' &&
		detectRouterOnly(input) &&
		!/\bssr\b/i.test(input) &&
		!/\bserver functions?\b/i.test(input);

	const recipe: ApplicationStarterRecipe = {
		deployment,
		featureOptions: {},
		features: [],
		framework,
		packageManager,
		projectName: parseProjectName(input),
		routerOnly,
		tailwind,
		target: routerOnly ? 'router' : 'start',
		toolchain,
	};

	switch (intent) {
		case 'migration': {
			recipe.target = routerOnly ? 'router' : 'start';
			recipe.template = 'saas';
			addStarterFeatures(recipe, 'better-auth', 'neon', 'drizzle', 'sentry');
			break;
		}
		case 'saas': {
			recipe.template = 'saas';
			addStarterFeatures(
				recipe,
				'better-auth',
				'neon',
				'drizzle',
				'form',
				'sentry',
				'shadcn',
				'tanstack-query',
			);
			break;
		}
		case 'dashboard': {
			recipe.template = 'dashboard';
			addStarterFeatures(recipe, 'form', 'shadcn', 'table', 'tanstack-query');
			break;
		}
		case 'content': {
			recipe.template = 'blog';
			addStarterFeatures(recipe, 'strapi', 'tanstack-query');
			break;
		}
		case 'api': {
			recipe.template = 'api-first';
			addStarterFeatures(recipe, 'tanstack-query', 'tRPC');
			break;
		}
		case 'ai': {
			recipe.template = 'ai-chat';
			addStarterFeatures(recipe, 'ai', 'shadcn', 'store');
			break;
		}
		case 'realtime': {
			recipe.template = 'realtime';
			addStarterFeatures(recipe, 'convex', 'tanstack-query');
			break;
		}
		case 'ecommerce': {
			recipe.template = 'shopify-storefront';
			if (ecommerceCustomerAccountPatterns.some((pattern) => pattern.test(input))) {
				recipe.featureOptions.shopify = { customerAccount: 'enabled' };
			}
			break;
		}
		case 'fallback': {
			recipe.template = minimalRequest ? 'blank' : context === 'router' ? 'dashboard' : 'blank';
			if (!minimalRequest) {
				addStarterFeatures(recipe, 'tanstack-query');
			}
			break;
		}
	}

	const selectedPartnerIds = getApplicationStarterCompatiblePartnerIds(
		partnerConfig.selectedPartnerIds,
	);
	const inferredPartnerIds = getApplicationStarterCompatiblePartnerIds(
		partnerConfig.inferredPartnerIds.filter(
			(partnerId) => !hasApplicationStarterPartnerConflictWithAny(partnerId, selectedPartnerIds),
		),
	);

	applyPartnerOverrides(recipe, {
		partnerIds: [...selectedPartnerIds, ...inferredPartnerIds],
	});
	applyInputOverrides(input, recipe);
	normalizeRecipe(recipe);

	return recipe;
}

function addStarterFeatures(recipe: ApplicationStarterRecipe, ...features: Array<string>) {
	recipe.features.push(...features);
}

function applyPartnerOverrides(
	recipe: ApplicationStarterRecipe,
	options: { partnerIds: Array<string> },
) {
	const partnerIds = new Set(options.partnerIds);

	if (partnerIds.has('cloudflare')) {
		recipe.deployment = 'cloudflare';
	} else if (partnerIds.has('netlify')) {
		recipe.deployment = 'netlify';
	} else if (partnerIds.has('railway')) {
		recipe.deployment = 'railway';
	}

	if (partnerIds.has('workos')) {
		replaceExclusive(recipe, ['better-auth', 'clerk', 'workos'], 'workos');
	} else if (partnerIds.has('clerk')) {
		replaceExclusive(recipe, ['better-auth', 'clerk', 'workos'], 'clerk');
	}

	if (partnerIds.has('strapi')) {
		addStarterFeatures(recipe, 'strapi');
	}

	if (partnerIds.has('sentry')) {
		addStarterFeatures(recipe, 'sentry');
	}

	if (partnerIds.has('neon')) {
		replaceExclusive(recipe, ['convex'], 'neon');
		if (!partnerIds.has('prisma')) {
			replaceExclusive(recipe, ['drizzle', 'prisma'], 'drizzle');
		}
	}

	if (partnerIds.has('prisma')) {
		replaceExclusive(recipe, ['convex', 'drizzle', 'prisma'], 'prisma');
		addStarterFeatures(recipe, 'neon');
	}
}

function hasHostedDatabaseConstraint(input: string) {
	return /\b(do not use|don't use|avoid|without)\s+(?:a\s+)?hosted database\b/i.test(input);
}

function hasAuthOverlapConstraint(input: string) {
	return /\bavoid\s+adding\s+auth\s+and\s+api\s+key\s+providers?\s+that\s+overlap\s+in\s+purpose\b/i.test(
		input,
	);
}

function hasNegativeFeatureConstraint(input: string, feature: string) {
	return new RegExp(
		`\\b(?:do not use|don't use|avoid|without|no)\\s+(?:the\\s+)?${feature}\\b`,
		'i',
	).test(input);
}

function applyInputOverrides(input: string, recipe: ApplicationStarterRecipe) {
	if (hasNegativeFeatureConstraint(input, 'clerk')) {
		recipe.features = recipe.features.filter((feature) => feature !== 'clerk');
	} else if (/\bclerk\b/i.test(input)) {
		replaceExclusive(recipe, ['better-auth', 'clerk', 'workos'], 'clerk');
	} else if (
		/\b(sso|saml|scim|directory sync|enterprise auth|enterprise identity|b2b auth)\b/i.test(input)
	) {
		replaceExclusive(recipe, ['better-auth', 'clerk', 'workos'], 'workos');
	} else if (/\bworkos\b/i.test(input)) {
		replaceExclusive(recipe, ['better-auth', 'clerk', 'workos'], 'workos');
	} else if (
		!hasAuthOverlapConstraint(input) &&
		/\b(authentication|auth|login|sign ?in|sign ?up|oauth|sessions?)\b/i.test(input)
	) {
		replaceExclusive(recipe, ['better-auth', 'clerk', 'workos'], 'better-auth');
	}

	if (hasHostedDatabaseConstraint(input)) {
		recipe.features = recipe.features.filter(
			(feature) => feature !== 'convex' && feature !== 'neon',
		);
	} else if (/\bconvex\b/i.test(input)) {
		replaceExclusive(recipe, ['convex', 'drizzle', 'neon', 'prisma'], 'convex');
	} else if (/\bprisma\b/i.test(input)) {
		replaceExclusive(recipe, ['convex', 'drizzle', 'prisma'], 'prisma');
		addStarterFeatures(recipe, 'neon');
	} else if (/\bdrizzle\b/i.test(input)) {
		replaceExclusive(recipe, ['convex', 'drizzle', 'prisma'], 'drizzle');
		addStarterFeatures(recipe, 'neon');
	} else if (/\bpostgres\b|\bpostgre?s\b|\bdatabase\b|\bdb\b|\bneon\b/i.test(input)) {
		replaceExclusive(recipe, ['convex'], 'neon');
		replaceExclusive(recipe, ['drizzle', 'prisma'], 'drizzle');
	}

	if (/\bquery\b|\bloaders?\b|\bdata fetching\b/i.test(input)) {
		addStarterFeatures(recipe, 'tanstack-query');
	}

	if (/\btable\b|\bdatagrid\b|\bgrid\b/i.test(input)) {
		addStarterFeatures(recipe, 'table');
	}

	if (/\bform\b|\bforms\b/i.test(input)) {
		addStarterFeatures(recipe, 'form');
	}

	if (/\bposthog\b|\banalytics\b/i.test(input)) {
		addStarterFeatures(recipe, 'posthog');
	}

	if (/\bsentry\b|\bmonitoring\b|\berrors?\b/i.test(input)) {
		addStarterFeatures(recipe, 'sentry');
	}

	if (/\bi18n\b|\binternational\b|\blocali[sz]ation\b/i.test(input)) {
		addStarterFeatures(recipe, 'paraglide');
	}

	if (hasNegativeFeatureConstraint(input, 'shadcn')) {
		recipe.features = recipe.features.filter((feature) => feature !== 'shadcn');
	} else if (/\bshadcn\b|\bui\b|\bdesign system\b/i.test(input)) {
		addStarterFeatures(recipe, 'shadcn');
	}

	if (/\btrpc\b/i.test(input)) {
		addStarterFeatures(recipe, 'tRPC', 'tanstack-query');
	}

	if (/\borpc\b/i.test(input)) {
		recipe.features = recipe.features.filter((feature) => feature !== 'tRPC');
		addStarterFeatures(recipe, 'oRPC', 'tanstack-query');
	}

	if (/\bapollo\b|\bgraphql\b/i.test(input)) {
		recipe.features = recipe.features.filter((feature) => feature !== 'tRPC' && feature !== 'oRPC');
		addStarterFeatures(recipe, 'apollo-client');
	}

	if (/\bai\b|\bllm\b|\bchat\b|\bagent\b/i.test(input)) {
		addStarterFeatures(recipe, 'ai', 'store');
	}

	if (/\brealtime\b|\bcollaborat(?:e|ive|ion)\b|\blive\b/i.test(input)) {
		recipe.features = recipe.features.filter(
			(feature) => feature !== 'neon' && feature !== 'drizzle' && feature !== 'prisma',
		);
		addStarterFeatures(recipe, 'convex', 'tanstack-query');
	}
}

function replaceExclusive(
	recipe: ApplicationStarterRecipe,
	featureIds: Array<string>,
	nextFeature: string,
) {
	recipe.features = recipe.features.filter((feature) => !featureIds.includes(feature));
	recipe.features.push(nextFeature);
}

function normalizeRecipe(recipe: ApplicationStarterRecipe) {
	const seen = new Set<string>();
	const normalizedFeatures = Array<string>();

	for (const feature of recipe.features) {
		if (feature === recipe.deployment || feature === recipe.toolchain) {
			continue;
		}
		if (!seen.has(feature)) {
			seen.add(feature);
			normalizedFeatures.push(feature);
		}
	}

	recipe.features = normalizedFeatures;

	if (recipe.routerOnly) {
		recipe.template = undefined;
	}
}

function detectDeployment(input: string) {
	if (/\bcloudflare\b|\bworkers\b/i.test(input)) {
		return 'cloudflare' as const;
	}
	if (/\bnetlify\b/i.test(input)) {
		return 'netlify' as const;
	}
	if (/\brailway\b/i.test(input)) {
		return 'railway' as const;
	}
	if (/\bnitro\b/i.test(input)) {
		return 'nitro' as const;
	}
	return undefined;
}

function detectFramework(input: string): FrameworkId {
	if (/\bsolid\b/i.test(input)) {
		return 'solid';
	}
	return 'react';
}

function detectPackageManager(input: string) {
	if (/\bbun\b/i.test(input)) {
		return 'bun' as const;
	}
	if (/\byarn\b/i.test(input)) {
		return 'yarn' as const;
	}
	if (/\bnpm\b/i.test(input)) {
		return 'npm' as const;
	}
	return 'pnpm' as const;
}

function detectRouterOnly(input: string) {
	return (
		getApplicationStarterForceRouterOnly(input) ||
		/\brouter-only\b|\brouter only\b|\bspa\b|\bsingle page app\b|\bclient-side only\b|\bjust tanstack router\b/i.test(
			input,
		)
	);
}

function detectToolchain(input: string) {
	if (/\bbiome\b/i.test(input)) {
		return 'biome' as const;
	}
	if (/\beslint\b/i.test(input)) {
		return 'eslint' as const;
	}
	return undefined;
}

function parseProjectName(input: string) {
	const match = input.match(
		/(?:called|named|name it|project name is)\s+["']?([a-z0-9-]{2,})["']?/i,
	);
	if (!match?.[1]) {
		return undefined;
	}
	return match[1].toLowerCase();
}

function getResultType(intent: IntentId): ApplicationStarterResultType {
	if (intent === 'migration') {
		return 'migration';
	}
	if (intent === 'fallback') {
		return 'fallback';
	}
	return 'scaffoldable';
}

function buildSummary(
	resultType: ApplicationStarterResultType | IntentId,
	recipe: ApplicationStarterRecipe,
) {
	const parts = Array<string>();

	parts.push(recipe.target === 'router' ? 'Router-only starter' : 'TanStack Start starter');

	if (resultType === 'migration') {
		parts.push('migration-first prompt');
	}

	parts.push(recipe.framework === 'solid' ? 'Solid' : 'React');

	if (recipe.features.length > 0) {
		parts.push(recipe.features.slice(0, 4).join(', '));
	}

	if (recipe.deployment) {
		parts.push(`deploy to ${recipe.deployment}`);
	}

	return parts.join(' • ');
}

function buildRationale(input: string, intent: IntentId, recipe: ApplicationStarterRecipe) {
	const rationale = Array<string>();

	switch (intent) {
		case 'migration': {
			const source = detectMigrationSource(input);
			rationale.push(source ? `Detected migration from ${source}` : 'Detected migration workflow');
			rationale.push('Scaffold a fresh target app first, then move behavior over');
			break;
		}
		case 'saas':
			rationale.push('Detected a product app with auth, data, and production concerns');
			break;
		case 'dashboard':
			rationale.push('Detected a route-heavy UI with tables, loaders, and forms');
			break;
		case 'content':
			rationale.push('Detected a content-oriented app or CMS-backed site');
			break;
		case 'api':
			rationale.push('Detected an API-first or RPC-heavy application');
			break;
		case 'ai':
			rationale.push('Detected an AI-assisted or chat-driven application');
			break;
		case 'realtime':
			rationale.push('Detected live updates or collaborative product requirements');
			break;
		case 'fallback':
			rationale.push('Kept the result deliberately conservative because the request was broad');
			break;
	}

	if (recipe.routerOnly) {
		rationale.push(
			'Using router-only mode because the request explicitly avoided TanStack Start SSR',
		);
	} else {
		rationale.push('Defaulting to TanStack Start as the application-level starting point');
	}

	if (recipe.deployment) {
		rationale.push(`Matched deployment target: ${recipe.deployment}`);
	}

	return rationale;
}

function buildPrompt({
	input,
	resultType,
	recipe,
}: {
	input: string;
	resultType: ApplicationStarterResultType | IntentId;
	recipe: ApplicationStarterRecipe;
}) {
	const userBrief = getApplicationStarterUserBrief(input);
	const starterGuidanceLines = getApplicationStarterGuidanceLines(input);
	const cliCommand = buildCliCommand(recipe);
	const featureSummary = recipe.features.length ? recipe.features.join(', ') : 'no extra add-ons';
	const targetLabel = recipe.routerOnly
		? 'TanStack Router router-only application'
		: 'TanStack Start application';
	const frameworkLabel = recipe.framework === 'solid' ? 'Solid' : 'React';
	const stackDetails = [
		`Use ${frameworkLabel}`,
		recipe.template ? `the ${recipe.template} starter` : null,
		recipe.features.length > 0 ? `with ${featureSummary}` : null,
		recipe.deployment ? `targeting ${recipe.deployment}` : null,
	]
		.filter(Boolean)
		.join(', ');

	if (resultType === 'migration') {
		const source = detectMigrationSource(userBrief) ?? 'the existing app';
		const migrationRepositoryInstructions = getMigrationRepositoryInstructionLines(input);

		return [
			`Migrate ${source} into a fresh ${targetLabel}.`,
			'',
			'Do not incrementally mutate the old app in place.',
			'Start by scaffolding a fresh project with the TanStack CLI.',
			`Use this command: ${cliCommand}`,
			...getStarterTemplateInteropInstructionLines(),
			'',
			`After scaffolding, run ${STARTER_INTENT_INSTALL_COMMAND} and ${STARTER_INTENT_LIST_COMMAND}.`,
			STARTER_INTENT_USAGE_INSTRUCTION,
			getStarterPersistenceLine(),
			...starterGuidanceLines,
			...getStarterConstraintInstructionLines(input),
			...migrationRepositoryInstructions,
			'',
			'Migration strategy:',
			'1. Inventory routes, layouts, auth, data loading, forms, and environment variables in the existing app.',
			'2. Recreate the destination structure in the fresh TanStack project first.',
			'3. Port one vertical slice at a time.',
			'4. Preserve behavior and UX, not framework-specific implementation details.',
			'5. Stop and call out anything that cannot be migrated 1:1 before forcing a rewrite.',
			'',
			`Stack: ${stackDetails || `Use ${frameworkLabel}`}.`,
			`Original user brief: ${userBrief}`,
		].join('\n');
	}

	return [
		userBrief,
		'',
		...starterGuidanceLines,
		'',
		'Start by scaffolding the project with the TanStack CLI.',
		`Use this command: ${cliCommand}`,
		...getStarterTemplateInteropInstructionLines(),
		'',
		`After scaffolding, run ${STARTER_INTENT_INSTALL_COMMAND} and ${STARTER_INTENT_LIST_COMMAND}.`,
		STARTER_INTENT_USAGE_INSTRUCTION,
		getStarterPersistenceLine(),
		...getStarterConstraintInstructionLines(input),
		'',
		`Stack: ${stackDetails || `Use ${frameworkLabel}`}.`,
		recipe.toolchain
			? `Toolchain: ${recipe.toolchain}.`
			: 'Toolchain: keep the default CLI toolchain.',
		'Preserve the generated project structure unless there is a clear reason to change it.',
		'Explain any environment variables and follow-up setup steps after scaffolding.',
	].join('\n');
}

function detectMigrationSource(input: string) {
	for (const source of migrationSources) {
		if (input.toLowerCase().includes(source)) {
			return source;
		}
	}
	return undefined;
}

function isMinimalRequest(input: string) {
	return /\bblank\b|\bminimal\b|\bminimum\b|\bbarebones\b|\bfrom scratch\b|\bempty\b/i.test(input);
}

export function buildAdvancedBuilderUrl(recipe: ApplicationStarterRecipe) {
	const params = new URLSearchParams();
	const featureIds = getRecipeBuilderFeatures(recipe);

	params.set('name', recipe.projectName || DEFAULT_PROJECT_NAME);

	if (recipe.framework !== 'react') {
		params.set('framework', recipe.framework);
	}

	if (!recipe.tailwind) {
		params.set('tailwind', 'false');
	}

	if (recipe.packageManager !== 'pnpm') {
		params.set('pm', recipe.packageManager);
	}

	if (recipe.template) {
		params.set('template', recipe.template);
	}

	if (featureIds.length > 0) {
		params.set('features', featureIds.join(','));
	}

	return `/builder?${params.toString()}`;
}

const CLI_TEMPLATE_IDS = new Set<string>(['shopify-storefront']);

export function isCliTemplateId(value: string | undefined): boolean {
	return value !== undefined && CLI_TEMPLATE_IDS.has(value);
}

function shellQuoteSingle(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildAddOnConfigArg(
	featureOptions: ApplicationStarterRecipe['featureOptions'],
): string | null {
	const entries = Object.entries(featureOptions).filter(
		([, options]) => options && Object.keys(options).length > 0,
	);
	if (entries.length === 0) return null;
	return shellQuoteSingle(JSON.stringify(Object.fromEntries(entries)));
}

export function buildCliCommand(recipe: ApplicationStarterRecipe) {
	const commandParts = ['npx', '@tanstack/cli@latest', 'create'];
	commandParts.push(recipe.projectName || DEFAULT_PROJECT_NAME);
	commandParts.push('--agent');

	if (recipe.framework === 'solid') {
		commandParts.push('--framework', 'Solid');
	}

	if (recipe.routerOnly) {
		commandParts.push('--router-only');
	}

	commandParts.push('--package-manager', recipe.packageManager);

	commandParts.push(recipe.tailwind ? '--tailwind' : '--no-tailwind');

	if (recipe.deployment) {
		commandParts.push('--deployment', recipe.deployment);
	}

	if (recipe.toolchain) {
		commandParts.push('--toolchain', recipe.toolchain);
	}

	if (isCliTemplateId(recipe.template)) {
		commandParts.push('--template', recipe.template!);
	}

	if (recipe.features.length > 0) {
		commandParts.push('--add-ons', recipe.features.join(','));
	}

	const addOnConfig = buildAddOnConfigArg(recipe.featureOptions);
	if (addOnConfig) {
		commandParts.push('--add-on-config', addOnConfig);
	}

	return commandParts.join(' ');
}

export function buildDownloadUrl(recipe: ApplicationStarterRecipe) {
	const params = new URLSearchParams();
	const featureIds = getRecipeBuilderFeatures(recipe);

	params.set('name', recipe.projectName || DEFAULT_PROJECT_NAME);
	params.set('framework', recipe.framework);
	params.set('pm', recipe.packageManager);

	if (!recipe.tailwind) {
		params.set('tailwind', 'false');
	}

	if (featureIds.length > 0) {
		params.set('features', featureIds.join(','));
	}

	return `/api/builder/download?${params.toString()}`;
}
