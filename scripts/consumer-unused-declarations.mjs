/**
 * Find unused declarations in published source the way a consumer's compiler
 * reports them.
 *
 * A consumer that enables `noUnusedLocals` or `noUnusedParameters` applies the
 * flag to every `.ts` and `.tsrx` module of ours that its program reaches. Those
 * modules are source files, not declaration files, so `skipLibCheck` does not
 * exempt them, and one import a refactor left behind fails the consumer's
 * typecheck (issue #1694). The repository's own projects enable neither flag, so
 * nothing else here notices.
 *
 * Each package compiles under the canonical consumer options
 * (scripts/consumer-tsconfigs/base.json, read from what `octane init` scaffolds)
 * with both flags on, through octane-tsc so `.tsrx` modules are checked through
 * the Octane compiler the way an editor checks them. Only the unused-declaration
 * codes are read: the same programs still report the unrelated consumer-compile
 * debt of issue #721, which other rules track.
 *
 * Packages with findings compile a second time with only `noUnusedLocals`. That
 * splits their findings between the two flags, so debt recorded against one flag
 * cannot admit a regression under the other.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	CONSUMER_BASE_CONFIG_NAME,
	CONSUMER_TSCONFIG_DIRECTORY,
} from './generate-consumer-tsconfigs.mjs';
import { REPO_ROOT } from './workspace-packages.mjs';

/**
 * TS6133 (value never read), TS6138 (property never read), TS6192 (all imports
 * unused), TS6196 (declared but never used), TS6198 (all destructured elements
 * unused), TS6199 (all variables unused), and TS6205 (all type parameters unused).
 */
export const UNUSED_DECLARATION_CODES = new Set([6133, 6138, 6192, 6196, 6198, 6199, 6205]);

const DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/;

function toPosix(value) {
	return value.split(path.sep).join('/');
}

function findingKey(finding) {
	return `${finding.file}:${finding.line}:${finding.column}:${finding.code}`;
}

export function formatFinding(finding) {
	return `${finding.file}(${finding.line},${finding.column}): TS${finding.code} ${finding.message}`;
}

/**
 * The consumer project for one package. `extends` stays relative so octane-tsc
 * follows it and sees the base's empty `types`; with an absolute path it would
 * add every installed `@types/*`, which a scaffolded application does not have.
 */
export function createUnusedDeclarationProject(projectDirectory, packageDirectory, { parameters }) {
	const relative = (target) => toPosix(path.relative(projectDirectory, target));
	return {
		extends: relative(path.join(CONSUMER_TSCONFIG_DIRECTORY, CONSUMER_BASE_CONFIG_NAME)),
		compilerOptions: { noUnusedLocals: true, noUnusedParameters: parameters },
		include: [`${relative(path.join(packageDirectory, 'src'))}/**/*`],
	};
}

/**
 * Read the unused-declaration findings out of `--pretty false` output. Any line
 * that is not a diagnostic located in a module, such as a config error or an
 * unresolvable content mapper, means the program is not the one this check
 * claims to have compiled, so it throws rather than passing on a partial one.
 */
export function parseUnusedDeclarations(output, repo = REPO_ROOT) {
	const findings = [];
	for (const line of output.split(/\r?\n/)) {
		// Blank lines, and the indented continuation lines of a message chain.
		if (!line.trim() || /^\s/.test(line)) continue;
		const match = DIAGNOSTIC.exec(line);
		if (!match || match[1].endsWith('.json')) {
			throw new Error(`octane-tsc could not build the consumer program:\n${line}`);
		}
		const code = Number(match[4]);
		if (!UNUSED_DECLARATION_CODES.has(code)) continue;
		findings.push({
			file: toPosix(path.relative(repo, path.resolve(repo, match[1]))),
			line: Number(match[2]),
			column: Number(match[3]),
			code,
			message: match[5],
		});
	}
	return findings;
}

function runOctaneTsc(projects, repo) {
	const result = spawnSync(
		process.execPath,
		[
			path.join(repo, 'scripts/octane-tsc/bin.mjs'),
			...projects.flatMap((project) => ['-p', project]),
			'--pretty',
			'false',
		],
		{ cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
	);
	if (result.error) throw result.error;
	if (result.signal) throw new Error(`octane-tsc was terminated by ${result.signal}`);
	const output = `${result.stdout}${result.stderr}`;
	// A failed build always names at least one diagnostic. Without one, nothing
	// was checked, and an empty finding list would read as a pass.
	if (result.status !== 0 && !/\berror TS\d+/.test(output)) {
		throw new Error(`octane-tsc exited ${result.status} without a diagnostic:\n${output}`);
	}
	return output;
}

/**
 * Compile each package's `src` as a consumer does and return its findings split
 * by flag. Findings are attributed to the package whose `src` holds the file, so
 * a workspace dependency's module reached through another package's program is
 * reported once, against its own package. Files outside every given package,
 * such as `octane`'s own source (which publishes built declarations), are not.
 */
export function findUnusedDeclarations(packages, repo = REPO_ROOT) {
	if (!packages.length) return [];
	const sourceRoots = packages.map((pkg) => ({
		pkg,
		root: `${toPosix(path.relative(repo, path.join(pkg.directory, 'src')))}/`,
	}));
	const ownerOf = (file) => sourceRoots.find(({ root }) => file.startsWith(root))?.pkg;

	// The projects must sit inside the repository: octane-tsc resolves the
	// `.tsrx` content mapper from the project's directory, and without it
	// `.tsrx` modules would go unchecked.
	const cacheDirectory = path.join(repo, 'node_modules/.cache');
	mkdirSync(cacheDirectory, { recursive: true });
	const projectDirectory = mkdtempSync(path.join(cacheDirectory, 'unused-declarations-'));
	try {
		const compile = (selected, parameters) => {
			const projects = selected.map((pkg) => {
				const project = path.join(
					projectDirectory,
					`${parameters ? 'all' : 'locals'}.${pkg.dir}.json`,
				);
				const config = createUnusedDeclarationProject(projectDirectory, pkg.directory, {
					parameters,
				});
				writeFileSync(project, JSON.stringify(config));
				return project;
			});
			const findingsByPackage = new Map();
			const seen = new Set();
			for (const finding of parseUnusedDeclarations(runOctaneTsc(projects, repo), repo)) {
				const owner = ownerOf(finding.file);
				if (!owner || seen.has(findingKey(finding))) continue;
				seen.add(findingKey(finding));
				const findings = findingsByPackage.get(owner.name) ?? [];
				findings.push(finding);
				findingsByPackage.set(owner.name, findings);
			}
			return findingsByPackage;
		};

		const all = compile(packages, true);
		const flagged = packages.filter((pkg) => all.has(pkg.name));
		const locals = flagged.length ? compile(flagged, false) : new Map();
		return flagged.map((pkg) => {
			const localFindings = locals.get(pkg.name) ?? [];
			const localKeys = new Set(localFindings.map(findingKey));
			return {
				pkg,
				locals: localFindings,
				parameters: all.get(pkg.name).filter((finding) => !localKeys.has(findingKey(finding))),
			};
		});
	} finally {
		rmSync(projectDirectory, { recursive: true, force: true });
	}
}
