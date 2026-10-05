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
	let fixedProps = null;
	if (shapes.length === 1) {
		let shape;
		try {
			shape = JSON.parse(shapes[0]);
		} catch {
			error(id, `invalid ${DOM_BINDINGS_PROPS_QUERY} shape query`);
		}
		if (
			!Array.isArray(shape) ||
			!((shape.length === 2 && shape[0] === 1) || (shape.length === 3 && shape[0] === 2)) ||
			!Array.isArray(shape[1]) ||
			shape[1].some((key) => typeof key !== 'string') ||
			new Set(shape[1]).size !== shape[1].length
		) {
			error(id, `invalid ${DOM_BINDINGS_PROPS_QUERY} shape query`);
		}
		props = shape[1];
		if (shape[0] === 2) {
			const fixed = shape[2];
			if (
				!Array.isArray(fixed) ||
				fixed.length === 0 ||
				fixed.some(
					(entry) =>
						!Array.isArray(entry) ||
						![1, 2].includes(entry.length) ||
						!props.includes(entry[0]) ||
						(entry.length === 2 &&
							!(
								entry[1] === null ||
								['string', 'boolean'].includes(typeof entry[1]) ||
								(typeof entry[1] === 'number' &&
									Number.isFinite(entry[1]) &&
									!Object.is(entry[1], -0))
							)),
				) ||
				new Set(fixed.map((entry) => entry[0])).size !== fixed.length
			)
				error(id, `invalid ${DOM_BINDINGS_PROPS_QUERY} fixed values`);
			fixedProps = fixed;
		}
	}
	return { exportName: values[0], mount: mounting.length === 1, props, fixedProps };
}

/**
 * An independent island whose only child is an imported component asks that
 * component's module for its activator. The module answers with a renderer-free
 * binding activator when the export is a zero-argument binding view, and
 * otherwise forwards to the host's ordinary renderer island module.
 */
export const DOM_BINDING_ISLAND_QUERY = 'octane-island';
const DOM_BINDING_ISLAND_HOST_QUERY = 'octane-island-host';
const DOM_BINDING_ISLAND_BOUNDARY_QUERY = 'octane-island-boundary';
/** Selects the renderer activator of a Hydrate boundary that delegates its selection. */
export const HYDRATE_ISLAND_RENDERER_QUERY = 'octane-island-renderer';

export function parseDomBindingIslandRequest(id) {
	const question = id.indexOf('?');
	if (question === -1) return null;
	const query = new URLSearchParams(id.slice(question + 1).split('#')[0]);
	const values = query.getAll(DOM_BINDING_ISLAND_QUERY);
	if (values.length === 0) return null;
	const hosts = query.getAll(DOM_BINDING_ISLAND_HOST_QUERY);
	const boundaries = query.getAll(DOM_BINDING_ISLAND_BOUNDARY_QUERY);
	if (
		values.length !== 1 ||
		!/^[A-Za-z_$][\w$]*$/.test(values[0]) ||
		hosts.length !== 1 ||
		hosts[0] === '' ||
		boundaries.length !== 1 ||
		!/^\d+(?:\.\d+)*$/.test(boundaries[0]) ||
		query.has(DOM_BINDINGS_QUERY)
	)
		error(id, `invalid ${DOM_BINDING_ISLAND_QUERY} island query`);
	return { exportName: values[0], host: hosts[0], boundary: boundaries[0] };
}

export function formatDomBindingIslandRequest(source, { exportName, host, boundary }) {
	return `${source}?${DOM_BINDING_ISLAND_QUERY}=${encodeURIComponent(exportName)}&${DOM_BINDING_ISLAND_HOST_QUERY}=${encodeURIComponent(host)}&${DOM_BINDING_ISLAND_BOUNDARY_QUERY}=${encodeURIComponent(boundary)}`;
}

export function isHydrateIslandRendererRequest(id) {
	const question = id.indexOf('?');
	return (
		question !== -1 &&
		new URLSearchParams(id.slice(question + 1).split('#')[0]).get(HYDRATE_ISLAND_RENDERER_QUERY) ===
			'1'
	);
}

export function formatDomBindingRequest(
	source,
	{ exportName, mount = false, props = null, fixedProps = null },
) {
	return `${source}?${DOM_BINDINGS_QUERY}=${encodeURIComponent(exportName)}${mount ? `&${DOM_BINDINGS_MOUNT_QUERY}=1` : ''}${props === null ? '' : `&${DOM_BINDINGS_PROPS_QUERY}=${encodeURIComponent(JSON.stringify(fixedProps?.length ? [2, props, fixedProps] : [1, props]))}`}`;
}
