import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const benchmarkRoot = import.meta.dirname;
const appRoot = path.join(benchmarkRoot, 'app');
const appSource = fs.readFileSync(path.join(appRoot, 'src/App.lynx.tsrx'), 'utf8');
const entrySource = fs.readFileSync(path.join(appRoot, 'src/index.ts'), 'utf8');
const data = await import('./app/src/data.ts');
const build = await import('./scripts/build-app.mjs');

function findNestedBlock(source, anchor) {
	const anchorStart = source.indexOf(anchor);
	assert.notEqual(anchorStart, -1, `missing block anchor: ${anchor}`);
	const blockStart = source.indexOf('{', anchorStart + anchor.length);
	assert.notEqual(blockStart, -1, `missing block start after: ${anchor}`);

	let depth = 0;
	for (let index = blockStart; index < source.length; index++) {
		if (source[index] === '{') depth += 1;
		if (source[index] !== '}') continue;
		depth -= 1;
		if (depth === 0) {
			return { body: source.slice(blockStart + 1, index), start: blockStart, end: index };
		}
	}

	assert.fail(`missing block end after: ${anchor}`);
}

test('authors a bounded workload through the native recycled-list contract', () => {
	assert.equal(data.FIXTURE_ROLE, 'bounded-native-list');
	assert.equal(data.FIXTURE_ID, 'octane-lynx-bounded-list-v1');
	assert.equal(data.LOGICAL_ROW_COUNT, 10_000);
	assert.deepEqual(
		[data.VIEWPORT_WIDTH_PX, data.VIEWPORT_HEIGHT_PX, data.ESTIMATED_ROW_HEIGHT_PX],
		[390, 640, 40],
	);
	assert.equal(data.LIST_BUFFER_ROWS, 2);
	assert.deepEqual(data.LIST_CASE_IDS, ['list-startup', 'list-recycle', 'list-fling']);
	assert.equal(data.ROWS.length, 10_000);
	assert.deepEqual(data.ROWS[0], { id: 'row-0', index: 0, label: 'Row 0' });
	assert.deepEqual(data.ROWS.at(-1), {
		id: 'row-9999',
		index: 9999,
		label: 'Row 9999',
	});

	assert.match(appSource, /<list\b[\s\S]*?preload-buffer-count=\{LIST_BUFFER_ROWS\}[\s\S]*?>/);
	assert.match(appSource, /@for \(const row of ROWS; key row\.id\)/);
	assert.match(
		appSource,
		/<list-item\b[\s\S]*?item-key=\{row\.id\}[\s\S]*?reuse-identifier="bounded-row"[\s\S]*?estimated-main-axis-size-px=\{ESTIMATED_ROW_HEIGHT_PX\}/,
	);
	assert.match(appSource, /bindscroll=\{captureScroll\}/);
	assert.match(appSource, /bindlayoutcomplete=\{captureLayout\}/);
	assert.match(appSource, /__LYNX_BOUNDED_LIST_CHECKPOINT__/);
	assert.doesNotMatch(appSource, /<view\b[^>]*class="rows"/);
	assert.equal((appSource.match(/<list-item\b/g) ?? []).length, 1);
});

test('binds the exact supported scale into distinct compile-time Native artifacts', () => {
	assert.deepEqual(build.SUPPORTED_LOGICAL_ROW_COUNTS, [1_000, 10_000]);
	assert.equal(build.resolveListLogicalRowCount('1000'), 1_000);
	assert.equal(build.resolveListLogicalRowCount('10000'), 10_000);
	for (const value of ['', '0', '1001', '01000', '1e3', '1000.0', 'ten-thousand']) {
		assert.throws(
			() => build.resolveListLogicalRowCount(value),
			/BENCH_LIST_ROWS must be exactly 1000 or 10000/,
		);
	}

	const buildSource = fs.readFileSync(path.join(benchmarkRoot, 'scripts/build-app.mjs'), 'utf8');
	assert.match(buildSource, /BENCH_LIST_ROWS/);
	assert.match(buildSource, /dist', `rows-\$\{logicalRowCount\}`/);
	assert.match(buildSource, /dataSource\.replace\(/);
	assert.doesNotMatch(appSource, /BENCH_LIST_ROWS|logicalRowCount\s*=/);
	assert.doesNotMatch(entrySource, /BENCH_LIST_ROWS|logicalRowCount\s*=/);
});

test('publishes semantic list checkpoints and teardown without claiming device allocation', () => {
	const checkpoint = data.createListSemanticCheckpoint('list-recycle', {
		scrollTop: 20_480,
		attachedCells: [
			{ index: 514, itemKey: 'row-514' },
			{ index: 512, itemKey: 'row-512' },
			{ index: 513, itemKey: 'row-513' },
		],
	});
	assert.deepEqual(
		checkpoint.attachedRows.map(({ index, itemKey, expectedItemKey, label }) => ({
			index,
			itemKey,
			expectedItemKey,
			label,
		})),
		[
			{ index: 512, itemKey: 'row-512', expectedItemKey: 'row-512', label: 'Row 512' },
			{ index: 513, itemKey: 'row-513', expectedItemKey: 'row-513', label: 'Row 513' },
			{ index: 514, itemKey: 'row-514', expectedItemKey: 'row-514', label: 'Row 514' },
		],
	);
	assert.deepEqual(checkpoint.semantics, {
		valid: true,
		keysMatch: true,
		indicesUnique: true,
		contiguous: true,
		startupAnchorPresent: true,
	});
	assert.equal(data.createListSemanticCheckpoint('list-startup', null), undefined);
	assert.equal(
		data.createListSemanticCheckpoint('list-startup', {
			scrollTop: 400,
			attachedCells: [{ index: 10, itemKey: 'row-10' }],
		}).semantics.valid,
		false,
	);
	assert.ok(!('physicalCells' in checkpoint));
	assert.ok(!('nativeCellAllocations' in checkpoint));
	assert.ok(!('peakLive' in checkpoint));
	assert.match(appSource, /__LYNX_BOUNDED_LIST_CHECKPOINT__/);
	assert.match(appSource, /createListSemanticCheckpoint\(caseId, observation\)/);

	assert.match(entrySource, /__LYNX_BOUNDED_LIST_TEARDOWN__/);
	const teardownBody = findNestedBlock(entrySource, 'async () =>').body;
	assert.match(teardownBody, /await root\.unmount\(\)/);
	assert.match(teardownBody, /__LYNX_BOUNDED_LIST_TEARDOWN_RECEIPT__/);
	assert.match(teardownBody, /complete: true/);
});

test('keeps startup publication behind render ACK, two frames, and an observed list checkpoint', () => {
	const renderGuard = findNestedBlock(
		entrySource,
		"if (rendering !== null && typeof rendering === 'object' && 'then' in rendering)",
	);
	const renderAckBody = findNestedBlock(renderGuard.body, 'void rendering.then(').body;
	const firstFrame = findNestedBlock(renderAckBody, 'benchmarkGlobal.lynx.requestAnimationFrame(');
	const secondFrame = findNestedBlock(
		firstFrame.body,
		'benchmarkGlobal.lynx.requestAnimationFrame(',
	);
	const checkpointRead = secondFrame.body.indexOf(
		"__LYNX_BOUNDED_LIST_CHECKPOINT__?.('list-startup')",
	);
	const missingCheckpoint = findNestedBlock(secondFrame.body, 'if (postState === undefined)');
	const receiptDeclaration = secondFrame.body.indexOf('const receipt: NativeStartupReceipt =');
	const publication = secondFrame.body.indexOf('__LYNX_BENCH_STARTUP__ = receipt');

	assert.notEqual(checkpointRead, -1);
	assert.ok(checkpointRead < missingCheckpoint.start);
	assert.ok(missingCheckpoint.end < receiptDeclaration);
	assert.ok(receiptDeclaration < publication);
	assert.match(missingCheckpoint.body, /__LYNX_BENCH_ERROR__/);
	assert.match(missingCheckpoint.body, /\breturn;/);
	assert.match(secondFrame.body, /protocol: 'lynx-native-startup-v1'/);
	assert.match(secondFrame.body, /kind: 'octane-root\.render'/);
	assert.match(secondFrame.body, /acknowledged: true/);
	assert.match(secondFrame.body, /renderEvidence: \{ kind: 'native-animation-frame', frames: 2 \}/);
	assert.match(renderGuard.body, /},\s*reportRenderFailure,?\s*\);/);

	const failureBody = findNestedBlock(entrySource, 'function reportRenderFailure').body;
	assert.match(failureBody, /native-list-unavailable/);
	assert.match(failureBody, /status: 'not-measured'/);
	assert.match(failureBody, /__LYNX_BENCH_UNSUPPORTED__/);
	assert.doesNotMatch(failureBody, /render|fallback|<view/);
});

test('keeps the bounded fixture independently buildable and workspace-addressable', () => {
	const packageJson = JSON.parse(fs.readFileSync(path.join(benchmarkRoot, 'package.json'), 'utf8'));
	assert.equal(packageJson.name, 'octane-lynx-list-bench');
	assert.equal(packageJson.private, true);
	assert.equal(packageJson.scripts.test, 'node --test native-fixture.test.mjs');
	assert.equal(packageJson.scripts['build:app'], 'node scripts/build-app.mjs');
	const workspaceSource = fs.readFileSync(
		path.join(benchmarkRoot, '../../pnpm-workspace.yaml'),
		'utf8',
	);
	assert.match(workspaceSource, /^  - benchmarks\/lynx-list$/m);

	const configSource = fs.readFileSync(path.join(appRoot, 'lynx.config.mjs'), 'utf8');
	assert.match(configSource, /mode: 'production'/);
	assert.match(configSource, /lynx:\s*\{\}/);
	assert.doesNotMatch(configSource, /\bweb:\s*\{\}/);

	const buildSource = fs.readFileSync(path.join(benchmarkRoot, 'scripts/build-app.mjs'), 'utf8');
	assert.match(buildSource, /lynx-list-bench/);
	assert.match(buildSource, /'--environment', 'lynx'/);
	assert.match(buildSource, /main\.lynx\.bundle/);
});
