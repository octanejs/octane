/**
 * Hydration probe gate (#2028). Runs the hydration suites with
 * OCTANE_HYDRATION_PROBE_AUDIT set, so the development runtime reports every
 * place it probes the server DOM for a range or adopts server nodes outside a
 * range of their own (auditHydrationProbe in runtime.ts, counted by
 * packages/octane/tests/_hydration-probe-audit.ts). Misses are summed by the
 * mount-path family that made them and compared with BUDGET below: the gate
 * fails when a family exceeds its budget, or when a probe belongs to no family.
 *
 * Each step of the hydration cursor redesign makes its family's probes strict
 * and takes that budget to 0. A budget rises only when a protocol change moves
 * misses from one family to another, which that change's commit says.
 *
 *   node scripts/hydration-probe-audit.mjs [--report] [-- vitest args…]
 *
 * --report prints every missing probe site with its count.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SUITES = [
	'packages/octane/tests/hydration',
	'packages/octane/tests/conformance',
	'packages/octane/tests/streaming-ssr.test.ts',
	'packages/octane/tests/signals-hydration.test.ts',
	'packages/octane/tests/ssr-rejection-hydration-fidelity.test.ts',
];

// The function that asked for a probe names its family: the probe's caller, or
// for a fallback (`inPlace`, `lend`, …) the site that made it. Stack frames
// name methods `Class.method`.
const FAMILIES = {
	// A component's returned value (#2028 commit 2).
	returned: ['renderReturnedValue'],
	// De-opt descriptor lists (commit 3).
	descriptors: ['deoptItemBody', 'renderPreparedChildList', 'buildsList'],
	// Strong, lite and void component calls (commit 5).
	components: ['componentSlotImpl', 'componentSlotLite'],
	// Compiled template roots, renderable and text holes, lists and branches (commit 6).
	templates: ['claimRoots'],
	holes: ['childSlot', 'hydrateOnlyChild', 'unclaimedText', 'adoptBindingText'],
	lists: ['mountItem', 'forBlock'],
	branches: ['branchOpen', 'renderBranchSlot', 'activityBlock'],
	// Root entry and `<Hydrate>` islands (commit 10a).
	roots: [
		// A passthrough root's lists (range-boundary.test.ts) go with its root.
		'mountPassthroughListItem',
		'hydrateRootWithOutputHandler',
		'createHydrateSlot',
		'rootSlot',
		'adopt',
		'retry',
	],
};

// Misses per family over SUITES at the commit that last lowered each budget.
const BUDGET = {
	returned: 0,
	descriptors: 0,
	components: 0,
	templates: 0,
	holes: 0,
	lists: 0,
	branches: 0,
	// A passthrough root and its lists, which own no server range above their
	// owner (HYDRATION_RANGE_BOUNDARY), place their items by the cursor.
	roots: 104,
};

const OWNER = new Map();
for (const [family, names] of Object.entries(FAMILIES))
	for (const name of names) OWNER.set(name, family);

/** The family of one record: its caller's, else its probing site's. */
function familyOf(record) {
	for (const frame of [record.caller, record.site]) {
		const family = OWNER.get(frame.slice(frame.lastIndexOf('.') + 1));
		if (family !== undefined) return family;
	}
	return null;
}

const args = process.argv.slice(2);
const report = args.includes('--report');
const separator = args.indexOf('--');
const vitestArgs = separator === -1 ? [] : args.slice(separator + 1);

const dir = mkdtempSync(path.join(tmpdir(), 'hydration-probes-'));
const out = path.join(dir, 'probes.jsonl');
try {
	const run = spawnSync(
		path.join(ROOT, 'node_modules/.bin/vitest'),
		['run', ...SUITES, '--project', 'octane', '--reporter=dot', ...vitestArgs],
		{ cwd: ROOT, stdio: 'inherit', env: { ...process.env, OCTANE_HYDRATION_PROBE_AUDIT: out } },
	);
	// A failing test still reports the probes it made; the gate judges only those.
	if (run.status !== 0) console.error('hydration-probe-audit: some audited tests failed.');
	const misses = new Map(Object.keys(BUDGET).map((family) => [family, 0]));
	const sites = new Map();
	let unowned = 0;
	let lines = '';
	try {
		lines = readFileSync(out, 'utf8');
	} catch {}
	for (const line of lines.split('\n')) {
		if (line === '') continue;
		const { file, records } = JSON.parse(line);
		for (const record of records) {
			if (record.hit) continue;
			const family = familyOf(record);
			if (family === null) unowned += record.count;
			else misses.set(family, misses.get(family) + record.count);
			const key = `${family ?? '(none)'}\t${record.kind}\t${record.site} ← ${record.caller}`;
			const site = sites.get(key) ?? { count: 0, files: new Set() };
			site.count += record.count;
			site.files.add(path.relative(path.join(ROOT, 'packages/octane/tests'), file));
			sites.set(key, site);
		}
	}
	if (report) {
		for (const [key, { count, files }] of [...sites].sort((a, b) => b[1].count - a[1].count))
			console.log(`${count}\t${key}\t(${files.size} files: ${[...files].slice(0, 4).join(', ')})`);
		console.log('');
	}
	let failed = unowned !== 0;
	for (const [family, count] of misses) {
		const over = count > BUDGET[family];
		failed ||= over;
		console.log(`${over ? 'FAIL' : 'ok  '}  ${family.padEnd(12)} ${count} / ${BUDGET[family]}`);
	}
	if (unowned !== 0) console.log(`FAIL  probes outside every family: ${unowned}`);
	process.exit(failed ? 1 : 0);
} finally {
	rmSync(dir, { recursive: true, force: true });
}
