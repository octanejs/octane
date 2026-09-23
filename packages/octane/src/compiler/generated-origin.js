const SKIP_KEYS = new Set(['type', 'loc', 'start', 'end', 'range', 'metadata', 'parent']);

/**
 * Give every location-less node under `root` the authored origin of `origin`,
 * so generated scaffolding still maps into the source. Copy-on-write: adopted
 * parser nodes are never mutated (tests deep-freeze them), and the returned
 * tree must replace `root`. Stylesheet descendants use offsets into their own
 * CSS source rather than JavaScript locations, so they are left intact.
 */
export function inheritGeneratedOrigin(root, origin) {
	if (origin?.loc == null) return root;
	const seen = new WeakMap();
	const visit = (value) => {
		if (!value || typeof value !== 'object') return value;
		if (value.type === 'StyleSheet') return value;
		if (seen.has(value)) return seen.get(value);
		seen.set(value, value);
		if (Array.isArray(value)) {
			let output = null;
			for (let index = 0; index < value.length; index++) {
				const mapped = visit(value[index]);
				if (output === null && mapped !== value[index]) output = value.slice(0, index);
				if (output !== null) output.push(mapped);
			}
			const result = output ?? value;
			seen.set(value, result);
			return result;
		}
		let output = null;
		if (typeof value.type === 'string' && value.loc == null) {
			output = { ...value, start: origin.start, end: origin.end, loc: origin.loc };
		}
		for (const [key, child] of Object.entries(value)) {
			if (SKIP_KEYS.has(key)) continue;
			const mapped = visit(child);
			if (mapped !== child) {
				if (output === null) output = { ...value };
				output[key] = mapped;
			}
		}
		const result = output ?? value;
		seen.set(value, result);
		return result;
	};
	return visit(root);
}
