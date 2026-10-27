// Which Octane the playground compiles and runs against. `main` is the
// compiler bundled with this website build plus the runtime manifest the
// playgroundRuntime() vite plugin serves, so unreleased changes stay testable.
// A published release loads BOTH halves from esm.sh at that exact version:
// the compiler is imported into this page, and the sandbox's import map points
// every runtime entry at the same esm.sh build. esm.sh splits a package's
// shared internals into one module per file, so `octane` and
// `octane/internal/client` import the same `dist/runtime.mjs` and share one
// runtime instance. `?external=react,react-dom` leaves react bare on every
// entry, so the sandbox import map's pinned React is the only React.
//
// Commit and PR revisions are not offered: esm.sh's GitHub route rejects this
// monorepo ("repo is too large"), and preview packages would need a CI build
// per revision, which #1022 leaves blocked on a sponsored build host.
//
// Client-only: load via dynamic import from an effect (never during SSR).
import type { compile } from 'octane/compiler';
import type { compileTypesInspection } from 'octane/compiler/volar';
import type { RuntimeSource } from './playground-sandbox.ts';

export const MAIN_VERSION = 'main';

const NPM_PACKAGE_URL = 'https://registry.npmjs.org/octane';
const ESM_ORIGIN = 'https://esm.sh';
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** The runtime entries a compiled playground module may import. */
export const RUNTIME_ENTRIES = [
	'octane',
	'octane/internal/client',
	'octane/react',
	'octane/signals',
	'octane/signals/client',
] as const;

export type ParsedVersion = { ok: true; version: string } | { ok: false; error: string };

/** Reads the `version` query parameter: absent or `main` is main, else an exact release. */
export function parseVersionParam(value: unknown): ParsedVersion {
	if (value == null || value === '' || value === MAIN_VERSION) {
		return { ok: true, version: MAIN_VERSION };
	}
	const version = String(value).trim().replace(/^v/, '');
	if (SEMVER.test(version)) return { ok: true, version };
	return {
		ok: false,
		error: `"${String(value)}" is not an Octane version. Use main or an exact published release such as 0.16.0.`,
	};
}

function compareVersions(a: string, b: string): number {
	const [coreA, preA] = a.split('-', 2);
	const [coreB, preB] = b.split('-', 2);
	const partsA = coreA.split('.').map(Number);
	const partsB = coreB.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		if (partsA[i] !== partsB[i]) return partsA[i] - partsB[i];
	}
	if (preA === preB) return 0;
	if (preA === undefined) return 1;
	if (preB === undefined) return -1;
	return preA < preB ? -1 : 1;
}

/**
 * Published Octane releases, newest first. The npm name predates Octane, so
 * the deprecated 2015 releases of the unrelated package are left out.
 */
export async function fetchReleases(fetcher: typeof fetch = fetch): Promise<string[]> {
	const res = await fetcher(NPM_PACKAGE_URL, {
		headers: { Accept: 'application/vnd.npm.install-v1+json' },
	});
	if (!res.ok) throw new Error(`npm registry responded with HTTP ${res.status}`);
	const doc = (await res.json()) as { versions?: Record<string, { deprecated?: string }> };
	return Object.entries(doc.versions ?? {})
		.filter(([version, manifest]) => !manifest.deprecated && SEMVER.test(version))
		.map(([version]) => version)
		.sort((a, b) => compareVersions(b, a));
}

/**
 * The compiler surface the playground calls, typed as main's. Older releases
 * may lack types inspection or return less; playground.ts reports those gaps.
 */
export interface PlaygroundCompiler {
	compile: typeof compile;
	compileTypesInspection?: typeof compileTypesInspection;
}

export interface PlaygroundToolchain {
	version: string;
	compiler: PlaygroundCompiler;
	runtime: RuntimeSource;
}

export const esmUrl = (version: string, subpath = ''): string =>
	`${ESM_ORIGIN}/octane@${version}${subpath}?external=react,react-dom`;

/**
 * Loads a published release's compiler and describes its sandbox runtime.
 * Never falls back to another version: a missing release, a missing compiler
 * entry, or an esm.sh failure rejects with an actionable message.
 */
export async function loadReleaseToolchain(
	version: string,
	fetcher: typeof fetch = fetch,
	importModule: (url: string) => Promise<any> = (url) => import(/* @vite-ignore */ url),
): Promise<PlaygroundToolchain> {
	const res = await fetcher(`${NPM_PACKAGE_URL}/${encodeURIComponent(version)}`);
	if (res.status === 404) throw new Error(`octane@${version} is not published on npm.`);
	if (!res.ok) throw new Error(`npm registry responded with HTTP ${res.status}`);
	const manifest = (await res.json()) as { exports?: Record<string, unknown>; deprecated?: string };
	const exportsMap = manifest.exports ?? {};
	if (manifest.deprecated || !('./compiler' in exportsMap)) {
		throw new Error(`octane@${version} does not ship the TSRX compiler.`);
	}

	let compilerModule: any;
	let volarModule: any = null;
	try {
		[compilerModule, volarModule] = await Promise.all([
			importModule(esmUrl(version, '/compiler')),
			'./compiler/volar' in exportsMap
				? importModule(esmUrl(version, '/compiler/volar')).catch(() => null)
				: null,
		]);
	} catch (error) {
		throw new Error(
			`Could not load the octane@${version} compiler from esm.sh: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
	if (typeof compilerModule?.compile !== 'function') {
		throw new Error(`octane@${version}/compiler does not export compile().`);
	}

	const imports: Record<string, string> = {};
	for (const entry of RUNTIME_ENTRIES) {
		const subpath = entry.slice('octane'.length);
		if (`.${subpath}` in exportsMap) imports[entry] = esmUrl(version, subpath);
	}
	return {
		version,
		compiler: {
			compile: compilerModule.compile,
			compileTypesInspection:
				typeof volarModule?.compileTypesInspection === 'function'
					? volarModule.compileTypesInspection
					: undefined,
		},
		runtime: { kind: 'esm', imports },
	};
}
