/**
 * Install the identity data hook owned by Octane's generated main-thread entry.
 *
 * @param {{ processData?: unknown }} [target]
 * @returns {(data: unknown) => unknown}
 */
export function installMainThreadProcessData(target = globalThis) {
	const processData = (data) => data;
	target.processData = processData;
	return processData;
}
