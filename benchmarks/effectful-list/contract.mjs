// Shared lifecycle contract for the canonical timing harness and work guards.
// perSamplePre: the op consumes its pre-state (empty / fresh 1k), so the pre
// step re-runs (untimed) before EVERY sample. inner: timed-window inner-loop
// count (sample = total / inner) for ops that are sub-millisecond on the
// fine-grained targets. expect: exact __fx deltas (h is sign-checked only —
// its magnitude is row-height dependent). rowsAfter: tbody tr count gate.
export const OPS = [
	{
		name: 'mount_1k',
		pre: '__toEmpty',
		op: '__opMount1k',
		perSamplePre: true,
		inner: 1,
		rowsAfter: 1000,
		expect: {
			mounts: 1000,
			cleanups: 0,
			refs: 1000,
			refCleanups: 0,
			layouts: 100,
			hPositive: true,
		},
	},
	{
		name: 'update_nodeps',
		pre: '__toFresh1k',
		op: '__opUpdateNodeps',
		perSamplePre: false,
		inner: 10,
		rowsAfter: 1000,
		expect: { mounts: 0, cleanups: 0, refs: 0, refCleanups: 0, layouts: 0, hPositive: false },
	},
	{
		name: 'update_deps',
		pre: '__toFresh1k',
		op: '__opUpdateDeps',
		perSamplePre: false,
		inner: 10,
		rowsAfter: 1000,
		expect: { mounts: 0, cleanups: 0, refs: 0, refCleanups: 0, layouts: 100, hPositive: true },
	},
	{
		name: 'clear',
		pre: '__toFresh1k',
		op: '__opClear',
		perSamplePre: true,
		inner: 1,
		rowsAfter: 0,
		expect: { mounts: 0, cleanups: 1000, refs: 0, refCleanups: 1000, layouts: 0, hPositive: false },
	},
	{
		name: 'remount',
		pre: '__toFresh1k',
		op: '__opRemount',
		perSamplePre: false, // self-sustaining: each remount replaces 1000 with 1000 new keys
		inner: 1,
		rowsAfter: 1000,
		expect: {
			mounts: 1000,
			cleanups: 1000,
			refs: 1000,
			refCleanups: 1000,
			layouts: 100,
			hPositive: true,
		},
	},
	{
		name: 'remove_100_scattered',
		pre: '__toFresh1k',
		op: '__opRemove100',
		perSamplePre: true,
		inner: 1,
		rowsAfter: 900,
		expect: { mounts: 0, cleanups: 100, refs: 0, refCleanups: 100, layouts: 0, hPositive: false },
	},
];

export function effectGateErrors(got, op) {
	const errs = [];
	for (const k of ['mounts', 'cleanups', 'refs', 'refCleanups', 'layouts']) {
		if (got.fx[k] !== op.expect[k]) errs.push(`${k}: expected ${op.expect[k]}, got ${got.fx[k]}`);
	}
	if (op.expect.hPositive ? !(got.fx.h > 0) : got.fx.h !== 0) {
		errs.push(`h: expected ${op.expect.hPositive ? '> 0' : '0'}, got ${got.fx.h}`);
	}
	if (got.rows !== op.rowsAfter) errs.push(`rows: expected ${op.rowsAfter}, got ${got.rows}`);
	return errs;
}
