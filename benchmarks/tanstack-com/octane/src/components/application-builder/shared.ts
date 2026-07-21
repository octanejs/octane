import { libraries, type LibraryId } from '~/libraries';
import { composeApplicationStarterInput } from '~/utils/partners.tsrx';
import {
	type ApplicationStarterAnalysis,
	sanitizeStarterPrompt,
	type ApplicationStarterRequest,
	type ApplicationStarterResult,
} from '~/utils/application-starter';

export type StarterTone = 'cyan' | 'emerald' | 'violet';
export type StarterDeployProvider = 'cloudflare' | 'netlify' | 'railway';
export type StarterPromptDeployProvider = 'lovable' | 'netlify';
export type StarterPackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';
export type StarterToolchain = 'biome' | 'eslint';

export interface StarterPalette {
	button: 'cyan' | 'emerald' | 'purple';
	chip: string;
	chipSelected: string;
	ring: string;
}

export interface ApplicationStarterBuilderIntegration {
	applyResult: (
		result: ApplicationStarterResult,
		options?: { silent?: boolean },
	) => Promise<boolean>;
	downloadResult?: (result: ApplicationStarterResult) => Promise<void>;
}

export interface ApplicationStarterAnonymousQuota {
	limit: number;
	remaining: number;
	resetAt: string;
}

export interface ApplicationStarterStatusResponse {
	anonymousGenerationQuota: ApplicationStarterAnonymousQuota | null;
	authenticated: boolean;
}

export interface StarterTryLibrary {
	description?: string;
	id: LibraryId;
	label: string;
	locked: boolean;
	tagline: string;
	textStyle: string;
}

export type StarterPartnerButtonStyle = Record<string, any> & {
	'--starter-partner-active-border-color'?: string;
	'--starter-partner-border-hover'?: string;
	'--starter-partner-hover-border-color'?: string;
};

const nextJsMigrationPattern =
	/migrat(?:e|ing|ion).*(next(?:\.js)?)|(next(?:\.js)?).*(migrat(?:e|ing|ion))/i;
const remixMigrationPattern =
	/migrat(?:e|ing|ion).*(remix|react[\s-]?router)|(remix|react[\s-]?router).*(migrat(?:e|ing|ion))/i;
const migrationRepositoryUrlPattern = /^(https?:\/\/\S+|git@\S+|ssh:\/\/\S+)$/i;

export const STARTER_NEXTJS_MIGRATION_GUIDE_URL =
	'https://tanstack.com/start/latest/docs/framework/react/migrate-from-next-js';
export const STARTER_REMIX_MIGRATION_GUIDE_URL =
	'https://tanstack.com/router/latest/docs/guide/how-to/migrate-from-react-router';

export const starterPinnedLibraryIds = [
	'start',
	'router',
	'intent',
	'cli',
] as const satisfies Array<LibraryId>;

export const starterAddonLibraryIds = [
	'query',
	'table',
	'form',
	'store',
	'db',
	'ai',
	'hotkeys',
	'pacer',
	'virtual',
] as const satisfies Array<LibraryId>;

const starterTryLibraryIds = [
	...starterPinnedLibraryIds,
	...starterAddonLibraryIds,
] as const satisfies Array<LibraryId>;

export const starterTryLibraries = starterTryLibraryIds.flatMap((libraryId) => {
	const library = libraries.find((candidate) => candidate.id === libraryId);

	if (!library) {
		return [];
	}

	return [
		{
			description: library.description,
			id: library.id,
			label: library.name.replace(/^TanStack\s+/, ''),
			locked: starterPinnedLibraryIds.some((pinnedLibraryId) => pinnedLibraryId === library.id),
			tagline: library.tagline,
			textStyle: library.textStyle,
		},
	];
});

export const toneClasses: Record<StarterTone, StarterPalette> = {
	cyan: {
		button: 'cyan',
		chip: 'border-gray-200 bg-white text-gray-600 hover:border-cyan-200 hover:text-cyan-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-cyan-900 dark:hover:text-cyan-200',
		chipSelected:
			'border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200',
		ring: 'focus:ring-cyan-500',
	},
	emerald: {
		button: 'emerald',
		chip: 'border-gray-200 bg-white text-gray-600 hover:border-emerald-200 hover:text-emerald-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-emerald-900 dark:hover:text-emerald-200',
		chipSelected:
			'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
		ring: 'focus:ring-emerald-500',
	},
	violet: {
		button: 'purple',
		chip: 'border-gray-200 bg-white text-gray-600 hover:border-violet-200 hover:text-violet-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-violet-900 dark:hover:text-violet-200',
		chipSelected:
			'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200',
		ring: 'focus:ring-violet-500',
	},
};

export const starterLoadingPhrases = [
	'Charting the route...',
	'Smoothing the shoreline...',
	'Scanning the horizon...',
	'Catching a better breeze...',
	'Hoisting a fresh draft...',
	'Finding calmer waters...',
];

export function buildStarterPromptDeployUrl(provider: StarterPromptDeployProvider, prompt: string) {
	switch (provider) {
		case 'lovable': {
			const url = new URL('https://lovable.dev/');

			url.searchParams.set('autosubmit', 'true');
			url.searchParams.set('utm_source', 'tanstack');
			url.hash = `prompt=${encodeURIComponent(prompt)}`;

			return url.toString();
		}
		case 'netlify': {
			const url = new URL('https://app.netlify.com/start');

			url.searchParams.set('prompt', prompt);
			url.searchParams.set('utm_source', 'tanstack');

			return url.toString();
		}
	}
}

export function isPinnedStarterLibrary(libraryId: LibraryId) {
	return starterPinnedLibraryIds.some((pinnedLibraryId) => pinnedLibraryId === libraryId);
}

export function isNextJsMigrationInput(input: string) {
	return nextJsMigrationPattern.test(input);
}

export function isRemixMigrationInput(input: string) {
	return remixMigrationPattern.test(input);
}

export function getStarterMigrationGuideUrl(input: string) {
	if (isNextJsMigrationInput(input)) {
		return STARTER_NEXTJS_MIGRATION_GUIDE_URL;
	}

	if (isRemixMigrationInput(input)) {
		return STARTER_REMIX_MIGRATION_GUIDE_URL;
	}

	return null;
}

export function normalizeMigrationRepositoryUrl(value: string) {
	return value.trim();
}

export function isValidMigrationRepositoryUrl(value: string) {
	return migrationRepositoryUrlPattern.test(value);
}

export function composeStarterInput({
	forceRouterOnly = false,
	inferredPartners,
	input,
	migrationRepositoryUrl,
	packageManager,
	selectedLibraries,
	selectedPartners,
	toolchain,
}: {
	forceRouterOnly?: boolean;
	inferredPartners: Array<string>;
	input: string;
	migrationRepositoryUrl: string;
	packageManager?: StarterPackageManager;
	selectedLibraries: Array<LibraryId>;
	selectedPartners: Array<string>;
	toolchain?: StarterToolchain;
}) {
	const composedInput = composeApplicationStarterInput(input, selectedPartners, inferredPartners, {
		forceRouterOnly,
	});
	const normalizedRepositoryUrl = normalizeMigrationRepositoryUrl(migrationRepositoryUrl);
	const selectedTryLibraries = starterTryLibraries.filter((library) =>
		selectedLibraries.includes(library.id),
	);
	const selectedAddonLibraries = selectedTryLibraries.filter((library) => !library.locked);
	const libraryInstruction = selectedAddonLibraries.length
		? `Include and demonstrate these TanStack libraries in the project: ${selectedTryLibraries
				.map((library) => `TanStack ${library.label}`)
				.join(', ')}.`
		: '';
	const packageManagerInstruction = packageManager
		? `Use ${packageManager} for package management.`
		: '';
	const toolchainInstruction = toolchain ? `Use ${toolchain} as the project toolchain.` : '';

	const baseInput = [
		composedInput,
		libraryInstruction,
		packageManagerInstruction,
		toolchainInstruction,
	]
		.filter(Boolean)
		.join('\n\n');

	if (!isNextJsMigrationInput(input) || !normalizedRepositoryUrl) {
		return baseInput;
	}

	return [
		baseInput,
		'',
		`Legacy repository URL: ${normalizedRepositoryUrl}`,
		'After scaffolding the new app, clone the legacy project into ./legacy-source and migrate it incrementally into the fresh TanStack app.',
	]
		.filter(Boolean)
		.join('\n');
}

export function colorWithAlpha(color: string | undefined, alpha: number) {
	if (!color?.startsWith('#')) {
		return undefined;
	}

	const normalized =
		color.length === 4
			? color
					.slice(1)
					.split('')
					.map((part) => `${part}${part}`)
					.join('')
			: color.slice(1);

	if (normalized.length !== 6) {
		return undefined;
	}

	const red = Number.parseInt(normalized.slice(0, 2), 16);
	const green = Number.parseInt(normalized.slice(2, 4), 16);
	const blue = Number.parseInt(normalized.slice(4, 6), 16);

	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export async function resolveApplicationStarter(request: ApplicationStarterRequest) {
	const response = await fetch('/api/application-starter/resolve', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(request),
	});

	if (!response.ok) {
		const error = await response.json().catch(() => null);
		throw new ApplicationStarterError(
			error?.details || error?.error || 'Failed to resolve application starter',
			{
				code: error?.code,
				loginRequired: error?.loginRequired,
				retryAfter: error?.retryAfter,
			},
		);
	}

	const result = (await response.json()) as ApplicationStarterResult;

	return {
		...result,
		prompt: sanitizeStarterPrompt(result.prompt),
	};
}

export async function analyzeApplicationStarter(request: ApplicationStarterRequest) {
	const response = await fetch('/api/application-starter/resolve', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			...request,
			mode: 'analyze',
		}),
	});

	if (!response.ok) {
		const error = await response.json().catch(() => null);
		throw new ApplicationStarterError(
			error?.details || error?.error || 'Failed to analyze application starter',
			{
				code: error?.code,
				loginRequired: error?.loginRequired,
				retryAfter: error?.retryAfter,
			},
		);
	}

	return (await response.json()) as ApplicationStarterAnalysis;
}

export function isApplicationStarterStatusResponse(
	value: unknown,
): value is ApplicationStarterStatusResponse {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	const quota = candidate.anonymousGenerationQuota;
	const quotaRecord =
		typeof quota === 'object' && quota !== null ? (quota as Record<string, unknown>) : null;

	const hasValidQuota =
		quota === null ||
		(quotaRecord !== null &&
			typeof quotaRecord.limit === 'number' &&
			typeof quotaRecord.remaining === 'number' &&
			typeof quotaRecord.resetAt === 'string');

	return typeof candidate.authenticated === 'boolean' && hasValidQuota;
}

export class ApplicationStarterError extends Error {
	code?: string;
	loginRequired?: boolean;
	retryAfter?: number;

	constructor(
		message: string,
		options?: { code?: string; loginRequired?: boolean; retryAfter?: number },
	) {
		super(message);
		this.name = 'ApplicationStarterError';
		this.code = options?.code;
		this.loginRequired = options?.loginRequired;
		this.retryAfter = options?.retryAfter;
	}
}
