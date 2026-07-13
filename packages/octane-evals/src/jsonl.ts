import {
	parseEvaluationRunManifest,
	parseEvaluationResult,
	parsePrediction,
	parsePublicTaskManifest,
	parseTaskManifest,
	SchemaValidationError,
	type EvaluationRunManifest,
	type EvaluationResult,
	type Prediction,
	type PublicTaskManifest,
	type TaskManifest,
} from './schema.js';
import { validateTaskManifestCollection } from './dataset.js';

type Parser<T> = (value: unknown) => T;

/** A schema failure annotated with the one-based JSONL record line. */
export class JsonlSchemaValidationError extends SchemaValidationError {
	readonly lineNumber: number;
	readonly recordLabel: string;
	override readonly cause: SchemaValidationError;

	constructor(recordLabel: string, lineNumber: number, cause: SchemaValidationError) {
		super(`${recordLabel} line ${lineNumber}`, cause.issues);
		this.name = 'JsonlSchemaValidationError';
		this.lineNumber = lineNumber;
		this.recordLabel = recordLabel;
		this.cause = cause;
	}
}

function parseJsonl<T>(source: string, label: string, parse: Parser<T>): T[] {
	const records: T[] = [];
	const lines = source.split(/\r?\n/);

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index].trim();
		if (line.length === 0) continue;

		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new SyntaxError(`${label} line ${index + 1} is not valid JSON: ${message}`);
		}

		try {
			records.push(parse(value));
		} catch (error) {
			if (error instanceof SchemaValidationError) {
				throw new JsonlSchemaValidationError(label, index + 1, error);
			}
			const message = error instanceof Error ? error.message : String(error);
			const wrapped = new TypeError(`${label} line ${index + 1}: ${message}`, { cause: error });
			throw wrapped;
		}
	}

	return records;
}

function stringifyJsonl<T>(records: readonly T[]): string {
	return records.length === 0
		? ''
		: `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

export function parsePredictionJsonl(source: string): Prediction[] {
	return parseJsonl(source, 'Predictions JSONL', parsePrediction);
}

export function parseTaskManifestJsonl(source: string): TaskManifest[] {
	const manifests = parseJsonl(source, 'Task manifests JSONL', parseTaskManifest);
	validateTaskManifestCollection(manifests);
	return manifests;
}

export function parsePublicTaskManifestJsonl(source: string): PublicTaskManifest[] {
	const manifests = parseJsonl(source, 'Public task manifests JSONL', parsePublicTaskManifest);
	validateTaskManifestCollection(manifests);
	return manifests;
}

/** Historical test-split manifests that have been explicitly retired and released. */
export function parseRetiredTaskManifestJsonl(source: string): TaskManifest[] {
	const manifests = parseJsonl(source, 'Retired task manifests JSONL', parseTaskManifest);
	validateTaskManifestCollection(manifests);
	if (manifests.some((manifest) => manifest.split !== 'test')) {
		throw new TypeError('Retired task manifest JSONL must preserve the original test split');
	}
	return manifests;
}

export function parseRunManifestJsonl(source: string): EvaluationRunManifest[] {
	return parseJsonl(source, 'Run manifests JSONL', parseEvaluationRunManifest);
}

export function parseResultJsonl(source: string): EvaluationResult[] {
	return parseJsonl(source, 'Results JSONL', parseEvaluationResult);
}

export function stringifyPredictionsJsonl(predictions: readonly Prediction[]): string {
	for (const prediction of predictions) parsePrediction(prediction);
	return stringifyJsonl(predictions);
}

export function stringifyTaskManifestsJsonl(manifests: readonly TaskManifest[]): string {
	for (const manifest of manifests) parseTaskManifest(manifest);
	validateTaskManifestCollection(manifests);
	return stringifyJsonl(manifests);
}

export function stringifyPublicTaskManifestsJsonl(
	manifests: readonly PublicTaskManifest[],
): string {
	for (const manifest of manifests) parsePublicTaskManifest(manifest);
	validateTaskManifestCollection(manifests);
	return stringifyJsonl(manifests);
}

export function stringifyRetiredTaskManifestsJsonl(manifests: readonly TaskManifest[]): string {
	for (const manifest of manifests) parseTaskManifest(manifest);
	validateTaskManifestCollection(manifests);
	if (manifests.some((manifest) => manifest.split !== 'test')) {
		throw new TypeError('Retired task manifests must preserve the original test split');
	}
	return stringifyJsonl(manifests);
}

export function stringifyRunManifestsJsonl(manifests: readonly EvaluationRunManifest[]): string {
	for (const manifest of manifests) parseEvaluationRunManifest(manifest);
	return stringifyJsonl(manifests);
}

export function stringifyResultsJsonl(results: readonly EvaluationResult[]): string {
	for (const result of results) parseEvaluationResult(result);
	return stringifyJsonl(results);
}
