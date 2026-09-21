// Shared lifecycle contract for the canonical timing harness and work guards.
// perSamplePre: the op consumes its pre-state (empty / fresh 1k), so the pre
// step re-runs (untimed) before EVERY sample. inner: timed-window inner-loop
// count (sample = total / inner) for ops that are sub-millisecond on the
// fine-grained targets. expect: exact __fx deltas (h is sign-checked only —
// its magnitude is row-height dependent). expect.renders: the window.__renders
// row-body invocation delta — asserted only on VDOM_TARGETS (fine-grained
// targets never re-invoke row bodies and are not instrumented), and absent on
// remove_100_scattered where an equal-props skip on the 900 survivors is
// legitimate divergence rather than measurement fraud. rowsAfter: tbody tr
// count gate.
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
			renders: { row: 1000 },
		},
	},
	{
		name: 'update_nodeps',
		pre: '__toFresh1k',
		op: '__opUpdateNodeps',
		perSamplePre: false,
		inner: 10,
		rowsAfter: 1000,
		expect: {
			mounts: 0,
			cleanups: 0,
			refs: 0,
			refCleanups: 0,
			layouts: 0,
			hPositive: false,
			renders: { row: 1000 },
		},
	},
	{
		name: 'update_deps',
		pre: '__toFresh1k',
		op: '__opUpdateDeps',
		perSamplePre: false,
		inner: 10,
		rowsAfter: 1000,
		expect: {
			mounts: 0,
			cleanups: 0,
			refs: 0,
			refCleanups: 0,
			layouts: 100,
			hPositive: true,
			renders: { row: 1000 },
		},
	},
	{
		name: 'clear',
		pre: '__toFresh1k',
		op: '__opClear',
		perSamplePre: true,
		inner: 1,
		rowsAfter: 0,
		expect: {
			mounts: 0,
			cleanups: 1000,
			refs: 0,
			refCleanups: 1000,
			layouts: 0,
			hPositive: false,
			renders: { row: 0 },
		},
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
			renders: { row: 1000 },
		},
	},
	{
		name: 'remove_100_scattered',
		pre: '__toFresh1k',
		op: '__opRemove100',
		perSamplePre: true,
		inner: 1,
		rowsAfter: 900,
		// No renders gate: an equal-props skip on the 900 surviving rows (a memo
		// or itemMemo region whose inputs are unchanged) is legitimate
		// divergence between targets, not measurement fraud.
		expect: { mounts: 0, cleanups: 100, refs: 0, refCleanups: 100, layouts: 0, hPositive: false },
	},
];

// The row-invocation gate's declared targets: the VDOM fixtures, whose Row
// bodies must re-invoke on every parent update now that `tick` is a real prop.
// A declared target that lacks window.__renders fails the gate — a missing
// probe is a fixture defect, not an exemption. The fine-grained targets
// (solid, ripple, vue-vapor, svelte) are deliberately uninstrumented: they
// never re-invoke row bodies by design.
export const VDOM_TARGETS = new Set(['octane-tsrx', 'octane-jsx', 'react', 'preact', 'inferno']);

export function effectGateErrors(got, op, checkRenders = false) {
	const errs = [];
	for (const k of ['mounts', 'cleanups', 'refs', 'refCleanups', 'layouts']) {
		if (got.fx[k] !== op.expect[k]) errs.push(`${k}: expected ${op.expect[k]}, got ${got.fx[k]}`);
	}
	if (op.expect.hPositive ? !(got.fx.h > 0) : got.fx.h !== 0) {
		errs.push(`h: expected ${op.expect.hPositive ? '> 0' : '0'}, got ${got.fx.h}`);
	}
	if (got.rows !== op.rowsAfter) errs.push(`rows: expected ${op.rowsAfter}, got ${got.rows}`);
	if (checkRenders) {
		if (!got.renders) {
			errs.push('renders: window.__renders probe missing on a declared VDOM target');
		} else if (op.expect.renders) {
			for (const k of Object.keys(op.expect.renders)) {
				if (got.renders[k] !== op.expect.renders[k]) {
					errs.push(`renders.${k}: expected ${op.expect.renders[k]}, got ${got.renders[k]}`);
				}
			}
		}
	}
	return errs;
}
