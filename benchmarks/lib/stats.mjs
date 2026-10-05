// Shared benchmark statistics.
//
// Benchmark.js reports hz from the arithmetic mean period and carries a 95%
// relative margin of error beside it. Our UI workloads are latency benches
// rather than tight ops/sec loops, so the headline `score` below is the mean of
// a late stable window. That keeps sample order visible enough to catch residual
// JIT warmup while retaining median/min/p95 as distribution diagnostics.

const T_CRITICAL_95 = {
	1: 12.706,
	2: 4.303,
	3: 3.182,
	4: 2.776,
	5: 2.571,
	6: 2.447,
	7: 2.365,
	8: 2.306,
	9: 2.262,
	10: 2.228,
	11: 2.201,
	12: 2.179,
	13: 2.16,
	14: 2.145,
	15: 2.131,
	16: 2.12,
	17: 2.11,
	18: 2.101,
	19: 2.093,
	20: 2.086,
	21: 2.08,
	22: 2.074,
	23: 2.069,
	24: 2.064,
	25: 2.06,
	26: 2.056,
	27: 2.052,
	28: 2.048,
	29: 2.045,
	30: 2.042,
	infinity: 1.96,
};

function finiteNumbers(samples) {
	const values = Array.from(samples, Number).filter(Number.isFinite);
	if (values.length === 0) throw new Error('cannot summarize an empty sample set');
	return values;
}

function percentile(sorted, p) {
	return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function statsFor(values, start = 0) {
	const sorted = [...values].sort((a, b) => a - b);
	const n = sorted.length;
	const mean = values.reduce((sum, v) => sum + v, 0) / n;
	const variance = n > 1 ? values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1) : 0;
	const sd = Math.sqrt(variance);
	const sem = sd / Math.sqrt(n);
	const df = n - 1;
	const critical = T_CRITICAL_95[Math.round(df)] ?? T_CRITICAL_95.infinity;
	const moe = sem * critical;
	const rme = mean === 0 ? 0 : (moe / mean) * 100;
	return {
		start,
		samples: n,
		mean,
		median: sorted[n >> 1],
		min: sorted[0],
		p95: percentile(sorted, 0.95),
		p99: percentile(sorted, 0.99),
		variance,
		sd,
		stddev: sd,
		sem,
		moe,
		rme,
	};
}

function pickSteadyWindow(values, options) {
	const all = statsFor(values);
	if (options.scoreMode === 'mean') return { ...all, scoreKind: 'mean' };
	const minSamples = options.minSamplesForScore ?? 5;
	if (values.length < minSamples) return { ...all, scoreKind: 'median' };

	const fraction = options.windowFraction ?? 0.4;
	const minWindow = options.minWindow ?? 5;
	const tolerance = options.warmTolerance ?? 1.08;
	const windowSize = Math.min(
		values.length,
		Math.max(minWindow, Math.ceil(values.length * fraction)),
	);
	if (windowSize >= values.length) return { ...all, scoreKind: 'mean' };

	const means = new Float64Array(values.length - windowSize + 1);
	let sum = 0;
	for (let i = 0; i < windowSize; i++) sum += values[i];
	means[0] = sum / windowSize;
	let bestMean = means[0];

	for (let start = 1; start < means.length; start++) {
		sum += values[start + windowSize - 1] - values[start - 1];
		means[start] = sum / windowSize;
		if (means[start] < bestMean) bestMean = means[start];
	}

	let selectedStart = means.length - 1;
	while (selectedStart > 0 && means[selectedStart] > bestMean * tolerance) {
		selectedStart--;
	}
	return {
		...statsFor(values.slice(selectedStart, selectedStart + windowSize), selectedStart),
		scoreKind: 'mean',
	};
}

export function summarizeSamples(samples, options = {}) {
	const values = finiteNumbers(samples);
	const all = statsFor(values);
	const steady = pickSteadyWindow(values, options);
	const score = steady.scoreKind === 'median' ? all.median : steady.mean;
	const early = statsFor(values.slice(0, steady.samples));
	const warmupRatio = steady.scoreKind === 'median' || score === 0 ? 1 : early.mean / score;
	return {
		score,
		scoreKind: steady.scoreKind,
		scoreMedian: steady.median,
		scoreRme: steady.rme,
		scoreStart: steady.start,
		scoreSamples: steady.samples,
		warmupRatio,
		median: all.median,
		min: all.min,
		p95: all.p95,
		p99: all.p99,
		mean: all.mean,
		sd: all.sd,
		stddev: all.stddev,
		variance: all.variance,
		sem: all.sem,
		moe: all.moe,
		rme: all.rme,
		samples: all.samples,
	};
}

export function scoreOf(stat) {
	if (!stat) return null;
	const value = stat.score ?? stat.median;
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function timingStatForJson(stat, options = {}) {
	const out = {
		score: stat.score,
		median: stat.median,
		min: stat.min,
		mean: stat.mean,
		p95: stat.p95,
		sd: stat.sd ?? stat.stddev,
		rme: stat.rme,
		scoreRme: stat.scoreRme,
		warmupRatio: stat.warmupRatio,
		samples: stat.samples,
	};
	if (options.p99 && Number.isFinite(stat.p99)) out.p99 = stat.p99;
	if (Number.isFinite(stat.opsPerSec)) out.opsPerSec = stat.opsPerSec;
	return out;
}

// Paired A/B comparison. Sample i of `base` and sample i of `head` were taken
// back to back in one browser, so drift on a shared runner moves both sides of a
// pair together and cancels in their ratio. Returns the median head/base ratio
// with a percentile-bootstrap 95% confidence interval over the pairs. The
// bootstrap makes no normality assumption, and its fixed seed makes one set of
// samples always produce the same interval.
export function pairedRatio(base, head, { resamples = 2000, seed = 0x9e3779b9 } = {}) {
	const before = finiteNumbers(base);
	const after = finiteNumbers(head);
	if (before.length !== after.length || before.length < 2) {
		throw new Error(`paired comparison needs equal sample counts of at least 2`);
	}
	// performance.now() can read 0 for a sub-tick sample; keep every log finite.
	const floor = (value) => Math.max(value, 1e-3);
	const logs = before.map((value, i) => Math.log(floor(after[i]) / floor(value)));
	const median = (values) => {
		const sorted = Float64Array.from(values).sort();
		const middle = sorted.length >> 1;
		return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
	};
	let state = seed >>> 0;
	const random = () => {
		state = (state + 0x6d2b79f5) | 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
	const medians = new Float64Array(resamples);
	const draw = new Float64Array(logs.length);
	for (let r = 0; r < resamples; r++) {
		for (let i = 0; i < logs.length; i++) draw[i] = logs[Math.floor(random() * logs.length)];
		medians[r] = median(draw);
	}
	medians.sort();
	return {
		ratio: Math.exp(median(logs)),
		low: Math.exp(medians[Math.floor(resamples * 0.025)]),
		high: Math.exp(medians[Math.ceil(resamples * 0.975) - 1]),
		pairs: logs.length,
	};
}
