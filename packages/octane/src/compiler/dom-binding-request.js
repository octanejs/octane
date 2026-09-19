/** Shared extraction requests retain ordered caller props across bundler IDs. */
export const DOM_BINDINGS_QUERY = 'octane-bindings';
export const DOM_BINDINGS_MOUNT_QUERY = 'octane-mount';
export const DOM_BINDINGS_PROPS_QUERY = 'octane-props';

function error(id, message) {
	const error = new Error(`Octane DOM bindings (${id}:1): ${message}`);
	error.code = 'OCTANE_DOM_BINDINGS';
	throw error;
}

export function parseDomBindingRequest(id) {
	const question = id.indexOf('?');
	if (question === -1) return null;
	const query = new URLSearchParams(id.slice(question + 1).split('#')[0]);
	const values = query.getAll(DOM_BINDINGS_QUERY);
	const mounting = query.getAll(DOM_BINDINGS_MOUNT_QUERY);
	const shapes = query.getAll(DOM_BINDINGS_PROPS_QUERY);
	if (
		mounting.length > 1 ||
		(mounting.length === 1 && (mounting[0] !== '1' || values.length !== 1))
	) {
		error(id, 'octane-mount=1 requires one selected binding export');
	}
	if (shapes.length > 1 || (shapes.length === 1 && values.length !== 1)) {
		error(id, `${DOM_BINDINGS_PROPS_QUERY} requires one selected binding export and one shape`);
	}
	if (values.length === 0) return null;
	if (values.length !== 1 || !/^[A-Za-z_$][\w$]*$/.test(values[0])) {
		error(id, `invalid ${DOM_BINDINGS_QUERY} export query`);
	}
	let props = null;
	if (shapes.length === 1) {
		let shape;
		try {
			shape = JSON.parse(shapes[0]);
		} catch {
			error(id, `invalid ${DOM_BINDINGS_PROPS_QUERY} shape query`);
		}
		if (
			!Array.isArray(shape) ||
			shape.length !== 2 ||
			shape[0] !== 1 ||
			!Array.isArray(shape[1]) ||
			shape[1].some((key) => typeof key !== 'string') ||
			new Set(shape[1]).size !== shape[1].length
		) {
			error(id, `invalid ${DOM_BINDINGS_PROPS_QUERY} shape query`);
		}
		props = shape[1];
	}
	return { exportName: values[0], mount: mounting.length === 1, props };
}

export function formatDomBindingRequest(source, { exportName, mount = false, props = null }) {
	return `${source}?${DOM_BINDINGS_QUERY}=${encodeURIComponent(exportName)}${mount ? `&${DOM_BINDINGS_MOUNT_QUERY}=1` : ''}${props === null ? '' : `&${DOM_BINDINGS_PROPS_QUERY}=${encodeURIComponent(JSON.stringify([1, props]))}`}`;
}
