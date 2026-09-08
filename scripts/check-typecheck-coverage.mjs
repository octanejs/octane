import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { collectTypecheckProjects } from './check-source-publication.mjs';
import { getWorkspacePackages, REPO_ROOT } from './workspace-packages.mjs';

const record = JSON.parse(
	readFileSync(path.join(REPO_ROOT, 'scripts/typecheck-coverage.json'), 'utf8'),
);
const packages = getWorkspacePackages();
const packagesByName = new Map(packages.map((pkg) => [pkg.name, pkg]));
const projects = collectTypecheckProjects(REPO_ROOT, packages);
const errors = [];
const recordedProjects = new Set();

function resolveProject(project) {
	const absolute = path.resolve(REPO_ROOT, project);
	if (!existsSync(absolute)) errors.push(`recorded project does not exist: ${project}`);
	if (recordedProjects.has(absolute)) errors.push(`project is recorded more than once: ${project}`);
	recordedProjects.add(absolute);
	return absolute;
}

for (const project of record.requiredProjects) {
	const absolute = resolveProject(project);
	const checkers = projects.get(absolute);
	if (!checkers?.has('tsrx-tsc')) {
		errors.push(`${project} is not reached by the root typecheck with tsrx-tsc`);
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
	if (projects.has(project)) {
		errors.push(`${exception.package} is typechecked now; remove its stale exception`);
	}
}

if (errors.length) {
	console.error(`Typecheck coverage manifest is invalid:\n  - ${errors.join('\n  - ')}`);
	process.exit(1);
}

console.log(
	`typecheck coverage manifest passed (${record.requiredProjects.length} required, ${record.privateExceptions.length} private exception)`,
);
