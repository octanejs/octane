//#region src/vite/module-id.ts
/** Checks for a query parameter without rewriting the opaque module ID. */
function hasIdQueryFlag(id, flag) {
	const queryIndex = id.indexOf('?');
	if (queryIndex === -1) return false;
	return new URLSearchParams(id.slice(queryIndex + 1)).has(flag);
}
/** Appends an owned query flag without normalizing the existing query. */
function appendIdQueryFlag(id, flag) {
	if (!id.includes('?')) return `${id}?${flag}`;
	const separator = id.endsWith('&') ? '' : '&';
	return `${id}${separator}${flag}`;
}
/** Removes the owned query flag appended by {@link appendIdQueryFlag}. */
function removeIdQueryFlag(id, flag) {
	for (const separator of ['?', '&']) {
		const suffix = `${separator}${flag}`;
		if (id.endsWith(suffix)) return id.slice(0, -suffix.length);
	}
	return id;
}
//#endregion
export { appendIdQueryFlag, hasIdQueryFlag, removeIdQueryFlag };
