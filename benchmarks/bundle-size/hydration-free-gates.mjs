import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Hydration-only top-level declarations of the client engine. A client that only
// calls createRoot never hydrates, so no code from any of them may reach its
// production bundle under either bundler.
//
// The oracle is the bundle's source map, not identifier names: a production
// minifier mangles names and inlines single-use functions (oxc inlines them;
// esbuild renames collisions), so a name search can pass while the code is still
// shipped. Every generated segment maps back to its original line and column,
// so a declaration is retained exactly when some segment maps inside its source
// range. Columns matter: a minifier that joins adjacent variable statements, and
// then removes a declarator that its constant folding made unused, keeps that
// declarator's statement as the joined statement's shell, so the surviving
// declarators' `var` keyword still maps to the removed one's line. Every entry
// is checked three ways, so the list cannot go stale:
// - it is still a top-level declaration of the source file it names;
// - a hydrating control bundle maps into it under the same build settings,
//   which proves the oracle can see it;
// - no createRoot-only bundle maps into it.
//
// An entry marked `foldOnly` is a state cell or a trivial accessor of one that
// client code must still read behind its guard. Only a bundler that folds a
// never-written module flag (Rolldown with Vite's default minifier) can drop it;
// esbuild never folds that flag, so esbuild bundles are checked for every other
// entry: the hydration bodies, which must live where client code cannot reach
// them (HydrationCapability methods, the functions only its methods and the
// passes it runs call, or an installed driver).
//
// Each entry is hydration-only by construction, not by its name alone:
// drainHydrationRenderPhaseUpdates (the first mount drains render-phase
// updates), preserveRootCreatedDom, MAPPED_ITEM_ADOPTION, the deopt adopt queue,
// isRendererHydrationStyle, and the root-container claim are also client paths
// and are deliberately absent. Development-only hydration diagnostics, such as
// hydration/dev-values.ts, are absent too: no production bundle retains them,
// so no hydrating control could prove the oracle sees them.
export const HYDRATION_ONLY_DECLARATIONS = Object.freeze([
	// The root-local hydration capability. Only hydration entry points construct
	// it; it is the dispatch boundary for adoption code.
	{ name: 'HydrationCapability', source: 'runtime.ts' },
	{ name: 'passSeeds', source: 'runtime.ts' },
	{ name: 'discardSeeds', source: 'runtime.ts' },
	{ name: 'holdDiagnostics', source: 'runtime.ts' },
	{ name: 'releaseDiagnostics', source: 'runtime.ts' },
	{ name: 'cursorIn', source: 'runtime.ts' },
	{ name: 'rendersAgain', source: 'runtime.ts' },
	{ name: 'fragmentRoots', source: 'runtime.ts' },
	{ name: 'adoptOrDefer', source: 'runtime.ts' },
	{ name: 'defer', source: 'runtime.ts' },
	{ name: 'claimDeferred', source: 'runtime.ts' },
	{ name: 'takeDeferred', source: 'runtime.ts' },
	{ name: 'hydrationFailure', source: 'runtime.ts' },
	{ name: 'thrownWhileAdopting', source: 'runtime.ts' },
	{ name: 'adopt', source: 'runtime.ts' },
	{ name: 'skipForeign', source: 'runtime.ts' },
	{ name: 'claimRoots', source: 'runtime.ts' },
	{ name: 'unclaimedText', source: 'runtime.ts' },
	{ name: 'framedContent', source: 'runtime.ts' },
	{ name: 'renderBeforeMismatch', source: 'runtime.ts' },
	{ name: 'adoptText', source: 'runtime.ts' },
	{ name: 'settleTexts', source: 'runtime.ts' },
	// The current hydration pass and its adopting cursor. Only hydration entry
	// points and the pass assign them, so a client-only bundle can only read
	// them as null.
	{ name: 'HYDRATION_PASS', source: 'runtime.ts', foldOnly: true },
	{ name: 'CURSOR', source: 'runtime.ts', foldOnly: true },
	// Early-presentation adoption. Binding and control leases exist only on
	// hydrateRoot roots: createRoot rejects both options (client error 76).
	{ name: 'PRESENTATION_HYDRATION', source: 'runtime.ts', foldOnly: true },
	{ name: 'PRESENTATION_PREPARATIONS', source: 'runtime.ts' },
	{ name: 'PresentationAdoptionMiss', source: 'runtime.ts' },
	{ name: 'presentationMiss', source: 'runtime.ts' },
	{ name: 'presentationRange', source: 'runtime.ts' },
	{ name: 'currentPresentations', source: 'runtime.ts' },
	{ name: 'retryPresentations', source: 'runtime.ts' },
	{ name: 'retireDetachedBindingLeases', source: 'runtime.ts' },
	{ name: 'retireBindingLease', source: 'runtime.ts' },
	// Server native-signal adoption, owned by a hydration pass. The miss is
	// "internal hydration control flow, never an application error-boundary value".
	{ name: 'NATIVE_ADOPTION_RELEASES', source: 'runtime.ts', foldOnly: true },
	{ name: 'releaseNativeAdoptions', source: 'runtime.ts' },
	{ name: 'NativeAdoptionMiss', source: 'signals/read-protocol.ts' },
	// The streamed-shell control-capture bridge. Only hydration entry points
	// install it; signal cells, which every client that declares signals ships,
	// only read the values it published.
	{ name: 'publishEarlyHydrationControlSignalValues', source: 'signals/early-values.ts' },
]);

/**
 * The deny-listed ranges a bundler must drop: esbuild cannot fold a module flag,
 * so it is not held to the `foldOnly` state cells and accessors.
 */
export function deniedRangesFor(bundler, ranges) {
	assert.ok(bundler === 'rolldown' || bundler === 'esbuild', `unknown bundler: ${bundler}`);
	return bundler === 'esbuild' ? ranges.filter(({ foldOnly }) => foldOnly !== true) : ranges;
}

// Hydration modules a createRoot-only bundle must not contain at all.
export const HYDRATION_ONLY_MODULES = Object.freeze([/\/packages\/octane\/src\/hydration\//]);

const SOURCE_ROOT = '/packages/octane/src/';

function bindingNames(pattern, out) {
	if (pattern === null) return;
	switch (pattern.type) {
		case 'Identifier':
			out.push(pattern.name);
			break;
		case 'ObjectPattern':
			for (const property of pattern.properties) {
				bindingNames(property.type === 'RestElement' ? property.argument : property.value, out);
			}
			break;
		case 'ArrayPattern':
			for (const element of pattern.elements) bindingNames(element, out);
			break;
		case 'RestElement':
			bindingNames(pattern.argument, out);
			break;
		case 'AssignmentPattern':
			bindingNames(pattern.left, out);
			break;
	}
}

/**
 * The top-level declarations of an ESTree Program with their [start, end)
 * offsets: functions, classes, and variable bindings, including exported ones.
 * Nested declarations are ignored, so a local that shares a name never counts.
 */
export function topLevelDeclarations(program) {
	assert.equal(program?.type, 'Program', 'expected an ESTree Program');
	const declarations = new Map();
	for (const statement of program.body) {
		const declaration =
			(statement.type === 'ExportNamedDeclaration' ||
				statement.type === 'ExportDefaultDeclaration') &&
			statement.declaration
				? statement.declaration
				: statement;
		if (
			(declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') &&
			declaration.id
		) {
			declarations.set(declaration.id.name, { start: declaration.start, end: declaration.end });
		} else if (declaration.type === 'VariableDeclaration') {
			for (const declarator of declaration.declarations) {
				const names = [];
				bindingNames(declarator.id, names);
				for (const name of names) {
					declarations.set(name, { start: declarator.start, end: declarator.end });
				}
			}
		}
	}
	return declarations;
}

function lineAt(lineStarts, offset) {
	let low = 0;
	let high = lineStarts.length - 1;
	while (low < high) {
		const middle = (low + high + 1) >> 1;
		if (lineStarts[middle] <= offset) low = middle;
		else high = middle - 1;
	}
	return low;
}

const OCTANE_SOURCE = path.resolve(import.meta.dirname, '../../packages/octane/src');
const RUNTIME_MODULE = /\/packages\/octane\/src\/runtime(?:\.ts|\/[^/]+\.ts)$/;

/** Whether a bundler module id is the client runtime: runtime.ts or one of its modules. */
export function isRuntimeModule(id) {
	return RUNTIME_MODULE.test(String(id).replace(/\\/g, '/'));
}

/** The names an ESTree Program exports. */
export function exportedNames(program) {
	const names = new Set();
	for (const statement of program.body) {
		if (statement.type !== 'ExportNamedDeclaration') continue;
		for (const specifier of statement.specifiers ?? []) names.add(specifier.exported.name);
		const declaration = statement.declaration;
		if (!declaration) continue;
		if (declaration.id) names.add(declaration.id.name);
		for (const declarator of declaration.declarations ?? []) {
			const found = [];
			bindingNames(declarator.id, found);
			for (const name of found) names.add(name);
		}
	}
	return names;
}

/**
 * The runtime exports a Rolldown chunk renders. Rolldown reports each export on
 * the module that declares it, so a split runtime's come from all of its
 * modules; `surface` (runtime.ts's own exports) leaves out the names its
 * modules export only to one another.
 */
export function renderedRuntimeExports(modules, surface) {
	const names = [];
	for (const [id, module] of Object.entries(modules))
		if (isRuntimeModule(id))
			for (const name of module.renderedExports ?? []) if (surface.has(name)) names.push(name);
	return names;
}

/**
 * The client runtime's files below packages/octane/src: runtime.ts and, once
 * scripts/split-runtime.mjs has split it, its concept modules in runtime/.
 */
export function runtimeSourceFiles(sourceDir = OCTANE_SOURCE) {
	const dir = path.join(sourceDir, 'runtime');
	const modules = fs.existsSync(dir)
		? fs
				.readdirSync(dir)
				.filter((name) => name.endsWith('.ts'))
				.sort()
				.map((name) => `runtime/${name}`)
		: [];
	return ['runtime.ts', ...modules];
}

/**
 * Resolve every deny-listed declaration to its 0-based range in its source
 * file, from [startLine, startColumn] up to [endLine, endColumn] (exclusive).
 * A variable's range is its declarator, without the statement's keyword.
 * `parse(text, source)` returns an ESTree Program whose offsets index `text`.
 * A `runtime.ts` source names the client runtime: the entry resolves to the
 * runtime module that declares it. A name that is no longer a top-level
 * declaration of its file fails with the reason, so a rename cannot silently
 * pass.
 */
export function resolveDeclarationRanges(
	readSource,
	parse,
	denied = HYDRATION_ONLY_DECLARATIONS,
	runtimeFiles = runtimeSourceFiles(),
) {
	const files = new Map();
	const ranges = [];
	const missing = [];
	const fileOf = (source) => {
		if (!files.has(source)) {
			const text = readSource(source);
			const lineStarts = [0];
			for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
				lineStarts.push(index + 1);
			}
			files.set(source, {
				text,
				lineStarts,
				declarations: topLevelDeclarations(parse(text, source)),
			});
		}
		return files.get(source);
	};
	for (const named of denied) {
		let entry = named;
		if (entry.source === 'runtime.ts' && !fileOf('runtime.ts').declarations.has(entry.name)) {
			const source = runtimeFiles.find((candidate) =>
				fileOf(candidate).declarations.has(entry.name),
			);
			if (source !== undefined) entry = { ...entry, source };
		}
		const file = fileOf(entry.source);
		const span = file.declarations.get(entry.name);
		if (span === undefined) {
			missing.push(entry);
			continue;
		}
		const startLine = lineAt(file.lineStarts, span.start);
		// Parser offsets must index this text; a mismatch would misattribute lines.
		assert.equal(
			file.text.slice(file.lineStarts[startLine], span.end).includes(entry.name),
			true,
			`${entry.source}: parser offsets do not locate ${entry.name}`,
		);
		const endLine = lineAt(file.lineStarts, span.end - 1);
		ranges.push({
			...entry,
			startLine,
			startColumn: span.start - file.lineStarts[startLine],
			endLine,
			endColumn: span.end - file.lineStarts[endLine],
		});
	}
	if (missing.length !== 0) {
		throw new assert.AssertionError({
			message:
				'deny-listed hydration declarations are no longer top-level declarations of their source; ' +
				'update HYDRATION_ONLY_DECLARATIONS:\n' +
				missing.map(({ name, source }) => `  ${name}  [packages/octane/src/${source}]`).join('\n'),
		});
	}
	return ranges;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_VALUES = new Int8Array(128).fill(-1);
for (let index = 0; index < BASE64.length; index++) BASE64_VALUES[BASE64.charCodeAt(index)] = index;

/**
 * Decode a source map v3 `mappings` string into the [sourceIndex, originalLine,
 * originalColumn] of every segment that has a source. Lines and columns are
 * 0-based.
 */
export function* mappedSourcePositions(mappings) {
	let sourceIndex = 0;
	let originalLine = 0;
	let originalColumn = 0;
	let index = 0;
	const fields = [0, 0, 0, 0, 0];
	while (index < mappings.length) {
		const char = mappings.charCodeAt(index);
		if (char === 59 /* ; */ || char === 44 /* , */) {
			index++;
			continue;
		}
		let count = 0;
		while (index < mappings.length) {
			const next = mappings.charCodeAt(index);
			if (next === 59 || next === 44) break;
			let value = 0;
			let shift = 0;
			let digit;
			do {
				digit = BASE64_VALUES[mappings.charCodeAt(index++)];
				assert.notEqual(digit, -1, 'invalid source map mappings');
				value += (digit & 31) << shift;
				shift += 5;
			} while (digit & 32);
			fields[count++] = value & 1 ? -(value >>> 1) : value >>> 1;
		}
		if (count >= 4) {
			sourceIndex += fields[1];
			originalLine += fields[2];
			originalColumn += fields[3];
			yield [sourceIndex, originalLine, originalColumn];
		}
	}
}

/**
 * The deny-listed declarations a bundle retains: those whose source range some
 * generated segment of `map` maps into. Sources are matched by their path
 * below packages/octane/src/, so the map's sourceRoot and relative form do not
 * matter.
 */
export function retainedDeclarations(map, ranges) {
	const bySource = new Map();
	map.sources.forEach((source, index) => {
		const normalized = String(source).replace(/\\/g, '/');
		const at = normalized.lastIndexOf(SOURCE_ROOT);
		if (at === -1) return;
		const relative = normalized.slice(at + SOURCE_ROOT.length);
		const fileRanges = ranges.filter((range) => range.source === relative);
		if (fileRanges.length !== 0) bySource.set(index, fileRanges);
	});
	const retained = new Set();
	if (bySource.size === 0) return retained;
	for (const [sourceIndex, line, column] of mappedSourcePositions(map.mappings)) {
		const fileRanges = bySource.get(sourceIndex);
		if (fileRanges === undefined) continue;
		for (const range of fileRanges) {
			if (
				(line > range.startLine || (line === range.startLine && column >= range.startColumn)) &&
				(line < range.endLine || (line === range.endLine && column < range.endColumn))
			)
				retained.add(range.name);
		}
	}
	return retained;
}

function formatDeclarations(entries) {
	return entries
		.map(({ name, source, startLine, endLine }) => {
			const lines = startLine === undefined ? '' : `:${startLine + 1}-${endLine + 1}`;
			return `  ${name}  [packages/octane/src/${source}${lines}]`;
		})
		.join('\n');
}

/**
 * Fails when a createRoot-only bundle retains hydration code, naming every
 * retained declaration and module rather than only the first.
 */
export function verifyHydrationFree(
	label,
	{ retained, modules = [] },
	ranges,
	deniedModules = HYDRATION_ONLY_MODULES,
) {
	const found = ranges.filter(({ name }) => retained.has(name));
	const leakedModules = modules.filter((id) => deniedModules.some((pattern) => pattern.test(id)));
	if (found.length === 0 && leakedModules.length === 0) return;
	const lines = [`${label}: a createRoot-only client retained hydration code`];
	if (found.length !== 0) {
		lines.push(`${found.length} hydration-only declaration(s):`, formatDeclarations(found));
	}
	if (leakedModules.length !== 0) {
		lines.push(
			`${leakedModules.length} hydration-only module(s):`,
			...leakedModules.map((id) => `  ${id}`),
		);
	}
	throw new assert.AssertionError({ message: lines.join('\n') });
}

/**
 * Every deny-listed declaration must be retained by at least one hydrating
 * control bundle. Otherwise the gate could pass because the oracle stopped
 * seeing the declaration, not because a client stopped retaining it.
 */
export function verifyControlCoverage(controls, ranges) {
	assert.notEqual(controls.size, 0, 'at least one hydrating control bundle must run');
	const missing = ranges.filter(({ name }) =>
		[...controls.values()].every((retained) => !retained.has(name)),
	);
	if (missing.length === 0) return;
	throw new assert.AssertionError({
		message:
			`no hydrating control (${[...controls.keys()].join(', ')}) retains these deny-listed ` +
			'declarations, so the gate cannot detect them; update HYDRATION_ONLY_DECLARATIONS or the controls:\n' +
			formatDeclarations(missing),
	});
}
