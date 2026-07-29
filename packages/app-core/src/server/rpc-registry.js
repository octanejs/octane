// @ts-check
/**
 * Collision guard for `module server` function ids.
 *
 * An id is a truncated SHA-256 of `"<module>#<export>"`, so two different
 * exports can produce the same one. Both registration paths are a plain Map
 * set, which resolves a collision by overwriting: one function becomes
 * unreachable and its calls execute the other one instead, silently and with
 * whatever authorization that other function carries. Fail the boot instead.
 */

/**
 * @typedef {{ module: string, export: string }} RpcDeclaration
 */

/**
 * @param {string} id
 * @param {RpcDeclaration} first
 * @param {RpcDeclaration} second
 * @returns {Error}
 */
export function rpcIdCollision(id, first, second) {
	return new Error(
		`[octane] Two server functions share the id "${id}": \`${first.export}\` in ${first.module} ` +
			`and \`${second.export}\` in ${second.module}. An id is a truncated hash of the module ` +
			'path and export name, so renaming either export resolves it.',
	);
}

/**
 * `globalThis.rpc_modules`, rejecting a second declaration under an id already
 * taken by a different one. Re-registering the same export is a no-op, which
 * dev module reloads depend on.
 */
class RpcRegistry extends Map {
	/**
	 * @param {string} id
	 * @param {[modulePath: string, exportName: string]} declaration
	 * @returns {this}
	 */
	set(id, declaration) {
		const existing = this.get(id);
		if (
			existing !== undefined &&
			(existing[0] !== declaration[0] || existing[1] !== declaration[1])
		) {
			throw rpcIdCollision(
				id,
				{ module: existing[0], export: existing[1] },
				{ module: declaration[0], export: declaration[1] },
			);
		}
		return super.set(id, declaration);
	}
}

/**
 * @returns {Map<string, [modulePath: string, exportName: string]>}
 */
export function createRpcRegistry() {
	return new RpcRegistry();
}
