import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const OWNERSHIP = new Set(['imported', 'adapter', 'copied']);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const packageName = (specifier) =>
	specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];

function confinedFile(root, file) {
	if (typeof file !== 'string' || path.isAbsolute(file) || file.split('/').includes('..'))
		return false;
	try {
		const relative = path.relative(realpathSync(root), realpathSync(path.join(root, file)));
		return (
			relative !== '' &&
			!relative.startsWith('..') &&
			!path.isAbsolute(relative) &&
			statSync(path.join(root, file)).isFile()
		);
	} catch {
		return false;
	}
}

function targets(value) {
	if (typeof value === 'string') return [value];
	return value && typeof value === 'object' ? Object.values(value).flatMap(targets) : [];
}

function sourceFacts(root, file, seen = new Set()) {
	if (seen.has(file)) throw new Error(`Cyclic export coverage requires review: ${file}`);
	seen = new Set([...seen, file]);
	const source = readFileSync(path.join(root, file), 'utf8');
	const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	if (ast.parseDiagnostics.length)
		throw new Error(`Unparsed source coverage requires review: ${file}`);
	const exports = [];
	const files = new Set([file]);
	const forwarding = new Map([[file, true]]);
	const runtimeBindings = new Set();
	for (const statement of ast.statements) {
		if (
			!ts.isImportDeclaration(statement) ||
			!ts.isStringLiteral(statement.moduleSpecifier) ||
			!/^octane(?:\/|$)/.test(statement.moduleSpecifier.text) ||
			statement.importClause?.isTypeOnly
		)
			continue;
		const clause = statement.importClause;
		if (clause?.name) runtimeBindings.add(clause.name.text);
		if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings))
			runtimeBindings.add(clause.namedBindings.name.text);
		if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings))
			for (const item of clause.namedBindings.elements)
				if (!item.isTypeOnly) runtimeBindings.add(item.name.text);
	}
	const usesRuntimeIntegration = (statement) => {
		let found = false;
		const visit = (node) => {
			if (ts.isTypeNode(node)) return;
			if (ts.isIdentifier(node) && runtimeBindings.has(node.text)) found = true;
			ts.forEachChild(node, visit);
		};
		visit(statement);
		return found;
	};
	const resolveLocal = (specifier) => {
		const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
		const candidates = [
			base,
			...['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.js'].map((suffix) => base + suffix),
		];
		const resolved = candidates.find((candidate) => confinedFile(root, candidate));
		if (!resolved)
			throw new Error(`Unresolved local module requires review: ${file}: ${specifier}`);
		return resolved;
	};
	for (const statement of ast.statements) {
		if (
			!ts.isExportDeclaration(statement) &&
			!ts.isEmptyStatement(statement) &&
			!(ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly)
		)
			forwarding.set(file, false);
		if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
			if (statement.moduleSpecifier.text.startsWith('.')) {
				const child = sourceFacts(root, resolveLocal(statement.moduleSpecifier.text), seen);
				child.files.forEach((item) => files.add(item));
				child.forwarding.forEach((value, key) => forwarding.set(key, value));
			}
		}
		if (ts.isExportDeclaration(statement)) {
			const specifier = statement.moduleSpecifier?.text;
			if (!specifier) throw new Error(`Indirect local export requires review: ${file}`);
			if (specifier.startsWith('.')) {
				const child = sourceFacts(root, resolveLocal(specifier), seen);
				child.files.forEach((item) => files.add(item));
				child.forwarding.forEach((value, key) => forwarding.set(key, value));
				if (!statement.exportClause)
					exports.push(
						...child.exports.map((item) => ({
							...item,
							erased: statement.isTypeOnly || item.erased,
						})),
					);
				else if (ts.isNamedExports(statement.exportClause)) {
					for (const element of statement.exportClause.elements) {
						const original = (element.propertyName ?? element.name).text;
						const found = child.exports.find((item) => item.name === original);
						if (!found)
							throw new Error(`Unresolved exported symbol requires review: ${file}: ${original}`);
						exports.push({
							...found,
							name: element.name.text,
							erased: statement.isTypeOnly || element.isTypeOnly || found.erased,
						});
					}
				} else throw new Error(`Namespace export requires review: ${file}`);
			} else {
				if (!statement.exportClause) exports.push({ name: '*', file, specifier });
				else if (ts.isNamedExports(statement.exportClause)) {
					for (const element of statement.exportClause.elements)
						exports.push({ name: element.name.text, file, specifier });
				} else exports.push({ name: statement.exportClause.name.text, file, specifier });
			}
		} else if (
			statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
		) {
			const integration = usesRuntimeIntegration(statement);
			const erased = ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement);
			if (statement.modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword))
				exports.push({ name: 'default', file, integration, erased });
			else if (statement.name)
				exports.push({ name: statement.name.text, file, integration, erased });
			else if (
				ts.isVariableStatement(statement) &&
				statement.declarationList.declarations.every((item) => ts.isIdentifier(item.name))
			) {
				for (const item of statement.declarationList.declarations)
					exports.push({
						name: item.name.text,
						file,
						integration: usesRuntimeIntegration(item.initializer ?? item),
						erased,
					});
			} else throw new Error(`Unresolved public declaration requires review: ${file}`);
		}
	}
	return { exports, files: [...files], forwarding };
}

/** Declarations select observed source surfaces; evidence references never stand for passing tests. */
export function readBindingSurfacePolicy(packageDirectory, { sourceLedger } = {}) {
	const statusPath = path.join(packageDirectory, 'status.json');
	const status = existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, 'utf8')) : {};
	if (status.surfaces === undefined)
		return {
			mode: 'legacy',
			valid: true,
			issues: [],
			surfaces: [],
			fingerprint: null,
			requiresCopiedEvidence: true,
			requiresLifecycleEvidence: false,
		};
	const issues = [];
	const surfaces = status.surfaces;
	const manifest = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
	const ledgerPath = path.join(packageDirectory, 'audit/source-ledger.json');
	const ledger =
		sourceLedger ?? (existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : []);
	if (!Array.isArray(ledger)) issues.push('source ledger must be an array');
	else
		for (const entry of ledger) {
			if (
				!entry ||
				!['authored', 'adapted'].includes(entry.origin) ||
				!confinedFile(packageDirectory, entry.path) ||
				entry.sha256 !== digest(readFileSync(path.join(packageDirectory, entry.path)))
			)
				issues.push('source ledger contains missing, invalid, or changed source provenance');
		}
	const exported =
		typeof manifest.exports === 'object' &&
		Object.keys(manifest.exports).some((key) => key.startsWith('.'))
			? manifest.exports
			: { '.': manifest.exports ?? manifest.main };
	const fingerprints = { 'package.json': digest(JSON.stringify(manifest)) };
	if (!Array.isArray(surfaces) || surfaces.length === 0)
		issues.push('surfaces must be a non-empty array');
	for (const surface of Array.isArray(surfaces) ? surfaces : []) {
		if (
			!surface ||
			!OWNERSHIP.has(surface.ownership) ||
			!Object.hasOwn(exported, surface.entrypoint)
		) {
			issues.push('surface has unknown ownership or entrypoint');
			continue;
		}
		if (
			!Array.isArray(surface.exports) ||
			surface.exports.length === 0 ||
			surface.exports.some((item) => typeof item !== 'string' || !item)
		)
			issues.push(`${surface.entrypoint}: exports must contain selectors`);
		for (const field of ['files', 'evidence']) {
			if (!Array.isArray(surface[field]) || surface[field].length === 0)
				issues.push(`${surface.entrypoint}: ${field} must contain existing package files`);
			for (const file of surface[field] ?? []) {
				if (!confinedFile(packageDirectory, file))
					issues.push(`${surface.entrypoint}: invalid ${field} file ${file}`);
				else fingerprints[file] = digest(readFileSync(path.join(packageDirectory, file)));
			}
		}
		const dependency = surface.dependency;
		if (!dependency?.package || !dependency.version)
			issues.push(`${surface.entrypoint}: dependency package and version are required`);
		if (surface.ownership !== 'copied' && dependency) {
			const declared = ['dependencies', 'optionalDependencies', 'peerDependencies']
				.map((field) => manifest[field]?.[dependency.package])
				.filter(Boolean);
			if (!declared.includes(dependency.version))
				issues.push(`${surface.entrypoint}: dependency identity differs from package.json`);
		}
		if (
			surface.ownership === 'copied' &&
			(!Array.isArray(surface.upstreamPaths) ||
				surface.upstreamPaths.length === 0 ||
				surface.upstreamPaths.some(
					(item) =>
						typeof item !== 'string' ||
						!item ||
						item.startsWith('/') ||
						item.split('/').includes('..'),
				))
		)
			issues.push(`${surface.entrypoint}: copied implementation needs scoped upstreamPaths`);
		for (const entry of Array.isArray(ledger) ? ledger : []) {
			if (
				(surface.files ?? []).includes(entry.path) &&
				entry.origin === 'adapted' &&
				surface.ownership !== 'copied'
			)
				issues.push(`${entry.path}: source ledger conflicts with ${surface.ownership} ownership`);
		}
		if (surface.ownership === 'copied')
			for (const file of surface.files ?? []) {
				const entry = Array.isArray(ledger) ? ledger.find((item) => item.path === file) : undefined;
				if (
					!entry ||
					entry.origin !== 'adapted' ||
					entry.packageName !== dependency?.package ||
					entry.sha256 !== fingerprints[file]
				)
					issues.push(`${file}: copied implementation lacks matching hashed source provenance`);
			}
	}
	for (const [entrypoint, value] of Object.entries(exported)) {
		if (entrypoint === './package.json') continue;
		const declarations = Array.isArray(surfaces)
			? surfaces.filter((item) => item?.entrypoint === entrypoint)
			: [];
		if (declarations.length === 0) {
			issues.push(`${entrypoint}: undeclared entrypoint`);
			continue;
		}
		for (const target of new Set(targets(value))) {
			const file = target.replace(/^\.\//, '');
			if (!confinedFile(packageDirectory, file)) {
				issues.push(`${entrypoint}: missing export source ${target}`);
				continue;
			}
			try {
				const observed = sourceFacts(packageDirectory, file);
				for (const sourceFile of observed.files)
					fingerprints[sourceFile] = digest(readFileSync(path.join(packageDirectory, sourceFile)));
				for (const sourceFile of observed.files)
					if (!declarations.some((surface) => surface.files?.includes(sourceFile)))
						issues.push(`${entrypoint}: reachable source ${sourceFile} has no owner`);
				for (const surface of declarations) {
					if (surface.ownership === 'imported')
						for (const ownedFile of surface.files ?? []) {
							if (observed.forwarding.has(ownedFile) && !observed.forwarding.get(ownedFile))
								issues.push(
									`${entrypoint}: imported source ${ownedFile} also executes owned statements`,
								);
						}
					if (surface.ownership === 'adapter') {
						const runtime = observed.exports.filter(
							(item) =>
								surface.exports?.includes(item.name) &&
								surface.files?.includes(item.file) &&
								!item.erased,
						);
						if (runtime.length === 0 || runtime.some((item) => !item.integration))
							issues.push(
								`${entrypoint}: each selected adapter runtime export needs observed Octane integration; associated types cannot authorize separate runtime implementations`,
							);
					}
				}
				for (const item of observed.exports) {
					const selected = declarations.filter((surface) => surface.exports?.includes(item.name));
					if (selected.length !== 1) {
						issues.push(`${entrypoint}:${item.name}: uncovered or overlapping ownership`);
						continue;
					}
					const surface = selected[0];
					if (!surface.files?.includes(item.file))
						issues.push(`${entrypoint}:${item.name}: actual source ${item.file} is not covered`);
					if (
						surface.ownership === 'imported' &&
						(!item.specifier ||
							packageName(item.specifier) !== surface.dependency?.package ||
							(surface.dependency.specifier && item.specifier !== surface.dependency.specifier))
					)
						issues.push(
							`${entrypoint}:${item.name}: imported ownership is not a direct dependency re-export`,
						);
					if (surface.ownership === 'imported' && !observed.forwarding.get(item.file))
						issues.push(
							`${entrypoint}:${item.name}: imported source also executes owned statements`,
						);
					if (surface.ownership !== 'imported' && item.specifier)
						issues.push(
							`${entrypoint}:${item.name}: dependency re-export is not owned implementation`,
						);
				}
				for (const surface of declarations)
					for (const selector of surface.exports ?? [])
						if (!observed.exports.some((item) => item.name === selector))
							issues.push(`${entrypoint}:${selector}: selector is not observed`);
			} catch (error) {
				issues.push(error.message);
			}
		}
	}
	const valid = issues.length === 0;
	return {
		mode: 'declared',
		valid,
		issues,
		surfaces: Array.isArray(surfaces) ? surfaces : [],
		fingerprint: digest(JSON.stringify({ surfaces, fingerprints, ledger })),
		requiresCopiedEvidence: !valid || surfaces.some((surface) => surface.ownership === 'copied'),
		requiresLifecycleEvidence:
			!valid || surfaces.some((surface) => surface.ownership === 'adapter'),
	};
}

export function assertBindingSurfacePolicy(packageDirectory, options) {
	const policy = readBindingSurfacePolicy(packageDirectory, options);
	if (!policy.valid) throw new Error(`Invalid binding surface policy: ${policy.issues.join('; ')}`);
	return policy;
}

export function requiresUpstreamEvidence(policy, dependencyName) {
	return (
		policy.mode === 'legacy' ||
		!policy.valid ||
		policy.surfaces.some(
			(surface) =>
				surface.ownership === 'copied' &&
				(!dependencyName || surface.dependency.package === dependencyName),
		)
	);
}

/** A migrated mixed package may materialize only its declared copied slice. */
export function assertUpstreamLockScope(policy, lock) {
	if (policy.mode === 'legacy') return;
	if (!policy.valid)
		throw new Error('Invalid binding surface policy cannot authorize an upstream lock');
	if (!requiresUpstreamEvidence(policy, lock.identity.packageName))
		throw new Error(
			'This imported dependency does not require an upstream lock; remove the obsolete lock explicitly',
		);
	const prefix = lock.identity.repository?.subdirectory
		? `${lock.identity.repository.subdirectory}/`
		: '';
	const localPath = (file) =>
		prefix && file.startsWith(prefix) ? file.slice(prefix.length) : file;
	const scopes = policy.surfaces
		.filter(
			(surface) =>
				surface.ownership === 'copied' && surface.dependency.package === lock.identity.packageName,
		)
		.flatMap((surface) => surface.upstreamPaths.map(localPath));
	const attribution = new Set(
		[...(lock.license.evidence ?? []), ...(lock.license.notices ?? [])].map((entry) =>
			localPath(entry.path),
		),
	);
	const outside = lock.files.filter(
		(file) =>
			!attribution.has(file.path) &&
			!scopes.some(
				(scope) => file.path === scope || file.path.startsWith(`${scope.replace(/\/$/, '')}/`),
			),
	);
	if (outside.length)
		throw new Error(
			`Upstream lock contains files outside the copied surface scope: ${outside
				.slice(0, 5)
				.map((file) => file.path)
				.join(', ')}. Explicitly migrate the lock to the copied scope before materializing.`,
		);
	if (!lock.files.some((file) => !attribution.has(file.path)))
		throw new Error(
			'Upstream lock contains no copied source or test evidence; review the declared scope',
		);
}

export function scopeUpstreamInventory(policy, inventory, dependencyName) {
	if (policy.mode === 'legacy' || !policy.valid) return inventory;
	const scopes = policy.surfaces
		.filter(
			(surface) =>
				surface.ownership === 'copied' &&
				(!dependencyName || surface.dependency.package === dependencyName),
		)
		.flatMap((surface) => surface.upstreamPaths);
	const scoped = inventory.filter((item) =>
		scopes.some(
			(scope) => item.path === scope || item.path.startsWith(`${scope.replace(/\/$/, '')}/`),
		),
	);
	if (scopes.length > 0 && inventory.length > 0 && scoped.length === 0)
		throw new Error(
			'Copied surface scopes match no pinned upstream inventory; review the scope before removing evidence',
		);
	return scoped;
}
