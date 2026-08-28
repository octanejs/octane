import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const resultPath = path.join(
	fs.mkdtempSync(path.join(os.tmpdir(), 'octane-scheduler-depth-eval-')),
	'result.json',
);

try {
	const run = spawnSync(process.execPath, ['benchmarks/scheduler-depth/run.mjs', '9'], {
		cwd: path.resolve(import.meta.dirname, '../..'),
		env: { ...process.env, BENCH_JSON: resultPath, BENCH_QUIET: '1' },
		encoding: 'utf8',
	});
	const payload = fs.existsSync(resultPath)
		? JSON.parse(fs.readFileSync(resultPath, 'utf8'))
		: null;
	if ((run.status ?? 1) !== 0) {
		throw new Error(
			payload?.failed || run.stderr || run.stdout || `scheduler-depth exited ${run.status}`,
		);
	}
	if (payload.failed) throw new Error(payload.failed);
	const control = payload.targets.find((target) => target.name === 'depth-500');
	const deep = payload.targets.find((target) => target.name === 'depth-2000');
	if (control === undefined || deep === undefined)
		throw new Error('scheduler-depth targets missing');
	const normalizedScalingRatio = deep.ops.flush.score / control.ops.flush.score / 4;
	console.log(
		JSON.stringify({
			correctness_passed: 1,
			deep_wave_ms: deep.ops.flush.score,
			control_wave_ms: control.ops.flush.score,
			normalized_scaling_ratio: normalizedScalingRatio,
			queued_components: deep.meta.queuedComponents,
			rendered_components: deep.meta.renderedComponents,
		}),
	);
} finally {
	fs.rmSync(path.dirname(resultPath), { recursive: true, force: true });
}
