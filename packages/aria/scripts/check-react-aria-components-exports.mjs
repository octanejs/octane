import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstreamPackage = path.join(packageRoot, 'node_modules/react-aria-components/package.json');
const upstreamEntry = path.join(
	packageRoot,
	'node_modules/react-aria-components/dist/types/exports/index.d.ts',
);
const localEntry = path.join(packageRoot, 'src/components/index.ts');
const PINNED_VERSION = '1.19.0';

function collectNamedExports(file) {
	let source = ts.createSourceFile(
		file,
		fs.readFileSync(file, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
	);
	let runtime = new Set();
	let types = new Set();

	for (let statement of source.statements) {
		if (!ts.isExportDeclaration(statement)) {
			continue;
		}
		if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
			throw new Error(`Export parity requires explicit named exports in ${file}`);
		}

		for (let element of statement.exportClause.elements) {
			let lane = statement.isTypeOnly || element.isTypeOnly ? types : runtime;
			lane.add(element.name.text);
		}
	}

	return { runtime, types };
}

function difference(left, right) {
	return [...left].filter((name) => !right.has(name)).sort();
}

export function auditReactAriaComponentsExports() {
	let upstreamVersion = JSON.parse(fs.readFileSync(upstreamPackage, 'utf8')).version;
	if (upstreamVersion !== PINNED_VERSION) {
		throw new Error(`Expected react-aria-components ${PINNED_VERSION}, found ${upstreamVersion}`);
	}

	let upstream = collectNamedExports(upstreamEntry);
	let local = collectNamedExports(localEntry);
	let result = {
		version: upstreamVersion,
		runtime: {
			upstream: upstream.runtime.size,
			local: local.runtime.size,
			missing: difference(upstream.runtime, local.runtime),
			extra: difference(local.runtime, upstream.runtime),
		},
		types: {
			upstream: upstream.types.size,
			local: local.types.size,
			missing: difference(upstream.types, local.types),
			extra: difference(local.types, upstream.types),
		},
	};

	return result;
}

export function assertReactAriaComponentsExports() {
	let result = auditReactAriaComponentsExports();
	let failures = [];
	for (let lane of ['runtime', 'types']) {
		for (let direction of ['missing', 'extra']) {
			if (result[lane][direction].length > 0) {
				failures.push(`${lane} ${direction}: ${result[lane][direction].join(', ')}`);
			}
		}
	}

	if (failures.length > 0) {
		throw new Error(
			`react-aria-components@${result.version} export parity failed\n${failures.join('\n')}`,
		);
	}

	return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	let result = assertReactAriaComponentsExports();
	console.log(
		`react-aria-components@${result.version}: ${result.runtime.local} runtime and ${result.types.local} type exports match`,
	);
}
