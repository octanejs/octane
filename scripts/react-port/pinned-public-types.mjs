import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { parseTarArchive, verifyIntegrity } from './preflight-lib.mjs';
import path from 'node:path';
import {
	publicCompatibilityDeclarations,
	publicCompatibilityExport,
} from './public-compatibility.mjs';
import ts from 'typescript';
import { validateUpstreamLock, verifyPristineTree } from './materialize-lib.mjs';

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
		const source = ts.createSourceFile(
			file.path,
			readFileSync(path.join(root, file.path), 'utf8'),
			ts.ScriptTarget.Latest,
			true,
		);
		const visit = (node) => {
			if (ts.getJSDocTags(node).some((tag) => tag.tagName.text === 'internal')) {
				const nativePath = path.resolve(packageDirectory, file.path.replace(/\.tsx$/, '.tsrx'));
				entries.internalMembers.add(memberKey(node, nativePath));
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	for (const [subpath, target] of Object.entries(manifest.exports)) {
		if (subpath === './package.json') continue;
		let file = target?.import?.types ?? target?.types ?? target?.default?.types;
		if (typeof file !== 'string') {
			const request = subpath === '.' ? manifest.name : manifest.name + subpath.slice(1);
			const resolved = ts.resolveModuleName(
				request,
				path.join(packageDirectory, '__public_type_witness__.ts'),
				{ moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext },
				ts.sys,
			).resolvedModule?.resolvedFileName;
			if (!resolved || !/\.d\.[cm]?ts$/.test(resolved))
				throw new Error(`Public export has no pinned declaration: ${subpath}`);
			file = './' + path.relative(installedRoot, resolved).split(path.sep).join('/');
		}
		if (!published.files.has(`package/${file.slice(2)}`))
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
		if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
		symbol = checker.getExportsOfModule(symbol).find((entry) => entry.name === part);
	}
	if (compatibility?.constraintIndex !== undefined) {
		if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
		const declaration = symbol?.declarations?.find(
			(node) => node.typeParameters?.[compatibility.constraintIndex]?.constraint,
		);
		const constraint = declaration?.typeParameters?.[compatibility.constraintIndex]?.constraint;
		if (!constraint) return undefined;
		const type = checker.getTypeFromTypeNode(constraint);
		const projection = checker.getIndexTypeOfType(type, ts.IndexKind.String);
		if (!projection) return undefined;
		return {
			flags: ts.SymbolFlags.Transient,
			name,
			declarations: projection.aliasSymbol?.declarations ?? projection.symbol?.declarations ?? [],
			projectedPublicType: projection,
			projectedPublicArguments:
				projection.aliasTypeArguments ??
				(projection.objectFlags & ts.ObjectFlags.Reference
					? checker.getTypeArguments(projection)
					: []),
		};
	}
	return symbol;
}

export function publicSymbolType(symbol, checker) {
	if (symbol.projectedPublicType) return symbol.projectedPublicType;
	if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
	const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
	return symbol.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface)
		? checker.getDeclaredTypeOfSymbol(symbol)
		: checker.getTypeOfSymbolAtLocation(symbol, declaration);
}

function memberKey(node, file = node.getSourceFile().fileName) {
	const names = [];
	for (let parent = node; parent && !ts.isSourceFile(parent); parent = parent.parent) {
		if (parent.name) names.unshift(parent.name.getText());
	}
	return `${file}#${names.join('.')}`;
}

function name(type) {
	return type?.aliasSymbol?.name ?? type?.symbol?.name;
}

function declarationFiles(type) {
	return [...(type?.aliasSymbol?.declarations ?? []), ...(type?.symbol?.declarations ?? [])].map(
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
	if (type?.isUnion?.()) {
		const parts = [...type.types];
		const seen = new Set();
		for (let index = 0; index < parts.length; index++) {
			const part = parts[index];
			if (seen.has(part)) continue;
			seen.add(part);
			if (part.isUnion?.()) parts.push(...part.types);
			parts.push(
				...(part.aliasTypeArguments ??
					(part.objectFlags & ts.ObjectFlags.Reference ? checker.getTypeArguments(part) : [])),
			);
			const declaration = (part.aliasSymbol ?? part.symbol)?.declarations?.find((node) =>
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
				type.types.every((member) => {
					if (member.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
					if (checker.isTypeAssignableTo(member, canonical)) return true;
					const args =
						member.objectFlags & ts.ObjectFlags.Reference ? checker.getTypeArguments(member) : [];
					return (
						depth < 4 &&
						member.symbol?.name === 'Promise' &&
						member.symbol.declarations?.some((node) => node.getSourceFile().hasNoDefaultLib) &&
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
	if (ts.isParenthesizedTypeNode(node)) return declaresReactNode(node.type, checker);
	if (ts.isUnionTypeNode(node))
		return node.types.some((child) => declaresReactNode(child, checker));
	if (!ts.isTypeReferenceNode(node)) return false;
	let symbol = checker.getSymbolAtLocation(node.typeName);
	if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
	return (
		symbol?.name === 'ReactNode' &&
		symbol.declarations?.some((declaration) =>
			/\/@types\/react\/index\.d\.ts$/.test(
				declaration.getSourceFile().fileName.replaceAll('\\', '/'),
			),
		)
	);
}

function corresponding(type, witness, checker) {
	if (!witness?.isUnion?.() || type.isUnion?.()) return witness;
	if (witness.types.includes(type)) return type;
	const score = (actual, expected, depth) => {
		if (actual === expected) return 100;
		if (actual.isLiteral?.() && expected.isLiteral?.())
			return actual.value === expected.value ? 100 : -100;
		let result = actual.flags === expected.flags ? 1 : 0;
		const objectLike = (type) =>
			Boolean(type.flags & ts.TypeFlags.Object || type.isIntersection?.());
		if (objectLike(actual) && objectLike(expected)) {
			result += 2;
			for (const property of checker.getPropertiesOfType(actual)) {
				const original = checker.getPropertyOfType(expected, property.name);
				const declaration = property.valueDeclaration ?? property.declarations?.[0];
				if (!original || !declaration) continue;
				const left = checker.getTypeOfSymbolAtLocation(property, declaration);
				const right = checker.getTypeOfSymbolAtLocation(
					original,
					original.valueDeclaration ?? original.declarations?.[0] ?? declaration,
				);
				const callable = (value) =>
					value.isUnion?.()
						? value.types.some(callable)
						: checker.getSignaturesOfType(value, ts.SignatureKind.Call).length > 0;
				// Optional callback props distinguish otherwise identical intersection
				// branches (for example a string header versus a render callback).
				if (callable(left) !== callable(right)) result -= 20;
				if (left.isLiteral?.() && right.isLiteral?.())
					result += left.value === right.value ? 20 : -100;
				if (
					Boolean(property.flags & ts.SymbolFlags.Optional) ===
					Boolean(original.flags & ts.SymbolFlags.Optional)
				)
					result += 3;
				else result -= 3;
				if (
					Boolean(left.flags & ts.TypeFlags.Undefined) !==
					Boolean(right.flags & ts.TypeFlags.Undefined)
				)
					result -= 20;
			}
		}
		if (name(actual) && name(actual) === name(expected)) result += 10;
		const calls = checker.getSignaturesOfType(actual, ts.SignatureKind.Call);
		const otherCalls = checker.getSignaturesOfType(expected, ts.SignatureKind.Call);
		if (calls.length && !otherCalls.length) return -1_000_000;
		if (
			calls.length &&
			otherCalls.length &&
			calls[0].parameters.length === otherCalls[0].parameters.length
		)
			result += 10;
		// Intersection aliases retain generic arguments too. Ignoring them makes
		// Options<Error> and Options<unknown> tie, rejecting an unchanged union.
		if (depth && objectLike(actual) && objectLike(expected)) {
			const args =
				actual.aliasTypeArguments ??
				(actual.objectFlags & ts.ObjectFlags.Reference ? checker.getTypeArguments(actual) : []);
			const others =
				expected.aliasTypeArguments ??
				(expected.objectFlags & ts.ObjectFlags.Reference ? checker.getTypeArguments(expected) : []);
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
	const ranked = witness.types
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
	if (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) return [];
	if (type.isUnion?.()) {
		const targets = [];
		for (const part of type.types) {
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
		const signature = checker.getSignaturesOfType(type, ts.SignatureKind.Call)[0];
		const parameter = signature?.parameters[0];
		const declaration = parameter?.valueDeclaration ?? parameter?.declarations?.[0];
		return declaration ? [checker.getTypeOfSymbolAtLocation(parameter, declaration)] : null;
	}
	if (name(type) === 'ReadonlyArray' && files.some((file) => /\/typescript\/lib\/lib\./.test(file)))
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
	if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
		if (
			witness &&
			((witness.flags & ts.TypeFlags.Any && witness.intrinsicName !== 'error') ||
				(type.flags & ts.TypeFlags.Unknown &&
					(witness.flags & ts.TypeFlags.Unknown ||
						reactRenderable(witness, checker) ||
						declaresReactNode(options.witnessTypeNode, checker))))
		)
			return null;
		return `${trail} [${checker.typeToString(type)} versus ${witness ? checker.typeToString(witness) : 'missing witness'}; witness=${name(witness)}]`;
	}
	if (witness?.flags & ts.TypeFlags.Any && witness.intrinsicName !== 'error') return null;
	if (
		rendererElement(type) &&
		(reactRenderable(witness, checker) ||
			(witness?.isUnion?.() && witness.types.some((part) => reactRenderable(part, checker))))
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
	if (type.flags & ts.TypeFlags.TypeParameter && !(witness?.flags & ts.TypeFlags.TypeParameter)) {
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
	if (type.flags & ts.TypeFlags.TypeParameter) {
		for (const [label, get] of [
			['constraint', (t) => checker.getBaseConstraintOfType(t)],
			['default', (t) => checker.getDefaultFromTypeParameter(t)],
		]) {
			if (label === 'default' && !(witness?.flags & ts.TypeFlags.TypeParameter)) continue;
			const failure = check(
				get(type),
				witness?.flags & ts.TypeFlags.TypeParameter ? get(witness) : witness,
				label,
			);
			if (failure) return failure;
		}
	}
	const arguments_ =
		type.aliasTypeArguments ??
		(type.objectFlags & ts.ObjectFlags.Reference ? checker.getTypeArguments(type) : []);
	const expectedArguments =
		witness?.aliasTypeArguments ??
		(witness?.objectFlags & ts.ObjectFlags.Reference ? checker.getTypeArguments(witness) : []);
	// Published declarations may inline a named source type. Generic arguments
	// correspond only when both sides retain the same generic representation;
	// otherwise compare the instantiated public members below.
	const sameGeneric =
		witness &&
		((name(type) && name(type) === name(witness)) ||
			(type.target && type.target === witness.target));
	for (const [i, argument] of (sameGeneric ? arguments_ : []).entries()) {
		const parameter = type.target?.typeParameters?.[i];
		if (
			!expectedArguments[i] &&
			parameter?.symbol?.declarations?.some((node) => node.getSourceFile().hasNoDefaultLib) &&
			argument === checker.getDefaultFromTypeParameter(parameter)
		)
			continue;
		const failure = check(argument, expectedArguments[i], `argument${i}`);
		if (failure) return failure;
	}
	const sameDeclaration =
		(type.aliasSymbol ?? type.symbol) &&
		(type.aliasSymbol ?? type.symbol) === (witness?.aliasSymbol ?? witness?.symbol);
	const nativePlatform = declarationFiles(type).some(
		(file) =>
			/\/octane\/(?:src|dist)\/(?:runtime\.ts|jsx-runtime\.d\.ts|public-types\.ts|index\.ts)$/.test(
				file,
			) || /\/node_modules\/(?:@types\/node\/|typescript\/lib\/lib\.)/.test(file),
	);
	// Reused platform declarations retain their own contract. Inspect supplied
	// generic arguments above, so a binding cannot hide new erasure inside
	// Promise<any> or Ref<any>, but do not re-audit renderer implementation types.
	if (
		nativePlatform ||
		(sameDeclaration && declarationFiles(type).some((file) => file.includes('/node_modules/')))
	)
		return null;
	if (type.isUnion?.()) {
		for (const child of type.types) {
			const failure = check(child, corresponding(child, witness, checker), 'union');
			if (failure) return failure;
		}
		return null;
	}
	for (const kind of [ts.SignatureKind.Call, ts.SignatureKind.Construct]) {
		const signatures = checker.getSignaturesOfType(type, kind);

		const expected = witness ? checker.getSignaturesOfType(witness, kind) : [];
		for (const [index, signature] of signatures.entries()) {
			const matching = expected.filter(
				(candidate) =>
					candidate.parameters.length === signature.parameters.length &&
					(candidate.typeParameters?.length ?? 0) === (signature.typeParameters?.length ?? 0),
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
				counterpart?.declaration?.type,
			);
			if (failure) return failure;
			for (const [i, parameter] of signature.parameters.entries()) {
				const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0];
				if (!declaration) continue;
				const parameterType = checker.getTypeOfSymbolAtLocation(parameter, declaration);
				if (parameterType.flags & ts.TypeFlags.Unknown) continue;
				const expectedParameter = counterpart?.parameters[i];
				const expectedDeclaration =
					expectedParameter?.valueDeclaration ?? expectedParameter?.declarations?.[0];
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
	if (type.flags & ts.TypeFlags.Object || type.isIntersection?.()) {
		if (type.objectFlags & (ts.ObjectFlags.Class | ts.ObjectFlags.Interface)) {
			const expectedBases =
				witness?.objectFlags & (ts.ObjectFlags.Class | ts.ObjectFlags.Interface)
					? checker.getBaseTypes(witness)
					: [];
			for (const [i, base] of checker.getBaseTypes(type).entries()) {
				const failure = check(base, expectedBases[i] ?? witness, `base${i}`);
				if (failure) return failure;
			}
		}
		for (const property of checker.getPropertiesOfType(type)) {
			const declarations = property.declarations ?? [];
			if (
				declarations.some(
					(node) =>
						ts.getCombinedModifierFlags(node) &
						(ts.ModifierFlags.Private | ts.ModifierFlags.Protected),
				)
			)
				continue;
			const declaration =
				declarations.find((node) => !node.getSourceFile().hasNoDefaultLib) ??
				(declarations.length ? undefined : property.valueDeclaration);
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
			const expectedDeclaration = expected?.valueDeclaration ?? expected?.declarations?.[0];
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
			const failure = check(info.type, expected?.type, 'index');
			if (failure) return failure;
		}
	}
	return null;
}

export function newOpaquePublicSymbol(symbol, witness, checker, options = {}) {
	if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
	if (witness?.flags & ts.SymbolFlags.Alias) witness = checker.getAliasedSymbol(witness);
	for (const declaration of symbol.declarations ?? []) {
		// Source implementations may carry a wider private rest signature after
		// public overloads. Only the overload declarations form the exported API.
		if (
			ts.isFunctionDeclaration(declaration) &&
			declaration.body &&
			symbol.declarations.some((other) => ts.isFunctionDeclaration(other) && !other.body)
		)
			continue;
		const candidates =
			witness?.declarations?.filter(
				(candidate) =>
					candidate.kind === declaration.kind ||
					((ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) &&
						(ts.isInterfaceDeclaration(candidate) || ts.isTypeAliasDeclaration(candidate))),
			) ?? [];
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
			for (const key of ['constraint', 'default']) {
				if (!parameter[key]) continue;
				const expected = original?.typeParameters?.[i]?.[key];
				const failure = newOpaquePublicType(
					checker.getTypeFromTypeNode(parameter[key]),
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
