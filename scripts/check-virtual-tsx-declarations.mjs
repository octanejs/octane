// The virtual TSX an editor typechecks must not reference a name it never declares.
//
// Several lowerings in the type-only path rewrite an authored construct into a
// generated binding plus references to it — a host element carrying `ref` and a
// spread becomes `let X = __normalize_spread_props_for_ref_attr(bag)` with the
// attributes rewritten to read `X`, and a dynamic tag name becomes a
// `TsrxDynamic_N` alias. The declaration is attached to the node for a later
// pass to hoist, so a position no hoisting pass reaches drops the declaration
// while keeping the references, and the language service reports "Cannot find
// name" on source that compiles and runs correctly (octanejs/octane#737).
//
// The failure is silent — `compileToVolarMappings` reports no error — and it is
// invisible to CI wherever a package typechecks through `tsgo`, which does not
// read `.tsrx` at all. This scan is the guard: it is a pure string check over
// generated identifiers, so it cannot be fooled by a package's tsconfig.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileToVolarMappings } from '../packages/octane/src/compiler/volar.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['packages', 'examples', 'benchmarks', 'playground', 'website'];
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '.test-scratch', '.next']);

// Generated names the type-only lowerings introduce alongside a declaration.
const GENERATED_NAME = /\b([A-Za-z_$][\w$]*__spread_props\d+|TsrxDynamic_\d+)\b/g;
const DECLARED_NAME =
	/\b(?:let|const|var)\s+([A-Za-z_$][\w$]*__spread_props\d+|TsrxDynamic_\d+)\b/g;

function* walk(directory) {
	let entries;
	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!SKIP_DIRECTORIES.has(entry.name)) yield* walk(absolute);
		} else if (entry.name.endsWith('.tsrx')) {
			yield absolute;
		}
	}
}

function undeclaredNames(code) {
	const declared = new Set([...code.matchAll(DECLARED_NAME)].map((match) => match[1]));
	const referenced = new Set([...code.matchAll(GENERATED_NAME)].map((match) => match[1]));
	return [...referenced].filter((name) => !declared.has(name));
}

const violations = [];
let scanned = 0;

for (const root of ROOTS) {
	const absolute = path.join(REPO, root);
	try {
		if (!statSync(absolute).isDirectory()) continue;
	} catch {
		continue;
	}

	for (const file of walk(absolute)) {
		const relative = path.relative(REPO, file);
		let code;
		try {
			code = compileToVolarMappings(readFileSync(file, 'utf8'), file).code;
		} catch (error) {
			// A file the type-only path cannot compile is a different failure, and
			// the suites that own it report it with far better context than a name
			// scan can. Keep this check to the one thing it can prove.
			violations.push({ file: relative, threw: error instanceof Error ? error.message : error });
			continue;
		}
		scanned += 1;

		const undeclared = undeclaredNames(code);
		if (undeclared.length > 0) violations.push({ file: relative, undeclared });
	}
}

if (violations.length > 0) {
	console.error('The virtual TSX for these .tsrx files references names it never declares:\n');
	for (const violation of violations) {
		if (violation.threw) {
			console.error(`  ${violation.file}: compileToVolarMappings threw — ${violation.threw}`);
		} else {
			console.error(`  ${violation.file}: ${violation.undeclared.join(', ')}`);
		}
	}
	console.error(
		'\nEach one surfaces in editors and `tsrx-tsc` as TS2304 on source that compiles and runs',
	);
	console.error(
		'correctly. Fix the lowering that drops the declaration, not the component that trips it.',
	);
	process.exit(1);
}

console.log(
	`Virtual TSX declaration check passed (${scanned} .tsrx files, no undeclared generated names).`,
);
