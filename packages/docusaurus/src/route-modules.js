function appendQuery(path, query) {
	if (query === undefined) return path;
	const search = new URLSearchParams();
	for (const key of Object.keys(query).sort()) {
		const value = query[key];
		if (Array.isArray(value)) {
			for (const item of value) search.append(key, String(item));
		} else if (value !== undefined) {
			search.append(key, String(value));
		}
	}
	const serialized = search.toString();
	const separator = path.includes('?') ? '&' : '?';
	return serialized === '' ? path : `${path}${separator}${serialized}`;
}

export function docusaurusModuleKey(reference) {
	return typeof reference === 'string' ? reference : appendQuery(reference.path, reference.query);
}

function isImportedModule(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		value.__import === true &&
		typeof value.path === 'string'
	);
}

function collectModuleReferences(value, result) {
	if (typeof value === 'string' || isImportedModule(value)) {
		const key = docusaurusModuleKey(value);
		result.set(key, key);
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectModuleReferences(item, result);
		return;
	}
	if (value !== null && typeof value === 'object') {
		for (const item of Object.values(value)) collectModuleReferences(item, result);
	}
}

function collectRouteReferences(route, result) {
	collectModuleReferences(route.component, result);
	collectModuleReferences(route.modules, result);
	collectModuleReferences(route.context, result);
	for (const child of route.children ?? []) collectRouteReferences(child, result);
}

export function collectDocusaurusRouteModuleReferences(routes) {
	const result = new Map();
	for (const route of routes) collectRouteReferences(route, result);
	return result;
}
