import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

export const TYPE_PARITY_CONFIG = 'packages/tanstack-devtools/audit/type-parity.json';

const TSRX_EXTENSION = {
	extension: '.tsrx',
	isMixedContent: false,
	scriptKind: ts.ScriptKind.TSX,
};

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function posix(value) {
	return value.split(sep).join('/');
}

function scriptKindFor(fileName) {
	if (fileName.endsWith('.tsrx') || fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
	return ts.ScriptKind.TS;
}

function listProbeFiles(root) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter(function keepProbeFiles(entry) {
			if (!entry.isFile()) return false;
			const relativePath = posix(
				relative(root, resolve(entry.parentPath ?? entry.path, entry.name)),
			);
			return (
				/(?:\.test-d\.ts|\.ts)$/.test(relativePath) &&
				!relativePath.endsWith('tsconfig.json') &&
				!relativePath.includes('tsconfig')
			);
		})
		.map(function toRelative(entry) {
			return posix(relative(root, resolve(entry.parentPath ?? entry.path, entry.name)));
		})
		.sort();
}

function normalizeComment(comment) {
	return comment
		.replace(/^\/\*\*|\*\/$/g, '')
		.replace(/^\s*\*\s?/gm, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function containsExpect(node) {
	if (ts.isIdentifier(node) && node.text === 'Expect') return true;
	return node.getChildren().some(containsExpect);
}

function assertionGroups(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const printer = ts.createPrinter({ removeComments: true });
	const groups = [];
	for (const match of source.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
		groups.push(`doc:${normalizeComment(match[0])}`);
	}
	for (const match of source.matchAll(/\/\/\s*@ts-expect-error([^\n]*)\n\s*([^\n]+)/g)) {
		groups.push(
			`expect-error:${match[1].trim()}:${match[2]
				.replace(/\bTanStackDevtoolsReact(Plugin|Init)\b/g, 'TanStackDevtoolsFramework$1')
				.replace(/\bTanStackDevtoolsOctane(Plugin|Init)\b/g, 'TanStackDevtoolsFramework$1')
				.replace(/\s+/g, ' ')
				.trim()}`,
		);
	}
	function visit(node) {
		if (ts.isTypeAliasDeclaration(node) && node.type && containsExpect(node.type)) {
			groups.push(
				`expect:${node.name.text}:${printer.printNode(ts.EmitHint.Unspecified, node.type, sourceFile).replace(/\s+/g, ' ').trim()}`,
			);
		}
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'expectType'
		) {
			groups.push(
				`expectType:${printer
					.printNode(ts.EmitHint.Unspecified, node, sourceFile)
					.replace(/\bReactNode\b/g, 'RenderableNode')
					.replace(/\bReactElement\b/g, 'RenderableNode')
					.replace(/\bOctaneNode\b/g, 'RenderableNode')
					.replace(/\bTanStackDevtoolsReact(Plugin|Init)\b/g, 'TanStackDevtoolsFramework$1')
					.replace(/\bTanStackDevtoolsOctane(Plugin|Init)\b/g, 'TanStackDevtoolsFramework$1')
					.replace(/\s+/g, ' ')
					.trim()}`,
			);
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return groups;
}

function normalizeSpecifier(specifier) {
	if (
		specifier === '../../upstream/src/index' ||
		specifier === '../../upstream/src/index.ts' ||
		specifier === '../src/index' ||
		specifier === '../src/index.ts' ||
		specifier === '@octanejs/tanstack-devtools' ||
		specifier === '@tanstack/react-devtools'
	) {
		return '#tanstack-devtools-public';
	}
	if (specifier === 'react' || specifier === 'octane') return '#renderable-runtime';
	if (
		specifier === 'react-dom' ||
		specifier === './devtools' ||
		specifier === './devtools.tsrx' ||
		specifier === './devtools.tsx'
	) {
		return '#adapter-local';
	}
	return specifier;
}

function normalizeFrameworkNames(source) {
	return source
		.replace(/\bTanStackDevtoolsReact(Plugin|Init|Config)\b/g, 'TanStackDevtoolsFramework$1')
		.replace(/\bTanStackDevtoolsOctane(Plugin|Init|Config)\b/g, 'TanStackDevtoolsFramework$1')
		.replace(/\bReactNode\b/g, 'RenderableNode')
		.replace(/\bReactElement\b/g, 'RenderableNode')
		.replace(/\bOctaneNode\b/g, 'RenderableNode')
		.replace(/\bJSX\.Element\b/g, 'RenderableNode');
}

function stripOctaneMarkers(source) {
	return source
		.replace(/^\/\/ OCTANE DIVERGENCE\[[^\]]*\]\[[^\]]*\]\s*\n/gm, '')
		.replace(/^\/\/ Ported from[\s\S]*?^\/\/ - `ref`[^\n]*\n+/m, '')
		.replace(/^\/\/ An octane renderable[\s\S]*?^\/\/ \(a `unknown`[^\n]*\n+/m, '')
		.replace(/^\/\/ A createPortal VALUE[\s\S]*?^\/\/ so each container[^\n]*\n+/m, '');
}

function stripAdditiveExports(source) {
	return source
		.replace(/\n\/\/ Re-export the framework-agnostic core surface[\s\S]*$/m, '\n')
		.replace(/\nexport \{\s*PLUGIN_CONTAINER_ID[\s\S]*from '@tanstack\/devtools';\s*/m, '\n')
		.replace(/\nexport type \{\s*ClientEventBusConfig[\s\S]*from '@tanstack\/devtools';\s*/m, '\n');
}

function canonicalizeAdapterSource(source, fileName) {
	let text = stripOctaneMarkers(source);
	if (fileName === 'index.ts' || fileName.endsWith('/index.ts')) {
		text = stripAdditiveExports(text);
	}
	text = normalizeFrameworkNames(text);
	text = text
		.replace(
			/import React,\s*\{\s*useEffect,\s*useMemo,\s*useRef,\s*useState\s*\}\s*from ['"]#renderable-runtime['"];?\s*/g,
			"import { createPortal, useEffect, useMemo, useRef, useState } from '#renderable-runtime';\n",
		)
		.replace(
			/import\s*\{\s*createPortal,\s*useEffect,\s*useMemo,\s*useRef,\s*useState\s*\}\s*from ['"]#renderable-runtime['"];?\s*/g,
			"import { createPortal, useEffect, useMemo, useRef, useState } from '#renderable-runtime';\n",
		)
		.replace(/import\s*\{\s*createPortal\s*\}\s*from ['"]#adapter-local['"];?\s*/g, '')
		.replace(
			/import type\s*\{\s*JSX,\s*RenderableNode\s*\}\s*from ['"]#renderable-runtime['"];?\s*/g,
			'',
		)
		.replace(/import type\s*\{\s*RenderableNode\s*\}\s*from ['"]#renderable-runtime['"];?\s*/g, '')
		.replace(/import type\s*\{\s*OctaneNode\s*\}\s*from ['"]#renderable-runtime['"];?\s*/g, '')
		.replace(/type Renderable = \{\} \| null \| undefined;\s*/g, '')
		.replace(/\bRenderable\b/g, 'RenderableNode')
		.replace(
			/React\.Dispatch<\s*React\.SetStateAction<Record<string, RenderableNode>>\s*>/g,
			'SetComponents',
		)
		.replace(
			/\(updater: \(prev: Record<string, RenderableNode>\) => Record<string, RenderableNode>\) => void/g,
			'SetComponents',
		)
		.replace(
			/React\.Dispatch<\s*React\.SetStateAction<RenderableNode \| null>\s*>/g,
			'(element: RenderableNode | null) => void',
		)
		.replace(
			/function DevtoolsPortal\(props: \{ target: HTMLElement; content: RenderableNode \}\) \{\s*return createPortal\(props\.content, props\.target\);\s*\}\s*/g,
			'',
		)
		.replace(
			/<DevtoolsPortal\s+key=\{[^}]+\}\s+target=\{([^}]+)\}\s+content=\{([^}]+)\}\s*\/>/g,
			'createPortal(<>{$2}</>, $1)',
		)
		.replace(
			/<DevtoolsPortal\s+target=\{([^}]+)\}\s+content=\{([^}]+)\}\s*\/>/g,
			'createPortal(<>{$2}</>, $1)',
		)
		.replace(
			/Object\.entries\(([^)]+)\)\.map\(function map\w+\(\[key,\s*(\w+)\]\)\s*\{\s*return \(\s*createPortal\(<>\{([^}]+)\}<\/>,\s*\2\)\s*\);\s*\}\)/g,
			'Object.entries($1).map(([key, $2]) => createPortal(<>{$3}</>, $2))',
		)
		.replace(
			/Object\.entries\(([^)]+)\)\.map\(function map\w+\(\[key,\s*(\w+)\]\)\s*\{\s*return createPortal\(<>\{([^}]+)\}<\/>,\s*\2\);\s*\}\)/g,
			'Object.entries($1).map(([key, $2]) => createPortal(<>{$3}</>, $2))',
		)
		.replace(/: RenderableNode =>/g, ': RenderableNode | null =>')
		.replace(/useRef<HTMLDivElement>\(null\)/g, 'useRef<HTMLDivElement | null>(null)');
	return text;
}

function structuralProbeSource(source, fileName) {
	let transformed = normalizeFrameworkNames(source);
	const sourceFile = ts.createSourceFile(
		fileName,
		transformed,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const replacements = [];
	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
			continue;
		const specifier = statement.moduleSpecifier.text;
		const normalized = normalizeSpecifier(specifier);
		if (normalized === specifier) continue;
		replacements.push({
			start: statement.moduleSpecifier.getStart(sourceFile) + 1,
			end: statement.moduleSpecifier.getEnd() - 1,
			value: normalized,
		});
	}
	for (const replacement of replacements.sort(function byStartDesc(a, b) {
		return b.start - a.start;
	})) {
		transformed = `${transformed.slice(0, replacement.start)}${replacement.value}${transformed.slice(replacement.end)}`;
	}
	const normalizedFile = ts.createSourceFile(
		fileName,
		transformed,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	return ts
		.createPrinter({ removeComments: true })
		.printFile(normalizedFile)
		.replace(/\s+/g, ' ')
		.trim();
}

function rewriteImportSpecifiers(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKindFor(fileName),
	);
	const replacements = [];
	for (const statement of sourceFile.statements) {
		if (!(
			(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
			statement.moduleSpecifier &&
			ts.isStringLiteral(statement.moduleSpecifier)
		)) {
			continue;
		}
		const specifier = statement.moduleSpecifier.text;
		const normalized = normalizeSpecifier(specifier);
		if (normalized === specifier) continue;
		replacements.push({
			start: statement.moduleSpecifier.getStart(sourceFile) + 1,
			end: statement.moduleSpecifier.getEnd() - 1,
			value: normalized,
		});
	}
	let transformed = source;
	for (const replacement of replacements.sort(function byStartDesc(a, b) {
		return b.start - a.start;
	})) {
		transformed = `${transformed.slice(0, replacement.start)}${replacement.value}${transformed.slice(replacement.end)}`;
	}
	return transformed;
}

function structuralAdapterSource(source, fileName) {
	const rewritten = canonicalizeAdapterSource(rewriteImportSpecifiers(source, fileName), fileName);
	const sourceFile = ts.createSourceFile(
		fileName,
		rewritten,
		ts.ScriptTarget.Latest,
		true,
		scriptKindFor(fileName),
	);
	const printer = ts.createPrinter({ removeComments: true });
	const parts = [];
	for (const statement of sourceFile.statements) {
		if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
			parts.push(printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile));
			continue;
		}
		if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
			parts.push(printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile));
			continue;
		}
		if (
			ts.isFunctionDeclaration(statement) &&
			statement.modifiers?.some(function isExport(modifier) {
				return modifier.kind === ts.SyntaxKind.ExportKeyword;
			})
		) {
			const signatureOnly = ts.factory.updateFunctionDeclaration(
				statement,
				statement.modifiers,
				statement.asteriskToken,
				statement.name,
				statement.typeParameters,
				statement.parameters,
				statement.type,
				undefined,
			);
			parts.push(printer.printNode(ts.EmitHint.Unspecified, signatureOnly, sourceFile));
			if (statement.body) {
				parts.push(
					`body:${printer
						.printNode(ts.EmitHint.Unspecified, statement.body, sourceFile)
						.replace(/\s+/g, ' ')
						.trim()}`,
				);
			}
			continue;
		}
		if (
			ts.isVariableStatement(statement) &&
			statement.modifiers?.some(function isExport(modifier) {
				return modifier.kind === ts.SyntaxKind.ExportKeyword;
			})
		) {
			parts.push(printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile));
			continue;
		}
		if (
			ts.isFunctionDeclaration(statement) ||
			ts.isVariableStatement(statement) ||
			ts.isExpressionStatement(statement)
		) {
			parts.push(printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile));
		}
	}
	return parts
		.map(function compact(part) {
			return part.replace(/\s+/g, ' ').trim();
		})
		.filter(Boolean)
		.join('\n');
}

function exportSurface(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		normalizeFrameworkNames(source),
		ts.ScriptTarget.Latest,
		true,
		scriptKindFor(fileName),
	);
	const exports = new Set();
	for (const statement of sourceFile.statements) {
		if (
			(ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) &&
			ts.isExportDeclaration(statement)
		) {
			if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
				for (const element of statement.exportClause.elements) {
					exports.add(element.name.text);
				}
			}
		}
		if (
			(ts.isFunctionDeclaration(statement) ||
				ts.isClassDeclaration(statement) ||
				ts.isTypeAliasDeclaration(statement) ||
				ts.isInterfaceDeclaration(statement) ||
				ts.isVariableStatement(statement)) &&
			statement.modifiers?.some(function isExport(modifier) {
				return modifier.kind === ts.SyntaxKind.ExportKeyword;
			})
		) {
			if (ts.isVariableStatement(statement)) {
				for (const declaration of statement.declarationList.declarations) {
					if (ts.isIdentifier(declaration.name)) exports.add(declaration.name.text);
				}
			} else if ('name' in statement && statement.name && ts.isIdentifier(statement.name)) {
				exports.add(statement.name.text);
			}
		}
	}
	return [...exports].sort();
}

export function loadTypeParityConfig(root = process.cwd()) {
	return JSON.parse(readFileSync(resolve(root, TYPE_PARITY_CONFIG), 'utf8'));
}

function listCompilerProgramFiles(root, projectPath, sourceRoot) {
	const configPath = resolve(root, projectPath);
	if (!existsSync(configPath)) {
		throw new Error(`missing compiler project for program membership: ${projectPath}`);
	}
	const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
	if (readResult.error) {
		throw new Error(
			`failed to read ${projectPath}: ${ts.flattenDiagnosticMessageText(readResult.error.messageText, '\n')}`,
		);
	}
	const config = { ...readResult.config };
	if (Array.isArray(config.include) && !config.files) {
		const explicit = config.include.filter(function isExplicitFile(pattern) {
			return /\.(?:ts|tsx|tsrx)$/.test(pattern) && !pattern.includes('*');
		});
		if (explicit.length === config.include.length && explicit.length > 0) {
			config.files = explicit;
			delete config.include;
		}
	}
	const parsed = ts.parseJsonConfigFileContent(
		config,
		ts.sys,
		dirname(configPath),
		undefined,
		configPath,
		undefined,
		[TSRX_EXTENSION],
	);
	const sourceAbs = resolve(root, sourceRoot);
	return parsed.fileNames
		.filter(function underSourceRoot(filePath) {
			const rel = relative(sourceAbs, filePath);
			return (
				rel &&
				!rel.startsWith('..') &&
				!rel.includes(`..${sep}`) &&
				/\.(?:ts|tsx|tsrx)$/.test(filePath) &&
				!filePath.endsWith('.d.ts')
			);
		})
		.map(function toRelative(filePath) {
			return posix(relative(sourceAbs, filePath));
		})
		.sort();
}

function verifyProgramMembership(config, upstreamFiles, adaptedFiles) {
	const mappedUpstream = config.fileMap
		.map(function upstreamPath(entry) {
			return entry.upstream;
		})
		.sort();
	const mappedAdapted = config.fileMap
		.map(function adaptedPath(entry) {
			return entry.adapted;
		})
		.sort();
	if (JSON.stringify(upstreamFiles) !== JSON.stringify(mappedUpstream)) {
		throw new Error(
			`upstream compiler program membership drifted from fileMap; expected ${JSON.stringify(mappedUpstream)}, received ${JSON.stringify(upstreamFiles)}`,
		);
	}
	if (JSON.stringify(adaptedFiles) !== JSON.stringify(mappedAdapted)) {
		throw new Error(
			`adapted compiler program membership drifted from fileMap; expected ${JSON.stringify(mappedAdapted)}, received ${JSON.stringify(adaptedFiles)}`,
		);
	}
	const seenAdapted = new Set();
	for (const entry of config.fileMap) {
		if (seenAdapted.has(entry.adapted)) {
			throw new Error(`fileMap maps multiple upstream files onto ${entry.adapted}`);
		}
		seenAdapted.add(entry.adapted);
	}
	const pristineProject = config.lanes?.pristine?.project;
	const adaptedProject = config.lanes?.adapted?.project;
	if (!pristineProject || !adaptedProject) {
		throw new Error('type-parity.json lanes must declare pristine and adapted compiler projects');
	}
}

function buildSourceInventories(root, config) {
	const pristineProject = config.lanes.pristine.project;
	const adaptedProject = config.lanes.adapted.project;
	const upstreamFiles = listCompilerProgramFiles(root, pristineProject, config.upstreamRoot);
	const adaptedFiles = listCompilerProgramFiles(root, adaptedProject, config.adaptedRoot);
	verifyProgramMembership(config, upstreamFiles, adaptedFiles);

	const upstreamRoot = resolve(root, config.upstreamRoot);
	const adaptedRoot = resolve(root, config.adaptedRoot);
	const upstream = [];
	const adapted = [];
	const allowedExtra = config.allowedExtraExports ?? {};
	for (const entry of config.fileMap) {
		const upstreamSource = readFileSync(resolve(upstreamRoot, entry.upstream), 'utf8');
		const adaptedSource = readFileSync(resolve(adaptedRoot, entry.adapted), 'utf8');
		const upstreamExports = exportSurface(upstreamSource, entry.upstream);
		const adaptedExports = exportSurface(adaptedSource, entry.adapted);
		const adaptedSet = new Set(adaptedExports);
		const missing = upstreamExports.filter(function missingExport(name) {
			return !adaptedSet.has(name);
		});
		if (missing.length > 0) {
			throw new Error(
				`${entry.upstream} → ${entry.adapted}: adapted source is missing required exports after permitted transforms: ${missing.join(', ')}`,
			);
		}
		const upstreamSet = new Set(upstreamExports);
		const extras = adaptedExports.filter(function extraExport(name) {
			return !upstreamSet.has(name);
		});
		const allowed = new Set(allowedExtra[entry.adapted] ?? allowedExtra[entry.upstream] ?? []);
		const unexpected = extras.filter(function unexpectedExport(name) {
			return !allowed.has(name);
		});
		if (unexpected.length > 0) {
			throw new Error(
				`${entry.upstream} → ${entry.adapted}: adapted source has undeclared extra exports: ${unexpected.join(', ')}`,
			);
		}
		const undeclaredAllow = [...allowed].filter(function unusedAllow(name) {
			return !extras.includes(name);
		});
		if (undeclaredAllow.length > 0) {
			throw new Error(
				`${entry.adapted}: allowedExtraExports lists symbols not present on the adapted surface: ${undeclaredAllow.join(', ')}`,
			);
		}
		const upstreamStructure = structuralAdapterSource(upstreamSource, entry.upstream);
		const adaptedStructure = structuralAdapterSource(adaptedSource, entry.adapted);
		if (upstreamStructure !== adaptedStructure) {
			throw new Error(
				`${entry.upstream} → ${entry.adapted}: adapted source contains a change outside the permitted transformations`,
			);
		}
		upstream.push({
			path: entry.upstream,
			sha256: sha256(upstreamSource),
			exports: upstreamExports,
			structure: sha256(upstreamStructure),
			pairedAdapted: entry.adapted,
		});
		adapted.push({
			path: entry.adapted,
			sha256: sha256(adaptedSource),
			exports: adaptedExports,
			extraExports: extras,
			structure: sha256(adaptedStructure),
			pairedUpstream: entry.upstream,
		});
	}
	return { upstream, adapted };
}

function buildProbeInventories(root, config) {
	const probe = config.probePair;
	if (!probe) return { upstream: [], adapted: [] };
	const upstreamRoot = resolve(root, probe.upstreamRoot);
	const adaptedRoot = resolve(root, probe.adaptedRoot);
	const upstreamFiles = listProbeFiles(upstreamRoot);
	const adaptedFiles = listProbeFiles(adaptedRoot);
	if (JSON.stringify(upstreamFiles) !== JSON.stringify(adaptedFiles)) {
		throw new Error(
			'type-probe file inventories differ; every upstream probe needs one adapted counterpart',
		);
	}
	const upstream = [];
	const adapted = [];
	for (const file of upstreamFiles) {
		const upstreamSource = readFileSync(resolve(upstreamRoot, file), 'utf8');
		const adaptedSource = readFileSync(resolve(adaptedRoot, file), 'utf8');
		const upstreamGroups = assertionGroups(upstreamSource, file);
		const adaptedGroups = assertionGroups(adaptedSource, file);
		if (JSON.stringify(upstreamGroups) !== JSON.stringify(adaptedGroups)) {
			throw new Error(`${file}: assertion groups differ between pristine and adapted probes`);
		}
		if (
			structuralProbeSource(upstreamSource, file) !== structuralProbeSource(adaptedSource, file)
		) {
			throw new Error(
				`${file}: adapted probe contains a change outside the permitted transformations`,
			);
		}
		upstream.push({
			path: file,
			sha256: sha256(upstreamSource),
			assertionGroups: upstreamGroups.map(sha256),
		});
		adapted.push({
			path: file,
			sha256: sha256(adaptedSource),
			assertionGroups: adaptedGroups.map(sha256),
		});
	}
	return { upstream, adapted };
}

export function buildTypeInventories(root = process.cwd()) {
	const config = loadTypeParityConfig(root);
	if (!Array.isArray(config.fileMap) || config.fileMap.length === 0) {
		throw new Error('type-parity.json must declare a non-empty fileMap for the source programs');
	}
	const source = buildSourceInventories(root, config);
	const probes = buildProbeInventories(root, config);
	return { source, probes, config };
}

export function writeTypeInventories(root = process.cwd()) {
	const { source, probes, config } = buildTypeInventories(root);
	writeFileSync(
		resolve(root, config.inventories.upstream),
		`${JSON.stringify(source.upstream, null, '\t')}\n`,
	);
	writeFileSync(
		resolve(root, config.inventories.adapted),
		`${JSON.stringify(source.adapted, null, '\t')}\n`,
	);
	if (config.probePair) {
		writeFileSync(
			resolve(root, config.probePair.inventories.upstream),
			`${JSON.stringify(probes.upstream, null, '\t')}\n`,
		);
		writeFileSync(
			resolve(root, config.probePair.inventories.adapted),
			`${JSON.stringify(probes.adapted, null, '\t')}\n`,
		);
	}
	return { source, probes, config };
}

export function verifyTypeInventories(root = process.cwd()) {
	const absoluteConfig = resolve(root, TYPE_PARITY_CONFIG);
	if (!existsSync(absoluteConfig))
		throw new Error(`missing type parity config: ${TYPE_PARITY_CONFIG}`);
	const { source, probes, config } = buildTypeInventories(root);
	for (const side of ['upstream', 'adapted']) {
		const inventoryPath = resolve(root, config.inventories[side]);
		const recorded = existsSync(inventoryPath)
			? JSON.parse(readFileSync(inventoryPath, 'utf8'))
			: undefined;
		const expected = source[side];
		if (JSON.stringify(recorded) !== JSON.stringify(expected)) {
			throw new Error(
				`${side} source program inventory drifted; review the change and regenerate its inventory`,
			);
		}
	}
	if (config.probePair) {
		for (const side of ['upstream', 'adapted']) {
			const inventoryPath = resolve(root, config.probePair.inventories[side]);
			const recorded = existsSync(inventoryPath)
				? JSON.parse(readFileSync(inventoryPath, 'utf8'))
				: undefined;
			const expected = probes[side];
			if (JSON.stringify(recorded) !== JSON.stringify(expected)) {
				throw new Error(
					`${side} type-probe inventory drifted; review the change and regenerate its inventory`,
				);
			}
		}
	}
	return {
		pairs: source.upstream.length,
		files: source.upstream.length,
		probePairs: probes.upstream.length,
		assertions: probes.upstream.reduce(function sumAssertions(sum, file) {
			return sum + file.assertionGroups.length;
		}, 0),
		exports: source.upstream.reduce(function sumExports(sum, file) {
			return sum + file.exports.length;
		}, 0),
	};
}
