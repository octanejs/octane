/**
 * Generate the canonical consumer-shaped TypeScript projects that validate
 * source-published packages the way a real application sees them.
 *
 * Every `@octanejs/*` binding ships raw `src/` and points its exports at that
 * source, so the consumer's own `tsc` invocation compiles our `.tsrx` and `.ts`
 * files with the consumer's compiler options — not ours. The repository's
 * per-package `tsconfig.json` files are house configuration (they pin
 * `types: ["node"]`, omit the Octane Volar compiler, and exclude files that
 * still ship), so a package can be green here and broken for everyone who
 * installs it.
 *
 * The compiler options below are read from `packages/cli/src/commands/init/
 * templates.js`, the exact file `octane init` scaffolds into user projects, so
 * the validation shape cannot drift from what we tell people to write. The only
 * additions are the ones a consumer gets implicitly and a config file must state
 * explicitly:
 *
 *   - `tsrx.compiler`, which every real consumer obtains from
 *     `@tsrx/typescript-plugin` reading the installed `octane` package. Without
 *     it `.tsrx` files are checked by a generic fallback and whole classes of
 *     prop/ref errors disappear.
 *   - `include`, which points at the package's shipped `src/` tree.
 *
 * These projects are deliberately NOT part of the green typecheck chain: most
 * source-published packages still fail them (issue #721). They are the
 * reproduction command for that debt:
 *
 *     pnpm exec tsrx-tsc --noEmit -p scripts/consumer-tsconfigs/<package>.json
 *
 * They live outside the package directories on purpose. `scripts/typecheck-files
 * .mjs` treats every `packages/<name>/tsconfig*.json` as a project that owns the
 * package's sources, so a consumer project stored next to the house config would
 * silently join `pnpm typecheck:files` and turn known debt into an unrelated
 * change's failure.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { getPublishablePackages, REPO_ROOT } from './workspace-packages.mjs';
import { tsconfig as SCAFFOLDED_TSCONFIG } from '../packages/cli/src/commands/init/templates.js';

export const CONSUMER_TSCONFIG_DIRECTORY = path.join(REPO_ROOT, 'scripts/consumer-tsconfigs');
export const CONSUMER_BASE_CONFIG_NAME = 'base.json';

/** The compiler options `octane init` writes into a new application. */
export function scaffoldedCompilerOptions(template = SCAFFOLDED_TSCONFIG) {
	const scaffolded = JSON.parse(template);
	return scaffolded.compilerOptions;
}

/**
 * The shared consumer project. It carries no `include`, so it never forms a
 * program on its own; each package project extends it and adds its own sources.
 */
export function createConsumerBaseConfig(template = SCAFFOLDED_TSCONFIG) {
	return {
		compilerOptions: scaffoldedCompilerOptions(template),
		// A real consumer resolves this through the `octane` it installed. A
		// project file has to name it, and without it `.tsrx` type errors in
		// published source stay invisible.
		tsrx: { compiler: 'octane/compiler/volar' },
	};
}

export function createPackageConsumerConfig(packageDirectory) {
	return {
		extends: `./${CONSUMER_BASE_CONFIG_NAME}`,
		include: [`../../packages/${packageDirectory}/src/**/*`],
	};
}

function containsTsrx(directory) {
	if (!existsSync(directory)) return false;
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name === 'node_modules') continue;
		if (entry.isDirectory()) {
			if (containsTsrx(path.join(directory, entry.name))) return true;
		} else if (entry.name.endsWith('.tsrx')) return true;
	}
	return false;
}

/**
 * Source-published packages that ship `.tsrx`. Those are the ones whose type
 * correctness depends on the consumer's compiler being the Octane one, so they
 * are the ones a consumer-shaped project can say something new about.
 */
export function consumerTsconfigPackages(packages = getPublishablePackages()) {
	return packages
		.filter((pkg) => Array.isArray(pkg.manifest.files) && pkg.manifest.files.includes('src'))
		.filter((pkg) => containsTsrx(path.join(pkg.directory, 'src')))
		.map((pkg) => pkg.dir)
		.sort();
}

export function consumerTsconfigFiles(packageDirectories, template = SCAFFOLDED_TSCONFIG) {
	const files = new Map([[CONSUMER_BASE_CONFIG_NAME, createConsumerBaseConfig(template)]]);
	for (const packageDirectory of packageDirectories) {
		files.set(`${packageDirectory}.json`, createPackageConsumerConfig(packageDirectory));
	}
	return files;
}

async function serialize(value, filepath) {
	// Formatted through prettier, because generated baselines share the
	// repository-wide `pnpm format:check` gate.
	return format(JSON.stringify(value), { ...(await resolveConfig(filepath)), filepath });
}

async function main() {
	const check = process.argv.includes('--check');
	const packageDirectories = consumerTsconfigPackages();
	const files = consumerTsconfigFiles(packageDirectories);
	const relativeDirectory = path.relative(REPO_ROOT, CONSUMER_TSCONFIG_DIRECTORY);
	const expected = new Map();
	for (const [name, value] of files) {
		expected.set(name, await serialize(value, path.join(CONSUMER_TSCONFIG_DIRECTORY, name)));
	}

	if (check) {
		const problems = [];
		const present = existsSync(CONSUMER_TSCONFIG_DIRECTORY)
			? readdirSync(CONSUMER_TSCONFIG_DIRECTORY).filter((name) => name.endsWith('.json'))
			: [];
		for (const name of present) {
			if (!expected.has(name)) problems.push(`${relativeDirectory}/${name} is no longer generated`);
		}
		for (const [name, contents] of expected) {
			const file = path.join(CONSUMER_TSCONFIG_DIRECTORY, name);
			const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
			if (current !== contents) problems.push(`${relativeDirectory}/${name} is out of date`);
		}
		if (problems.length) {
			console.error(
				`Consumer validation projects are stale:\n  - ${problems.join(
					'\n  - ',
				)}\nRun \`pnpm consumer:tsconfigs\`.`,
			);
			process.exitCode = 1;
			return;
		}
		console.log(`${relativeDirectory} is up to date (${expected.size} consumer project(s)).`);
		return;
	}

	rmSync(CONSUMER_TSCONFIG_DIRECTORY, { force: true, recursive: true });
	mkdirSync(CONSUMER_TSCONFIG_DIRECTORY, { recursive: true });
	for (const [name, contents] of expected) {
		writeFileSync(path.join(CONSUMER_TSCONFIG_DIRECTORY, name), contents);
	}
	console.log(
		`Wrote ${expected.size} consumer validation project(s) to ${relativeDirectory} ` +
			`for ${packageDirectories.length} source-published package(s) shipping .tsrx.`,
	);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await main();
}
