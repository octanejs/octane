import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format } from 'prettier';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EXAMPLES_ROOT = path.join(REPO_ROOT, 'examples');
export const CATALOG_PATH = path.join(EXAMPLES_ROOT, 'catalog.json');

const TOP_LEVEL_FIELDS = new Set([
	'$schema',
	'schemaVersion',
	'id',
	'title',
	'summary',
	'status',
	'renderModes',
	'dialects',
	'bindings',
	'octaneFeatures',
	'commands',
	'journeys',
	'faultScenarios',
]);
const COMMAND_FIELDS = new Set(['build', 'typecheck', 'e2e']);
const JOURNEY_FIELDS = new Set(['id', 'title', 'kind', 'spec', 'critical']);
const FAULT_FIELDS = new Set(['id', 'description']);
const STATUS_VALUES = new Set(['active', 'experimental']);
const RENDER_MODE_VALUES = new Set(['client', 'ssr', 'streaming-ssr', 'hydration', 'static']);
const DIALECT_VALUES = new Set(['tsrx', 'tsx']);
const JOURNEY_KIND_VALUES = new Set(['health', 'golden', 'resilience', 'ssr-hydration']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCRIPT_NAME = /^[a-z0-9][a-z0-9:-]*$/;
const BINDING_NAME = /^@octanejs\/[a-z0-9][a-z0-9-]*$/;
const SPEC_PATH = /^e2e\/[A-Za-z0-9_./-]+\.spec\.ts$/;

const KNOWN_BINDINGS = new Set(
	readdirSync(path.join(REPO_ROOT, 'packages'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.flatMap((entry) => {
			const directory = path.join(REPO_ROOT, 'packages', entry.name);
			if (!existsSync(path.join(directory, 'status.json'))) return [];
			const packagePath = path.join(directory, 'package.json');
			if (!existsSync(packagePath)) return [];
			try {
				const name = JSON.parse(readFileSync(packagePath, 'utf8')).name;
				return typeof name === 'string' && BINDING_NAME.test(name) ? [name] : [];
			} catch {
				return [];
			}
		}),
);

function readJson(file, errors) {
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch (error) {
		errors.push(
			`${path.relative(REPO_ROOT, file)} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
		return undefined;
	}
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkFields(value, allowed, required, label, errors) {
	if (!isRecord(value)) {
		errors.push(`${label} must be an object`);
		return false;
	}
	for (const field of Object.keys(value)) {
		if (!allowed.has(field)) errors.push(`${label} has unknown field ${JSON.stringify(field)}`);
	}
	for (const field of required) {
		if (!(field in value)) errors.push(`${label} is missing ${JSON.stringify(field)}`);
	}
	return true;
}

function checkString(value, label, errors, options = {}) {
	if (typeof value !== 'string' || value.length < (options.minLength ?? 1)) {
		errors.push(`${label} must be a string with at least ${options.minLength ?? 1} character(s)`);
		return false;
	}
	if (options.pattern && !options.pattern.test(value)) {
		errors.push(`${label} has invalid value ${JSON.stringify(value)}`);
		return false;
	}
	return true;
}

function checkStringArray(value, label, errors, options = {}) {
	if (!Array.isArray(value)) {
		errors.push(`${label} must be an array`);
		return false;
	}
	if (value.length < (options.minItems ?? 0)) {
		errors.push(`${label} must contain at least ${options.minItems} item(s)`);
	}
	const seen = new Set();
	for (let index = 0; index < value.length; index++) {
		const item = value[index];
		if (typeof item !== 'string') {
			errors.push(`${label}[${index}] must be a string`);
			continue;
		}
		if (seen.has(item)) errors.push(`${label} contains duplicate ${JSON.stringify(item)}`);
		seen.add(item);
		if (options.values && !options.values.has(item)) {
			errors.push(`${label}[${index}] has unsupported value ${JSON.stringify(item)}`);
		}
		if (options.pattern && !options.pattern.test(item)) {
			errors.push(`${label}[${index}] has invalid value ${JSON.stringify(item)}`);
		}
	}
	return true;
}

function checkUniqueIds(items, label, errors) {
	const ids = new Set();
	for (const item of items) {
		if (!isRecord(item) || typeof item.id !== 'string') continue;
		if (ids.has(item.id)) errors.push(`${label} contains duplicate id ${JSON.stringify(item.id)}`);
		ids.add(item.id);
	}
}

function isInside(directory, candidate) {
	const relative = path.relative(directory, candidate);
	return (
		relative !== '' &&
		!relative.startsWith(`..${path.sep}`) &&
		relative !== '..' &&
		!path.isAbsolute(relative)
	);
}

/** Validate both the portable schema shape and this repository's file/script links. */
export function validateExampleManifest(example, errors = []) {
	const { directory, directoryName, manifest, packageManifest } = example;
	const label = `examples/${directoryName}/example.json`;
	if (!checkFields(manifest, TOP_LEVEL_FIELDS, TOP_LEVEL_FIELDS, label, errors)) return errors;

	if (manifest.$schema !== '../example.schema.json') {
		errors.push(`${label} "$schema" must be "../example.schema.json"`);
	}
	if (manifest.schemaVersion !== 1) errors.push(`${label} "schemaVersion" must be 1`);
	if (checkString(manifest.id, `${label} "id"`, errors, { pattern: SLUG })) {
		if (manifest.id !== directoryName) {
			errors.push(`${label} "id" must match its directory name ${JSON.stringify(directoryName)}`);
		}
	}
	checkString(manifest.title, `${label} "title"`, errors);
	checkString(manifest.summary, `${label} "summary"`, errors, { minLength: 20 });
	if (!STATUS_VALUES.has(manifest.status)) {
		errors.push(`${label} "status" must be one of ${[...STATUS_VALUES].join(', ')}`);
	}
	checkStringArray(manifest.renderModes, `${label} "renderModes"`, errors, {
		minItems: 1,
		values: RENDER_MODE_VALUES,
	});
	checkStringArray(manifest.dialects, `${label} "dialects"`, errors, {
		minItems: 1,
		values: DIALECT_VALUES,
	});
	checkStringArray(manifest.bindings, `${label} "bindings"`, errors, {
		pattern: BINDING_NAME,
	});
	checkStringArray(manifest.octaneFeatures, `${label} "octaneFeatures"`, errors, {
		minItems: 1,
		pattern: SLUG,
	});

	if (
		Array.isArray(manifest.renderModes) &&
		manifest.renderModes.includes('hydration') &&
		!manifest.renderModes.some((mode) => mode === 'ssr' || mode === 'streaming-ssr')
	) {
		errors.push(`${label} hydration requires either ssr or streaming-ssr`);
	}

	const packageScripts = isRecord(packageManifest?.scripts) ? packageManifest.scripts : {};
	if (!isRecord(packageManifest)) {
		errors.push(`examples/${directoryName}/package.json must be an object`);
	} else {
		if (packageManifest.private !== true) {
			errors.push(`examples/${directoryName}/package.json must be private`);
		}
		const dependencies = {
			...(isRecord(packageManifest.dependencies) ? packageManifest.dependencies : {}),
			...(isRecord(packageManifest.optionalDependencies)
				? packageManifest.optionalDependencies
				: {}),
			...(isRecord(packageManifest.devDependencies) ? packageManifest.devDependencies : {}),
			...(isRecord(packageManifest.peerDependencies) ? packageManifest.peerDependencies : {}),
		};
		if (typeof dependencies.octane !== 'string') {
			errors.push(`examples/${directoryName}/package.json must declare octane`);
		}
		for (const reactRuntime of ['react', 'react-dom']) {
			if (reactRuntime in dependencies) {
				errors.push(
					`examples/${directoryName}/package.json must use Octane, not declare the ${reactRuntime} runtime`,
				);
			}
		}
		for (const binding of Array.isArray(manifest.bindings) ? manifest.bindings : []) {
			if (typeof binding !== 'string' || !BINDING_NAME.test(binding)) continue;
			if (!KNOWN_BINDINGS.has(binding)) {
				errors.push(`${label} binding ${binding} is not a status-backed workspace binding`);
			} else if (typeof dependencies[binding] !== 'string') {
				errors.push(`${label} binding ${binding} is not declared in package.json`);
			}
		}
		const runtimeDependencies = {
			...(isRecord(packageManifest.dependencies) ? packageManifest.dependencies : {}),
			...(isRecord(packageManifest.optionalDependencies)
				? packageManifest.optionalDependencies
				: {}),
		};
		const declaredBindings = new Set(Array.isArray(manifest.bindings) ? manifest.bindings : []);
		for (const dependency of Object.keys(runtimeDependencies)) {
			if (KNOWN_BINDINGS.has(dependency) && !declaredBindings.has(dependency)) {
				errors.push(`${label} omits runtime binding ${dependency} from "bindings"`);
			}
		}
	}

	if (
		checkFields(manifest.commands, COMMAND_FIELDS, COMMAND_FIELDS, `${label} "commands"`, errors)
	) {
		const commands = manifest.commands;
		const commandNames = [];
		if (
			checkStringArray(commands.build, `${label} "commands.build"`, errors, {
				minItems: 1,
				pattern: SCRIPT_NAME,
			})
		) {
			commandNames.push(...commands.build);
			if (commands.build.length !== 1 || commands.build[0] !== 'build') {
				errors.push(`${label} "commands.build" must be exactly ["build"]`);
			}
		}
		for (const field of ['typecheck', 'e2e']) {
			if (
				checkString(commands[field], `${label} "commands.${field}"`, errors, {
					pattern: SCRIPT_NAME,
				})
			) {
				commandNames.push(commands[field]);
			}
		}
		if (commands.typecheck !== 'typecheck') {
			errors.push(`${label} "commands.typecheck" must be the standard "typecheck" script`);
		}
		if (commands.e2e !== 'test:e2e') {
			errors.push(`${label} "commands.e2e" must be the standard "test:e2e" script`);
		}
		for (const command of commandNames) {
			if (typeof packageScripts[command] !== 'string') {
				errors.push(`${label} command ${JSON.stringify(command)} is not a package.json script`);
			}
		}
	}

	if (!Array.isArray(manifest.journeys) || manifest.journeys.length === 0) {
		errors.push(`${label} "journeys" must contain at least one journey`);
	} else {
		checkUniqueIds(manifest.journeys, `${label} "journeys"`, errors);
		let criticalJourneys = 0;
		for (let index = 0; index < manifest.journeys.length; index++) {
			const journey = manifest.journeys[index];
			const journeyLabel = `${label} "journeys[${index}]"`;
			if (!checkFields(journey, JOURNEY_FIELDS, JOURNEY_FIELDS, journeyLabel, errors)) continue;
			checkString(journey.id, `${journeyLabel}.id`, errors, { pattern: SLUG });
			checkString(journey.title, `${journeyLabel}.title`, errors);
			if (!JOURNEY_KIND_VALUES.has(journey.kind)) {
				errors.push(`${journeyLabel}.kind has unsupported value ${JSON.stringify(journey.kind)}`);
			}
			if (typeof journey.critical !== 'boolean') {
				errors.push(`${journeyLabel}.critical must be a boolean`);
			} else if (journey.critical) {
				criticalJourneys++;
			}
			if (checkString(journey.spec, `${journeyLabel}.spec`, errors, { pattern: SPEC_PATH })) {
				const specPath = path.resolve(directory, journey.spec);
				if (!isInside(directory, specPath)) {
					errors.push(`${journeyLabel}.spec escapes the example directory`);
				} else if (!existsSync(specPath) || !statSync(specPath).isFile()) {
					errors.push(`${journeyLabel}.spec does not exist: ${journey.spec}`);
				}
			}
		}
		if (criticalJourneys === 0) errors.push(`${label} must declare at least one critical journey`);
	}

	if (!Array.isArray(manifest.faultScenarios)) {
		errors.push(`${label} "faultScenarios" must be an array`);
	} else {
		checkUniqueIds(manifest.faultScenarios, `${label} "faultScenarios"`, errors);
		for (let index = 0; index < manifest.faultScenarios.length; index++) {
			const fault = manifest.faultScenarios[index];
			const faultLabel = `${label} "faultScenarios[${index}]"`;
			if (!checkFields(fault, FAULT_FIELDS, FAULT_FIELDS, faultLabel, errors)) continue;
			checkString(fault.id, `${faultLabel}.id`, errors, { pattern: SLUG });
			checkString(fault.description, `${faultLabel}.description`, errors);
		}
	}

	return errors;
}

/** Discover every package directly under examples/ and require a manifest. */
export function getExamples() {
	const errors = [];
	const examples = [];
	const directories = readdirSync(EXAMPLES_ROOT, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name !== '_shared')
		.sort((a, b) => a.name.localeCompare(b.name));

	for (const entry of directories) {
		const directory = path.join(EXAMPLES_ROOT, entry.name);
		const packagePath = path.join(directory, 'package.json');
		const manifestPath = path.join(directory, 'example.json');
		if (!existsSync(packagePath) && !existsSync(manifestPath)) continue;
		if (!existsSync(packagePath)) {
			errors.push(`examples/${entry.name}/example.json has no sibling package.json`);
			continue;
		}
		if (!existsSync(manifestPath)) {
			errors.push(`examples/${entry.name} is missing example.json`);
			continue;
		}
		const packageManifest = readJson(packagePath, errors);
		const manifest = readJson(manifestPath, errors);
		if (packageManifest === undefined || manifest === undefined) continue;
		const example = {
			directory,
			directoryName: entry.name,
			manifestPath,
			manifest,
			packageManifest,
		};
		validateExampleManifest(example, errors);
		examples.push(example);
	}

	examples.sort((a, b) => String(a.manifest.id).localeCompare(String(b.manifest.id)));
	return { examples, errors };
}

export function createExamplesCatalog(examples) {
	return {
		schemaVersion: 1,
		examples: examples.map(({ directoryName, manifest }) => ({
			directory: `examples/${directoryName}`,
			id: manifest.id,
			title: manifest.title,
			summary: manifest.summary,
			status: manifest.status,
			renderModes: manifest.renderModes,
			dialects: manifest.dialects,
			bindings: manifest.bindings,
			octaneFeatures: manifest.octaneFeatures,
			commands: {
				build: manifest.commands.build,
				typecheck: manifest.commands.typecheck,
				e2e: manifest.commands.e2e,
			},
			journeys: manifest.journeys.map((journey) => ({
				id: journey.id,
				title: journey.title,
				kind: journey.kind,
				spec: journey.spec,
				critical: journey.critical,
			})),
			faultScenarios: manifest.faultScenarios.map((scenario) => ({
				id: scenario.id,
				description: scenario.description,
			})),
		})),
	};
}

export function renderExamplesCatalog(examples) {
	return format(JSON.stringify(createExamplesCatalog(examples)), {
		parser: 'json',
		printWidth: 100,
		tabWidth: 2,
		useTabs: false,
	});
}

async function runCli() {
	const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--check');
	if (unknownArguments.length > 0) {
		console.error(`unknown argument(s): ${unknownArguments.join(', ')}`);
		process.exit(1);
	}

	const { examples, errors } = getExamples();
	if (errors.length > 0) {
		console.error(`examples catalog input is invalid:\n  - ${errors.join('\n  - ')}`);
		process.exit(1);
	}

	const expected = await renderExamplesCatalog(examples);
	if (process.argv.includes('--check')) {
		const current = existsSync(CATALOG_PATH) ? readFileSync(CATALOG_PATH, 'utf8') : '';
		if (current !== expected) {
			console.error(
				'examples/catalog.json is stale — run `node scripts/examples-catalog.mjs` and commit the result.',
			);
			process.exit(1);
		}
		console.log(`examples catalog is current (${examples.length} example(s)).`);
		return;
	}

	writeFileSync(CATALOG_PATH, expected);
	console.log(`wrote examples/catalog.json (${examples.length} example(s)).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	runCli().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
