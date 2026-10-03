import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectTypecheckProjects } from './check-source-publication.mjs';
import { getWorkspacePackages, REPO_ROOT } from './workspace-packages.mjs';

const TSRX_CHECKERS = new Set(['octane-tsc', 'tsrx-tsc']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The projects that make up a published package's own types: every project its
 * `typecheck` script hands to a .tsrx-aware checker, or its `tsconfig.json`
 * when the script declares none. Pristine-upstream probes run with plain `tsc`
 * compare against React's types and are not the package's own program.
 */
export function packageTypecheckProjects(pkg, packages) {
	const declared = [...collectTypecheckProjects(pkg.directory, packages)]
		.filter(([, checkers]) => [...checkers].some((checker) => TSRX_CHECKERS.has(checker)))
		.map(([project]) => project);
	if (declared.length) return declared;
	const tsconfig = path.join(pkg.directory, 'tsconfig.json');
	return existsSync(tsconfig) ? [tsconfig] : [];
}

/**
 * Every published package must be typechecked by the root `typecheck` with
 * octane-tsc: a package-local script runs in no CI job, so its errors ship.
 * A project that cannot pass yet needs a dated exception with its reason; the
 * date makes the exception fail again instead of becoming permanent.
 */
export function checkTypecheckCoverage({ record, packages, rootProjects, today }) {
	const errors = [];
	const recordedProjects = new Set();
	const packagesByName = new Map(packages.map((pkg) => [pkg.name, pkg]));
	const reachedByOctaneTsc = (project) => rootProjects.get(project)?.has('octane-tsc') === true;

	const resolveProject = (project) => {
		const absolute = path.resolve(REPO_ROOT, project);
		if (!existsSync(absolute)) errors.push(`recorded project does not exist: ${project}`);
		if (recordedProjects.has(absolute)) {
			errors.push(`project is recorded more than once: ${project}`);
		}
		recordedProjects.add(absolute);
		return absolute;
	};

	for (const project of record.requiredProjects) {
		if (!reachedByOctaneTsc(resolveProject(project))) {
			errors.push(`${project} is not reached by the root typecheck with octane-tsc`);
		}
	}

	for (const exception of record.privateExceptions) {
		const project = resolveProject(exception.project);
		const pkg = packagesByName.get(exception.package);
		if (!pkg) errors.push(`exception names an unknown package: ${exception.package}`);
		else if (!pkg.private)
			errors.push(`only private packages may be exceptions: ${exception.package}`);
		if (typeof exception.reason !== 'string' || exception.reason.trim().length < 20) {
			errors.push(`exception needs a durable reason: ${exception.package}`);
		}
		if (rootProjects.has(project)) {
			errors.push(`${exception.package} is typechecked now; remove its stale exception`);
		}
	}

	// Projects whose inputs a harness materializes from a pinned upstream and the
	// repository ignores: a clean checkout has nothing for them to compile. This
	// is a fact about the inputs, not debt, so it carries a reason and no date.
	const excepted = new Set();
	for (const entry of record.materializedProjects ?? []) {
		const project = resolveProject(entry.project);
		if (typeof entry.reason !== 'string' || entry.reason.trim().length < 20) {
			errors.push(`materialized project needs a durable reason: ${entry.project}`);
		}
		if (reachedByOctaneTsc(project)) {
			errors.push(`${entry.project} is typechecked now; remove it from materializedProjects`);
		}
		excepted.add(project);
	}
	for (const exception of record.publishedExceptions ?? []) {
		const pkg = packagesByName.get(exception.package);
		if (!pkg || pkg.private) {
			errors.push(`published exception names no published package: ${exception.package}`);
		}
		if (typeof exception.reason !== 'string' || exception.reason.trim().length < 20) {
			errors.push(`exception needs a durable reason: ${exception.package}`);
		}
		if (typeof exception.expires !== 'string' || !DATE.test(exception.expires)) {
			errors.push(`exception needs an expires date (YYYY-MM-DD): ${exception.package}`);
		} else if (today > exception.expires) {
			errors.push(
				`${exception.package}: typecheck exception expired ${exception.expires}; fix the errors or renew it with a reason`,
			);
		}
		for (const project of exception.projects ?? []) {
			const absolute = resolveProject(project);
			excepted.add(absolute);
			if (reachedByOctaneTsc(absolute)) {
				errors.push(
					`${project} is typechecked now; remove it from ${exception.package}'s exception`,
				);
			}
		}
	}

	for (const pkg of packages) {
		if (pkg.private) continue;
		for (const project of packageTypecheckProjects(pkg, packages)) {
			if (reachedByOctaneTsc(project) || excepted.has(project)) continue;
			errors.push(
				`${pkg.name}: ${path.relative(REPO_ROOT, project)} is not reached by the root typecheck with octane-tsc`,
			);
		}
	}
	return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const record = JSON.parse(
		readFileSync(path.join(REPO_ROOT, 'scripts/typecheck-coverage.json'), 'utf8'),
	);
	const packages = getWorkspacePackages();
	const errors = checkTypecheckCoverage({
		record,
		packages,
		rootProjects: collectTypecheckProjects(REPO_ROOT, packages),
		today: new Date().toISOString().slice(0, 10),
	});
	if (errors.length) {
		console.error(`Typecheck coverage manifest is invalid:\n  - ${errors.join('\n  - ')}`);
		process.exit(1);
	}
	const published = packages.filter((pkg) => !pkg.private).length;
	console.log(
		`typecheck coverage passed (${published} published packages, ${record.requiredProjects.length} required projects, ` +
			`${record.privateExceptions.length} private and ${(record.publishedExceptions ?? []).length} published exceptions, ` +
			`${(record.materializedProjects ?? []).length} materialized)`,
	);
}
