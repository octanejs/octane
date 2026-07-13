import { describe, expect, it } from 'vitest';
import {
	parseEvaluationResult,
	parseEvaluationRunManifest,
	parsePrediction,
	parsePublicTaskManifest,
	parseTaskManifest,
	SchemaValidationError,
} from '../src/schema.js';
import { createPrediction, createResult, createRun, createTask } from './_fixtures.js';

describe('task manifest schemas', () => {
	it('accepts complete, pinned public task metadata', () => {
		const manifest = createTask('tsrx.counter.001');
		expect(parsePublicTaskManifest(manifest)).toBe(manifest);
	});

	it('requires and restricts integration package metadata', () => {
		const integration = createTask('integration.form.001', { suite: 'integration' });
		const { portShape: _portShape, ...missingShape } = integration;
		expect(() => parseTaskManifest(missingShape)).toThrow(/portShape.*required/);

		const unexpectedShape = { ...createTask('tsrx.form.001'), portShape: 'core-adapter' };
		expect(() => parseTaskManifest(unexpectedShape)).toThrow(/portShape.*only allowed/);
	});

	it('rejects private answer material at any depth', () => {
		const manifest = { ...createTask('tsrx.private.001'), metadata: { gold_patch: 'secret' } };
		expect(() => parsePublicTaskManifest(manifest)).toThrow(/gold_patch.*forbidden/);
	});

	it('allows held-out manifests only through the private parser', () => {
		const manifest = createTask('octane.heldout.001', { suite: 'octane', split: 'test' });
		expect(parseTaskManifest(manifest)).toBe(manifest);
		expect(() => parsePublicTaskManifest(manifest)).toThrow(/held-out test tasks/);

		const withoutHiddenDigest = {
			...manifest,
			grader: { ...manifest.grader, hiddenBundleDigest: undefined },
		};
		expect(() => parseTaskManifest(withoutHiddenDigest)).toThrow(/hiddenBundleDigest.*required/);
	});

	it('returns structured validation issues', () => {
		try {
			parseTaskManifest({ schemaVersion: '1.0' });
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(SchemaValidationError);
			expect(
				(error as SchemaValidationError).issues.some((issue) => issue.path === '$.taskId'),
			).toBe(true);
		}
	});

	it('pins commits and versions and keeps allowed paths inside the sandbox', () => {
		const mutable = createTask('tsrx.mutable.001');
		mutable.environment.baseCommit = 'main';
		mutable.environment.node = 'latest';
		expect(() => parseTaskManifest(mutable)).toThrow(/immutable.*Git commit/);

		const traversal = createTask('tsrx.path.001');
		traversal.prompt.allowedPaths = ['docs/outside.md'];
		expect(() => parseTaskManifest(traversal)).toThrow(/not contained.*writable path/);
	});

	it('validates exact SemVer and complete SPDX expression syntax', () => {
		for (const version of ['01.2.3', '1.2.3-alpha..1', '1.2.3-01']) {
			const manifest = createTask(`tsrx.semver.${version.replaceAll(/[^a-z0-9]/g, '-')}`);
			manifest.environment.node = version;
			expect(() => parseTaskManifest(manifest)).toThrow(/exact semantic version/);
		}

		const licensed = createTask('tsrx.license.001');
		licensed.provenance.sources[0].license = 'MIT AND (Apache-2.0 OR BSD-3-Clause)';
		expect(parseTaskManifest(licensed)).toBe(licensed);

		licensed.provenance.sources[0].license = 'MIT AND (Apache-2.0 OR)';
		expect(() => parseTaskManifest(licensed)).toThrow(/SPDX license/);
	});
});

describe('run, prediction, and result schemas', () => {
	it('accepts a reproducible pass@1 protocol', () => {
		const task = createTask('octane.events.001', { suite: 'octane' });
		const run = createRun([task]);
		const prediction = createPrediction(run, task);
		const result = createResult(run, task, prediction);

		expect(parseEvaluationRunManifest(run)).toBe(run);
		expect(parsePrediction(prediction)).toBe(prediction);
		expect(parseEvaluationResult(result)).toBe(result);
	});

	it('rejects timestamps that have valid syntax but impossible calendar values', () => {
		const task = createTask('octane.timestamp.001', { suite: 'octane' });
		const run = createRun([task], { createdAt: '2026-02-30T00:00:00Z' });
		expect(() => parseEvaluationRunManifest(run)).toThrow(/valid ISO 8601 UTC timestamp/);
	});

	it('makes attempt identity explicit and limits schema 1.0 to pass@1', () => {
		const task = createTask('tsrx.attempt.001');
		const run = createRun([task]);
		const unsupported = {
			...run,
			attempts: { attemptsPerTask: 2, aggregation: 'pass@k' },
		};
		expect(() => parseEvaluationRunManifest(unsupported)).toThrow(/exactly one attempt/);

		const prediction = { ...createPrediction(run, task), attempt: 2 };
		expect(() => parsePrediction(prediction)).toThrow(/exactly one attempt/);
	});

	it('requires immutable definitions for every declared MCP tool', () => {
		const task = createTask('tsrx.mcp.001');
		const run = createRun([task], {
			context: {
				mode: 'repo-docs-mcp',
				docsCommit: task.context.docsCommit,
				mcp: { package: '@octanejs/mcp-server', version: '0.1.0', tools: ['compile'] },
			},
		});
		expect(() => parseEvaluationRunManifest(run)).toThrow(/missing immutable definition.*compile/);
	});

	it('requires a failure stage only for unsuccessful results', () => {
		const task = createTask('tsrx.failure.001');
		const run = createRun([task]);
		const prediction = createPrediction(run, task);
		const unresolved = createResult(run, task, prediction, 'unresolved');
		const { failureStage: _failureStage, ...missingStage } = unresolved;
		expect(() => parseEvaluationResult(missingStage)).toThrow(/failureStage.*required/);

		const resolved = { ...createResult(run, task, prediction), failureStage: 'compile' };
		expect(() => parseEvaluationResult(resolved)).toThrow(/failureStage.*omitted/);
	});

	it('requires immutable prediction linkage and command-level telemetry', () => {
		const task = createTask('tsrx.linkage.001');
		const run = createRun([task]);
		const prediction = createPrediction(run, task);
		const result = createResult(run, task, prediction);
		const { predictionDigest: _predictionDigest, ...unlinked } = result;
		expect(() => parseEvaluationResult(unlinked)).toThrow(/predictionDigest/);

		const invalidCommand = {
			...result,
			commands: [
				{ id: 'typecheck', phase: 'public', outcome: 'passed', durationMs: 10, exitCode: 1 },
			],
		};
		expect(() => parseEvaluationResult(invalidCommand)).toThrow(/exitCode.*zero/);

		const failedCommand = {
			...result,
			commands: [
				{ id: 'public-test', phase: 'public', outcome: 'failed', durationMs: 10, exitCode: 1 },
			],
		};
		expect(() => parseEvaluationResult(failedCommand)).toThrow(/must be passed.*resolved/);

		const incompleteTests = {
			...result,
			metrics: { ...result.metrics, targetPassed: 1, targetTotal: 2 },
		};
		expect(() => parseEvaluationResult(incompleteTests)).toThrow(/must equal targetTotal/);
	});
});
