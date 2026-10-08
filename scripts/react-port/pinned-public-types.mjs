import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { parseTarArchive, verifyIntegrity } from './preflight-lib.mjs';
import path from 'node:path';
import {
	publicCompatibilityDeclarations,
	publicCompatibilityExport,
} from './public-compatibility.mjs';
import { importNativeTypeScript } from '../octane-tsc/native.mjs';
import { parseSourceFile } from '../octane-tsc/native-syntax.mjs';
import { validateUpstreamLock, verifyPristineTree } from './materialize-lib.mjs';
import {
	declarationsOf,
	hasModifier,
	IndexKind,
	is,
	isTypeScriptLibraryFile,
	isTypeScriptLibraryNode,
	namingSymbolOf,
	ObjectFlags,
	primaryDeclarationOf,
	SignatureKind,
	SymbolFlags,
	SyntaxKind,
	targetOf,
	TypeFlags,
	typeArgumentsOf,
	unionMembers,
} from './native-types.mjs';

const { API, ModuleKind, ModuleResolutionKind } = await importNativeTypeScript('unstable/sync');
const { getJSDocTags } = await importNativeTypeScript('unstable/ast');
const { createFileSystemLayer } = await importNativeTypeScript('unstable/fs');

// Resolve upstream specifiers from the binding package as a bundler-mode import
// does, to the files TypeScript 7 selects. Its API resolves only within a
// program, so a probe importing every specifier exists in the request's file
// system layer, never on disk; the program needs no library or ambient types.
function resolveFromPackage(packageDirectory, specifiers) {
	if (specifiers.length === 0) return [];
	const probe = path.join(packageDirectory, '.pinned-public-entries.ts');
	const api = new API({ cwd: packageDirectory });
	try {
		const program = api.createSnapshot({
			createPrograms: [
				{
					rootFiles: [probe],
					compilerOptions: {
						module: ModuleKind.ESNext,
						moduleResolution: ModuleResolutionKind.Bundler,
						noLib: true,
						types: [],
					},
				},
			],
			fileSystem: createFileSystemLayer([
				[probe, specifiers.map((specifier) => `import ${JSON.stringify(specifier)};`).join('\n')],
			]),
		}).operation.createdPrograms[0];
		return specifiers.map((specifier) =>
			program.getResolvedModule(probe, specifier, ModuleKind.ESNext),
		);
	} finally {
		api.close();
	}
}

// An upstream declaration is an authority only after its complete source tree
// has matched the immutable inventory. No package-local list of allowed `any`
// paths can manufacture an exception to the public precision check.
export function pinnedPublicEntries(packageDirectory, node) {
	const lock = validateUpstreamLock(
		JSON.parse(readFileSync(path.join(packageDirectory, 'audit/upstream.lock.json'), 'utf8')),
	);
	for (const key of ['packageName', 'version', 'commit', 'integrity']) {
		if (lock.identity[key] !== node.identity?.[key])
			throw new Error(`Public type witness has a different pinned ${key}`);
	}
	const root = path.join(packageDirectory, 'upstream');
	const drift = verifyPristineTree(lock, root);
	if (Object.values(drift).some((files) => files.length))
		throw new Error('Public type witness has invalid pristine bytes');
	const artifactRoot = path.join(packageDirectory, 'upstream-artifact');
	const archives = readdirSync(artifactRoot).filter((file) => file.endsWith('.tgz'));
	const matches = archives.flatMap((file) => {
		const bytes = readFileSync(path.join(artifactRoot, file));
		try {
			verifyIntegrity(bytes, node.identity.integrity);
			return [bytes];
		} catch {
			return [];
		}
	});
	if (matches.length !== 1)
		throw new Error(
			'Public types require exactly one npm tarball matching the immutable integrity',
		);
	const published = parseTarArchive(
		gunzipSync(matches[0], { maxOutputLength: 400 * 1024 * 1024 }),
		{
			select: (file) => /\.d\.[cm]?ts$/.test(file) || file === 'package/package.json',
		},
	);
	const manifest = JSON.parse(published.files.get('package/package.json'));
	if (manifest.name !== node.identity.packageName || manifest.version !== node.identity.version)
		throw new Error('Public declaration artifact has a different package or version');
	const require = createRequire(path.join(packageDirectory, 'package.json'));
	const installedRoot = path.dirname(require.resolve(`${node.identity.packageName}/package.json`));
	for (const [file, bytes] of published.files) {
		const installed = path.resolve(installedRoot, file.slice('package/'.length));
		if (
			!realpathSync(installed).startsWith(`${realpathSync(installedRoot)}${path.sep}`) ||
			!readFileSync(installed).equals(bytes)
		)
			throw new Error(`Installed public type witness differs from pinned npm bytes: ${file}`);
	}
	const entries = new Map();
	entries.internalMembers = new Set();
	for (const file of lock.files) {
		if (!/^src\/.*\.tsx?$/.test(file.path)) continue;
		const source = parseSourceFile(file.path, readFileSync(path.join(root, file.path), 'utf8'));
		const visit = (node) => {
			if (getJSDocTags(node).some((tag) => tag.tagName.text === 'internal')) {
				const nativePath = path.resolve(packageDirectory, file.path.replace(/\.tsx$/, '.tsrx'));
				entries.internalMembers.add(memberKey(node, nativePath));
			}
			node.forEachChild(visit);
		};
		visit(source);
	}
	const publicExports = Object.entries(manifest.exports).filter(
		([subpath, target]) =>
			subpath !== './package.json' && typeof target === 'object' && target !== null,
	);
	// Let the checking compiler select versioned and nested export conditions,
	// just as it does for the consumer. A fallback `types` may intentionally
	// reject older compilers rather than describe the current public surface.
	const resolutions = resolveFromPackage(
		packageDirectory,
		publicExports.map(
			([subpath]) => node.identity.packageName + (subpath === '.' ? '' : subpath.slice(1)),
		),
	);
	for (const [index, [subpath, target]] of publicExports.entries()) {
		const resolved = resolutions[index];
		let file;
		if (resolved && /\.d\.[cm]?ts$/.test(resolved.resolvedFileName)) {
			file = path.relative(installedRoot, resolved.resolvedFileName).replaceAll(path.sep, '/');
		} else {
			// An export the compiler cannot place on a declaration still needs one:
			// fall back to its declared types condition rather than dropping the
			// public entry silently.
			const declared = target?.import?.types ?? target?.types ?? target?.default?.types;
			if (typeof declared !== 'string')
				throw new Error(`Public export has no pinned declaration: ${subpath}`);
			file = declared.replace(/^\.\//, '');
		}
		if (!published.files.has(`package/${file}`))
			throw new Error(`Public export points outside the pinned declarations: ${file}`);
		const specifier = subpath === '.' ? node.binding : node.binding + subpath.slice(1);
		entries.set(specifier, path.resolve(installedRoot, file));
	}
	for (const [specifier, file] of publicCompatibilityDeclarations(node.binding)) {
		if (!published.files.has(`package/${file}`))
			throw new Error(`Compatibility witness is absent from the pinned declarations: ${file}`);
		entries.set(specifier, path.resolve(installedRoot, file));
	}
	return entries;
}

export function pinnedPublicExport(entries, program, checker, specifier, name) {
	const compatibility = publicCompatibilityExport(specifier, name);
	const target = compatibility?.specifier ?? specifier;
	const source = program.getSourceFile(entries.get(target));
	let symbol = source && checker.getSymbolAtLocation(source);
	for (const part of (compatibility?.path ?? name).split('.')) {
		if (!symbol) return undefined;
		if (symbol.flags & SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
		symbol = checker.getExportsOfModule(symbol).find((entry) => entry.name === part);
	}
	if (compatibility?.constraintIndex !== undefined) {
		if (symbol?.flags & SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
		const declaration = declarationsOf(symbol).find(
			(node) => node.typeParameters?.[compatibility.constraintIndex]?.constraint,
		);
		const constraint = declaration?.typeParameters?.[compatibility.constraintIndex]?.constraint;
		if (!constraint) return undefined;
		const type = checker.getTypeFromTypeNode(constraint);
		const projection = checker.getIndexTypeOfType(type, IndexKind.String);
		if (!projection) return undefined;
		return {
			flags: SymbolFlags.Transient,
			name,
			// Declaration handles, like a TypeScript 7 symbol's.
			declarations:
				projection.getAliasSymbol()?.declarations ?? projection.getSymbol()?.declarations ?? [],
			projectedPublicType: projection,
			projectedPublicArguments: typeArgumentsOf(projection, checker),
		};
	}
	return symbol;
}

export function publicSymbolType(symbol, checker) {
	if (symbol.projectedPublicType) return symbol.projectedPublicType;
	if (symbol.flags & SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
	const declaration = primaryDeclarationOf(symbol);
	return symbol.flags & (SymbolFlags.TypeAlias | SymbolFlags.Interface)
		? checker.getDeclaredTypeOfSymbol(symbol)
		: checker.getTypeOfSymbolAtLocation(symbol, declaration);
}

// Keys both parsed upstream nodes and program nodes: either way only the source
// file has no parent.
function memberKey(node, file = node.getSourceFile().fileName) {
	const names = [];
	for (let parent = node; parent?.parent; parent = parent.parent) {
		if (parent.name) names.unshift(parent.name.getText());
	}
	return `${file}#${names.join('.')}`;
}

function name(type) {
	return namingSymbolOf(type)?.name;
}

function declarationFiles(type) {
	return [...declarationsOf(type?.getAliasSymbol?.()), ...declarationsOf(type?.getSymbol?.())].map(
		(node) => node.getSourceFile().fileName.replaceAll('\\', '/'),
	);
}

function rendererElement(type) {
	return (
		['Element', 'ElementDescriptor', 'OctaneElement', 'ReactElement'].includes(name(type)) &&
		declarationFiles(type).some((file) =>
			/\/octane\/(?:src|dist)\/(?:jsx-runtime\.d\.ts|public-types\.ts|runtime\.ts)$/.test(file),
		)
	);
}

function reactRenderable(type, checker, depth = 0) {
	// Declaration emit can expand ReactNode while preserving its exact union.
	// Recover the canonical symbol only through a real React element declaration.
	const members = unionMembers(type);
	if (members) {
		const parts = [...members];
		const seen = new Set();
		for (let index = 0; index < parts.length; index++) {
			const part = parts[index];
			if (seen.has(part)) continue;
			seen.add(part);
			parts.push(...(unionMembers(part) ?? []));
			parts.push(...typeArgumentsOf(part, checker));
			const declaration = declarationsOf(namingSymbolOf(part)).find((node) =>
				/\/@types\/react\/index\.d\.ts$/.test(node.getSourceFile().fileName.replaceAll('\\', '/')),
			);
			if (!declaration) continue;
			const module = checker.getSymbolAtLocation(declaration.getSourceFile());
			const symbol =
				module && checker.getExportsOfModule(module).find((symbol) => symbol.name === 'ReactNode');
			if (!symbol) continue;
			const canonical = checker.getDeclaredTypeOfSymbol(symbol);
			if (
				checker.isTypeAssignableTo(canonical, type) &&
				members.every((member) => {
					if (member.flags & (TypeFlags.Any | TypeFlags.Unknown)) return false;
					if (checker.isTypeAssignableTo(member, canonical)) return true;
					const args =
						member.objectFlags & ObjectFlags.Reference ? checker.getTypeArguments(member) : [];
					return (
						depth < 4 &&
						member.getSymbol()?.name === 'Promise' &&
						declarationsOf(member.getSymbol()).some(isTypeScriptLibraryNode) &&
						args.length === 1 &&
						reactRenderable(args[0], checker, depth + 1)
					);
				})
			)
				return true;
		}
	}

	return (
		['ReactNode', 'ReactElement', 'Element'].includes(name(type)) &&
		declarationFiles(type).some((file) => /\/@types\/react\/index\.d\.ts$/.test(file))
	);
}

function declaresReactNode(node, checker) {
	if (!node) return false;
	if (is.isParenthesizedTypeNode(node)) return declaresReactNode(node.type, checker);
	if (is.isUnionTypeNode(node))
		return node.types.some((child) => declaresReactNode(child, checker));
	if (!is.isTypeReferenceNode(node)) return false;
	let symbol = checker.getSymbolAtLocation(node.typeName);
	if (symbol?.flags & SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
	return (
		symbol?.name === 'ReactNode' &&
		declarationsOf(symbol).some((declaration) =>
			/\/@types\/react\/index\.d\.ts$/.test(
				declaration.getSourceFile().fileName.replaceAll('\\', '/'),
			),
		)
	);
}

function corresponding(type, witness, checker) {
	const witnessMembers = unionMembers(witness);
	if (!witnessMembers || unionMembers(type)) return witness;
	if (witnessMembers.includes(type)) return type;
	const score = (actual, expected, depth) => {
		if (actual === expected) return 100;
		if (actual.isLiteralType() && expected.isLiteralType())
			return actual.value === expected.value ? 100 : -100;
		let result = actual.flags === expected.flags ? 1 : 0;
		const objectLike = (type) =>
			Boolean(type.flags & TypeFlags.Object || type.isIntersectionType());
		if (objectLike(actual) && objectLike(expected)) {
			result += 2;
			for (const property of checker.getPropertiesOfType(actual)) {
				const original = checker.getPropertyOfType(expected, property.name);
				const declaration = primaryDeclarationOf(property);
				if (!original || !declaration) continue;
				const left = checker.getTypeOfSymbolAtLocation(property, declaration);
				const right = checker.getTypeOfSymbolAtLocation(
					original,
					primaryDeclarationOf(original) ?? declaration,
				);
				const callable = (value) =>
					unionMembers(value)
						? unionMembers(value).some(callable)
						: checker.getSignaturesOfType(value, SignatureKind.Call).length > 0;
				// Optional callback props distinguish otherwise identical intersection
				// branches (for example a string header versus a render callback).
				if (callable(left) !== callable(right)) result -= 20;
				if (left.isLiteralType() && right.isLiteralType())
					result += left.value === right.value ? 20 : -100;
				if (
					Boolean(property.flags & SymbolFlags.Optional) ===
					Boolean(original.flags & SymbolFlags.Optional)
				)
					result += 3;
				else result -= 3;
				if (
					Boolean(left.flags & TypeFlags.Undefined) !== Boolean(right.flags & TypeFlags.Undefined)
				)
					result -= 20;
			}
		}
		if (name(actual) && name(actual) === name(expected)) result += 10;
		const calls = checker.getSignaturesOfType(actual, SignatureKind.Call);
		const otherCalls = checker.getSignaturesOfType(expected, SignatureKind.Call);
		if (calls.length && !otherCalls.length) return -1_000_000;
		if (
			calls.length &&
			otherCalls.length &&
			calls[0].getParameters().length === otherCalls[0].getParameters().length
		)
			result += 10;
		// Intersection aliases retain generic arguments too. Ignoring them makes
		// Options<Error> and Options<unknown> tie, rejecting an unchanged union.
		if (depth && objectLike(actual) && objectLike(expected)) {
			const args = typeArgumentsOf(actual, checker);
			const others = typeArgumentsOf(expected, checker);
			for (const [i, argument] of args.entries())
				if (others[i]) result += 100 * score(argument, others[i], depth - 1);
			if (!args.length && !others.length) {
				const keys = checker.getPropertiesOfType(actual).map((property) => property.name);
				const otherKeys = checker.getPropertiesOfType(expected).map((property) => property.name);
				if (keys.length && keys.join('\0') === otherKeys.join('\0')) result += 5;
			}
		}
		return result;
	};
	const ranked = witnessMembers
		.map((candidate) => ({ candidate, score: score(type, candidate, 2) }))
		.sort((a, b) => b.score - a.score);
	return ranked[0].score > (ranked[1]?.score ?? 0)
		? ranked[0].candidate
		: ranked.filter((entry) => entry.score === ranked[0].score).map((entry) => entry.candidate);
}

// Octane adds nested arrays to React's callback/object ref forms. Match the
// target of every platform-defined ref leaf, including inside those arrays;
// an any target must not be smuggled in through the recursive form.
function referenceTargets(type, checker, seen = new Set()) {
	if (!type || seen.has(type)) return [];
	seen.add(type);
	if (type.flags & (TypeFlags.Null | TypeFlags.Undefined)) return [];
	if (unionMembers(type)) {
		const targets = [];
		for (const part of unionMembers(type)) {
			const nested = referenceTargets(part, checker, seen);
			if (nested === null) return null;
			targets.push(...nested);
		}
		return targets;
	}
	const files = declarationFiles(type);
	if (
		name(type) === 'RefObject' &&
		files.some((file) => /\/@types\/react\/index\.d\.ts$/.test(file))
	)
		return checker.getTypeArguments(type);
	if (
		name(type) === 'bivarianceHack' &&
		files.some((file) => /\/@types\/react\/index\.d\.ts$/.test(file))
	) {
		const signature = checker.getSignaturesOfType(type, SignatureKind.Call)[0];
		const parameter = signature?.getParameters()[0];
		const declaration = primaryDeclarationOf(parameter);
		return declaration ? [checker.getTypeOfSymbolAtLocation(parameter, declaration)] : null;
	}
	if (name(type) === 'ReadonlyArray' && files.some(isTypeScriptLibraryFile))
		return referenceTargets(checker.getTypeArguments(type)[0], checker, seen);
	return null;
}

// Only an opaque leaf already present at the corresponding upstream position
// is acceptable. New erasure still fails (including any replacing unknown).
// Renderer-owned elements are opaque values by contract: their internals are
// intentionally different, while surrounding props/callbacks remain checked.
export function newOpaquePublicType(
	type,
	witness,
	checker,
	seen = new Map(),
	trail = 'export',
	options = {},
) {
	if (Array.isArray(witness)) {
		// When structural matching is ambiguous, every candidate must authorize
		// the opaque leaves. A permissive sibling cannot waive a precise branch.
		for (const candidate of witness) {
			const failure = newOpaquePublicType(type, candidate, checker, seen, trail, options);
			if (failure) return failure;
		}
		return null;
	}
	if (type.flags & (TypeFlags.Any | TypeFlags.Unknown)) {
		if (
			witness &&
			((witness.flags & TypeFlags.Any && witness.intrinsicName !== 'error') ||
				(type.flags & TypeFlags.Unknown &&
					(witness.flags & TypeFlags.Unknown ||
						reactRenderable(witness, checker) ||
						declaresReactNode(options.witnessTypeNode, checker))))
		)
			return null;
		return `${trail} [${checker.typeToString(type)} versus ${witness ? checker.typeToString(witness) : 'missing witness'}; witness=${name(witness)}]`;
	}
	if (witness?.flags & TypeFlags.Any && witness.intrinsicName !== 'error') return null;
	if (
		rendererElement(type) &&
		(reactRenderable(witness, checker) ||
			unionMembers(witness)?.some((part) => reactRenderable(part, checker)))
	)
		return null;
	if (type === witness) return null;
	if (type === witness) return null;
	const nativeRefs = referenceTargets(type, checker);
	const upstreamRefs = nativeRefs?.length ? referenceTargets(witness, checker) : null;
	if (nativeRefs?.length && upstreamRefs?.length) {
		for (const target of nativeRefs) {
			const failure = newOpaquePublicType(
				target,
				upstreamRefs[0],
				checker,
				seen,
				`${trail}.refTarget`,
				options,
			);
			if (failure) return failure;
		}
		return null;
	}
	if (type.flags & TypeFlags.TypeParameter && !(witness?.flags & TypeFlags.TypeParameter)) {
		const constraint = checker.getBaseConstraintOfType(type);
		return constraint && constraint !== type
			? newOpaquePublicType(constraint, witness, checker, seen, `${trail}.constraint`, options)
			: null;
	}

	witness = corresponding(type, witness, checker);
	if (Array.isArray(witness))
		return newOpaquePublicType(type, witness, checker, seen, trail, options);
	const visited = seen.get(type) ?? new Set();
	if (visited.has(witness)) return null;
	visited.add(witness);
	seen.set(type, visited);
	const check = (child, expected, suffix, witnessTypeNode) =>
		child &&
		newOpaquePublicType(child, expected, checker, seen, `${trail}.${suffix}`, {
			...options,
			witnessTypeNode,
		});
	if (type.flags & TypeFlags.TypeParameter) {
		for (const [label, get] of [
			['constraint', (t) => checker.getBaseConstraintOfType(t)],
			['default', (t) => checker.getDefaultFromTypeParameter(t)],
		]) {
			if (label === 'default' && !(witness?.flags & TypeFlags.TypeParameter)) continue;
			const failure = check(
				get(type),
				witness?.flags & TypeFlags.TypeParameter ? get(witness) : witness,
				label,
			);
			if (failure) return failure;
		}
	}
	const arguments_ = typeArgumentsOf(type, checker);
	const expectedArguments = witness ? typeArgumentsOf(witness, checker) : [];
	// Published declarations may inline a named source type. Generic arguments
	// correspond only when both sides retain the same generic representation;
	// otherwise compare the instantiated public members below.
	const target = targetOf(type);
	const sameGeneric =
		witness &&
		((name(type) && name(type) === name(witness)) || (target && target === targetOf(witness)));
	for (const [i, argument] of (sameGeneric ? arguments_ : []).entries()) {
		const parameter = target?.getTypeParameters?.()?.[i];
		if (
			!expectedArguments[i] &&
			declarationsOf(parameter?.getSymbol?.()).some(isTypeScriptLibraryNode) &&
			argument === checker.getDefaultFromTypeParameter(parameter)
		)
			continue;
		const failure = check(argument, expectedArguments[i], `argument${i}`);
		if (failure) return failure;
	}
	const sameDeclaration = namingSymbolOf(type) && namingSymbolOf(type) === namingSymbolOf(witness);
	const nativePlatform = declarationFiles(type).some(
		(file) =>
			/\/octane\/(?:src|dist)\/(?:runtime\.ts|jsx-runtime\.d\.ts|public-types\.ts|index\.ts)$/.test(
				file,
			) ||
			/\/node_modules\/@types\/node\//.test(file) ||
			isTypeScriptLibraryFile(file),
	);
	// Reused platform declarations retain their own contract. Inspect supplied
	// generic arguments above, so a binding cannot hide new erasure inside
	// Promise<any> or Ref<any>, but do not re-audit renderer implementation types.
	if (
		nativePlatform ||
		(sameDeclaration && declarationFiles(type).some((file) => file.includes('/node_modules/')))
	)
		return null;
	if (unionMembers(type)) {
		for (const child of unionMembers(type)) {
			const failure = check(child, corresponding(child, witness, checker), 'union');
			if (failure) return failure;
		}
		return null;
	}
	for (const kind of [SignatureKind.Call, SignatureKind.Construct]) {
		const signatures = checker.getSignaturesOfType(type, kind);

		const expected = witness ? checker.getSignaturesOfType(witness, kind) : [];
		for (const [index, signature] of signatures.entries()) {
			const matching = expected.filter(
				(candidate) =>
					candidate.getParameters().length === signature.getParameters().length &&
					candidate.getTypeParameters().length === signature.getTypeParameters().length,
			);
			const counterpart = matching.length === 1 ? matching[0] : expected[index];
			for (const [i, parameter] of (signature.getTypeParameters() ?? []).entries()) {
				const failure = check(
					parameter,
					counterpart?.getTypeParameters()?.[i],
					`signature${index}.generic${i}`,
				);
				if (failure) return failure;
			}
			const failure = check(
				checker.getReturnTypeOfSignature(signature),
				counterpart && checker.getReturnTypeOfSignature(counterpart),
				`signature${index}.return`,
				counterpart?.declaration?.resolve()?.type,
			);
			if (failure) return failure;
			for (const [i, parameter] of signature.getParameters().entries()) {
				const declaration = primaryDeclarationOf(parameter);
				if (!declaration) continue;
				const parameterType = checker.getTypeOfSymbolAtLocation(parameter, declaration);
				if (parameterType.flags & TypeFlags.Unknown) continue;
				const expectedParameter = counterpart?.getParameters()[i];
				const expectedDeclaration = primaryDeclarationOf(expectedParameter);
				const failure = check(
					parameterType,
					expectedDeclaration &&
						checker.getTypeOfSymbolAtLocation(expectedParameter, expectedDeclaration),
					`signature${index}.parameter${i}`,
				);
				if (failure) return failure;
			}
		}
	}
	if (type.flags & TypeFlags.Object || type.isIntersectionType()) {
		if (type.objectFlags & (ObjectFlags.Class | ObjectFlags.Interface)) {
			const expectedBases =
				witness?.objectFlags & (ObjectFlags.Class | ObjectFlags.Interface)
					? checker.getBaseTypes(witness)
					: [];
			for (const [i, base] of checker.getBaseTypes(type).entries()) {
				const failure = check(base, expectedBases[i] ?? witness, `base${i}`);
				if (failure) return failure;
			}
		}
		for (const property of checker.getPropertiesOfType(type)) {
			const declarations = declarationsOf(property);
			if (
				declarations.some(
					(node) =>
						hasModifier(node, SyntaxKind.PrivateKeyword) ||
						hasModifier(node, SyntaxKind.ProtectedKeyword),
				)
			)
				continue;
			const declaration =
				declarations.find((node) => !isTypeScriptLibraryNode(node)) ??
				(declarations.length ? undefined : primaryDeclarationOf(property));
			if (!declaration) continue;
			if (options.internalMembers?.has(memberKey(declaration))) continue;
			const expected = witness && checker.getPropertyOfType(witness, property.name);
			// memo exposes its original callable as `type` in Octane. React's
			// NamedExoticComponent omits this platform member; compare the original
			// callable against the same public call contract instead.
			if (
				!expected &&
				property.name === 'type' &&
				/\/octane\/(?:src|dist)\/(?:public-types|runtime)\.ts$/.test(
					declaration.getSourceFile().fileName,
				)
			) {
				const failure = check(
					checker.getTypeOfSymbolAtLocation(property, declaration),
					witness,
					'memoOriginal',
				);
				if (failure) return failure;
				continue;
			}
			const expectedDeclaration = primaryDeclarationOf(expected);
			const failure = check(
				checker.getTypeOfSymbolAtLocation(property, declaration),
				expected && checker.getTypeOfSymbolAtLocation(expected, expectedDeclaration ?? declaration),
				property.name,
				expectedDeclaration?.type,
			);
			if (failure) return failure;
		}
		for (const info of checker.getIndexInfosOfType(type)) {
			const expected =
				witness &&
				checker
					.getIndexInfosOfType(witness)
					.find((other) => other.keyType.flags === info.keyType.flags);
			const failure = check(info.valueType, expected?.valueType, 'index');
			if (failure) return failure;
		}
	}
	return null;
}

export function newOpaquePublicSymbol(symbol, witness, checker, options = {}) {
	if (symbol.flags & SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
	if (witness?.flags & SymbolFlags.Alias) witness = checker.getAliasedSymbol(witness);
	const witnessDeclarations = declarationsOf(witness);
	for (const declaration of declarationsOf(symbol)) {
		// Callable generics are checked per public signature below. Matching every
		// overload to the first declaration mispairs constraints and includes the
		// implementation signature, which is not part of the exported contract.
		if (is.isFunctionDeclaration(declaration)) continue;
		const candidates = witnessDeclarations.filter(
			(candidate) =>
				candidate.kind === declaration.kind ||
				((is.isInterfaceDeclaration(declaration) || is.isTypeAliasDeclaration(declaration)) &&
					(is.isInterfaceDeclaration(candidate) || is.isTypeAliasDeclaration(candidate))),
		);
		const parameters = declaration.typeParameters ?? [];
		const sameArity = candidates.filter(
			(candidate) => (candidate.typeParameters?.length ?? 0) === parameters.length,
		);
		const original =
			sameArity.find((candidate) =>
				parameters.every(
					(parameter, index) => parameter.name.text === candidate.typeParameters[index].name.text,
				),
			) ??
			sameArity[0] ??
			candidates[0];

		for (const [i, parameter] of (declaration.typeParameters ?? []).entries()) {
			// TypeScript 7 names a type parameter's default `defaultType`.
			for (const [key, field] of [
				['constraint', 'constraint'],
				['default', 'defaultType'],
			]) {
				if (!parameter[field]) continue;
				const expected = original?.typeParameters?.[i]?.[field];
				const failure = newOpaquePublicType(
					checker.getTypeFromTypeNode(parameter[field]),
					key === 'default' && witness?.projectedPublicArguments?.[i]
						? witness.projectedPublicArguments[i]
						: expected && checker.getTypeFromTypeNode(expected),
					checker,
					new Map(),
					`export.generic${i}.${key}`,
					options,
				);
				if (failure) return failure;
			}
		}
	}
	return newOpaquePublicType(
		publicSymbolType(symbol, checker),
		witness && publicSymbolType(witness, checker),
		checker,
		new Map(),
		'export',
		options,
	);
}
