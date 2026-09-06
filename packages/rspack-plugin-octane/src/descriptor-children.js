import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import {
	cleanModuleId,
	findDescriptorChildrenExports,
	findDescriptorChildrenImports,
} from 'octane/compiler/bundler';

/**
 * A loader runs before Rspack publishes outgoing module-graph edges. Resolve
 * each JSX import with its ESM resolver, then prove the named export from the
 * resolved authored source. Every file in the proof becomes a loader dependency
 * so changing a marker or any barrel invalidates its compiled consumers.
 */
export async function loadDescriptorChildrenImports(context, source, id) {
	if (typeof context.getResolve !== 'function' || !/<\s*[A-Z_$]/.test(source)) return null;
	const imports = findDescriptorChildrenImports(source, id).filter(
		(candidate) => candidate.local !== undefined && candidate.request !== 'octane',
	);
	if (imports.length === 0) return null;
	const resolver = context.getResolve({ dependencyType: 'esm' });
	const analyses = new Map();
	const classifications = new Map();
	const proven = new Set();

	async function analyze(resolvedId) {
		const filename = cleanModuleId(resolvedId);
		if (!isAbsolute(filename) || !/\.(?:[cm]?[jt]sx?|tsrx)$/.test(filename)) return null;
		let analysis = analyses.get(filename);
		if (analysis === undefined) {
			context.addDependency?.(filename);
			analysis = readFile(filename, 'utf8')
				.then((code) => {
					// An ordinary source with neither the marker's name nor an
					// import/re-export pair cannot prove any binding. Keep that
					// common case out of the parser entirely.
					const mayReexport = code.includes('export') && code.includes('from');
					return {
						exports: code.includes('descriptorChildren')
							? new Set(findDescriptorChildrenExports(code, filename))
							: new Set(),
						code: mayReexport ? code : null,
						reexports: mayReexport ? undefined : [],
					};
				})
				.catch((error) => {
					if (error?.code === 'ENOENT') context.addMissingDependency?.(filename);
					return null;
				});
			analyses.set(filename, analysis);
		}
		return analysis;
	}

	async function resolveImport(request, importer) {
		try {
			return await resolver(dirname(cleanModuleId(importer)), request);
		} catch {
			// Let Rspack's module factory report unresolved imports with its own
			// issuer trace; no export can be proven from a missing dependency.
			return null;
		}
	}

	async function isMarked(resolvedId, imported, ancestors = new Set()) {
		const key = `${resolvedId}\0${imported}`;
		if (ancestors.has(key)) return false;
		let classification = ancestors.size === 0 ? classifications.get(key) : undefined;
		if (classification === undefined) {
			classification = (async () => {
				const analysis = await analyze(resolvedId);
				if (analysis === null) return false;
				if (analysis.exports.has(imported)) return true;
				const reexports = (analysis.reexports ??=
					analysis.code !== null
						? findDescriptorChildrenImports(analysis.code, cleanModuleId(resolvedId)).filter(
								(candidate) => candidate.exported !== undefined,
							)
						: []);
				const nextAncestors = new Set(ancestors);
				nextAncestors.add(key);
				for (const candidate of reexports) {
					if (candidate.exported !== imported) continue;
					const target = await resolveImport(candidate.request, resolvedId);
					if (typeof target === 'string' && target !== resolvedId) {
						if (await isMarked(target, candidate.imported, nextAncestors)) return true;
					}
				}
				return false;
			})();
			// A result inside a cycle can depend on the starting point. Only root
			// classifications are safe to share across independent import paths.
			if (ancestors.size === 0) classifications.set(key, classification);
		}
		return classification;
	}

	const byRequest = new Map();
	for (const candidate of imports) {
		const values = byRequest.get(candidate.request) ?? [];
		values.push(candidate);
		byRequest.set(candidate.request, values);
	}
	await Promise.all(
		[...byRequest].map(async ([request, candidates]) => {
			const target = await resolveImport(request, id);
			if (typeof target !== 'string' || target === id) return;
			await Promise.all(
				candidates.map(async ({ imported }) => {
					if (await isMarked(target, imported)) proven.add(`${request}\0${imported}`);
				}),
			);
		}),
	);
	return proven.size === 0 ? null : (request, imported) => proven.has(`${request}\0${imported}`);
}
