// Hooks are keyed by call-site slot, so an instance declaration reached through
// two calls of one custom hook must not alias one cell. Runtime slot Symbols
// are numbered by module evaluation order and differ between the server and
// the browser, while declaration keys also identify seeds, streamed results and
// early values. Compiled custom-hook call sites therefore carry a separate
// position-hashed site, and a declaration folds the enclosing ones into its key.
let readPath: (() => string) | undefined;

/** @internal The enclosing custom-hook call sites, or '' outside a custom hook. */
export function currentSignalDeclarationPath(): string {
	return readPath === undefined ? '' : readPath();
}

/**
 * @internal Bind compiler-assigned custom-hook sites to one renderer's slot
 * path stack. The engine stays renderer-free: nothing is installed until a
 * compiled signal-aware module registers its first call site.
 */
export function createSignalHookSites(stack: readonly unknown[]): <S>(slot: S, site: string) => S {
	const sites = new Map<unknown, string>();
	// The path of each stack prefix, reused while the prefix holds the same
	// slots. Every render of a hook reaches its declarations through the same
	// call slots, so a declaration reads its path without rebuilding it.
	const slots: unknown[] = [];
	const paths: string[] = [];
	const read = (): string => {
		const depth = stack.length;
		let index = 0;
		while (index < depth && index < slots.length && slots[index] === stack[index]) index++;
		if (index < depth) slots.length = paths.length = index;
		for (; index < depth; index++) {
			const site = sites.get(stack[index]);
			// A call boundary compiled without a site (a caller outside the signal
			// contract) adds nothing, preserving that caller's previous identity.
			// Sites are compiler hashes. Unlike '/', a NUL separator cannot appear
			// in a realistic authored key, so a key such as 'user/h:…' declared
			// directly cannot alias the key 'user' declared through a hook.
			paths.push((paths[index - 1] ?? '') + (site === undefined ? '' : '\0' + site));
			slots.push(stack[index]);
		}
		return paths[depth - 1] ?? '';
	};
	return (slot, site) => {
		if (sites.size === 0) {
			// Client and server renderers can share one engine instance. Only the
			// renderer currently inside a custom hook has a nonempty path.
			const previous = readPath;
			readPath = previous === undefined ? read : () => read() || previous();
		}
		sites.set(slot, site);
		// A module re-evaluated by HMR may register a slot with a new site.
		slots.length = paths.length = 0;
		return slot;
	};
}
