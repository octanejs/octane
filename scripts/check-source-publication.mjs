/**
 * Guard the validation contract for source-published packages.
 *
 * `@octanejs/*` bindings ship raw `src/` and point their exports at it, so the
 * consumer's TypeScript program — not ours — compiles our modules. That makes a
 * handful of repository-side decisions user-visible defects rather than house
 * style, and each of them has already let broken source ship (issue #721):
 *
 *   - Typechecking a package that ships `.tsrx` with `tsgo`. `tsgo` has no
 *     `.tsrx` support: it ignores those files and exits 0, so a binding's
 *     components are never checked at all.
 *   - Pinning `types: ["node"]` in the project that validates shipped source.
 *     The tsconfig `octane init` scaffolds has no `types` field and a browser
 *     application installs no `@types/node`, so `process.env.NODE_ENV` in
 *     published source is an error in the consumer's program and not in ours.
 *   - Excluding a file from the validation project that `files` still packs.
 *     The file ships unchecked.
 *   - Publishing a `.js` module with no sibling `.d.ts`. The consumer gets
 *     `any` (or an error under `noImplicitAny`) for our public API.
 *
 * Only the first rule is about what the root typecheck chain runs, so only it is
 * driven by parsing that chain. The other two tsconfig rules are about the file
 * a consumer's compile is measured against, which exists whether or not the
 * chain happens to name it, so they are driven by walking the workspace: a
 * package that validates through a package script, through a wrapper the chain
 * parser cannot read, or that the chain never reaches at all is still checked.
 *
 * Everything already broken is enumerated in SOURCE_PUBLICATION_DEBT below, so
 * this gate is green today and refuses anything new.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPublishablePackages, REPO_ROOT } from './workspace-packages.mjs';

export const RULES = {
	tsgo: 'tsrx-typechecked-by-tsgo',
	nodeTypes: 'node-types-in-validation-tsconfig',
	excluded: 'excluded-shipped-source',
	untypedJavaScript: 'untyped-published-javascript',
};

/**
 * Known, pre-existing violations. Every entry is a package that ships source a
 * consumer cannot compile the way we compile it, and it is here only so this
 * gate can block NEW debt while the backlog is worked down.
 *
 * Entries are deleted, never edited: fix the package, then remove its line. A
 * stale entry (one that no longer violates its rule) fails this check for
 * exactly that reason, so the list shrinks monotonically and cannot rot.
 *
 * Nothing may be added here without the issue that tracks the fix.
 */
export const SOURCE_PUBLICATION_DEBT = {
	// These projects still run `tsgo` over a package that ships `.tsrx`, because
	// the package does not yet compile under `tsrx-tsc` (error counts measured
	// 2026-08-12 on `pnpm exec tsrx-tsc --noEmit -p <project>`).
	[RULES.tsgo]: [
		'packages/dnd-kit/typetests/tsconfig.json', // 4 errors
		'packages/redux-toolkit/tsconfig.json', // 4 errors
		'packages/redux-toolkit/typetests/tsconfig.json', // 2 errors
		'packages/tiptap/typetests/tsconfig.json', // 3 errors
	],
	// These validation projects still hand shipped source the Node globals a
	// browser application does not have. Dropping `types: ["node"]` is the fix;
	// where shipped source genuinely reads `process`, the source is the defect.
	//
	// Twelve of these (alien-signals, colorful, day-picker, draggable, drei,
	// livestore, popper, shadcn, spring, transition-group, vaul, window) were
	// invisible while this rule read the root typecheck chain instead of the
	// workspace: each validates through a package script or a wrapper the chain
	// parser cannot follow, or the chain never names it. They are the same defect
	// under the same issue, not a new class.
	[RULES.nodeTypes]: [
		'packages/adapter-cloudflare/tsconfig.typecheck.json',
		'packages/adapter-vercel/tsconfig.typecheck.json',
		'packages/alien-signals/tsconfig.json',
		'packages/animejs/tsconfig.json',
		'packages/apollo-client/tsconfig.json',
		'packages/app-core/tsconfig.typecheck.json',
		'packages/aria/tsconfig.json',
		'packages/astro/tsconfig.typecheck.json',
		'packages/base-ui/tsconfig.json',
		'packages/cli/tsconfig.typecheck.json',
		'packages/cmdk/tsconfig.json',
		'packages/colorful/tsconfig.json',
		'packages/create-octane/tsconfig.typecheck.json',
		'packages/day-picker/tsconfig.json',
		'packages/devtools/tsconfig.json',
		'packages/dexie/tsconfig.json',
		'packages/dnd-kit/tsconfig.json',
		'packages/docusaurus/tsconfig.json',
		'packages/draggable/tsconfig.json',
		'packages/drei/tsconfig.json',
		'packages/dropzone/tsconfig.json',
		'packages/electron/tsconfig.json',
		'packages/embla-carousel/tsconfig.json',
		'packages/floating-ui/tsconfig.json',
		'packages/gsap/tsconfig.json',
		'packages/hook-form/tsconfig.json',
		'packages/i18next/tsconfig.json',
		'packages/inertia/tsconfig.json',
		'packages/lexical/tsconfig.json',
		'packages/livestore/tsconfig.json',
		'packages/lucide/tsconfig.json',
		'packages/mantine-hooks/tsconfig.json',
		'packages/markdown/tsconfig.json',
		'packages/mdx/tsconfig.json',
		'packages/mobx/tsconfig.json',
		'packages/motion/tsconfig.json',
		'packages/nuqs/tsconfig.json',
		'packages/pdf/tsconfig.json',
		'packages/phosphor-icons/tsconfig.json',
		'packages/popper/tsconfig.json',
		'packages/radix/tsconfig.json',
		'packages/rainbowkit/tsconfig.json',
		'packages/react-error-boundary/tsconfig.json',
		'packages/react-map-gl/tsconfig.json',
		'packages/redux-toolkit/tsconfig.json',
		'packages/rsbuild-plugin-octane/tsconfig.typecheck.json',
		'packages/rspack-plugin-octane/tsconfig.typecheck.json',
		'packages/rxjs/tsconfig.json',
		'packages/seo/tsconfig.json',
		'packages/shadcn/tsconfig.json',
		'packages/solana-react/tsconfig.json',
		'packages/sonner/tsconfig.json',
		'packages/spring/tsconfig.json',
		'packages/styled-components/tsconfig.json',
		'packages/stylex/tsconfig.json',
		'packages/tanstack-ai/tsconfig.json',
		'packages/tanstack-devtools/tsconfig.json',
		'packages/tanstack-form/tsconfig.json',
		'packages/tanstack-hotkeys/tsconfig.json',
		'packages/tanstack-pacer/tsconfig.json',
		'packages/tanstack-query/tsconfig.json',
		'packages/tanstack-router-ssr-query/tsconfig.octane.json',
		'packages/tanstack-router/tsconfig.json',
		'packages/tanstack-start/tsconfig.json',
		'packages/tanstack-store/tsconfig.json',
		'packages/tanstack-table/tsconfig.json',
		'packages/tanstack-virtual/tsconfig.json',
		'packages/tauri/tsconfig.json',
		'packages/testing-library/tsconfig.json',
		'packages/textarea-autosize/tsconfig.json',
		'packages/three/tsconfig.json',
		'packages/tiptap/tsconfig.json',
		'packages/transition-group/tsconfig.json',
		'packages/valtio/tsconfig.json',
		'packages/vaul/tsconfig.json',
		'packages/vite-plugin-octane/tsconfig.typecheck.json',
		'packages/wagmi/tsconfig.json',
		'packages/window/tsconfig.json',
		'packages/zag/tsconfig.json',
		'packages/zustand/tsconfig.json',
	],
	[RULES.excluded]: [],
	// These packages publish `.js` modules with no sibling declaration file, so
	// the consumer's program types their public API as `any`.
	[RULES.untypedJavaScript]: [
		'@octanejs/adapter-cloudflare',
		'@octanejs/adapter-vercel',
		'@octanejs/apollo-client',
		'@octanejs/app-core',
		'@octanejs/astro',
		'@octanejs/cli',
		'@octanejs/docusaurus',
		'@octanejs/i18next',
		'@octanejs/mcp-server',
		'@octanejs/mdx',
		'@octanejs/rsbuild-plugin',
		'@octanejs/rspack-plugin',
		'@octanejs/stylex',
		'@octanejs/syntax-highlighter',
		'@octanejs/tanstack-start',
		'@octanejs/vite-plugin',
		'create-octane',
	],
};

const CHECKERS = new Set(['tsgo', 'tsrx-tsc', 'tsc']);
const TSRX_CHECKER = 'tsrx-tsc';
const JAVASCRIPT_MODULE = /\.[cm]?js$/;
const TEST_MODULE = /\.(?:test|spec)\.[cm]?js$/;
const TSCONFIG_FILE = /^tsconfig(?:\..+)?\.json$/;

/** tsconfig files are JSON with comments; several in this repository use them. */
export function parseJsonc(text) {
	const withoutComments = text
		.replace(/\\"|"(?:\\"|[^"])*"|(\/\/[^\n\r]*|\/\*[\s\S]*?\*\/)/g, (match, comment) =>
			comment ? '' : match,
		)
		.replace(/,(\s*[}\]])/g, '$1');
	return JSON.parse(withoutComments);
}

function readJson(file) {
	return parseJsonc(readFileSync(file, 'utf8'));
}

function toPosix(value) {
	return value.split(path.sep).join('/');
}

function splitCommands(script) {
	return script
		.split(/&&|\|\||;/)
		.map((command) => command.trim())
		.filter(Boolean);
}

/**
 * Walk the root typecheck chain, following `pnpm <script>`,
 * `pnpm --dir <dir> <script>`, and `pnpm --filter <package> <script>` the way
 * pnpm does, and return every `<checker> --noEmit -p <project>` it reaches.
 * A package cannot escape this gate by hiding its project behind a delegation.
 */
export function collectTypecheckProjects(
	repo = REPO_ROOT,
	packages = getPublishablePackages(),
	entryScripts = ['typecheck'],
) {
	const manifestCache = new Map();
	const readManifest = (directory) => {
		if (!manifestCache.has(directory)) {
			const file = path.join(directory, 'package.json');
			manifestCache.set(directory, existsSync(file) ? readJson(file) : { scripts: {} });
		}
		return manifestCache.get(directory);
	};
	const directoryForPackageName = new Map(packages.map((pkg) => [pkg.name, pkg.directory]));
	const projects = new Map();
	const visited = new Set();

	const runScript = (directory, name) => {
		const key = `${directory}::${name}`;
		if (visited.has(key)) return;
		visited.add(key);
		const scripts = readManifest(directory).scripts ?? {};
		for (const hook of [`pre${name}`, name, `post${name}`]) {
			const script = scripts[hook];
			if (typeof script !== 'string') continue;
			if (hook !== name) runScript(directory, hook);
			for (const command of splitCommands(script)) runCommand(directory, command);
		}
	};

	const runCommand = (directory, command) => {
		const words = command.split(/\s+/).filter((word) => word !== 'pnpm' && word !== 'exec');
		const checkerIndex = words.findIndex((word) => CHECKERS.has(word));
		const projectIndex = words.indexOf('-p');
		if (checkerIndex !== -1 && projectIndex !== -1 && words[projectIndex + 1]) {
			const project = path.resolve(directory, words[projectIndex + 1]);
			const checker = words[checkerIndex];
			const existing = projects.get(project) ?? new Set();
			existing.add(checker);
			projects.set(project, existing);
			return;
		}
		if (!command.startsWith('pnpm')) return;
		const directoryFlag = /--dir\s+(\S+)/.exec(command);
		const filterFlag = /--filter\s+'?([^\s']+)'?/.exec(command);
		const target = words.at(-1);
		if (!target || CHECKERS.has(target)) return;
		if (directoryFlag) {
			runScript(path.resolve(repo, directoryFlag[1]), target);
			return;
		}
		if (filterFlag) {
			const packageDirectory = directoryForPackageName.get(filterFlag[1]);
			if (packageDirectory) runScript(packageDirectory, target);
			return;
		}
		runScript(repo, target);
	};

	for (const entry of entryScripts) runScript(repo, entry);
	return projects;
}

function collectSourceFiles(directory, root = directory, files = []) {
	if (!existsSync(directory)) return files;
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name === 'node_modules') continue;
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) collectSourceFiles(absolute, root, files);
		else files.push(toPosix(path.relative(root, absolute)));
	}
	return files;
}

function shipsSource(pkg) {
	return Array.isArray(pkg.manifest.files) && pkg.manifest.files.includes('src');
}

/**
 * `files`, `include`, and `exclude` entries are globs, not file names, and
 * TypeScript matches them against a path prefix: `src`, `src/**`, and
 * `src/**\/*.tsrx` all reach `src/index.tsrx`. Translate one entry into a
 * predicate over project-relative POSIX paths so a directory or glob entry is
 * recognized the same way `tsc` recognizes it, rather than only an entry that
 * spells a shipped file out in full.
 */
function createSpecMatcher(spec) {
	const normalized = toPosix(spec).replace(/^\.\//, '').replace(/\/+$/, '');
	if (!normalized) return () => false;
	const source = normalized
		.split('/')
		.map((segment, index, segments) => {
			// `**` spans any number of directories, including none.
			if (segment === '**') return index === segments.length - 1 ? '.*' : '(?:[^/]*/)*';
			const escaped = segment
				.replace(/[.+^${}()|[\]\\]/g, '\\$&')
				.replace(/\*/g, '[^/]*')
				.replace(/\?/g, '[^/]');
			return index === segments.length - 1 ? escaped : `${escaped}/`;
		})
		.join('');
	// A bare directory name covers its contents, so a literal last segment gets a
	// trailing `($|/)`. A wildcard last segment must NOT: `*` and `?` do not cross
	// `/` in `tsc`, so `src/*` reaches `src/index.ts` and stops there, while `src/**`
	// keeps spanning because its `.*` already does.
	const segments = normalized.split('/');
	const last = segments[segments.length - 1];
	const spansDirectories = last === '**' || !/[*?]/.test(last);
	const pattern = new RegExp(`^${source}${spansDirectories ? '(?:$|/)' : '$'}`);
	return (file) => pattern.test(file);
}

/**
 * A package's validation projects are the tsconfig files that sit in the
 * package root and whose program reaches the shipped tree. Nested projects
 * (typetests and friends) check adapted suites rather than shipped source, and
 * a root project scoped to tests or build scripts is not validating the package
 * either.
 *
 * `exclude` deliberately takes no part in this decision: a project that drops
 * packed source out of its program is still the project that was meant to check
 * it, and reporting that is exactly what RULES.excluded is for.
 */
function coversShippedSource(config, sourceFiles) {
	const specs = [
		...(Array.isArray(config.files) ? config.files : []),
		...(Array.isArray(config.include) ? config.include : []),
	];
	// Neither field means every supported file under the project directory.
	if (!specs.length) return true;
	const matchers = specs.map(createSpecMatcher);
	return sourceFiles.some((file) => matchers.some((matches) => matches(`src/${file}`)));
}

/**
 * Every tsconfig in the package root, whether or not the root typecheck chain
 * names it. Chain-discovered root projects are unioned in so a project the
 * chain runs under some other name is never dropped.
 */
function collectPackageRootProjects(pkg, chainProjects) {
	const found = new Set(
		readdirSync(pkg.directory, { withFileTypes: true })
			.filter((entry) => entry.isFile() && TSCONFIG_FILE.test(entry.name))
			.map((entry) => path.join(pkg.directory, entry.name)),
	);
	for (const project of chainProjects) {
		if (path.dirname(project) === pkg.directory && existsSync(project)) found.add(project);
	}
	return [...found].sort();
}

/**
 * Pinned upstream provenance lanes compile vendored React sources with the
 * upstream compiler on purpose; `.tsrx` never reaches them.
 */
function isPinnedUpstreamProject(project, pkg) {
	return toPosix(path.relative(pkg.directory, project))
		.split('/')
		.slice(0, -1)
		.some((segment) => segment === 'audit' || segment.startsWith('upstream'));
}

export function findSourcePublicationViolations(
	repo = REPO_ROOT,
	packages = getPublishablePackages(),
) {
	const projects = collectTypecheckProjects(repo, packages);
	const violations = [];

	for (const pkg of packages) {
		if (!shipsSource(pkg)) continue;
		const sourceFiles = collectSourceFiles(path.join(pkg.directory, 'src'));
		const sourceFileSet = new Set(sourceFiles);
		const publishesTsrx = sourceFiles.some((file) => file.endsWith('.tsrx'));
		const packageProjects = [...projects.keys()].filter(
			(project) => project.startsWith(`${pkg.directory}${path.sep}`) && existsSync(project),
		);

		// The tsgo rule is about what the chain actually runs, so it stays keyed to
		// the chain.
		for (const project of packageProjects.sort()) {
			const checkers = projects.get(project);
			if (publishesTsrx && !checkers.has(TSRX_CHECKER) && !isPinnedUpstreamProject(project, pkg)) {
				violations.push({
					rule: RULES.tsgo,
					id: toPosix(path.relative(repo, project)),
					detail: `${pkg.name} ships .tsrx, but this project runs ${[...checkers].join(
						', ',
					)}, which ignores .tsrx files and exits 0`,
				});
			}
		}

		// The tsconfig rules are about the project a consumer's compile is measured
		// against, which exists whether or not the chain reaches it.
		for (const project of collectPackageRootProjects(pkg, projects.keys())) {
			const config = readJson(project);
			if (!coversShippedSource(config, sourceFiles)) continue;
			const id = toPosix(path.relative(repo, project));

			const types = config.compilerOptions?.types;
			if (Array.isArray(types) && types.includes('node')) {
				violations.push({
					rule: RULES.nodeTypes,
					id,
					detail: `${pkg.name} validates shipped source with types: ${JSON.stringify(
						types,
					)}; a scaffolded consumer installs no @types/node`,
				});
			}

			const excluded = (config.exclude ?? [])
				.map((entry) => ({ entry, matches: createSpecMatcher(entry) }))
				.filter(({ matches }) => sourceFiles.some((file) => matches(`src/${file}`)))
				.map(({ entry }) => entry);
			if (excluded.length) {
				violations.push({
					rule: RULES.excluded,
					id,
					detail: `${pkg.name} excludes shipped source from validation: ${excluded.join(', ')}`,
				});
			}
		}

		const untyped = sourceFiles
			.filter((file) => JAVASCRIPT_MODULE.test(file) && !TEST_MODULE.test(file))
			.filter((file) => !sourceFileSet.has(file.replace(JAVASCRIPT_MODULE, '.d.ts')))
			.sort();
		if (untyped.length) {
			violations.push({
				rule: RULES.untypedJavaScript,
				id: pkg.name,
				detail: `publishes ${untyped.length} .js module(s) with no sibling .d.ts, starting with ${untyped
					.slice(0, 3)
					.join(', ')}`,
			});
		}
	}

	return violations.sort(
		(left, right) => left.rule.localeCompare(right.rule) || left.id.localeCompare(right.id),
	);
}

export function partitionAgainstDebt(violations, debt = SOURCE_PUBLICATION_DEBT) {
	const allowed = new Map(Object.entries(debt).map(([rule, ids]) => [rule, new Set(ids)]));
	const unexpected = [];
	const observed = new Set();
	for (const violation of violations) {
		observed.add(`${violation.rule}::${violation.id}`);
		if (!allowed.get(violation.rule)?.has(violation.id)) unexpected.push(violation);
	}
	const stale = [];
	for (const [rule, ids] of allowed) {
		for (const id of ids) {
			if (!observed.has(`${rule}::${id}`)) stale.push({ rule, id });
		}
	}
	return { unexpected, stale };
}

function report(violations, label) {
	for (const violation of violations) {
		console.error(`  [${violation.rule}] ${violation.id}${label ? `: ${violation.detail}` : ''}`);
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const violations = findSourcePublicationViolations();
	if (process.argv.includes('--all')) {
		// Regenerating SOURCE_PUBLICATION_DEBT: every violation, allowlisted or not.
		report(violations, true);
		console.log(`${violations.length} source-publication violation(s) in total.`);
	} else {
		const { unexpected, stale } = partitionAgainstDebt(violations);
		if (unexpected.length) {
			console.error(
				'Source-published packages must be validated the way a consumer compiles them:',
			);
			report(unexpected, true);
			console.error(
				'Fix the package, or add the entry to SOURCE_PUBLICATION_DEBT in ' +
					'scripts/check-source-publication.mjs with the issue that tracks the fix.',
			);
		}
		if (stale.length) {
			console.error('SOURCE_PUBLICATION_DEBT lists entries that no longer violate their rule:');
			report(stale, false);
			console.error('Delete those lines; the allowlist only shrinks.');
		}
		if (unexpected.length || stale.length) process.exit(1);
		console.log(
			`source publication check passed (${violations.length} known violation(s) remaining in ` +
				'SOURCE_PUBLICATION_DEBT).',
		);
	}
}
