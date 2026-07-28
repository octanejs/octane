import path from 'node:path';
import { createOctaneCompiler } from 'octane/compiler/bundler';
import { compileDocusaurusMdx } from './mdx.js';
import { loadDocusaurusSite } from './load-site.js';
import { createDocusaurusManifest, resolveDocusaurusId } from './manifest.js';

export const DOCUSAURUS_MANIFEST_ID = 'virtual:octane-docusaurus-manifest';
const RESOLVED_DOCUSAURUS_MANIFEST_ID = `\0${DOCUSAURUS_MANIFEST_ID}`;

function cleanId(id) {
	return id.split(/[?#]/, 1)[0];
}

function createContentIndex(manifest) {
	const result = new Map();
	for (const [source, metadata] of Object.entries(manifest.content)) {
		const resolved = path.isAbsolute(source) ? source : resolveDocusaurusId(source, manifest);
		if (resolved !== null) result.set(cleanId(resolved), metadata);
	}
	return result;
}

function serializableManifest(manifest) {
	return JSON.stringify(manifest)
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029')
		.replace(/</g, '\\u003c');
}

function createSharedState(options) {
	let loaded;
	let manifest;
	let contentIndex = new Map();
	let loading;
	let root = path.resolve(process.cwd(), options.siteDir ?? '.');

	async function refresh() {
		if (loading) return loading;
		loading = (async () => {
			const nextLoaded = await loadDocusaurusSite({
				siteDir: root,
				outDir: options.outDir,
				config: options.config,
				locale: options.locale,
				automaticBaseUrlLocalizationDisabled: options.automaticBaseUrlLocalizationDisabled,
				allowUnsupportedVersion: options.allowUnsupportedVersion,
			});
			const nextManifest = await createDocusaurusManifest(nextLoaded);
			const nextContentIndex = createContentIndex(nextManifest);
			loaded = nextLoaded;
			manifest = nextManifest;
			contentIndex = nextContentIndex;
			return nextManifest;
		})().finally(() => {
			loading = undefined;
		});
		return loading;
	}

	return {
		setRoot(value) {
			root = path.resolve(value, options.siteDir ?? '.');
		},
		refresh,
		async getManifest() {
			return loading ?? manifest ?? refresh();
		},
		getLoaded() {
			return loaded;
		},
		async metadataFor(id) {
			await this.getManifest();
			return contentIndex.get(cleanId(id));
		},
	};
}

export function docusaurusBridge(options = {}, shared = createSharedState(options)) {
	return {
		name: 'octane-docusaurus-bridge',
		enforce: 'pre',
		api: {
			getManifest: () => shared.getManifest(),
			reload: () => shared.refresh(),
		},
		async configResolved(config) {
			shared.setRoot(config.root ?? process.cwd());
			await shared.refresh();
		},
		async buildStart() {
			const manifest = await shared.getManifest();
			const loaded = shared.getLoaded();
			const siteConfigPath = loaded?.site?.props?.siteConfigPath;
			if (typeof siteConfigPath === 'string') this.addWatchFile?.(siteConfigPath);
			for (const plugin of loaded?.site?.props?.plugins ?? []) {
				if (typeof plugin.getPathsToWatch !== 'function') continue;
				for (const watched of (await plugin.getPathsToWatch()) ?? []) {
					this.addWatchFile?.(watched);
				}
			}
			for (const source of Object.keys(manifest.content)) {
				const resolved = path.isAbsolute(source) ? source : resolveDocusaurusId(source, manifest);
				if (resolved !== null) this.addWatchFile?.(cleanId(resolved));
			}
		},
		async watchChange() {
			await shared.refresh();
		},
		async resolveId(id) {
			if (id === DOCUSAURUS_MANIFEST_ID) return RESOLVED_DOCUSAURUS_MANIFEST_ID;
			const manifest = await shared.getManifest();
			return resolveDocusaurusId(id, manifest);
		},
		async load(id) {
			if (id !== RESOLVED_DOCUSAURUS_MANIFEST_ID) return null;
			return `export default ${serializableManifest(await shared.getManifest())};\n`;
		},
	};
}

export function docusaurusMdx(options = {}) {
	const { ssr: forceSsr, md, hmr, profile, metadata: metadataOption, ...compileOptions } = options;
	let hmrEnabled = hmr;
	let projectRoot = process.cwd();
	let profileIds = createOctaneCompiler({ root: projectRoot });
	const includeMd = md !== false;
	const warnedByFile = new Map();

	return {
		name: 'octane-docusaurus-mdx',
		enforce: 'pre',
		configResolved(config) {
			projectRoot = config.root ?? projectRoot;
			profileIds = createOctaneCompiler({ root: projectRoot });
			if (hmrEnabled === undefined) hmrEnabled = config.command === 'serve';
		},
		watchChange(id) {
			profileIds.invalidate(id);
			warnedByFile.delete(cleanId(id));
		},
		async transform(code, id, transformOptions) {
			const [file, query = ''] = id.split('?');
			if (!(file.endsWith('.mdx') || (includeMd && file.endsWith('.md')))) return null;
			if (/(^|&)(raw|url|inline|worker|sharedworker)(=|&|$)/.test(query)) return null;
			const ssr =
				forceSsr !== undefined
					? forceSsr
					: transformOptions?.ssr === true || this.environment?.config?.consumer === 'server';
			const profiling = !ssr && profile === true;
			const profileIdentity = profiling ? profileIds.resolveProfileModuleId(file) : null;
			for (const dependency of profileIdentity?.dependencies ?? []) {
				this.addWatchFile?.(dependency);
			}
			const metadata =
				typeof metadataOption === 'function' ? await metadataOption(file) : metadataOption;
			const result = await compileDocusaurusMdx(code, profileIdentity?.id ?? file, {
				...compileOptions,
				metadata,
				mode: ssr ? 'server' : 'client',
				hmr: !ssr && !!hmrEnabled,
				dev: !ssr && !!hmrEnabled,
				profile: profiling,
			});
			let warned = warnedByFile.get(file);
			if (warned === undefined) {
				warned = new Set();
				warnedByFile.set(file, warned);
			}
			for (const diagnostic of result.diagnostics) {
				const key = `${diagnostic.code}:${diagnostic.start.offset}:${diagnostic.end.offset}:${diagnostic.message}`;
				if (warned.has(key)) continue;
				warned.add(key);
				this.warn?.({
					code: diagnostic.code,
					message: diagnostic.message,
					id: diagnostic.filename,
					loc: {
						file: diagnostic.filename,
						line: diagnostic.start.line,
						column: diagnostic.start.column,
					},
				});
			}
			return result;
		},
	};
}

export function docusaurus(options = {}) {
	const shared = createSharedState(options);
	const bridge = docusaurusBridge(options, shared);
	const mdx = docusaurusMdx({
		...options.mdx,
		metadata: async (id) => {
			const fromSite = await shared.metadataFor(id);
			if (fromSite !== undefined) return fromSite;
			const configured = options.mdx?.metadata;
			return typeof configured === 'function' ? configured(id) : configured;
		},
	});
	return [bridge, mdx];
}
