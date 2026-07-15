/**
 * Dependency-free renderer selection shared by compiler integrations and
 * language tooling. This module deliberately does not import the compiler,
 * bundler APIs, or Node path helpers: renderer config is serializable data and
 * resolving the same normalized module ID must produce the same answer in
 * every host.
 */

export const DOM_RENDERER_ID = 'dom';
export const DOM_RENDERER_MODULE = 'octane';
export const RENDERER_CONFIG_VERSION = 2;

const RENDERER_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const MODULE_EXPORT_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const PROP_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const CONFIG_KEYS = new Set(['boundaries', 'default', 'registry', 'rules', 'signature']);
const RULE_KEYS = new Set(['exclude', 'include', 'renderer']);
const REGISTRY_ENTRY_KEYS = new Set(['module', 'target']);
const BOUNDARY_ENTRY_KEYS = new Set(['childRenderer', 'ownerRenderer', 'prop']);

function configError(message) {
	return new Error(`octane/compiler/renderers: ${message}`);
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertKnownKeys(value, allowed, path) {
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) {
			throw configError(`${path}.${key} is not a supported option.`);
		}
	}
}

function validateRendererId(value, path) {
	if (typeof value !== 'string' || !RENDERER_ID.test(value)) {
		throw configError(
			`${path} must be a lowercase renderer ID (for example "dom", "three", or "test-object").`,
		);
	}
	return value;
}

function validateModuleId(value, path) {
	if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
		throw configError(`${path} must be a non-empty renderer module ID.`);
	}
	if (value.includes('\0') || value.includes('\\')) {
		throw configError(`${path} must use a portable module ID with forward slashes.`);
	}
	if (value === '.' || value === '..' || value.startsWith('./') || value.startsWith('../')) {
		throw configError(`${path} must be a package or project-root module ID, not a relative path.`);
	}
	return value;
}

function normalizeRegistryEntry(id, value, path) {
	let moduleId;
	let target;
	if (typeof value === 'string') {
		moduleId = validateModuleId(value, path);
		target = 'universal';
	} else {
		if (!isRecord(value)) {
			throw configError(`${path} must be a renderer module ID or { module, target } object.`);
		}
		assertKnownKeys(value, REGISTRY_ENTRY_KEYS, path);
		moduleId = validateModuleId(value.module, `${path}.module`);
		target = value.target ?? 'universal';
		if (target !== 'dom' && target !== 'universal') {
			throw configError(`${path}.target must be "dom" or "universal".`);
		}
	}

	if (id === DOM_RENDERER_ID) {
		if (moduleId !== DOM_RENDERER_MODULE || target !== 'dom') {
			throw configError(
				`compiler.renderers.registry.dom is built in as { module: ${JSON.stringify(DOM_RENDERER_MODULE)}, target: "dom" } and cannot be replaced.`,
			);
		}
	} else if (target === 'dom') {
		throw configError(`${path}.target cannot be "dom"; use the built-in "dom" renderer.`);
	}

	return Object.freeze({ module: moduleId, target });
}

function normalizeBoundaries(value, registry) {
	if (value === undefined) return Object.freeze({});
	if (!isRecord(value)) {
		throw configError(
			'compiler.renderers.boundaries must be an object keyed by module ID and export name.',
		);
	}

	const modules = [];
	for (const [moduleValue, rawExports] of Object.entries(value).sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	)) {
		const moduleId = validateModuleId(
			moduleValue,
			`compiler.renderers.boundaries module ${JSON.stringify(moduleValue)}`,
		);
		const modulePath = `compiler.renderers.boundaries[${JSON.stringify(moduleId)}]`;
		if (!isRecord(rawExports) || Object.keys(rawExports).length === 0) {
			throw configError(`${modulePath} must contain at least one boundary export.`);
		}

		const exports = [];
		for (const [exportName, rawBoundary] of Object.entries(rawExports).sort(([a], [b]) =>
			a < b ? -1 : a > b ? 1 : 0,
		)) {
			const path = `${modulePath}[${JSON.stringify(exportName)}]`;
			if (!MODULE_EXPORT_NAME.test(exportName)) {
				throw configError(
					`${path} must use a JavaScript export name (for example "Canvas", "Html", or "default").`,
				);
			}
			if (!isRecord(rawBoundary)) {
				throw configError(`${path} must be a renderer boundary metadata object.`);
			}
			assertKnownKeys(rawBoundary, BOUNDARY_ENTRY_KEYS, path);

			const ownerRenderer = validateRendererId(rawBoundary.ownerRenderer, `${path}.ownerRenderer`);
			const childRenderer = validateRendererId(rawBoundary.childRenderer, `${path}.childRenderer`);
			if (!Object.hasOwn(registry, ownerRenderer)) {
				throw configError(
					`${path}.ownerRenderer references unknown renderer ${JSON.stringify(ownerRenderer)}.`,
				);
			}
			if (!Object.hasOwn(registry, childRenderer)) {
				throw configError(
					`${path}.childRenderer references unknown renderer ${JSON.stringify(childRenderer)}.`,
				);
			}
			if (ownerRenderer === childRenderer) {
				throw configError(
					`${path} must switch renderers; ownerRenderer and childRenderer are both ${JSON.stringify(ownerRenderer)}.`,
				);
			}
			if (typeof rawBoundary.prop !== 'string' || !PROP_NAME.test(rawBoundary.prop)) {
				throw configError(
					`${path}.prop must be a JavaScript prop name (for example "children" or "content").`,
				);
			}
			if (rawBoundary.prop === 'key' || rawBoundary.prop === '__proto__') {
				throw configError(
					`${path}.prop cannot be ${JSON.stringify(rawBoundary.prop)} because that name cannot carry a renderer-owned component prop.`,
				);
			}

			exports.push([
				exportName,
				Object.freeze({ ownerRenderer, childRenderer, prop: rawBoundary.prop }),
			]);
		}
		modules.push([moduleId, Object.freeze(Object.fromEntries(exports))]);
	}

	return Object.freeze(Object.fromEntries(modules));
}

function normalizePattern(value, path) {
	if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
		throw configError(`${path} must contain non-empty glob strings.`);
	}
	if (value.includes('\0')) {
		throw configError(`${path} contains an invalid glob.`);
	}
	if (value.startsWith('!')) {
		throw configError(`${path} must use \`exclude\` instead of a negated glob.`);
	}

	let pattern = value.replaceAll('\\', '/');
	while (pattern.startsWith('./')) pattern = pattern.slice(2);
	while (pattern.startsWith('/')) pattern = pattern.slice(1);
	pattern = pattern.replace(/\/{2,}/g, '/');
	if (pattern.length === 0) throw configError(`${path} must not resolve to an empty glob.`);
	if (pattern.split('/').includes('..')) {
		throw configError(`${path} must not traverse outside the project with "..".`);
	}

	// Parse now so malformed braces/classes fail during config loading rather
	// than producing a bundler-specific answer later.
	for (const expanded of expandBraces(pattern, path)) compileGlob(expanded, path);
	return pattern;
}

function normalizePatternList(value, path, optional = false) {
	if (value === undefined && optional) return [];
	const input = typeof value === 'string' ? [value] : value;
	if (optional && Array.isArray(input) && input.length === 0) return [];
	if (!Array.isArray(input) || input.length === 0) {
		throw configError(`${path} must be a glob string or a non-empty array of glob strings.`);
	}
	const patterns = input.map((pattern, index) => normalizePattern(pattern, `${path}[${index}]`));
	return [...new Set(patterns)].sort();
}

function findClosingBrace(pattern, start, path) {
	let depth = 0;
	for (let index = start; index < pattern.length; index++) {
		const character = pattern[index];
		if (character === '{') depth++;
		if (character === '}' && --depth === 0) return index;
	}
	throw configError(`${path} contains an unclosed "{".`);
}

function splitBraceAlternatives(value) {
	const alternatives = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < value.length; index++) {
		const character = value[index];
		if (character === '{') depth++;
		if (character === '}') depth--;
		if (character === ',' && depth === 0) {
			alternatives.push(value.slice(start, index));
			start = index + 1;
		}
	}
	alternatives.push(value.slice(start));
	return alternatives;
}

function expandBraces(pattern, path) {
	const start = pattern.indexOf('{');
	if (start === -1) {
		if (pattern.includes('}')) throw configError(`${path} contains an unmatched "}".`);
		return [pattern];
	}
	const end = findClosingBrace(pattern, start, path);
	const alternatives = splitBraceAlternatives(pattern.slice(start + 1, end));
	if (alternatives.length < 2 || alternatives.some((alternative) => alternative.length === 0)) {
		throw configError(`${path} braces must contain two or more non-empty alternatives.`);
	}
	const prefix = pattern.slice(0, start);
	const suffix = pattern.slice(end + 1);
	return alternatives.flatMap((alternative) => expandBraces(prefix + alternative + suffix, path));
}

function escapeRegex(character) {
	return /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
}

function compileGlob(pattern, path) {
	let source = '^';
	for (let index = 0; index < pattern.length; index++) {
		const character = pattern[index];
		if (character === '*') {
			if (pattern[index + 1] === '*') {
				while (pattern[index + 1] === '*') index++;
				if (pattern[index + 1] === '/') {
					index++;
					source += '(?:.*/)?';
				} else {
					source += '.*';
				}
			} else {
				source += '[^/]*';
			}
			continue;
		}
		if (character === '?') {
			source += '[^/]';
			continue;
		}
		if (character === '[') {
			const end = pattern.indexOf(']', index + 1);
			if (end === -1) throw configError(`${path} contains an unclosed "[".`);
			let content = pattern.slice(index + 1, end);
			if (content.length === 0 || content.includes('/')) {
				throw configError(`${path} contains an invalid character class.`);
			}
			if (content[0] === '!') content = '^' + content.slice(1);
			else if (content[0] === '^') content = '\\' + content;
			source += `[${content.replaceAll('\\', '\\\\')}]`;
			index = end;
			continue;
		}
		if (character === ']') throw configError(`${path} contains an unmatched "]".`);
		source += escapeRegex(character);
	}
	return new RegExp(source + '$');
}

function normalizeFilename(filename) {
	if (typeof filename !== 'string' || filename.length === 0) {
		throw configError('resolveRendererForFile requires a non-empty filename.');
	}
	let end = filename.length;
	for (const suffix of ['?', '#']) {
		const index = filename.indexOf(suffix);
		if (index !== -1 && index < end) end = index;
	}
	let normalized = filename.slice(0, end).replaceAll('\\', '/');
	while (normalized.startsWith('./')) normalized = normalized.slice(2);
	while (normalized.startsWith('/')) normalized = normalized.slice(1);
	normalized = normalized.replace(/\/{2,}/g, '/');
	const segments = [];
	for (const segment of normalized.split('/')) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..' && segments.length > 0 && segments.at(-1) !== '..') segments.pop();
		else segments.push(segment);
	}
	return segments.join('/');
}

function matchesPattern(filename, pattern, path) {
	return expandBraces(pattern, path).some((expanded) => compileGlob(expanded, path).test(filename));
}

function stableSignature(value) {
	return `octane-renderers-v${RENDERER_CONFIG_VERSION}:${JSON.stringify(value)}`;
}

/**
 * Validate and canonicalize declarative renderer configuration.
 *
 * Registry aliases map to importable module IDs. `dom` is built in and cannot
 * be replaced. Rule order is preserved because the first matching rule wins;
 * registry keys and each rule's pattern sets are sorted so semantically equal
 * configuration receives the same cache signature.
 *
 * @param {unknown} [input]
 */
export function normalizeRendererConfig(input = {}) {
	if (!isRecord(input)) {
		throw configError('compiler.renderers must be an object when provided.');
	}
	assertKnownKeys(input, CONFIG_KEYS, 'compiler.renderers');

	const rawRegistry = input.registry ?? {};
	if (!isRecord(rawRegistry)) {
		throw configError('compiler.renderers.registry must be an object of renderer module IDs.');
	}
	const entries = [
		[DOM_RENDERER_ID, Object.freeze({ module: DOM_RENDERER_MODULE, target: 'dom' })],
	];
	for (const [idValue, moduleValue] of Object.entries(rawRegistry).sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	)) {
		const id = validateRendererId(
			idValue,
			`compiler.renderers.registry key ${JSON.stringify(idValue)}`,
		);
		const entry = normalizeRegistryEntry(id, moduleValue, `compiler.renderers.registry.${id}`);
		if (id === DOM_RENDERER_ID) {
			continue;
		}
		entries.push([id, entry]);
	}
	entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	const registry = Object.fromEntries(entries);
	const boundaries = normalizeBoundaries(input.boundaries, registry);

	const defaultRenderer = validateRendererId(
		input.default ?? DOM_RENDERER_ID,
		'compiler.renderers.default',
	);
	if (!Object.hasOwn(registry, defaultRenderer)) {
		throw configError(
			`compiler.renderers.default references unknown renderer ${JSON.stringify(defaultRenderer)}.`,
		);
	}

	const rawRules = input.rules ?? [];
	if (!Array.isArray(rawRules)) {
		throw configError('compiler.renderers.rules must be an array.');
	}
	const rules = rawRules.map((rawRule, index) => {
		const path = `compiler.renderers.rules[${index}]`;
		if (!isRecord(rawRule)) throw configError(`${path} must be an object.`);
		assertKnownKeys(rawRule, RULE_KEYS, path);
		const renderer = validateRendererId(rawRule.renderer, `${path}.renderer`);
		if (!Object.hasOwn(registry, renderer)) {
			throw configError(
				`${path}.renderer references unknown renderer ${JSON.stringify(renderer)}.`,
			);
		}
		return Object.freeze({
			renderer,
			include: Object.freeze(normalizePatternList(rawRule.include, `${path}.include`)),
			exclude: Object.freeze(normalizePatternList(rawRule.exclude, `${path}.exclude`, true)),
		});
	});

	const signature = stableSignature({
		default: defaultRenderer,
		registry: entries.map(([id, { module, target }]) => [id, module, target]),
		rules: rules.map(({ renderer, include, exclude }) => [renderer, include, exclude]),
		boundaries: Object.entries(boundaries).flatMap(([moduleId, exports]) =>
			Object.entries(exports).map(([exportName, { ownerRenderer, childRenderer, prop }]) => [
				moduleId,
				exportName,
				ownerRenderer,
				childRenderer,
				prop,
			]),
		),
	});
	return Object.freeze({
		default: defaultRenderer,
		registry: Object.freeze(registry),
		rules: Object.freeze(rules),
		boundaries,
		signature,
	});
}

/**
 * Resolve a canonical/project-relative module filename to its renderer.
 * Bundler query/hash suffixes and Windows separators do not affect matching.
 * Rules are tested in declaration order and the first match wins.
 *
 * @param {unknown} config Raw or normalized renderer configuration
 * @param {string} filename Canonical module ID (for example `/src/App.tsrx`)
 */
export function resolveRendererForFile(config, filename) {
	const normalized = normalizeRendererConfig(config);
	const normalizedFilename = normalizeFilename(filename);
	let id = normalized.default;

	for (let index = 0; index < normalized.rules.length; index++) {
		const rule = normalized.rules[index];
		const path = `compiler.renderers.rules[${index}]`;
		if (!rule.include.some((pattern) => matchesPattern(normalizedFilename, pattern, path)))
			continue;
		if (rule.exclude.some((pattern) => matchesPattern(normalizedFilename, pattern, path))) continue;
		id = rule.renderer;
		break;
	}

	return Object.freeze({
		id,
		...normalized.registry[id],
	});
}
