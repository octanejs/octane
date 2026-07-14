import { createHash } from 'node:crypto';
import type { EvaluationRunManifest, Prediction, TaskManifest } from './schema.js';

/** RFC-8785-like deterministic JSON for the protocol's JSON-compatible records. */
export function canonicalJson(value: unknown): string {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') {
		return JSON.stringify(value);
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value))
			throw new TypeError('Canonical JSON cannot encode a non-finite number');
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((entry) => (entry === undefined ? 'null' : canonicalJson(entry))).join(',')}]`;
	}
	if (typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, entry]) => entry !== undefined)
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
		return `{${entries
			.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
			.join(',')}}`;
	}
	throw new TypeError(`Canonical JSON cannot encode ${typeof value}`);
}

export function sha256Digest(value: string | Uint8Array): string {
	return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export interface WorkspaceDigestFile {
	path: string;
	content: string | Uint8Array;
}

/** Digest a template as a sorted path-to-content-digest map, independent of filesystem order. */
export function digestWorkspaceFiles(files: readonly WorkspaceDigestFile[]): string {
	const paths = new Set<string>();
	const entries = files
		.map((file) => {
			if (
				file.path.length === 0 ||
				file.path.startsWith('/') ||
				file.path.includes('\\') ||
				file.path.split('/').includes('..')
			) {
				throw new TypeError(`Invalid workspace file path: ${file.path}`);
			}
			if (paths.has(file.path)) throw new TypeError(`Duplicate workspace file path: ${file.path}`);
			paths.add(file.path);
			return { path: file.path, digest: sha256Digest(file.content) };
		})
		.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
	return sha256Digest(canonicalJson(entries));
}

/** Digest of sorted, canonical task records. Ordering the input cannot change the wave identity. */
export function digestTaskManifests(tasks: readonly TaskManifest[]): string {
	const records = [...tasks]
		.sort((left, right) => (left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0))
		.map((task) => canonicalJson(task));
	return sha256Digest(records.length === 0 ? '' : `${records.join('\n')}\n`);
}

export function digestPrediction(prediction: Prediction): string {
	return sha256Digest(canonicalJson(prediction));
}

export function digestRunManifest(run: EvaluationRunManifest): string {
	return sha256Digest(canonicalJson(run));
}
