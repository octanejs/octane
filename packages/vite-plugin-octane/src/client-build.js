// @ts-check
import { randomUUID } from 'node:crypto';
import path from 'node:path';

/**
 * One identity per actual Vite client generation. Discovery is replaceable per
 * source, so deleting a widget cannot leave an old activation record behind.
 * This never evaluates an application module or walks an undiscovered graph.
 * @param {(buildId: string) => void} [onIncompatibleDiscovery]
 */
export function createClientBuildState(onIncompatibleDiscovery) {
	let buildId = randomUUID();
	let hadHotUpdates = false;
	/** @type {Map<string, Map<string, { moduleId: string, styles: string[] }>>} */
	const sources = new Map();
	const signalSources = new Set();
	return {
		get buildId() {
			return buildId;
		},
		get hasStatefulModules() {
			return sources.size !== 0 || signalSources.size !== 0;
		},
		begin() {
			buildId = randomUUID();
			hadHotUpdates = false;
			sources.clear();
			signalSources.clear();
		},
		/** @param {string} file */
		invalidate(file) {
			buildId = randomUUID();
			hadHotUpdates = false;
			sources.delete(file.split('?', 1)[0]);
			signalSources.delete(file.split('?', 1)[0]);
		},
		noteHotUpdate() {
			hadHotUpdates = true;
		},
		/** @param {string} root @param {string} id @param {any[]} templates @param {boolean} [streamedSignals] */
		record(root, id, templates, streamedSignals = false) {
			// Sliced activation modules have no children of their own. They must
			// not clear their unsliced parent's compiler-proven widget catalog.
			if (new URLSearchParams(id.slice(id.indexOf('?') + 1)).has('octane-hydrate')) return;
			const incompatibleDiscovery = hadHotUpdates && sources.size === 0 && signalSources.size === 0;
			id = id.split('?', 1)[0];
			if (streamedSignals) signalSources.add(id);
			else signalSources.delete(id);
			const relative = path.relative(root, id);
			const withinRoot =
				relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
			const browserSource = withinRoot
				? '/' + relative.split(path.sep).join('/')
				: '/@fs/' + id.split(path.sep).join('/');
			const records = new Map();
			for (const template of templates) {
				if (typeof template?.boundaryId !== 'string' || typeof template.request !== 'string')
					continue;
				const queryStart = template.request.indexOf('?');
				if (queryStart === -1) continue;
				records.set(template.boundaryId, {
					moduleId: browserSource + template.request.slice(queryStart),
					styles: [],
				});
			}
			if (records.size === 0) sources.delete(id);
			else sources.set(id, records);
			if (incompatibleDiscovery && (sources.size !== 0 || signalSources.size !== 0)) {
				buildId = randomUUID();
				hadHotUpdates = false;
				onIncompatibleDiscovery?.(buildId);
				// The caller runs in the compiler transform before returning code.
				// Refuse this response once; fresh-document retries use the new ID.
				throw new Error(
					'The Vite client build gained streamed state after HMR. Reload this document.',
				);
			}
		},
		/** @returns {import('@octanejs/app-core/production').ClientBuildManifest} */
		metadata() {
			return {
				version: 1,
				buildId,
				mode: 'development',
				capabilities: { independentHydration: sources.size !== 0 },
			};
		},
		/** @returns {import('octane/server').RenderOptions['independentHydration']} */
		independentHydration() {
			const generation = buildId;
			return {
				buildId: generation,
				resolve(boundaryId) {
					if (buildId !== generation)
						throw new Error('The Vite client build changed during server rendering.');
					for (const records of sources.values()) {
						const record = records.get(boundaryId);
						if (record !== undefined) return record;
					}
				},
			};
		},
	};
}
