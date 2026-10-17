// The client runtime as one source file, for harnesses that patch runtime text.
//
// runtime.ts re-exports the runtime's concept modules in runtime/. A harness that
// edits a declaration, or appends code that names runtime internals, edits this
// text instead and loads it in place of runtime.ts: it holds every module's
// statements in evaluation order, their external imports merged, and only
// runtime.ts's own exports. Any other file, such as an unsplit runtime.ts from
// another checkout, reads unchanged. With `ref`, it reads this repository's
// files at that git revision.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '../..');
const RUNTIME = path.join(ROOT, 'packages/octane/src/runtime.ts');

const hasModifier = (node, kind) => node.modifiers?.some((m) => m.kind === kind) ?? false;

export function readClientRuntime(file = RUNTIME, ref) {
	return joinClientRuntime(file, ref).text;
}

/**
 * The joined text, and for a split runtime its modules in the order the text
 * holds them, each with the range of its statements, and the evaluation chain
 * its order links form (module names, first to last).
 */
export function joinClientRuntime(file = RUNTIME, ref) {
	const git = (...args) =>
		execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: 'pipe' });
	const relative = (f) => path.relative(ROOT, f).split(path.sep).join('/');
	const read = ref
		? (f) => git('show', `${ref}:${relative(f)}`)
		: (f) => fs.readFileSync(f, 'utf8');
	const list = (d) => {
		if (!ref) return fs.existsSync(d) ? fs.readdirSync(d) : [];
		try {
			return git('ls-tree', '--name-only', `${ref}:${relative(d)}`).split('\n');
		} catch {
			return [];
		}
	};
	const parse = (f) =>
		ts.createSourceFile(f, read(f), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
	const facadeFile = path.resolve(file);
	const sourceDir = path.dirname(facadeFile);
	const dir = path.join(sourceDir, 'runtime');
	const names = list(dir).filter((name) => name.endsWith('.ts'));
	if (path.basename(facadeFile) !== 'runtime.ts' || !names.length)
		return { text: read(facadeFile), modules: null, chain: null };
	const facade = parse(facadeFile);
	const modules = new Map(
		names.sort().map((name) => [path.join(dir, name), parse(path.join(dir, name))]),
	);
	const resolve = (from, spec) =>
		spec.startsWith('.') ? path.resolve(path.dirname(from), spec).replace(/\.js$/, '.ts') : null;
	const fromSource = (from, spec) => {
		const target = resolve(from, spec);
		if (!target) return spec;
		const moved = path
			.relative(sourceDir, target)
			.replace(/\.ts$/, '.js')
			.split(path.sep)
			.join('/');
		return moved.startsWith('.') ? moved : `./${moved}`;
	};

	// Evaluation order: each module first names the one before it, by an import
	// or an empty re-export, and runtime.ts names the last. Modules off that
	// chain load first.
	const links = (sf) =>
		sf.statements.filter(
			(st) => (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier,
		);
	const isOrderLink = (st) =>
		ts.isExportDeclaration(st) && st.exportClause?.elements.length === 0 && st.moduleSpecifier;
	let cursor = links(facade)
		.map((st) => resolve(facadeFile, st.moduleSpecifier.text))
		.findLast((target) => modules.has(target));
	const chain = [];
	while (modules.has(cursor) && !chain.includes(cursor)) {
		chain.unshift(cursor);
		const first = links(modules.get(cursor))[0];
		cursor = first && resolve(cursor, first.moduleSpecifier.text);
	}
	const order = [...[...modules.keys()].filter((f) => !chain.includes(f)), ...chain];

	// runtime.ts's surface; a module declaration exports only a name on it.
	const surface = new Set();
	const facadeKept = [];
	// External imports, merged per source in runtime.ts's pin order.
	const external = new Map();
	for (const st of facade.statements) {
		const target = st.moduleSpecifier && resolve(facadeFile, st.moduleSpecifier.text);
		if (ts.isImportDeclaration(st) || isOrderLink(st)) {
			if (!modules.has(target))
				external.set(st.moduleSpecifier.text, { bare: !st.importClause, names: new Map() });
		} else if (!ts.isExportDeclaration(st)) continue;
		else if (!modules.has(target)) facadeKept.push(st.getText());
		else for (const el of st.exportClause.elements) surface.add((el.propertyName ?? el.name).text);
	}
	const body = [];
	const ambient = new Set();
	const ranges = [];
	for (const file of order) {
		const sf = modules.get(file);
		ranges.push({ name: path.basename(file, '.ts'), from: body.length });
		const text = sf.getFullText();
		for (const st of sf.statements) {
			if (isOrderLink(st)) continue;
			if (ts.isImportDeclaration(st)) {
				if (modules.has(resolve(file, st.moduleSpecifier.text))) continue;
				const spec = fromSource(file, st.moduleSpecifier.text);
				const entry = external.get(spec) ?? { bare: !st.importClause, names: new Map() };
				const clause = st.importClause;
				if (clause?.name || (clause?.namedBindings && !ts.isNamedImports(clause.namedBindings)))
					throw new Error(`${file}: default and namespace imports are not joined`);
				for (const el of clause?.namedBindings?.elements ?? []) {
					const type = clause.isTypeOnly || el.isTypeOnly;
					const prior = entry.names.get(el.name.text);
					entry.names.set(el.name.text, {
						imported: (el.propertyName ?? el.name).text,
						type: type && (prior?.type ?? true),
					});
				}
				external.set(spec, entry);
				continue;
			}
			if (ts.isVariableStatement(st) && hasModifier(st, ts.SyntaxKind.DeclareKeyword)) {
				const key = st.getText();
				if (ambient.has(key)) continue;
				ambient.add(key);
			}
			// Edits by AST position: drop an export runtime.ts does not make, and
			// move each relative specifier from runtime/ to runtime.ts's directory.
			const edits = [];
			const exported = st.modifiers?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword);
			if (exported && !declaredNames(st).some((name) => surface.has(name)))
				edits.push([exported.getStart(), nextToken(st, exported), '']);
			(function visit(node) {
				const literal =
					(ts.isCallExpression(node) &&
						node.expression.kind === ts.SyntaxKind.ImportKeyword &&
						node.arguments[0]) ||
					(ts.isImportTypeNode(node) && node.argument.literal);
				if (literal && ts.isStringLiteral(literal))
					edits.push([literal.getStart() + 1, literal.end - 1, fromSource(file, literal.text)]);
				ts.forEachChild(node, visit);
			})(st);
			let out = text.slice(st.getFullStart(), st.end);
			for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0]))
				out = out.slice(0, start - st.getFullStart()) + value + out.slice(end - st.getFullStart());
			body.push(out);
		}
	}

	const importText = [...external]
		.map(([spec, { bare, names }]) => {
			if (!names.size) return bare ? `import '${spec}';` : '';
			const all = [...names.values()].every((n) => n.type);
			const list = [...names]
				.map(
					([local, n]) =>
						`${n.type && !all ? 'type ' : ''}${n.imported === local ? local : `${n.imported} as ${local}`}`,
				)
				.join(', ');
			return `import ${all ? 'type ' : ''}{ ${list} } from '${spec}';`;
		})
		.filter(Boolean);
	let offset = [...importText, ...facadeKept].join('\n').length + 1;
	const starts = body.map((text) => {
		const start = offset;
		offset += text.length;
		return start;
	});
	const name = (f) => path.basename(f, '.ts');
	return {
		text: `${[...importText, ...facadeKept].join('\n')}\n${body.join('')}\n`,
		modules: ranges.map((r, i) => ({
			name: r.name,
			start: starts[r.from] ?? offset,
			end: i + 1 < ranges.length ? (starts[ranges[i + 1].from] ?? offset) : offset,
		})),
		chain: chain.map(name),
	};
}

/**
 * The source of the named top-level declarations, in the order given and
 * without `export`, for a harness that evaluates runtime helpers in isolation.
 */
export function runtimeDeclarations(source, names) {
	const sf = ts.createSourceFile('runtime.ts', source, ts.ScriptTarget.ESNext, true);
	return names
		.map((name) => {
			const st = sf.statements.find((s) => declaredNames(s).includes(name));
			if (!st) throw new Error(`the runtime declares no ${name}`);
			const exported = st.modifiers?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword);
			return source.slice(exported ? nextToken(st, exported) : st.getStart(), st.end);
		})
		.join('\n');
}

function declaredNames(st) {
	const binding = (name) =>
		ts.isIdentifier(name)
			? [name.text]
			: name.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : binding(e.name)));
	if (ts.isVariableStatement(st))
		return st.declarationList.declarations.flatMap((d) => binding(d.name));
	return st.name ? [st.name.text] : [];
}

// Where the token after `export` starts, so removing it leaves the next one in place.
function nextToken(st, modifier) {
	const scanner = ts.createScanner(
		ts.ScriptTarget.ESNext,
		true,
		ts.LanguageVariant.Standard,
		st.getSourceFile().text,
	);
	scanner.setTextPos(modifier.end);
	scanner.scan();
	return scanner.getTokenStart();
}
