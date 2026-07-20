import {
	createMemoryEnvironment,
	createWorkerCreate,
	createWorkerManifestLoader,
	loadRemoteAddOn,
	type AddOn,
	type Framework,
	type ManifestCatalog,
	type Starter,
	type WorkerAddOnManifestModule,
	type WorkerFrameworkManifestModule,
} from '@tanstack/create/worker';
import { manifestCatalog } from '@tanstack/create/worker-manifest/catalog';

type WorkerTemplateContext = Parameters<WorkerAddOnManifestModule['renderManifestTemplate']>[1];

type GeneratedTemplateContext = WorkerTemplateContext & {
	packageManager: unknown;
	projectName: unknown;
	typescript: unknown;
	tailwind: unknown;
	js: unknown;
	jsx: unknown;
	fileRouter: unknown;
	codeRouter: unknown;
	routerOnly: unknown;
	includeExamples: unknown;
	addOnEnabled: Record<string, unknown>;
	addOnOption: Record<string, unknown>;
	addOns: Array<Record<string, unknown>>;
	integrations: Array<Record<string, unknown>>;
	routes: Array<Record<string, unknown>>;
	getPackageManagerAddScript: (...args: Array<unknown>) => string;
	getPackageManagerRunScript: (...args: Array<unknown>) => string;
	getPackageManagerExecuteScript: (...args: Array<unknown>) => string;
	relativePath: (...args: Array<unknown>) => string;
	integrationImportContent: (...args: Array<unknown>) => string;
	integrationImportCode: (...args: Array<unknown>) => string | undefined;
	renderTemplate: (content: string) => string;
	ignoreFile: () => never;
};

type GeneratedWorkerManifestModule = {
	renderManifestTemplate: (
		template: string,
		context: GeneratedTemplateContext,
	) => string | undefined;
	hasManifestTemplate?: (template: string) => boolean;
};

type GeneratedWorkerFrameworkManifestModule = GeneratedWorkerManifestModule & {
	framework: WorkerFrameworkManifestModule['framework'];
};

type WorkerAddOnManifest = WorkerAddOnManifestModule['addOn'];
type WorkerFrameworkMetadata = ManifestCatalog['frameworks'][number];
type WorkerAddOnMetadata = WorkerFrameworkMetadata['addOns'][number];
type WorkerAddOnType = WorkerAddOnManifest['type'];
type WorkerAddOnPhase = WorkerAddOnManifest['phase'];
type WorkerAddOnCategory = NonNullable<WorkerAddOnManifest['category']>;
type WorkerAddOnExclusive = NonNullable<WorkerAddOnManifest['exclusive']>[number];
type WorkerAddOnEnvVar = NonNullable<WorkerAddOnManifest['envVars']>[number];
type WorkerAddOnOptions = NonNullable<WorkerAddOnManifest['options']>;
type WorkerAddOnOption = WorkerAddOnOptions[string];
type WorkerAddOnPackageAdditions = NonNullable<WorkerAddOnManifest['packageAdditions']>;
type GeneratedStringRecord = Record<string, string | undefined>;
type GeneratedAddOnPackageAdditions = {
	dependencies?: GeneratedStringRecord;
	devDependencies?: GeneratedStringRecord;
	scripts?: GeneratedStringRecord;
};
type GeneratedAddOnEnvVar = Omit<WorkerAddOnEnvVar, 'file'> & {
	file?: string;
};
type GeneratedAddOnOption = Omit<WorkerAddOnOption, 'type'> & {
	type: string;
};
type GeneratedAddOnOptions = Record<string, GeneratedAddOnOption | undefined>;
type GeneratedAddOnFields = {
	type: string;
	phase: string;
	category?: string;
	exclusive?: Array<string>;
	envVars?: Array<GeneratedAddOnEnvVar>;
	options?: GeneratedAddOnOptions;
};
type GeneratedAddOnManifest = Omit<
	WorkerAddOnManifest,
	'type' | 'phase' | 'category' | 'exclusive' | 'envVars' | 'options' | 'packageAdditions'
> &
	GeneratedAddOnFields & {
		packageAdditions?: GeneratedAddOnPackageAdditions;
	};
type GeneratedAddOnMetadata = Omit<
	WorkerAddOnMetadata,
	'type' | 'phase' | 'category' | 'exclusive' | 'envVars' | 'options' | 'packageAdditions'
> &
	GeneratedAddOnFields & {
		packageAdditions?: GeneratedAddOnPackageAdditions;
	};

type GeneratedWorkerAddOnManifestModule = GeneratedWorkerManifestModule & {
	addOn: GeneratedAddOnManifest;
};

function isSupportedFrameworkId(frameworkId: string) {
	return frameworkId === 'react' || frameworkId === 'solid';
}

function isSupportedAddOnId(frameworkId: string, addOnId: string) {
	return addOnId in (addOnLoaders[frameworkId] ?? {});
}

function getGeneratedTemplateContext(context: WorkerTemplateContext): GeneratedTemplateContext {
	return {
		...context,
		packageManager: context.packageManager,
		projectName: context.projectName,
		typescript: context.typescript,
		tailwind: context.tailwind,
		js: context.js,
		jsx: context.jsx,
		fileRouter: context.fileRouter,
		codeRouter: context.codeRouter,
		routerOnly: context.routerOnly,
		includeExamples: context.includeExamples,
		addOnEnabled: context.addOnEnabled,
		addOnOption: context.addOnOption,
		addOns: context.addOns,
		integrations: context.integrations,
		routes: context.routes,
		getPackageManagerAddScript: context.getPackageManagerAddScript,
		getPackageManagerRunScript: context.getPackageManagerRunScript,
		getPackageManagerExecuteScript: context.getPackageManagerExecuteScript,
		relativePath: context.relativePath,
		integrationImportContent: context.integrationImportContent,
		integrationImportCode: context.integrationImportCode,
		renderTemplate: context.renderTemplate,
		ignoreFile: context.ignoreFile,
	};
}

function loadFramework(
	load: () => Promise<GeneratedWorkerFrameworkManifestModule>,
): () => Promise<WorkerFrameworkManifestModule> {
	return async () => {
		const module = await load();

		return {
			framework: module.framework,
			hasManifestTemplate: module.hasManifestTemplate,
			renderManifestTemplate(template, context) {
				return module.renderManifestTemplate(template, getGeneratedTemplateContext(context));
			},
		};
	};
}

function getAddOnType(type: string): WorkerAddOnType {
	switch (type) {
		case 'add-on':
		case 'example':
		case 'starter':
		case 'toolchain':
		case 'deployment':
			return type;
		default:
			throw new Error(`Unsupported add-on type: ${type}`);
	}
}

function getAddOnPhase(phase: string): WorkerAddOnPhase {
	switch (phase) {
		case 'setup':
		case 'add-on':
		case 'example':
			return phase;
		default:
			throw new Error(`Unsupported add-on phase: ${phase}`);
	}
}

function getAddOnCategory(category: string | undefined): WorkerAddOnCategory | undefined {
	switch (category) {
		case undefined:
		case 'tanstack':
		case 'database':
		case 'orm':
		case 'auth':
		case 'deploy':
		case 'styling':
		case 'monitoring':
		case 'cms':
		case 'api':
		case 'analytics':
		case 'i18n':
		case 'tooling':
		case 'other':
			return category;
		default:
			throw new Error(`Unsupported add-on category: ${category}`);
	}
}

function getAddOnExclusive(exclusive: string): WorkerAddOnExclusive {
	switch (exclusive) {
		case 'orm':
		case 'auth':
		case 'deploy':
		case 'database':
		case 'linter':
			return exclusive;
		default:
			throw new Error(`Unsupported add-on exclusivity group: ${exclusive}`);
	}
}

function getAddOnEnvFile(file: string | undefined): WorkerAddOnEnvVar['file'] {
	switch (file) {
		case undefined:
		case '.env':
		case '.env.local':
			return file;
		default:
			throw new Error(`Unsupported add-on env file: ${file}`);
	}
}

function getAddOnOption(option: GeneratedAddOnOption): WorkerAddOnOption {
	switch (option.type) {
		case 'select':
			return {
				...option,
				type: option.type,
			};
		default:
			throw new Error(`Unsupported add-on option type: ${option.type}`);
	}
}

function getAddOnOptions(
	options: GeneratedAddOnOptions | undefined,
): WorkerAddOnManifest['options'] {
	if (!options) return undefined;

	const normalizedOptions: WorkerAddOnOptions = {};

	for (const [key, option] of Object.entries(options)) {
		if (option !== undefined) {
			normalizedOptions[key] = getAddOnOption(option);
		}
	}

	return normalizedOptions;
}

function getAddOnEnvVars(
	envVars: Array<GeneratedAddOnEnvVar> | undefined,
): WorkerAddOnManifest['envVars'] {
	return envVars?.map((envVar) => ({
		...envVar,
		file: getAddOnEnvFile(envVar.file),
	}));
}

function getStringRecord(
	record: GeneratedStringRecord | undefined,
): Record<string, string> | undefined {
	if (!record) return undefined;

	const normalizedRecord: Record<string, string> = {};

	for (const [key, value] of Object.entries(record)) {
		if (value !== undefined) {
			normalizedRecord[key] = value;
		}
	}

	return normalizedRecord;
}

function getPackageAdditions(
	packageAdditions: GeneratedAddOnPackageAdditions | undefined,
): WorkerAddOnManifest['packageAdditions'] {
	if (!packageAdditions) return undefined;

	const normalizedPackageAdditions: WorkerAddOnPackageAdditions = {
		dependencies: getStringRecord(packageAdditions.dependencies),
		devDependencies: getStringRecord(packageAdditions.devDependencies),
		scripts: getStringRecord(packageAdditions.scripts),
	};

	return normalizedPackageAdditions;
}

function getAddOnMetadata(addOn: GeneratedAddOnMetadata): WorkerAddOnMetadata {
	return {
		...addOn,
		type: getAddOnType(addOn.type),
		phase: getAddOnPhase(addOn.phase),
		category: getAddOnCategory(addOn.category),
		exclusive: addOn.exclusive?.map(getAddOnExclusive),
		envVars: getAddOnEnvVars(addOn.envVars),
		options: getAddOnOptions(addOn.options),
		packageAdditions: getPackageAdditions(addOn.packageAdditions),
	};
}

function getAddOnManifest(addOn: GeneratedAddOnManifest): WorkerAddOnManifest {
	return {
		...addOn,
		type: getAddOnType(addOn.type),
		phase: getAddOnPhase(addOn.phase),
		category: getAddOnCategory(addOn.category),
		exclusive: addOn.exclusive?.map(getAddOnExclusive),
		envVars: getAddOnEnvVars(addOn.envVars),
		options: getAddOnOptions(addOn.options),
		packageAdditions: getPackageAdditions(addOn.packageAdditions),
	};
}

function getManifestCatalog(): ManifestCatalog {
	return {
		frameworks: manifestCatalog.frameworks
			.filter((framework) => isSupportedFrameworkId(framework.id))
			.map((framework) => ({
				...framework,
				addOns: framework.addOns
					.filter((addOn) => isSupportedAddOnId(framework.id, addOn.id))
					.map(getAddOnMetadata),
			})),
	};
}

function loadAddOn(
	load: () => Promise<GeneratedWorkerAddOnManifestModule>,
): () => Promise<WorkerAddOnManifestModule> {
	return async () => {
		const module = await load();

		return {
			addOn: getAddOnManifest(module.addOn),
			hasManifestTemplate: module.hasManifestTemplate,
			renderManifestTemplate(template, context) {
				return module.renderManifestTemplate(template, getGeneratedTemplateContext(context));
			},
		};
	};
}

const frameworkLoaders: Record<string, () => Promise<WorkerFrameworkManifestModule>> = {
	react: loadFramework(() => import('@tanstack/create/worker-manifest/frameworks/react')),
	solid: loadFramework(() => import('@tanstack/create/worker-manifest/frameworks/solid')),
};

const reactAddOnLoaders = {
	ai: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/ai')),
	'apollo-client': loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/apollo-client'),
	),
	'better-auth': loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/better-auth'),
	),
	biome: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/biome')),
	clerk: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/clerk')),
	cloudflare: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/cloudflare'),
	),
	compiler: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/compiler'),
	),
	convex: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/convex'),
	),
	db: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/db')),
	drizzle: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/drizzle'),
	),
	eslint: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/eslint'),
	),
	form: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/form')),
	mcp: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/mcp')),
	neon: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/neon')),
	netlify: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/netlify'),
	),
	nitro: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/nitro')),
	oRPC: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/orpc')),
	paraglide: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/paraglide'),
	),
	posthog: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/posthog'),
	),
	powersync: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/powersync'),
	),
	prisma: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/prisma'),
	),
	railway: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/railway'),
	),
	resume: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/resume'),
	),
	sentry: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/sentry'),
	),
	shadcn: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/shadcn'),
	),
	shopify: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/shopify'),
	),
	'shopify-storefront': loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/shopify-storefront'),
	),
	store: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/store')),
	storybook: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/storybook'),
	),
	strapi: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/strapi'),
	),
	t3env: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/t3env')),
	table: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/table')),
	'tanstack-query': loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/tanstack-query'),
	),
	tRPC: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/trpc')),
	workos: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/react/add-ons/workos'),
	),
} satisfies Record<string, () => Promise<WorkerAddOnManifestModule>>;

const solidAddOnLoaders = {
	'better-auth': loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/better-auth'),
	),
	biome: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/biome')),
	cloudflare: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/cloudflare'),
	),
	convex: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/convex'),
	),
	eslint: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/eslint'),
	),
	form: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/form')),
	netlify: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/netlify'),
	),
	nitro: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/nitro')),
	railway: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/railway'),
	),
	sentry: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/sentry'),
	),
	'solid-ui': loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/solid-ui'),
	),
	store: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/store')),
	strapi: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/strapi'),
	),
	t3env: loadAddOn(() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/t3env')),
	tanchat: loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/tanchat'),
	),
	'tanstack-query': loadAddOn(
		() => import('@tanstack/create/worker-manifest/frameworks/solid/add-ons/tanstack-query'),
	),
} satisfies Record<string, () => Promise<WorkerAddOnManifestModule>>;

const addOnLoaders: Record<string, Record<string, () => Promise<WorkerAddOnManifestModule>>> = {
	react: reactAddOnLoaders,
	solid: solidAddOnLoaders,
};

export const create = createWorkerCreate(
	createWorkerManifestLoader({
		loadCatalog: async () => getManifestCatalog(),
		async loadFramework(frameworkId) {
			const load = frameworkLoaders[frameworkId];
			if (!load) throw new Error(`Unsupported framework: ${frameworkId}`);
			return load();
		},
		async loadAddOn(frameworkId, addOnId) {
			const load = addOnLoaders[frameworkId]?.[addOnId];
			if (!load) throw new Error(`Unsupported add-on: ${addOnId}`);
			return load();
		},
	}),
);

export { createMemoryEnvironment, loadRemoteAddOn };
export type { AddOn, Framework, Starter };
