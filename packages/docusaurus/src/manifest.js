import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_EXTENSIONS = ['.tsrx', '.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs'];
const RESOLVE_EXTENSIONS = [...SOURCE_EXTENSIONS, '.json', '.mdx', '.md', '.css'];

function toJsonValue(value, trail = '$', active = new WeakSet()) {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return value;
	}
	if (value === undefined) return undefined;
	if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') {
		throw new TypeError(`${trail} is not serializable in a Docusaurus route manifest.`);
	}
	if (active.has(value)) {
		throw new TypeError(`${trail} is cyclic and cannot be serialized.`);
	}
	active.add(value);
	let result;
	if (Array.isArray(value)) {
		result = value.map((item, index) => toJsonValue(item, `${trail}[${index}]`, active));
	} else {
		result = {};
		for (const [key, item] of Object.entries(value)) {
			const serialized = toJsonValue(item, `${trail}.${key}`, active);
			if (serialized !== undefined) result[key] = serialized;
		}
	}
	active.delete(value);
	return result;
}

function moduleId(module) {
	if (typeof module === 'string') return module;
	if (module && typeof module === 'object' && module.__import === true) {
		return {
			__import: true,
			path: String(module.path),
			...(module.query === undefined ? {} : { query: toJsonValue(module.query) }),
		};
	}
	throw new TypeError(`Expected a Docusaurus module reference, received ${String(module)}.`);
}

function routeModules(value) {
	if (typeof value === 'string' || (value && value.__import === true)) {
		return moduleId(value);
	}
	if (Array.isArray(value)) return value.map(routeModules);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([name, item]) => [name, routeModules(item)]),
		);
	}
	throw new TypeError(`Expected a Docusaurus route module, received ${String(value)}.`);
}

function normalizeRoute(route, index, parentId = 'root') {
	const id = `${parentId}/${index}:${route.path}`;
	const modules = routeModules(route.modules ?? {});
	const known = new Set([
		'path',
		'component',
		'modules',
		'context',
		'props',
		'routes',
		'exact',
		'priority',
		'metadata',
		'plugin',
	]);
	const attributes = {};
	for (const [name, value] of Object.entries(route)) {
		if (known.has(name)) continue;
		const serialized = toJsonValue(value, `route(${route.path}).${name}`);
		if (serialized !== undefined) attributes[name] = serialized;
	}
	return {
		id,
		path: String(route.path),
		component: moduleId(route.component),
		exact: route.exact === true,
		...(route.priority === undefined ? {} : { priority: Number(route.priority) }),
		...(Object.keys(modules).length === 0 ? {} : { modules }),
		...(route.context === undefined ? {} : { context: routeModules(route.context) }),
		...(route.props === undefined
			? {}
			: { props: toJsonValue(route.props, `route(${route.path}).props`) }),
		...(route.metadata === undefined
			? {}
			: { metadata: toJsonValue(route.metadata, `route(${route.path}).metadata`) }),
		...(route.plugin === undefined
			? {}
			: { plugin: toJsonValue(route.plugin, `route(${route.path}).plugin`) }),
		...(Object.keys(attributes).length === 0 ? {} : { attributes }),
		children: (route.routes ?? []).map((child, childIndex) =>
			normalizeRoute(child, childIndex, id),
		),
	};
}

function listFiles(directory) {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const absolute = path.join(directory, entry.name);
		return entry.isDirectory() ? listFiles(absolute) : [absolute];
	});
}

function themeKey(file, root) {
	const relative = path.relative(root, file).split(path.sep).join('/');
	if (relative.endsWith('.d.ts')) return null;
	const extension = SOURCE_EXTENSIONS.find((candidate) => relative.endsWith(candidate));
	if (!extension) return null;
	let key = relative.slice(0, -extension.length);
	if (key.endsWith('/index')) key = key.slice(0, -'/index'.length);
	return key;
}

async function themeLayers(plugins) {
	const layers = [];
	for (const plugin of plugins) {
		if (typeof plugin.getThemePath !== 'function') continue;
		const supplied = await plugin.getThemePath();
		if (typeof supplied !== 'string') continue;
		layers.push(path.isAbsolute(supplied) ? supplied : path.resolve(plugin.path, supplied));
	}
	return layers;
}

async function createThemeAliases(plugins, siteDir) {
	const providers = new Map();
	for (const root of await themeLayers(plugins)) {
		for (const file of listFiles(root)) {
			const key = themeKey(file, root);
			if (key === null) continue;
			const entries = providers.get(key) ?? [];
			entries.push(file);
			providers.set(key, entries);
		}
	}
	const theme = {};
	const themeOriginal = {};
	const themeInit = {};
	for (const [key, entries] of providers) {
		theme[key] = entries.at(-1);
		themeOriginal[key] = entries.at(-1);
		if (entries.length > 1) themeInit[key] = entries[0];
	}
	const siteTheme = path.join(siteDir, 'src/theme');
	for (const file of listFiles(siteTheme)) {
		const key = themeKey(file, siteTheme);
		if (key !== null) theme[key] = file;
	}
	return { theme, themeOriginal, themeInit };
}

function readJsonIfPresent(filename, fallback) {
	if (!existsSync(filename)) return fallback;
	return JSON.parse(readFileSync(filename, 'utf8'));
}

function contentMetadata(generatedFilesDir) {
	const roots = [
		path.join(generatedFilesDir, 'docusaurus-plugin-content-docs'),
		path.join(generatedFilesDir, 'docusaurus-plugin-content-pages'),
	];
	const content = {};
	for (const root of roots) {
		for (const file of listFiles(root)) {
			if (!file.endsWith('.json') || path.basename(file).startsWith('__')) continue;
			let value;
			try {
				value = JSON.parse(readFileSync(file, 'utf8'));
			} catch {
				continue;
			}
			if (value && typeof value === 'object' && typeof value.source === 'string') {
				content[value.source] = value;
			}
		}
	}
	return content;
}

export async function createDocusaurusManifest(loaded) {
	const { props } = loaded.site;
	const { siteDir, generatedFilesDir } = props;
	const themeAliases = await createThemeAliases(props.plugins ?? [], siteDir);
	return {
		schemaVersion: 1,
		docusaurusVersion: loaded.docusaurusVersion,
		siteDir,
		generatedFilesDir,
		outDir: props.outDir,
		baseUrl: props.baseUrl,
		routesPaths: [...props.routesPaths],
		routes: props.routes.map((route, index) => normalizeRoute(route, index)),
		globalData: readJsonIfPresent(path.join(generatedFilesDir, 'globalData.json'), {}),
		content: contentMetadata(generatedFilesDir),
		aliases: {
			site: siteDir,
			generated: generatedFilesDir,
			docs: path.join(generatedFilesDir, 'docusaurus-plugin-content-docs'),
			...themeAliases,
		},
	};
}

function resolvedFile(candidate) {
	if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	for (const extension of RESOLVE_EXTENSIONS) {
		const filename = candidate + extension;
		if (existsSync(filename) && statSync(filename).isFile()) return filename;
	}
	if (existsSync(candidate) && statSync(candidate).isDirectory()) {
		for (const extension of RESOLVE_EXTENSIONS) {
			const filename = path.join(candidate, `index${extension}`);
			if (existsSync(filename) && statSync(filename).isFile()) return filename;
		}
	}
	return null;
}

function within(root, relativeId) {
	const candidate = path.resolve(root, relativeId);
	const relative = path.relative(root, candidate);
	if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
	return resolvedFile(candidate);
}

export function resolveDocusaurusId(id, manifest) {
	const queryIndex = id.indexOf('?');
	const source = queryIndex === -1 ? id : id.slice(0, queryIndex);
	const query = queryIndex === -1 ? '' : id.slice(queryIndex);
	let resolved = null;
	if (source.startsWith('@site/')) {
		resolved = within(manifest.aliases.site, source.slice('@site/'.length));
	} else if (source.startsWith('@generated/')) {
		resolved = within(manifest.aliases.generated, source.slice('@generated/'.length));
	} else if (source.startsWith('~docs/')) {
		resolved = within(manifest.aliases.docs, source.slice('~docs/'.length));
	} else if (source.startsWith('@theme-original/')) {
		resolved = manifest.aliases.themeOriginal[source.slice('@theme-original/'.length)] ?? null;
	} else if (source.startsWith('@theme-init/')) {
		resolved = manifest.aliases.themeInit[source.slice('@theme-init/'.length)] ?? null;
	} else if (source.startsWith('@theme/')) {
		resolved = manifest.aliases.theme[source.slice('@theme/'.length)] ?? null;
	}
	return resolved === null ? null : resolved + query;
}

export async function writeDocusaurusManifest(manifest, filename) {
	const target = path.resolve(filename);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`);
	return target;
}

export async function readDocusaurusManifest(filename) {
	return JSON.parse(await readFile(filename, 'utf8'));
}
