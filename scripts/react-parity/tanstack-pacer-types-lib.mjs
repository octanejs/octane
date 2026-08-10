import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

export const TYPE_PARITY_CONFIG = 'packages/tanstack-pacer/audit/type-parity.json';

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function posix(value) {
	return value.split(sep).join('/');
}

function scriptKind(fileName) {
	if (fileName.endsWith('.tsx') || fileName.endsWith('.tsrx')) return ts.ScriptKind.TSX;
	return ts.ScriptKind.TS;
}

function listSourceFiles(root, extensions) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter(function keepSource(entry) {
			if (!entry.isFile()) return false;
			const relativePath = posix(
				relative(root, resolve(entry.parentPath ?? entry.path, entry.name)),
			);
			if (relativePath.endsWith('.d.ts')) return false;
			return extensions.some(function matches(extension) {
				return relativePath.endsWith(extension);
			});
		})
		.map(function toRelative(entry) {
			return posix(relative(root, resolve(entry.parentPath ?? entry.path, entry.name)));
		})
		.sort();
}

function assertionGroups(source) {
	const groups = [];
	for (const match of source.matchAll(/\/\/\s*@ts-expect-error([^\n]*)\n\s*([^\n]+)/g)) {
		groups.push(`expect-error:${match[1].trim()}:${match[2].replace(/\s+/g, ' ').trim()}`);
	}
	for (const match of source.matchAll(
		/\/\/\s*OCTANE DIVERGENCE\[[^\]]+\]\[[^\]]+\][^\n]*\n(?:\/\/[^\n]*\n)*/g,
	)) {
		groups.push(`divergence:${match[0].replace(/\s+/g, ' ').trim()}`);
	}
	return groups;
}

function inventoryEntry(path, source) {
	return {
		path,
		sha256: sha256(source),
		assertionGroups: assertionGroups(source).map(sha256),
	};
}

function normalizeSpecifier(spec) {
	if (spec === 'react') return 'octane';
	if (spec === '@tanstack/react-store') return '@octanejs/tanstack-store';
	if (spec.startsWith('@tanstack/react-store/')) {
		return `@octanejs/tanstack-store/${spec.slice('@tanstack/react-store/'.length)}`;
	}
	if (
		spec === '../provider/PacerProvider' ||
		spec === './PacerProvider' ||
		spec === './PacerProvider.tsrx'
	) {
		return spec.includes('..') ? '../provider/context' : './context';
	}
	if (spec === './provider/PacerProvider' || spec === './provider/PacerProvider.tsrx') {
		return './provider/context';
	}
	return spec.replace(/\.ts$/, '');
}

const DROP_TYPE_NAMES = new Set([
	'Dispatch',
	'SetStateAction',
	'ReactNode',
	'OctaneNode',
	'FunctionComponent',
	'NODE',
	'FC',
	'Renderable',
	'ComponentLike',
]);

function dropSelectorSlotsAndUseStateTypeArgs(source, fileName) {
	const sf = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind(fileName),
	);
	const replacements = [];
	function visit(node) {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'useSelector' &&
			node.arguments.length >= 4
		) {
			replacements.push({
				start: node.arguments[2].end,
				end: node.arguments[3].end,
				value: '',
			});
		}
		ts.forEachChild(node, visit);
	}
	visit(sf);
	let text = source;
	for (const replacement of replacements.sort(function byStartDesc(a, b) {
		return b.start - a.start;
	})) {
		text = `${text.slice(0, replacement.start)}${replacement.value}${text.slice(replacement.end)}`;
	}
	return text.replace(/useState\s*<[^>]+>/g, 'useState');
}

function preprocessTsrxComponentBodies(source) {
	// `function f() @{ stmts; <jsx/> }` → `function f() { stmts; return (<jsx/>); }`
	let text = source;
	let searchFrom = 0;
	while (true) {
		const start = text.indexOf(') @{', searchFrom);
		if (start === -1) break;
		const bodyStart = start + 4;
		let depth = 1;
		let i = bodyStart;
		while (i < text.length && depth > 0) {
			const ch = text[i];
			if (ch === '{') depth += 1;
			else if (ch === '}') depth -= 1;
			i += 1;
		}
		if (depth !== 0) break;
		const body = text.slice(bodyStart, i - 1);
		const trimmed = body.trim();
		const jsxStart = trimmed.search(/<[A-Za-z]/);
		let replacement;
		if (jsxStart === -1) {
			replacement = `) {${body}}`;
		} else {
			const stmts = trimmed.slice(0, jsxStart).trim();
			const jsx = trimmed.slice(jsxStart).trim();
			const prefix = stmts.length ? `${stmts}\n` : '';
			replacement = `) {\n${prefix}return (${jsx});\n}`;
		}
		text = `${text.slice(0, start)}${replacement}${text.slice(i)}`;
		searchFrom = start + replacement.length;
	}
	return text;
}

/**
 * Normalize upstream/adapted adapter sources under the permitted transforms in
 * type-parity.json / assertions.md so only unauthorized structural drift fails.
 */
export function structuralSource(source, fileName, { mergeProviderContext = false } = {}) {
	let text = source;
	if (fileName.endsWith('.tsrx')) {
		text = preprocessTsrxComponentBodies(text);
	}
	text = text.replace(/^\s*const\s+\w+Slot\s*=\s*Symbol\.for\([^)]+\);\s*$/gm, '');
	text = text
		.replace(/\bReact\.Dispatch\b/g, 'Dispatch')
		.replace(/\bReact\.SetStateAction\b/g, 'SetStateAction');
	text = text.replace(/\bReactNode\b/g, 'NODE').replace(/\bOctaneNode\b/g, 'NODE');
	text = text.replace(/\bFunctionComponent\b/g, 'FC');
	text = text.replace(/useSelectorSlot\s*\(/g, 'useSelector(');
	text = text.replace(
		/:\s*\(\(state: TSelected\) => unknown\) \| unknown/g,
		': ((state: TSelected) => NODE) | NODE',
	);
	text = text.replace(/=>\s*ReturnType<\s*FC\s*>/g, '=> NODE');
	text = text.replace(/=>\s*unknown\b/g, '=> NODE');
	text = text.replace(
		/\(props\.children as \(state: TSelected\) => [^)]+\)\s*\(/g,
		'props.children(',
	);
	// Provider split exports context symbols that upstream keeps module-private.
	if (mergeProviderContext) {
		text = text
			.replace(/\bexport interface PacerContextValue\b/g, 'interface PacerContextValue')
			.replace(/\bexport const PacerContext\b/g, 'const PacerContext');
	}
	text = dropSelectorSlotsAndUseStateTypeArgs(text, fileName);

	const sf = ts.createSourceFile(
		fileName,
		text,
		ts.ScriptTarget.Latest,
		true,
		scriptKind(fileName),
	);
	const printer = ts.createPrinter({ removeComments: true });
	const importMap = new Map();
	const otherParts = [];

	for (const stmt of sf.statements) {
		if (
			ts.isImportDeclaration(stmt) &&
			stmt.moduleSpecifier &&
			ts.isStringLiteral(stmt.moduleSpecifier)
		) {
			const spec = normalizeSpecifier(stmt.moduleSpecifier.text);
			if (spec === '../internal' || spec === './internal') continue;
			if (
				mergeProviderContext &&
				fileName.includes('PacerProvider') &&
				(spec === './context' || spec === './context.ts')
			) {
				continue;
			}

			let defaultName = stmt.importClause?.name?.text;
			if (defaultName === 'React') defaultName = undefined;

			const named = [];
			const nb = stmt.importClause?.namedBindings;
			if (nb && ts.isNamedImports(nb)) {
				for (const el of nb.elements) {
					if (DROP_TYPE_NAMES.has(el.name.text)) continue;
					named.push(el.name.text);
				}
			}
			if (spec === '@octanejs/tanstack-store') {
				const set = new Set(named);
				if (set.has('shallow') || set.has('useSelector')) {
					set.add('shallow');
					set.add('useSelector');
				}
				named.length = 0;
				named.push(...[...set].sort());
			}

			const key = `${stmt.importClause?.isTypeOnly ? 'type' : 'value'}::${spec}`;
			const existing = importMap.get(key) ?? {
				isType: !!stmt.importClause?.isTypeOnly,
				spec,
				defaultName: undefined,
				named: new Set(),
			};
			if (defaultName) existing.defaultName = defaultName;
			for (const name of named) existing.named.add(name);
			importMap.set(key, existing);
			continue;
		}

		if (
			ts.isExportDeclaration(stmt) &&
			stmt.moduleSpecifier &&
			ts.isStringLiteral(stmt.moduleSpecifier)
		) {
			const spec = normalizeSpecifier(stmt.moduleSpecifier.text);
			if (
				stmt.exportClause &&
				ts.isNamedExports(stmt.exportClause) &&
				(spec.endsWith('/context') || spec === './context' || spec === './provider/context')
			) {
				otherParts.push(`export * from '${spec}';`);
				continue;
			}
			otherParts.push(
				printer
					.printNode(ts.EmitHint.Unspecified, stmt, sf)
					.replace(stmt.moduleSpecifier.text, spec),
			);
			continue;
		}

		otherParts.push(printer.printNode(ts.EmitHint.Unspecified, stmt, sf));
	}

	const importKeys = [];
	for (const entry of importMap.values()) {
		const named = [...entry.named].sort();
		if (!entry.defaultName && named.length === 0) continue;
		const head = entry.isType ? 'import type' : 'import';
		const names = named.length ? `{ ${named.join(', ')} }` : '';
		const clause =
			entry.defaultName && names ? `${entry.defaultName}, ${names}` : entry.defaultName || names;
		importKeys.push(`${head} ${clause} from '${entry.spec}';`);
	}

	const seenExport = new Set();
	const dedupedOther = [];
	for (const part of otherParts) {
		const match = part.match(/^export \* from '([^']+)';?\s*$/);
		if (match) {
			if (seenExport.has(match[1])) continue;
			seenExport.add(match[1]);
		}
		dedupedOther.push(part);
	}

	const combined = `${importKeys.sort().join('\n')}\n${dedupedOther.join('\n')}`;
	if (mergeProviderContext) {
		// Declaration order differs after the context split; compare a stable set.
		const bodySf = ts.createSourceFile(
			fileName,
			combined,
			ts.ScriptTarget.Latest,
			true,
			scriptKind(fileName),
		);
		const parts = [];
		for (const stmt of bodySf.statements) {
			parts.push(
				printer
					.printNode(ts.EmitHint.Unspecified, stmt, bodySf)
					.replace(/\s+/g, ' ')
					.replace(/,(\s*[}\)])/g, '$1')
					.trim(),
			);
		}
		parts.sort();
		return parts
			.join('\n')
			.replace(/>\s+\{/g, '>{')
			.replace(/\}\s+</g, '}<');
	}
	const printed = printer.printFile(
		ts.createSourceFile(fileName, combined, ts.ScriptTarget.Latest, true, scriptKind(fileName)),
	);
	return printed
		.replace(/\s+/g, ' ')
		.replace(/>\s+\{/g, '>{')
		.replace(/\}\s+</g, '}<')
		.replace(/,(\s*[}\)])/g, '$1')
		.trim();
}

export function readTypeParityConfig(root, configPath = TYPE_PARITY_CONFIG) {
	const absoluteConfig = resolve(root, configPath);
	if (!existsSync(absoluteConfig)) throw new Error(`missing type parity config: ${configPath}`);
	const config = JSON.parse(readFileSync(absoluteConfig, 'utf8'));
	if (!config.upstreamRoot || !config.adaptedRoot) {
		throw new Error('type-parity.json must declare upstreamRoot and adaptedRoot');
	}
	if (!Array.isArray(config.pathMaps) || config.pathMaps.length === 0) {
		throw new Error('type-parity.json must declare pathMaps for every upstream source file');
	}
	if (!Array.isArray(config.adaptedOnly)) {
		throw new Error('type-parity.json must declare adaptedOnly for Octane-only modules');
	}
	if (!Array.isArray(config.permittedTransforms) || config.permittedTransforms.length === 0) {
		throw new Error('type-parity.json must declare permittedTransforms');
	}
	if (!config.projects?.pristine || !config.projects?.adapted) {
		throw new Error('type-parity.json must declare projects.pristine and projects.adapted');
	}
	return config;
}

function globToRegExp(pattern) {
	let body = '';
	for (let index = 0; index < pattern.length; index += 1) {
		const char = pattern[index];
		if (char === '*' && pattern[index + 1] === '*') {
			body += '.*';
			index += 1;
			if (pattern[index + 1] === '/') index += 1;
			continue;
		}
		if (char === '*') {
			body += '[^/]*';
			continue;
		}
		if (char === '?') {
			body += '[^/]';
			continue;
		}
		if ('\\.^$+{}()|[]'.includes(char)) {
			body += `\\${char}`;
			continue;
		}
		body += char;
	}
	return new RegExp(`^${body}$`);
}

function matchesConfigGlob(configDir, pattern, absolutePath) {
	const relativePath = posix(relative(configDir, absolutePath));
	const normalizedPattern = posix(pattern).replace(/^\.\//, '');
	return globToRegExp(normalizedPattern).test(relativePath);
}

function configSelectsPath(configDir, config, absolutePath) {
	if (!existsSync(absolutePath)) return false;
	const exclude = Array.isArray(config.exclude) ? config.exclude : [];
	if (
		exclude.some(function matchesExclude(pattern) {
			return matchesConfigGlob(configDir, pattern, absolutePath);
		})
	) {
		return false;
	}

	const fileEntries = Array.isArray(config.files) ? config.files : null;
	const includeEntries = Array.isArray(config.include) ? config.include : null;
	const listedInFiles =
		fileEntries !== null &&
		fileEntries.some(function matchesFile(entry) {
			return resolve(configDir, entry) === absolutePath;
		});
	if (listedInFiles) return true;

	// `files` alone defines the program roots. Do not fall back to `**/*`.
	if (fileEntries !== null && includeEntries === null) return false;

	const include = includeEntries !== null ? includeEntries : ['**/*'];
	return include.some(function matchesInclude(pattern) {
		return matchesConfigGlob(configDir, pattern, absolutePath);
	});
}

function programFileSet(root, tsconfigPath) {
	const absoluteConfig = resolve(root, tsconfigPath);
	if (!existsSync(absoluteConfig)) {
		throw new Error(`missing type project config: ${tsconfigPath}`);
	}
	const read = ts.readConfigFile(absoluteConfig, ts.sys.readFile);
	if (read.error) {
		throw new Error(
			`unable to read ${tsconfigPath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, '\n')}`,
		);
	}
	const configDir = dirname(absoluteConfig);
	const parsed = ts.parseJsonConfigFileContent(
		read.config,
		ts.sys,
		configDir,
		undefined,
		absoluteConfig,
		undefined,
		[{ extension: '.tsrx', isMixedContent: false, scriptKind: ts.ScriptKind.TSX }],
	);
	const files = new Set(
		parsed.fileNames.map(function absolute(file) {
			return resolve(file);
		}),
	);
	// TypeScript wildcards do not expand extraFileExtensions into fileNames, and
	// `*.ts` globs can surface sibling `*.tsrx.d.ts` stubs instead. Record the
	// authored `.tsrx` when include/exclude still select it, and drop the stub.
	const sidecars = [];
	for (const file of files) {
		if (file.endsWith('.tsrx.d.ts')) sidecars.push(file);
	}
	for (const file of sidecars) {
		const source = file.slice(0, -'.d.ts'.length);
		if (!configSelectsPath(configDir, read.config, source)) continue;
		files.add(source);
		files.delete(file);
	}
	return { files, configDir, config: read.config };
}

function assertMappedPathInProgram(program, absolutePath, label) {
	if (program.files.has(absolutePath)) return;
	// Direct `.tsrx` membership can be absent from fileNames; include/exclude is
	// the authoritative signal that the mapped source still participates.
	if (
		absolutePath.endsWith('.tsrx') &&
		configSelectsPath(program.configDir, program.config, absolutePath)
	) {
		return;
	}
	throw new Error(`${label} compiler program omits mapped inventory member ${posix(absolutePath)}`);
}

export function assertCompilerProgramMembership(root, config, inventory) {
	const pristineProgram = programFileSet(root, config.projects.pristine);
	const adaptedProgram = programFileSet(root, config.projects.adapted);
	const upstreamRoot = resolve(root, config.upstreamRoot);
	const adaptedRoot = resolve(root, config.adaptedRoot);
	for (const entry of inventory.upstream) {
		assertMappedPathInProgram(pristineProgram, resolve(upstreamRoot, entry.path), 'pristine');
	}
	for (const entry of inventory.adapted) {
		assertMappedPathInProgram(adaptedProgram, resolve(adaptedRoot, entry.path), 'adapted');
	}
}

function adaptedSourceForMap(root, config, entry) {
	if (entry.upstream === 'provider/PacerProvider.tsx') {
		const contextSource = readFileSync(
			resolve(root, config.adaptedRoot, 'provider/context.ts'),
			'utf8',
		);
		const providerSource = readFileSync(resolve(root, config.adaptedRoot, entry.adapted), 'utf8');
		return `${contextSource}\n${providerSource}`;
	}
	return readFileSync(resolve(root, config.adaptedRoot, entry.adapted), 'utf8');
}

export function buildTypeInventory(root, config) {
	const upstreamRoot = resolve(root, config.upstreamRoot);
	const adaptedRoot = resolve(root, config.adaptedRoot);
	const upstreamFiles = listSourceFiles(upstreamRoot, ['.ts', '.tsx']);
	const adaptedFiles = listSourceFiles(adaptedRoot, ['.ts', '.tsx', '.tsrx']);
	const mappedUpstream = config.pathMaps.map(function path(entry) {
		return entry.upstream;
	});
	if (JSON.stringify(mappedUpstream.slice().sort()) !== JSON.stringify(upstreamFiles)) {
		throw new Error('type-parity pathMaps must cover every upstream source file exactly once');
	}
	const expectedAdapted = new Set(
		config.pathMaps
			.map(function adapted(entry) {
				return entry.adapted;
			})
			.concat(
				config.adaptedOnly.map(function path(entry) {
					return entry.path;
				}),
			),
	);
	for (const file of expectedAdapted) {
		if (!adaptedFiles.includes(file)) {
			throw new Error(`missing: adapted type suite file ${file}`);
		}
	}
	for (const file of adaptedFiles) {
		if (!expectedAdapted.has(file)) {
			throw new Error(`unexpected adapted source file outside type-parity maps: ${file}`);
		}
	}

	const upstream = [];
	const adapted = [];
	for (const entry of config.pathMaps) {
		const upstreamSource = readFileSync(resolve(upstreamRoot, entry.upstream), 'utf8');
		const adaptedSource = adaptedSourceForMap(root, config, entry);
		const upstreamStructural = structuralSource(upstreamSource, entry.upstream, {
			mergeProviderContext: entry.upstream === 'provider/PacerProvider.tsx',
		});
		const adaptedStructural = structuralSource(adaptedSource, entry.adapted, {
			mergeProviderContext: entry.upstream === 'provider/PacerProvider.tsx',
		});
		if (upstreamStructural !== adaptedStructural) {
			throw new Error(
				`${entry.upstream}: adapted source contains a change outside the permitted transformations`,
			);
		}
		upstream.push(inventoryEntry(entry.upstream, upstreamSource));
		adapted.push(
			inventoryEntry(entry.adapted, readFileSync(resolve(adaptedRoot, entry.adapted), 'utf8')),
		);
	}
	for (const entry of config.adaptedOnly) {
		const source = readFileSync(resolve(adaptedRoot, entry.path), 'utf8');
		adapted.push(inventoryEntry(entry.path, source));
	}
	upstream.sort(function byPath(a, b) {
		return a.path.localeCompare(b.path);
	});
	adapted.sort(function byPath(a, b) {
		return a.path.localeCompare(b.path);
	});
	return { upstream, adapted };
}

export function verifyTanstackPacerTypes(root, { configPath = TYPE_PARITY_CONFIG } = {}) {
	const config = readTypeParityConfig(root, configPath);
	const inventory = buildTypeInventory(root, config);
	assertCompilerProgramMembership(root, config, inventory);
	for (const [inventoryKey, configKey] of [
		['upstream', 'pristine'],
		['adapted', 'adapted'],
	]) {
		const inventoryPath = resolve(root, config.inventories[configKey]);
		const recorded = existsSync(inventoryPath)
			? JSON.parse(readFileSync(inventoryPath, 'utf8'))
			: undefined;
		if (JSON.stringify(recorded) !== JSON.stringify(inventory[inventoryKey])) {
			throw new Error(
				`${inventoryKey} type inventory drifted; review the change and regenerate its inventory`,
			);
		}
	}
	return {
		files: inventory.upstream.length,
		adaptedFiles: inventory.adapted.length,
		assertions: inventory.adapted.reduce(function sumAssertions(sum, file) {
			return sum + file.assertionGroups.length;
		}, 0),
	};
}

export function renderTypeInventories(root, configPath = TYPE_PARITY_CONFIG) {
	const config = readTypeParityConfig(root, configPath);
	const inventory = buildTypeInventory(root, config);
	return { config, inventory };
}
