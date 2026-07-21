import {
	create,
	createMemoryEnvironment,
	type AddOn,
	type Framework,
	type Starter,
} from './create-worker';

type AddOnType = 'add-on' | 'example' | 'starter' | 'toolchain' | 'deployment';
type AddOnPhase = 'setup' | 'add-on' | 'example';

export interface AddOnCompiled {
	id: string;
	name: string;
	description: string;
	type: AddOnType;
	phase: AddOnPhase;
	modes: Array<string>;
	files: Record<string, string>;
	deletedFiles: Array<string>;
	dependsOn?: Array<string>;
	options?: Record<string, unknown>;
	link?: string;
	tailwind: boolean;
	requiresTailwind?: boolean;
	warning?: string;
	priority?: number;
	author?: string;
	version?: string;
	license?: string;
	category?: string;
	packageAdditions?: {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
		scripts?: Record<string, string>;
	};
}

export interface StarterCompiled {
	id: string;
	name: string;
	description: string;
	type: AddOnType;
	phase: AddOnPhase;
	modes: Array<string>;
	files: Record<string, string>;
	deletedFiles: Array<string>;
	framework: string;
	mode: string;
	typescript: boolean;
	tailwind: boolean;
	banner?: string;
	dependsOn?: Array<string>;
}
import { getFramework, DEFAULT_MODE, DEFAULT_REQUIRED_ADDONS, type FrameworkId } from './config';

export interface ProjectDefinition {
	name: string;
	framework?: FrameworkId;
	packageManager?: 'bun' | 'npm' | 'pnpm' | 'yarn';
	tailwind?: boolean;
	features: Array<string>;
	featureOptions?: Record<string, Record<string, unknown>>;
	selectedExample?: string;
	customIntegrations?: Array<AddOnCompiled>;
	customTemplate?: StarterCompiled | null;
}

export interface CompileRequest {
	definition: ProjectDefinition;
	format?: 'full' | 'summary';
}

export interface CompileResponse {
	files: Record<string, string>;
	packages: {
		dependencies: Record<string, string>;
		devDependencies: Record<string, string>;
		scripts: Record<string, string>;
	};
	envVars: Array<{
		name: string;
		description: string;
		required?: boolean;
		example?: string;
	}>;
	commands: Array<{
		command: string;
		args?: Array<string>;
	}>;
	warnings: Array<string>;
}

export interface CompileHandlerOptions {
	format?: 'full' | 'summary';
}

async function resolveAddOns(
	featureIds: Array<string>,
	customAddOns: Array<AddOnCompiled>,
	frameworkId: FrameworkId = 'react',
): Promise<Array<AddOn>> {
	const framework = await getFramework(frameworkId);
	const allFrameworkAddOns = framework.getAddOns();

	const customIds = new Set(customAddOns.map((a: AddOnCompiled) => a.id));

	const frameworkFeatureIds = featureIds.filter((id) => !customIds.has(id));

	const resolvedFramework = await create.finalizeAddOns(framework, DEFAULT_MODE, [
		...DEFAULT_REQUIRED_ADDONS,
		...frameworkFeatureIds,
	]);

	const customAsAddOns = customAddOns.map((compiled: AddOnCompiled) => ({
		...compiled,
		getFiles: () => Promise.resolve(Object.keys(compiled.files)),
		getFileContents: (path: string) => Promise.resolve(compiled.files[path] ?? ''),
		getDeletedFiles: () => Promise.resolve(compiled.deletedFiles || []),
	})) as unknown as Array<AddOn>;

	for (const custom of customAsAddOns) {
		if (custom.dependsOn) {
			for (const depId of custom.dependsOn) {
				if (!resolvedFramework.some((a: AddOn) => a.id === depId)) {
					const depAddOn = allFrameworkAddOns.find((a: AddOn) => a.id === depId);
					if (depAddOn && !resolvedFramework.some((a: AddOn) => a.id === depId)) {
						resolvedFramework.push(depAddOn);
					}
				}
			}
		}
	}

	return [...resolvedFramework, ...customAsAddOns];
}

function extractEnvVars(
	addOns: Array<AddOn>,
): Array<{ name: string; description: string; required?: boolean; example?: string }> {
	const envVars: Array<{
		name: string;
		description: string;
		required?: boolean;
		example?: string;
	}> = [];
	const seen = new Set<string>();

	for (const addOn of addOns) {
		const files = addOn.files || {};
		for (const [path, content] of Object.entries(files) as Array<[string, string]>) {
			if (
				path.endsWith('.env') ||
				path.endsWith('.env.example') ||
				path.endsWith('.env.local.example')
			) {
				const lines = content.split('\n');
				for (const line of lines) {
					const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
					if (match && !seen.has(match[1])) {
						seen.add(match[1]);
						envVars.push({
							name: match[1],
							description: `Environment variable from ${addOn.name}`,
							example: match[2] || undefined,
						});
					}
				}
			}
		}
	}

	return envVars;
}

function extractWarnings(addOns: Array<AddOn>): Array<string> {
	return addOns.filter((a) => a.warning).map((a) => `${a.name}: ${a.warning}`);
}

function _convertToStarter(template: StarterCompiled): Starter {
	return {
		...template,
		getFiles: () => Promise.resolve(Object.keys(template.files)),
		getFileContents: (path: string) => Promise.resolve(template.files[path] ?? ''),
		getDeletedFiles: () => Promise.resolve(template.deletedFiles || []),
	} as unknown as Starter;
}

function mergeOptionsWithDefaults(
	chosenAddOns: Array<AddOn>,
	userOptions: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
	const defaults = create.populateAddOnOptionsDefaults(chosenAddOns);
	const merged: Record<string, Record<string, unknown>> = { ...defaults };

	for (const [addonId, options] of Object.entries(userOptions)) {
		merged[addonId] = { ...merged[addonId], ...options };
	}

	return merged;
}

export async function compileHandler(
	definition: ProjectDefinition,
	options: CompileHandlerOptions = {},
): Promise<CompileResponse> {
	const frameworkId = definition.framework ?? 'react';
	const framework = await getFramework(frameworkId);
	const featureOptions = definition.featureOptions ?? {};

	// Merge selectedExample into features (CTA treats examples as add-ons)
	const allFeatures = definition.selectedExample
		? [...definition.features, definition.selectedExample]
		: definition.features;

	// Custom integrations disabled until stable launch
	const chosenAddOns = await resolveAddOns(allFeatures, [], frameworkId);

	const { environment, output } = createMemoryEnvironment(`/project/${definition.name}`);

	// Custom starters disabled until stable launch
	await create.createApp(environment, {
		projectName: definition.name,
		targetDir: `/project/${definition.name}`,
		framework,
		mode: DEFAULT_MODE,
		typescript: true,
		tailwind: definition.tailwind ?? true,
		packageManager: definition.packageManager ?? 'pnpm',
		git: false,
		install: false,
		intent: false,
		chosenAddOns,
		addOnOptions: mergeOptionsWithDefaults(chosenAddOns, featureOptions),
	});

	const packageJson = output.files['package.json']
		? JSON.parse(output.files['package.json'])
		: { dependencies: {}, devDependencies: {}, scripts: {} };

	return {
		files: options.format === 'summary' ? {} : output.files,
		packages: {
			dependencies: packageJson.dependencies || {},
			devDependencies: packageJson.devDependencies || {},
			scripts: packageJson.scripts || {},
		},
		envVars: extractEnvVars(chosenAddOns),
		commands: output.commands,
		warnings: extractWarnings(chosenAddOns),
	};
}

type AttributionSource = {
	sourceId: string;
	sourceName: string;
};

type FileProvenance = {
	source: 'framework' | 'add-on' | 'starter';
	sourceId: string;
	sourceName: string;
};

type CtaLineAttribution = {
	line: number;
	sourceId: string;
	sourceName: string;
	type: 'original' | 'injected';
};

type CtaAttributedFile = {
	content: string;
	provenance: FileProvenance;
	lineAttributions: Array<CtaLineAttribution>;
};

type DependencyAttribution = {
	name: string;
	version: string;
	type: 'dependency' | 'devDependency';
	sourceId: string;
	sourceName: string;
};

type AttributionOutput = {
	attributedFiles: Record<string, CtaAttributedFile>;
	dependencies: Array<DependencyAttribution>;
};

type IntegrationWithSource = NonNullable<AddOn['integrations']>[number] & {
	_sourceId: string;
	_sourceName: string;
};

type InjectionPattern = {
	matches: (line: string) => boolean;
	appliesTo: (path: string) => boolean;
	source: AttributionSource;
};

function normalizeAttributionPath(path: string) {
	let nextPath = path.startsWith('./') ? path.slice(2) : path;
	nextPath = nextPath.replace(/\.ejs$/, '').replace(/_dot_/g, '.');

	const match = nextPath.match(/^(.+\/)?__([^_]+)__(.+)$/);
	return match ? (match[1] || '') + match[3] : nextPath;
}

async function getFileProvenance(
	filePath: string,
	framework: Framework,
	addOns: Array<AddOn>,
	starter: Starter | undefined,
): Promise<FileProvenance | null> {
	const target = filePath.startsWith('./') ? filePath.slice(2) : filePath;

	if (starter) {
		const files = await starter.getFiles();
		if (files.some((file) => normalizeAttributionPath(file) === target)) {
			return {
				source: 'starter',
				sourceId: starter.id,
				sourceName: starter.name,
			};
		}
	}

	const typeOrder: Array<AddOnType> = ['add-on', 'example', 'toolchain', 'deployment'];
	const phaseOrder: Array<AddOnPhase> = ['setup', 'add-on', 'example'];
	const ordered = typeOrder.flatMap((type) =>
		phaseOrder.flatMap((phase) =>
			addOns.filter((addOn) => addOn.phase === phase && addOn.type === type),
		),
	);

	for (let index = ordered.length - 1; index >= 0; index--) {
		const addOn = ordered[index];
		if (!addOn) continue;

		const files = await addOn.getFiles();
		if (files.some((file) => normalizeAttributionPath(file) === target)) {
			return {
				source: 'add-on',
				sourceId: addOn.id,
				sourceName: addOn.name,
			};
		}
	}

	const frameworkFiles = await framework.getFiles();
	if (frameworkFiles.some((file) => normalizeAttributionPath(file) === target)) {
		return {
			source: 'framework',
			sourceId: framework.id,
			sourceName: framework.name,
		};
	}

	return null;
}

function integrationInjections(integration: IntegrationWithSource): Array<InjectionPattern> {
	const source = {
		sourceId: integration._sourceId,
		sourceName: integration._sourceName,
	};
	const injections: Array<InjectionPattern> = [];
	const appliesTo = (path: string) => {
		if (integration.type === 'vite-plugin') return path.includes('vite.config');
		if (
			integration.type === 'provider' ||
			integration.type === 'root-provider' ||
			integration.type === 'devtools'
		) {
			return path.includes('__root') || path.includes('root.tsx');
		}
		return false;
	};

	if (integration.import) {
		const prefix = integration.import.split(' from ')[0];
		injections.push({
			matches: (line) => line.includes(prefix),
			appliesTo,
			source,
		});
	}

	const code = integration.code || integration.jsName;
	if (code) {
		injections.push({
			matches: (line) => line.includes(code),
			appliesTo,
			source,
		});
	}

	return injections;
}

function dependencyInjection(dep: DependencyAttribution): InjectionPattern {
	return {
		matches: (line) => line.includes(`"${dep.name}"`),
		appliesTo: (path) => path.endsWith('package.json'),
		source: { sourceId: dep.sourceId, sourceName: dep.sourceName },
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
	if (!isRecord(value)) return undefined;

	const result: Record<string, string> = {};
	for (const [key, entryValue] of Object.entries(value)) {
		if (typeof entryValue !== 'string') {
			return undefined;
		}
		result[key] = entryValue;
	}

	return result;
}

function collectPackageTemplateDependencies(
	packageTemplate: string,
	source: AttributionSource,
): Array<DependencyAttribution> {
	try {
		const value: unknown = JSON.parse(packageTemplate.replace(/"[^"]*<%[^%]*%>[^"]*"/g, '""'));
		if (!isRecord(value)) return [];

		return [
			...collectDependencies(readStringRecord(value.dependencies), 'dependency', source),
			...collectDependencies(readStringRecord(value.devDependencies), 'devDependency', source),
		];
	} catch {
		return [];
	}
}

function collectDependencies(
	deps: Record<string, string> | undefined,
	type: 'dependency' | 'devDependency',
	source: AttributionSource,
): Array<DependencyAttribution> {
	if (!deps) return [];

	return Object.entries(deps).map(([name, version]) => ({
		name,
		version,
		type,
		...source,
	}));
}

async function computeAttribution(input: {
	framework: Framework;
	chosenAddOns: Array<AddOn>;
	starter?: Starter;
	files: Record<string, string>;
}): Promise<AttributionOutput> {
	const { framework, chosenAddOns, starter, files } = input;

	const integrations = chosenAddOns.flatMap((addOn) =>
		(addOn.integrations ?? []).map((integration) => ({
			...integration,
			_sourceId: addOn.id,
			_sourceName: addOn.name,
		})),
	);

	const dependencies = chosenAddOns.flatMap((addOn) => {
		const source = { sourceId: addOn.id, sourceName: addOn.name };

		return [
			...collectDependencies(addOn.packageAdditions?.dependencies, 'dependency', source),
			...collectDependencies(addOn.packageAdditions?.devDependencies, 'devDependency', source),
			...(addOn.packageTemplate
				? collectPackageTemplateDependencies(addOn.packageTemplate, source)
				: []),
		];
	});

	const injections = [
		...integrations.flatMap(integrationInjections),
		...dependencies.map(dependencyInjection),
	];
	const attributedFiles: Record<string, CtaAttributedFile> = {};

	for (const [filePath, content] of Object.entries(files)) {
		const provenance = await getFileProvenance(filePath, framework, chosenAddOns, starter);
		if (!provenance) continue;

		const lines = content.split('\n');
		const relevant = injections.filter((injection) => injection.appliesTo(filePath));
		const injectedLines = new Map<number, AttributionSource>();

		for (const injection of relevant) {
			lines.forEach((line, index) => {
				if (injection.matches(line) && !injectedLines.has(index + 1)) {
					injectedLines.set(index + 1, injection.source);
				}
			});
		}

		attributedFiles[filePath] = {
			content,
			provenance,
			lineAttributions: lines.map((_, index) => {
				const line = index + 1;
				const injected = injectedLines.get(line);

				return injected
					? {
							line,
							sourceId: injected.sourceId,
							sourceName: injected.sourceName,
							type: 'injected',
						}
					: {
							line,
							sourceId: provenance.sourceId,
							sourceName: provenance.sourceName,
							type: 'original',
						};
			}),
		};
	}

	return { attributedFiles, dependencies };
}

// Line attribution interface (used by the UI)
export interface LineAttribution {
	lineNumber: number;
	featureId: string;
	featureName: string;
	type?: 'original' | 'injected';
}

export interface AttributedFile {
	path: string;
	content: string;
	attributions: Array<LineAttribution>;
}

export interface AttributedCompileOutput extends CompileResponse {
	attributedFiles: Record<string, AttributedFile>;
	dependencies?: Array<{
		name: string;
		version: string;
		type: 'dependency' | 'devDependency';
		sourceId: string;
		sourceName: string;
	}>;
}

export async function compileWithAttributionHandler(
	definition: ProjectDefinition,
): Promise<AttributedCompileOutput> {
	const frameworkId = definition.framework ?? 'react';
	const framework = await getFramework(frameworkId);
	const featureOptions = definition.featureOptions ?? {};

	// Merge selectedExample into features (CTA treats examples as add-ons)
	const allFeatures = definition.selectedExample
		? [...definition.features, definition.selectedExample]
		: definition.features;

	// Custom integrations disabled until stable launch
	const chosenAddOns = await resolveAddOns(allFeatures, [], frameworkId);

	const { environment, output } = createMemoryEnvironment(`/project/${definition.name}`);

	// Custom starters disabled until stable launch
	await create.createApp(environment, {
		projectName: definition.name,
		targetDir: `/project/${definition.name}`,
		framework,
		mode: DEFAULT_MODE,
		typescript: true,
		tailwind: definition.tailwind ?? true,
		packageManager: definition.packageManager ?? 'pnpm',
		git: false,
		install: false,
		intent: false,
		chosenAddOns,
		addOnOptions: mergeOptionsWithDefaults(chosenAddOns, featureOptions),
	});

	const packageJson = output.files['package.json']
		? JSON.parse(output.files['package.json'])
		: { dependencies: {}, devDependencies: {}, scripts: {} };

	// Compute attribution using the new cta-engine attribution system
	const attribution = await computeAttribution({
		framework,
		chosenAddOns,
		starter: undefined,
		files: output.files,
	});

	// Convert cta-engine attribution format to our UI format
	// Baseline sources (framework + required addons) get mapped to 'base'
	const baselineSourceIds = new Set([framework.id, ...DEFAULT_REQUIRED_ADDONS]);
	const attributedFiles: Record<string, AttributedFile> = {};

	for (const [filePath, ctaFile] of Object.entries(attribution.attributedFiles)) {
		attributedFiles[filePath] = {
			path: filePath,
			content: ctaFile.content,
			attributions: ctaFile.lineAttributions.map((attr) => {
				const isBaseline = baselineSourceIds.has(attr.sourceId);
				return {
					lineNumber: attr.line,
					featureId: isBaseline ? 'base' : attr.sourceId,
					featureName: isBaseline ? 'Base Template' : attr.sourceName,
					type: attr.type,
				};
			}),
		};
	}

	// For files that weren't in the attribution (e.g., generated files), use base attribution
	for (const [filePath, content] of Object.entries(output.files)) {
		if (!attributedFiles[filePath]) {
			const lines = content.split('\n');
			attributedFiles[filePath] = {
				path: filePath,
				content,
				attributions: lines.map((_, i) => ({
					lineNumber: i + 1,
					featureId: 'base',
					featureName: 'Base Template',
					type: 'original' as const,
				})),
			};
		}
	}

	return {
		files: output.files,
		packages: {
			dependencies: packageJson.dependencies || {},
			devDependencies: packageJson.devDependencies || {},
			scripts: packageJson.scripts || {},
		},
		envVars: extractEnvVars(chosenAddOns),
		commands: output.commands,
		warnings: extractWarnings(chosenAddOns),
		attributedFiles,
		dependencies: attribution.dependencies,
	};
}
