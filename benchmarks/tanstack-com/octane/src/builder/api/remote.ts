import { type AddOn } from './create-worker';
import { type AddOnCompiled, type StarterCompiled } from './compile';
import { validateRemoteUrl } from '~/utils/url-validation.server';
import { isRecord } from '~/utils/api-boundary.server';
import { fetchWithTimeout, readResponseJsonWithLimit } from '~/utils/outbound-fetch.server';

export interface RemoteIntegrationResponse {
	integration?: AddOnCompiled;
	error?: string;
}

export interface RemoteTemplateResponse {
	template?: StarterCompiled;
	error?: string;
}

const REMOTE_BUILDER_JSON_MAX_BYTES = 2 * 1024 * 1024;
const REMOTE_BUILDER_TIMEOUT_MS = 10_000;
const REMOTE_BUILDER_MAX_REDIRECTS = 3;
const REMOTE_BUILDER_JSON_TYPES = new Set([
	'application/json',
	'application/octet-stream',
	'text/plain',
]);
const ADD_ON_TYPES = new Set<string>(['add-on', 'deployment', 'example', 'starter', 'toolchain']);
const ADD_ON_PHASES = new Set<string>(['add-on', 'example', 'setup']);
const ADD_ON_CATEGORIES = new Set<string>([
	'analytics',
	'api',
	'auth',
	'cms',
	'database',
	'deploy',
	'i18n',
	'monitoring',
	'orm',
	'other',
	'styling',
	'tanstack',
	'tooling',
]);

function toIntegrationCompiled(addOn: AddOn): AddOnCompiled {
	return {
		id: addOn.id,
		name: addOn.name,
		description: addOn.description,
		type: addOn.type,
		phase: addOn.phase,
		modes: addOn.modes,
		files: addOn.files ?? {},
		deletedFiles: addOn.deletedFiles ?? [],
		dependsOn: addOn.dependsOn,
		options: addOn.options,
		link: addOn.link,
		tailwind: addOn.tailwind ?? true,
		requiresTailwind: addOn.tailwind === true ? undefined : !addOn.tailwind,
		warning: addOn.warning,
		priority: addOn.priority,
		author: addOn.author,
		version: addOn.version,
		license: addOn.license,
		category: addOn.category,
		packageAdditions: addOn.packageAdditions,
	};
}

function isStringArray(value: unknown): value is Array<string> {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStringRecord(value: unknown): value is Record<string, string> {
	return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function readString(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return typeof value === 'string' ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readOptionalBoolean(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return typeof value === 'boolean' ? value : undefined;
}

function readRecord(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return isRecord(value) ? value : undefined;
}

function readStringRecord(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return isStringRecord(value) ? value : undefined;
}

function isAddOnType(value: unknown): value is AddOn['type'] {
	return typeof value === 'string' && ADD_ON_TYPES.has(value);
}

function isAddOnPhase(value: unknown): value is AddOn['phase'] {
	return typeof value === 'string' && ADD_ON_PHASES.has(value);
}

function isAddOnCategory(value: unknown): value is NonNullable<AddOn['category']> {
	return typeof value === 'string' && ADD_ON_CATEGORIES.has(value);
}

function readPackageAdditions(record: Record<string, unknown>) {
	const value = readRecord(record, 'packageAdditions');
	if (!value) return undefined;

	return {
		dependencies: readStringRecord(value, 'dependencies'),
		devDependencies: readStringRecord(value, 'devDependencies'),
		scripts: readStringRecord(value, 'scripts'),
	};
}

function isAllowedRemoteJsonType(contentType: string) {
	if (!contentType) return true;

	const mediaType = contentType.split(';')[0]?.trim().toLowerCase();
	return !!mediaType && (REMOTE_BUILDER_JSON_TYPES.has(mediaType) || mediaType.endsWith('+json'));
}

function assertValidRemoteUrl(url: string) {
	const validation = validateRemoteUrl(url);
	if (!validation.valid || !validation.normalizedUrl) {
		throw new Error(validation.error ?? 'Invalid remote URL');
	}

	return validation.normalizedUrl;
}

async function fetchRemoteJson(url: string) {
	let currentUrl = assertValidRemoteUrl(url);

	for (let redirectCount = 0; redirectCount <= REMOTE_BUILDER_MAX_REDIRECTS; redirectCount++) {
		const response = await fetchWithTimeout(currentUrl, {
			headers: {
				Accept: 'application/json, text/plain;q=0.9, application/octet-stream;q=0.8',
			},
			redirect: 'manual',
			timeoutMs: REMOTE_BUILDER_TIMEOUT_MS,
		});

		if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
			const location = response.headers.get('location');
			if (!location) {
				throw new Error('Remote resource returned an empty redirect');
			}

			currentUrl = assertValidRemoteUrl(new URL(location, currentUrl).toString());
			continue;
		}

		if (response.status >= 300 && response.status < 400) {
			throw new Error('Remote resource redirected without a location');
		}

		if (!response.ok) {
			throw new Error(`Remote resource returned ${response.status}`);
		}

		const contentType = response.headers.get('content-type') ?? '';
		if (!isAllowedRemoteJsonType(contentType)) {
			throw new Error('Remote resource did not return JSON');
		}

		return readResponseJsonWithLimit(response, REMOTE_BUILDER_JSON_MAX_BYTES);
	}

	throw new Error('Remote resource redirected too many times');
}

function toRemoteTemplate(value: unknown, url: string): StarterCompiled | null {
	if (!isRecord(value)) return null;

	const name = readString(value, 'name');
	const description = readString(value, 'description');
	const framework = readString(value, 'framework');
	const mode = readString(value, 'mode');
	const files = readStringRecord(value, 'files');

	if (!name || !description || !framework || !mode || !files) {
		return null;
	}

	return {
		id: readString(value, 'id') ?? url,
		name,
		description,
		type: 'starter',
		phase: 'setup',
		modes: isStringArray(value.modes) ? value.modes : [mode],
		files,
		deletedFiles: isStringArray(value.deletedFiles) ? value.deletedFiles : [],
		framework,
		mode,
		typescript: readOptionalBoolean(value, 'typescript') ?? true,
		tailwind: readOptionalBoolean(value, 'tailwind') ?? true,
		banner: readString(value, 'banner'),
		dependsOn: isStringArray(value.dependsOn) ? value.dependsOn : undefined,
	};
}

async function loadRemoteTemplate(url: string) {
	const json = await fetchRemoteJson(url);
	const template = toRemoteTemplate(json, url);

	if (!template) {
		throw new Error(`Invalid starter: ${url}`);
	}

	return template;
}

function toRemoteAddOn(value: unknown, url: string): AddOn | null {
	if (!isRecord(value)) return null;

	const name = readString(value, 'name');
	const description = readString(value, 'description');
	const type = value.type;
	const phase = value.phase;
	const modes = value.modes;
	const files = readStringRecord(value, 'files');

	if (
		!name ||
		!description ||
		!isAddOnType(type) ||
		!isAddOnPhase(phase) ||
		!isStringArray(modes) ||
		!files
	) {
		return null;
	}

	const deletedFiles = value.deletedFiles;
	const addOn: AddOn = {
		id: url,
		name,
		description,
		type,
		phase,
		modes,
		files,
		deletedFiles: isStringArray(deletedFiles) ? deletedFiles : [],
		author: readString(value, 'author'),
		version: readString(value, 'version'),
		link: readString(value, 'link'),
		license: readString(value, 'license'),
		warning: readString(value, 'warning'),
		tailwind: readOptionalBoolean(value, 'tailwind'),
		category: isAddOnCategory(value.category) ? value.category : undefined,
		priority: readNumber(value, 'priority'),
		dependsOn: isStringArray(value.dependsOn) ? value.dependsOn : undefined,
		packageAdditions: readPackageAdditions(value),
		getFiles: () => Promise.resolve(Object.keys(files)),
		getFileContents: (path: string) => Promise.resolve(files[path] ?? ''),
		getDeletedFiles: () => Promise.resolve(isStringArray(deletedFiles) ? deletedFiles : []),
	};

	return addOn;
}

async function loadRemoteIntegration(url: string) {
	const json = await fetchRemoteJson(url);
	const addOn = toRemoteAddOn(json, url);

	if (!addOn) {
		throw new Error(`Invalid add-on: ${url}`);
	}

	return addOn;
}

export async function loadRemoteIntegrationHandler(
	url: string,
): Promise<RemoteIntegrationResponse> {
	if (!url) {
		return { error: 'URL is required' };
	}

	try {
		const addOn = await loadRemoteIntegration(url);
		const integration = toIntegrationCompiled(addOn);
		return { integration };
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : 'Failed to load integration',
		};
	}
}

export async function loadRemoteTemplateHandler(url: string): Promise<RemoteTemplateResponse> {
	if (!url) {
		return { error: 'URL is required' };
	}

	try {
		const template = await loadRemoteTemplate(url);
		return { template };
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : 'Failed to load template',
		};
	}
}
