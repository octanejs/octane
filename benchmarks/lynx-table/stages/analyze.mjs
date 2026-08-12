const MIN_REPETITIONS = 5;

export function requireMinimumRepetitions(value) {
	const repetitions = Number(value);
	if (!Number.isSafeInteger(repetitions) || repetitions < MIN_REPETITIONS) {
		throw new TypeError(`stage decomposition requires at least ${MIN_REPETITIONS} repetitions.`);
	}
	return repetitions;
}

export function interleavedABSchedule(repetitions) {
	const count = requireMinimumRepetitions(repetitions);
	return Array.from({ length: count }, (_, index) =>
		index % 2 === 0 ? ['control', 'profile'] : ['profile', 'control'],
	);
}

function finite(value, label) {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		throw new TypeError(`${label} must be a finite number greater than or equal to zero.`);
	}
	return value;
}

function observed(value, label) {
	return value === undefined ? 0 : finite(value, label);
}

function residual(total, stages, label) {
	const value = total - Object.values(stages).reduce((sum, stage) => sum + stage, 0);
	if (value < -0.5) throw new Error(`${label} directly observed stages exceed the wall clock.`);
	return Math.max(0, value);
}

export function analyzeFcpSample({ wallMs, main }) {
	const totalMs = finite(wallMs, 'FCP wallMs');
	const stages = {
		mt_slice_eval: observed(main?.mtSliceEvalMs, 'mtSliceEvalMs'),
		plan_interpretation: observed(main?.firstScreenPlanMs, 'firstScreenPlanMs'),
		papi_element_creation: observed(main?.papiCreateMs, 'papiCreateMs'),
	};
	return {
		totalMs,
		stages: {
			...stages,
			layout_flush_residual: residual(totalMs, stages, 'FCP'),
		},
	};
}

export function analyzeCreateSample({ wallMs, background, main }) {
	const totalMs = finite(wallMs, 'create wallMs');
	const applyMs = observed(main?.applyMs, 'applyMs');
	const papiCreateMs = observed(main?.papiCreateMs, 'papiCreateMs');
	if (papiCreateMs > applyMs + 0.5) {
		throw new Error('create PAPI element creation exceeds the enclosing main-thread apply stage.');
	}
	const stages = {
		bg_replay: observed(background?.bgReplayMs, 'bgReplayMs'),
		wire_clone_transfer: observed(background?.dispatchMs, 'dispatchMs'),
		mt_validate: observed(main?.validateMs, 'validateMs'),
		mt_expand: observed(main?.mtExpandMs, 'mtExpandMs'),
		mt_prepare: observed(main?.prepareMs, 'prepareMs'),
		papi_element_creation: papiCreateMs,
		mt_apply_other: Math.max(0, applyMs - papiCreateMs),
		mt_ack_publication: observed(main?.ackMs, 'ackMs'),
	};
	return {
		totalMs,
		stages: {
			...stages,
			presentation_residual: residual(totalMs, stages, 'create'),
		},
	};
}

function numericRecord(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object.`);
	}
	const record = {};
	for (const key of Object.keys(value)) record[key] = finite(value[key], `${label}.${key}`);
	return record;
}

export function parseRealmSnapshots(snapshots) {
	if (!Array.isArray(snapshots)) throw new TypeError('realm snapshots must be an array.');
	let background = null;
	let main = null;
	for (const snapshot of snapshots) {
		if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
			throw new TypeError('realm snapshot must be an object.');
		}
		const kind = snapshot.kind;
		if (kind !== 'worker' && kind !== 'frame')
			throw new TypeError(`unknown realm kind ${String(kind)}.`);
		if (snapshot.profile === null || snapshot.profile === undefined) continue;
		const parsed = numericRecord(snapshot.profile, `${kind} profile`);
		if (kind === 'worker') background = parsed;
		else main = parsed;
	}
	return { background, main };
}

function stat(values) {
	const sorted = values.map((value) => finite(value, 'sample')).sort((a, b) => a - b);
	if (sorted.length === 0) throw new Error('cannot summarize an empty sample.');
	const middle = Math.floor(sorted.length / 2);
	const median =
		sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
	return {
		median,
		min: sorted[0],
		max: sorted.at(-1),
		spread: sorted.at(-1) - sorted[0],
		n: sorted.length,
	};
}

export function summarizeSamples(samples, comparisons = {}) {
	requireMinimumRepetitions(samples.length);
	const total = stat(samples.map((sample) => sample.totalMs));
	const stageNames = Object.keys(samples[0].stages);
	const stages = {};
	for (const name of stageNames) {
		const summary = stat(samples.map((sample) => sample.stages[name]));
		stages[name] = { ...summary, share: total.median === 0 ? 0 : summary.median / total.median };
	}
	const ratios = {};
	for (const [name, values] of Object.entries(comparisons)) {
		const comparison = stat(values);
		ratios[name] = comparison.median === 0 ? null : total.median / comparison.median;
	}
	return { total, stages, ratios };
}
