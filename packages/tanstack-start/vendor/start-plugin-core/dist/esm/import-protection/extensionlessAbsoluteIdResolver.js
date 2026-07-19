import { KNOWN_SOURCE_EXTENSIONS } from "./constants.js";
import { normalizeFilePath } from "./utils.js";
import { basename, dirname, extname, isAbsolute } from "node:path";
import { resolveModulePath } from "exsolve";
//#region src/import-protection/extensionlessAbsoluteIdResolver.ts
var FILE_RESOLUTION_EXTENSIONS = [...KNOWN_SOURCE_EXTENSIONS];
/**
* Canonicalize extensionless absolute IDs like `/src/foo.server` to the
* physical file when possible.
*
* Keeps a small cache plus a reverse index so we can invalidate on HMR
* updates without clearing the whole map.
*/
var ExtensionlessAbsoluteIdResolver = class {
	entries = /* @__PURE__ */ new Map();
	keysByDep = /* @__PURE__ */ new Map();
	clear() {
		this.entries.clear();
		this.keysByDep.clear();
	}
	/**
	* Invalidate any cached entries that might be affected by changes to `id`.
	* We invalidate both the file and its containing directory.
	*/
	invalidateByFile(id) {
		const file = normalizeFilePath(id);
		this.invalidateDep(`file:${file}`);
		if (isAbsolute(file)) this.invalidateDep(`dir:${dirname(file)}`);
	}
	resolve(id) {
		const key = normalizeFilePath(id);
		const cached = this.entries.get(key);
		if (cached) return cached.value;
		let result = key;
		let resolvedPhysical;
		if (isAbsolute(key)) {
			const ext = extname(key);
			if (!FILE_RESOLUTION_EXTENSIONS.includes(ext)) {
				const resolved = resolveModulePath(`./${basename(key)}`, {
					from: dirname(key),
					extensions: FILE_RESOLUTION_EXTENSIONS,
					try: true
				});
				if (resolved) {
					resolvedPhysical = resolved;
					result = normalizeFilePath(resolved);
				}
			}
		}
		const resolvedFile = resolvedPhysical ? normalizeFilePath(resolvedPhysical) : void 0;
		const deps = this.buildDepsForKey(key, resolvedFile);
		this.entries.set(key, {
			value: result,
			deps
		});
		this.indexDeps(key, deps);
		return result;
	}
	invalidateDep(dep) {
		const keys = this.keysByDep.get(dep);
		if (!keys) return;
		for (const key of Array.from(keys)) this.deleteKey(key);
	}
	buildDepsForKey(key, resolvedFile) {
		const deps = /* @__PURE__ */ new Set();
		deps.add(`file:${key}`);
		if (isAbsolute(key)) deps.add(`dir:${dirname(key)}`);
		if (resolvedFile) deps.add(`file:${resolvedFile}`);
		return deps;
	}
	indexDeps(key, deps) {
		for (const dep of deps) {
			let keys = this.keysByDep.get(dep);
			if (!keys) {
				keys = /* @__PURE__ */ new Set();
				this.keysByDep.set(dep, keys);
			}
			keys.add(key);
		}
	}
	deleteKey(key) {
		const entry = this.entries.get(key);
		this.entries.delete(key);
		if (!entry) return;
		for (const dep of entry.deps) {
			const keys = this.keysByDep.get(dep);
			if (!keys) continue;
			keys.delete(key);
			if (keys.size === 0) this.keysByDep.delete(dep);
		}
	}
};
//#endregion
export { ExtensionlessAbsoluteIdResolver };

//# sourceMappingURL=extensionlessAbsoluteIdResolver.js.map