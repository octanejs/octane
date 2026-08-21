#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

function exportTargets(value, keyPath = 'exports', subpath = '.', conditions = []) {
	if (typeof value === 'string') return [{ conditions, keyPath, subpath, target: value }];
	if (value === null) return [{ conditions, excluded: true, keyPath, subpath }];
	if (Array.isArray(value)) {
		return value.flatMap((nested, index) =>
			exportTargets(nested, `${keyPath}[${index}]`, subpath, conditions),
		);
	}
	if (!value || typeof value !== 'object') return [];
	const entries = Object.entries(value);
	const hasSubpaths = entries.some(([key]) => key.startsWith('.'));
	return entries.flatMap(([key, nested]) =>
		exportTargets(
			nested,
			`${keyPath}.${key}`,
			hasSubpaths ? key : subpath,
			hasSubpaths ? conditions : [...conditions, key],
		),
	);
}

function matchesExportPattern(pattern, subpath) {
	if (!pattern.includes('*')) return pattern === subpath;
	const expression = new RegExp(
		`^${pattern
			.split('*')
			.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
			.join('(.+)')}$`,
	);
	return expression.test(subpath);
}

function exportPatternSpecificity(pattern) {
	const wildcard = pattern.indexOf('*');
	return wildcard === -1
		? [1, pattern.length, 0, pattern.length]
		: [0, wildcard, pattern.length - wildcard - 1, pattern.length - 1];
}

function compareSpecificity(left, right) {
	for (let index = 0; index < left.length; index++) {
		if (left[index] !== right[index]) return left[index] - right[index];
	}
	return 0;
}

function isExcludedSubpath(subpath, includedPattern, exclusions) {
	const includedSpecificity = exportPatternSpecificity(includedPattern);
	return exclusions.some(
		(exclusion) =>
			matchesExportPattern(exclusion.subpath, subpath) &&
			compareSpecificity(exportPatternSpecificity(exclusion.subpath), includedSpecificity) > 0,
	);
}

function scriptKind(filePath) {
	if (/\.(?:tsx|tsrx)$/i.test(filePath)) return ts.ScriptKind.TSX;
	if (/\.jsx$/i.test(filePath)) return ts.ScriptKind.JSX;
	if (/\.(?:js|mjs|cjs)$/i.test(filePath)) return ts.ScriptKind.JS;
	return ts.ScriptKind.TS;
}

function packageFiles(packageDirectory) {
	const files = [];
	const walk = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.name === 'node_modules' || entry.name === '.git') continue;
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) walk(entryPath);
			else if (entry.isFile()) files.push(entryPath);
		}
	};
	walk(packageDirectory);
	return files;
}

function wildcardMatches(packageDirectory, target, files) {
	const relativePattern = target.slice(2);
	const expression = new RegExp(
		`^${relativePattern
			.split('*')
			.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
			.join('(.+)')}$`,
	);
	return files.flatMap((filePath) => {
		const relativePath = path.relative(packageDirectory, filePath).replaceAll('\\', '/');
		const match = expression.exec(relativePath);
		return match ? [{ captures: match.slice(1), targetPath: filePath }] : [];
	});
}

function resolveLocalModule(fromPath, specifier, packageDirectory) {
	if (!specifier.startsWith('.')) return null;
	const unresolved = path.resolve(path.dirname(fromPath), specifier);
	const candidates = [unresolved];
	const extension = path.extname(unresolved);
	const extensions = [
		'.ts',
		'.tsx',
		'.tsrx',
		'.mts',
		'.cts',
		'.js',
		'.jsx',
		'.mjs',
		'.cjs',
		'.d.ts',
	];
	if (extension) {
		const stem = unresolved.slice(0, -extension.length);
		for (const candidateExtension of extensions) candidates.push(`${stem}${candidateExtension}`);
	}
	for (const candidateExtension of extensions) {
		candidates.push(`${unresolved}${candidateExtension}`);
		candidates.push(path.join(unresolved, `index${candidateExtension}`));
	}
	for (const candidate of candidates) {
		const relative = path.relative(packageDirectory, candidate);
		if (
			!relative.startsWith('..') &&
			!path.isAbsolute(relative) &&
			existsSync(candidate) &&
			statSync(candidate).isFile() &&
			realpathSync(candidate) === candidate
		) {
			return candidate;
		}
	}
	return null;
}

function exportedDeclarationNames(statement, output) {
	const addBindingNames = (name) => {
		if (ts.isIdentifier(name)) output.add(name.text);
		else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
			for (const element of name.elements) {
				if (ts.isBindingElement(element)) addBindingNames(element.name);
			}
		}
	};
	if (statement.name) addBindingNames(statement.name);
	if (ts.isVariableStatement(statement)) {
		for (const declaration of statement.declarationList.declarations) {
			addBindingNames(declaration.name);
		}
	}
}

function commonjsExportName(node) {
	if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
		return null;
	}
	const left = node.left;
	if (
		ts.isPropertyAccessExpression(left) &&
		ts.isIdentifier(left.expression) &&
		left.expression.text === 'module' &&
		left.name.text === 'exports'
	) {
		return 'module.exports';
	}
	if (ts.isPropertyAccessExpression(left) && ts.isIdentifier(left.expression)) {
		if (left.expression.text === 'exports') return left.name.text;
		if (
			ts.isPropertyAccessExpression(left.expression) &&
			ts.isIdentifier(left.expression.expression) &&
			left.expression.expression.text === 'module' &&
			left.expression.name.text === 'exports'
		) {
			return left.name.text;
		}
	}
	return null;
}

function importHasRuntimeEffect(statement) {
	const clause = statement.importClause;
	if (!clause) return true;
	if (clause.isTypeOnly) return false;
	if (clause.name) return true;
	if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
		return (
			clause.namedBindings.elements.length === 0 ||
			clause.namedBindings.elements.some((element) => !element.isTypeOnly)
		);
	}
	return true;
}

function inspectModule(targetPath, packageDirectory, visiting = new Set()) {
	if (visiting.has(targetPath)) return { exports: new Set(), sideEffect: false };
	const source = readFileSync(targetPath, 'utf8');
	if (targetPath.endsWith('.json')) {
		const value = JSON.parse(source);
		return {
			exports: new Set(
				value !== null && (typeof value !== 'object' || Object.keys(value).length)
					? ['default']
					: [],
			),
			sideEffect: false,
		};
	}
	if (!/\.(?:[cm]?[jt]sx?|tsrx)$/i.test(targetPath)) {
		return { exports: new Set(), sideEffect: source.trim().length > 0 };
	}
	if (/\.d\.[cm]?ts$/i.test(targetPath)) {
		return { exports: new Set(['declaration-contract']), sideEffect: false };
	}
	const emptyRuntimeMarker =
		/^\s*(?:\/\*\s*@octane-public-empty-marker\s*\*\/|\/\/\s*@octane-public-empty-marker)\s*$/.test(
			source,
		);
	const sourceFile = ts.createSourceFile(
		targetPath,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind(targetPath),
	);
	const exports = new Set();
	let sideEffect = false;
	const nextVisiting = new Set(visiting).add(targetPath);
	for (const statement of sourceFile.statements) {
		if (ts.isExportAssignment(statement)) {
			exports.add(statement.isExportEquals ? 'module.exports' : 'default');
			continue;
		}
		if (ts.isExportDeclaration(statement)) {
			if (statement.exportClause) {
				let nested = null;
				if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
					const resolved = resolveLocalModule(
						targetPath,
						statement.moduleSpecifier.text,
						packageDirectory,
					);
					if (resolved) nested = inspectModule(resolved, packageDirectory, nextVisiting);
					else if (!statement.moduleSpecifier.text.startsWith('.')) nested = 'external';
				}
				if (ts.isNamespaceExport(statement.exportClause)) {
					if (nested === 'external' || (nested && nested.exports.size > 0)) {
						exports.add(statement.exportClause.name.text);
					}
				} else {
					for (const element of statement.exportClause.elements) {
						const sourceName = element.propertyName?.text ?? element.name.text;
						if (
							!statement.moduleSpecifier ||
							nested === 'external' ||
							nested?.exports.has(sourceName) ||
							nested?.exports.has('declaration-contract')
						) {
							exports.add(element.name.text);
						}
					}
				}
				continue;
			}
			if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
				const resolved = resolveLocalModule(
					targetPath,
					statement.moduleSpecifier.text,
					packageDirectory,
				);
				if (!resolved) {
					if (!statement.moduleSpecifier.text.startsWith('.')) exports.add('external-reexport');
					continue;
				}
				const nested = inspectModule(resolved, packageDirectory, nextVisiting);
				for (const name of nested.exports) exports.add(name);
			}
			continue;
		}
		if (
			ts.canHaveModifiers(statement) &&
			ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
		) {
			exportedDeclarationNames(statement, exports);
			if (
				ts
					.getModifiers(statement)
					?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
			) {
				exports.add('default');
			}
			continue;
		}
		if (ts.isExpressionStatement(statement)) {
			const commonjsName = commonjsExportName(statement.expression);
			if (
				commonjsName === 'module.exports' &&
				ts.isBinaryExpression(statement.expression) &&
				ts.isCallExpression(statement.expression.right) &&
				ts.isIdentifier(statement.expression.right.expression) &&
				statement.expression.right.expression.text === 'require' &&
				ts.isStringLiteral(statement.expression.right.arguments[0])
			) {
				const specifier = statement.expression.right.arguments[0].text;
				const resolved = resolveLocalModule(targetPath, specifier, packageDirectory);
				if (resolved) {
					const nested = inspectModule(resolved, packageDirectory, nextVisiting);
					for (const name of nested.exports) exports.add(name);
				} else if (!specifier.startsWith('.')) exports.add('external-reexport');
			} else if (
				commonjsName === 'module.exports' &&
				ts.isBinaryExpression(statement.expression) &&
				ts.isObjectLiteralExpression(statement.expression.right)
			) {
				for (const property of statement.expression.right.properties) {
					if (
						(ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property)) &&
						property.name
					) {
						exports.add(property.name.getText(sourceFile));
					} else if (ts.isShorthandPropertyAssignment(property)) {
						exports.add(property.name.text);
					} else if (ts.isSpreadAssignment(property)) {
						exports.add('spread-export');
					}
				}
			} else if (commonjsName) exports.add(commonjsName);
			else if (!ts.isStringLiteral(statement.expression)) sideEffect = true;
			continue;
		}
		if (ts.isImportDeclaration(statement)) {
			sideEffect ||= importHasRuntimeEffect(statement);
			continue;
		}
		if (
			ts.isThrowStatement(statement) ||
			ts.isIfStatement(statement) ||
			ts.isForStatement(statement) ||
			ts.isForOfStatement(statement) ||
			ts.isForInStatement(statement) ||
			ts.isWhileStatement(statement) ||
			ts.isDoStatement(statement) ||
			ts.isTryStatement(statement)
		) {
			sideEffect = true;
		}
	}
	return { emptyRuntimeMarker, exports, sideEffect };
}

function validatesAfterPrepack(manifest, target) {
	return Boolean(
		manifest.scripts?.prepack && /^(?:\.\/)?(?:dist|build|lib|cjs|esm)\//.test(target.slice(2)),
	);
}

export function inspectPublicExports(packageDirectory) {
	const resolvedPackageDirectory = realpathSync(packageDirectory);
	const manifestPath = path.join(resolvedPackageDirectory, 'package.json');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	const entries = exportTargets(manifest.exports);
	const declaredTargets = entries.filter(({ excluded }) => !excluded);
	const exclusions = entries.filter(({ excluded }) => excluded);
	if (declaredTargets.length === 0)
		throw new Error('Package exports must declare at least one target');
	const files = packageFiles(resolvedPackageDirectory);
	const targets = [];
	for (const declared of declaredTargets) {
		const { keyPath, subpath, target } = declared;
		if (!target.startsWith('./')) {
			throw new Error(`${keyPath} must use a package-relative target: ${target}`);
		}
		const matchedTargets = target.includes('*')
			? wildcardMatches(resolvedPackageDirectory, target, files).map(
					({ captures, targetPath }) => ({
						concreteSubpath: captures.reduce(
							(value, capture) => value.replace('*', capture),
							subpath,
						),
						targetPath,
					}),
				)
			: [
					{
						concreteSubpath: subpath,
						targetPath: path.resolve(resolvedPackageDirectory, target),
					},
				];
		const concreteTargets = matchedTargets.filter(
			({ concreteSubpath }) => !isExcludedSubpath(concreteSubpath, subpath, exclusions),
		);
		if (matchedTargets.length > 0 && concreteTargets.length === 0) continue;
		if (concreteTargets.length === 0 && validatesAfterPrepack(manifest, target)) {
			targets.push({ ...declared, validation: 'packed-artifact' });
			continue;
		}
		if (concreteTargets.length === 0) {
			throw new Error(`${keyPath} wildcard matches no public exports: ${target}`);
		}
		for (const concrete of concreteTargets) {
			const relativeTarget = path.relative(resolvedPackageDirectory, concrete.targetPath);
			if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
				throw new Error(`${keyPath} escapes the package directory: ${target}`);
			}
			if (!existsSync(concrete.targetPath) || !statSync(concrete.targetPath).isFile()) {
				if (validatesAfterPrepack(manifest, target)) {
					targets.push({ ...declared, validation: 'packed-artifact' });
					continue;
				}
				throw new Error(`${keyPath} points to a missing public export: ${target}`);
			}
			if (realpathSync(concrete.targetPath) !== concrete.targetPath) {
				throw new Error(`${keyPath} must not resolve through a symlink: ${target}`);
			}
			const contract = inspectModule(concrete.targetPath, resolvedPackageDirectory);
			targets.push({
				...declared,
				concreteSubpath: concrete.concreteSubpath,
				concreteTarget: `./${relativeTarget.replaceAll('\\', '/')}`,
				emptyRuntimeMarker: contract.emptyRuntimeMarker === true,
				validation:
					contract.exports.size > 0
						? 'module-exports'
						: contract.sideEffect
							? 'side-effect'
							: 'empty',
			});
		}
	}
	for (const subpath of new Set(
		targets.map(({ concreteSubpath, subpath }) => concreteSubpath ?? subpath),
	)) {
		const conditions = targets.filter(
			(target) => (target.concreteSubpath ?? target.subpath) === subpath,
		);
		if (conditions.every(({ validation }) => validation === 'empty')) {
			throw new Error(`${subpath} exposes no public contract through any export condition`);
		}
		for (const target of conditions) {
			if (
				!target.conditions.includes('types') &&
				target.validation === 'empty' &&
				target.emptyRuntimeMarker
			) {
				target.validation = 'empty-marker';
			}
			if (!target.conditions.includes('types') && target.validation === 'empty') {
				throw new Error(
					`${subpath} runtime export condition ${target.conditions.join('.') || 'default'} exposes no public contract`,
				);
			}
		}
	}
	return { status: 'passed', package: manifest.name, targets };
}

export function concretePublicSpecifiers(packageDirectory, packageName) {
	return [
		...new Set(
			inspectPublicExports(packageDirectory)
				.targets.map(({ concreteSubpath, subpath }) => concreteSubpath ?? subpath)
				.filter((subpath) => subpath && !subpath.includes('*'))
				.map((subpath) => (subpath === '.' ? packageName : `${packageName}/${subpath.slice(2)}`)),
		),
	].sort();
}

function parseArguments(arguments_) {
	if (arguments_.length !== 2 || arguments_[0] !== '--package-dir' || !arguments_[1]) {
		throw new Error('Usage: node scripts/react-port/public-exports.mjs --package-dir <path>');
	}
	return arguments_[1];
}

const isMain =
	process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isMain) {
	try {
		const report = inspectPublicExports(parseArguments(process.argv.slice(2)));
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 2;
	}
}
