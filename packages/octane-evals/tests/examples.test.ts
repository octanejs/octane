import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { digestPrediction, digestTaskManifests, sha256Digest } from '../src/digest.js';
import {
	parsePredictionJsonl,
	parsePublicTaskManifestJsonl,
	parseResultJsonl,
	parseRunManifestJsonl,
} from '../src/jsonl.js';
import { createEvaluationReport } from '../src/reporting.js';

function readExample(name: string): string {
	return readFileSync(fileURLToPath(new URL(`../examples/${name}`, import.meta.url)), 'utf8');
}

describe('public protocol examples', () => {
	it('conform to the task, prediction, and result schemas', () => {
		const [task] = parsePublicTaskManifestJsonl(readExample('manifest.jsonl'));
		const [run] = parseRunManifestJsonl(readExample('run.jsonl'));
		const [prediction] = parsePredictionJsonl(readExample('prediction.jsonl'));
		const [result] = parseResultJsonl(readExample('result.jsonl'));

		expect(run.taskManifestDigest).toBe(digestTaskManifests([task]));
		expect(prediction.runId).toBe(run.runId);
		expect(prediction.taskId).toBe(task.taskId);
		expect(prediction.outputType).toBe(task.prompt.outputType);
		expect(result.predictionDigest).toBe(digestPrediction(prediction));
		expect(result.taskId).toBe(task.taskId);
		expect(result.graderVersion).toBe(task.grader.graderVersion);
		expect(createEvaluationReport(run, [task], [prediction], [result]).overall.resolvedRate).toBe(
			1,
		);
	});

	it('pins the exact public prompt artifact bytes', () => {
		const [run] = parseRunManifestJsonl(readExample('run.jsonl'));
		const system = run.promptArtifacts.find((artifact) => artifact.role === 'system');
		const template = run.promptArtifacts.find((artifact) => artifact.role === 'user-template');

		expect(system?.digest).toBe(sha256Digest(readExample('prompts/system.md')));
		expect(template?.digest).toBe(sha256Digest(readExample('prompts/user-template.md')));
	});
});
