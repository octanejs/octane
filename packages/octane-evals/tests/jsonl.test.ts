import { describe, expect, it } from 'vitest';
import {
	JsonlSchemaValidationError,
	parsePredictionJsonl,
	parsePublicTaskManifestJsonl,
	parseRetiredTaskManifestJsonl,
	parseResultJsonl,
	parseRunManifestJsonl,
	parseTaskManifestJsonl,
	stringifyPredictionsJsonl,
	stringifyPublicTaskManifestsJsonl,
	stringifyRetiredTaskManifestsJsonl,
	stringifyResultsJsonl,
	stringifyRunManifestsJsonl,
	stringifyTaskManifestsJsonl,
} from '../src/jsonl.js';
import { SchemaValidationError } from '../src/schema.js';
import { createPrediction, createResult, createRun, createTask } from './_fixtures.js';

const task = createTask('octane.events.001', { suite: 'octane' });
const run = createRun([task]);
const prediction = createPrediction(run, task);
const result = createResult(run, task, prediction);

describe('JSONL protocol', () => {
	it('round-trips every public protocol record with a trailing newline', () => {
		const tasks = stringifyTaskManifestsJsonl([task]);
		const runs = stringifyRunManifestsJsonl([run]);
		const predictions = stringifyPredictionsJsonl([prediction]);
		const results = stringifyResultsJsonl([result]);

		for (const source of [tasks, runs, predictions, results])
			expect(source.endsWith('\n')).toBe(true);
		expect(parseTaskManifestJsonl(tasks)).toEqual([task]);
		expect(parsePublicTaskManifestJsonl(tasks)).toEqual([task]);
		expect(parseRunManifestJsonl(runs)).toEqual([run]);
		expect(parsePredictionJsonl(predictions)).toEqual([prediction]);
		expect(parseResultJsonl(results)).toEqual([result]);
	});

	it('ignores blank lines and reports invalid JSON line numbers', () => {
		expect(parsePredictionJsonl(`\n${JSON.stringify(prediction)}\n\n`)).toEqual([prediction]);
		expect(() => parsePredictionJsonl(`${JSON.stringify(prediction)}\nnot json\n`)).toThrow(
			/line 2 is not valid JSON/,
		);
	});

	it('preserves structured schema issues while adding JSONL line context', () => {
		try {
			parseResultJsonl('{}\n');
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(JsonlSchemaValidationError);
			expect(error).toBeInstanceOf(SchemaValidationError);
			expect((error as JsonlSchemaValidationError).lineNumber).toBe(1);
			expect((error as JsonlSchemaValidationError).issues).toContainEqual({
				path: '$.taskId',
				message: 'expected a non-empty string',
			});
		}
	});

	it('validates collection invariants after parsing rows', () => {
		const duplicate = `${JSON.stringify(task)}\n${JSON.stringify(task)}\n`;
		expect(() => parseTaskManifestJsonl(duplicate)).toThrow(/duplicate task ID/);

		const heldOut = createTask('heldout', { split: 'test' });
		expect(() => parsePublicTaskManifestJsonl(`${JSON.stringify(heldOut)}\n`)).toThrow(
			/held-out test tasks/,
		);
		expect(() => stringifyPublicTaskManifestsJsonl([heldOut] as never)).toThrow(
			/held-out test tasks/,
		);
		expect(parseRetiredTaskManifestJsonl(`${JSON.stringify(heldOut)}\n`)).toEqual([heldOut]);
		expect(stringifyRetiredTaskManifestsJsonl([heldOut])).toBe(`${JSON.stringify(heldOut)}\n`);
	});

	it('validates rows before stringifying them', () => {
		const invalidPrediction = { ...prediction, runManifestDigest: 'latest' };
		expect(() => stringifyPredictionsJsonl([invalidPrediction] as never)).toThrow(
			/runManifestDigest/,
		);
	});

	it('serializes an empty record set as an empty string', () => {
		expect(stringifyPredictionsJsonl([])).toBe('');
		expect(stringifyResultsJsonl([])).toBe('');
		expect(stringifyRunManifestsJsonl([])).toBe('');
		expect(stringifyTaskManifestsJsonl([])).toBe('');
	});
});
