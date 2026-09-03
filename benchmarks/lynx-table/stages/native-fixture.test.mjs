import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const benchmarkRoot = path.resolve(import.meta.dirname, '..');
const appRoot = path.join(benchmarkRoot, 'app/src');
const appSource = fs.readFileSync(path.join(appRoot, 'App.lynx.tsrx'), 'utf8');

function findNestedBlock(source, anchor) {
	const anchorStart = source.indexOf(anchor);
	assert.notEqual(anchorStart, -1, `missing block anchor: ${anchor}`);
	const blockStart = source.indexOf('{', anchorStart + anchor.length);
	assert.notEqual(blockStart, -1, `missing block start after: ${anchor}`);

	let depth = 0;
	for (let i = blockStart; i < source.length; i++) {
		if (source[i] === '{') depth += 1;
		if (source[i] !== '}') continue;
		depth -= 1;
		if (depth === 0) {
			return { body: source.slice(blockStart + 1, i), start: blockStart, end: i };
		}
	}

	assert.fail(`missing block end after: ${anchor}`);
}

function extractNestedBlock(source, anchor) {
	return findNestedBlock(source, anchor).body;
}

test('runs the real table workload when Native does not expose MessageChannel', () => {
	const output = execFileSync(
		process.execPath,
		[
			'--import=data:text/javascript,delete%20globalThis.MessageChannel',
			path.join(benchmarkRoot, 'run.mjs'),
			'1',
		],
		{
			cwd: path.resolve(benchmarkRoot, '../..'),
			encoding: 'utf8',
			env: { ...process.env, LYNX_TABLE_SCALES: '1000' },
		},
	);

	assert.match(output, /rows=\s*1000/);
	assert.match(output, /updateStorm=50c\/5000/);
	assert.match(output, /selectStorm=30c\/60/);
});

test('keeps the eager table controls and Native element topology stable', () => {
	const visibleCreateControls = [
		...appSource.matchAll(
			/bindtap=\{(\w+)\}>\s*<text class="btn-text">\{'Create ([\d,]+) rows'\}<\/text>/g,
		),
	].map(([, handler, label]) => ({
		handler,
		rows: Number(label.replaceAll(',', '')),
	}));

	assert.deepEqual(visibleCreateControls, [
		{ handler: 'run', rows: 1000 },
		{ handler: 'run3k', rows: 3000 },
		{ handler: 'run5k', rows: 5000 },
		{ handler: 'runLots', rows: 10000 },
		{ handler: 'run20k', rows: 20000 },
		{ handler: 'run30k', rows: 30000 },
	]);
	for (const { handler, rows } of visibleCreateControls) {
		const buildArgument = rows === 1000 ? '' : String(rows);
		const handlerBody = extractNestedBlock(appSource, `const ${handler} = useCallback`);
		assert.match(handlerBody, new RegExp(`setRows\\(buildData\\(${buildArgument}\\)\\)`));
	}
	assert.match(
		appSource,
		/<view class="rows">\s*@for \(const row of rows; key row\.id\) \{\s*<Row row=\{row\}[\s\S]*?<\/view>/,
	);

	const rowStart = appSource.indexOf('function Row');
	const appStart = appSource.indexOf('export function App');
	assert.notEqual(rowStart, -1);
	assert.notEqual(appStart, -1);
	const rowTemplate = appSource.slice(rowStart, appStart);
	const chromeTemplate = appSource.slice(appSource.indexOf('<view class="page">', appStart));
	const rowViews = (rowTemplate.match(/<view\b/g) ?? []).length;
	const rowTexts = (rowTemplate.match(/<text\b/g) ?? []).length;
	const chromeViews = (chromeTemplate.match(/<view\b/g) ?? []).length;
	const chromeTexts = (chromeTemplate.match(/<text\b/g) ?? []).length;

	assert.deepEqual({ views: rowViews, texts: rowTexts }, { views: 1, texts: 3 });
	assert.deepEqual({ views: chromeViews, texts: chromeTexts }, { views: 15, texts: 13 });
	assert.equal((chromeTemplate.match(/<Row\b/g) ?? []).length, 1);

	// Lynx counts a text host and its text child separately. The renderer-owned
	// root contributes the remaining fixed element outside the authored chrome.
	const nativeElementsPerRow = rowViews + rowTexts * 2;
	const nativeChromeElements = 1 + chromeViews + chromeTexts * 2;
	const nativeElementTotal = (rows) => nativeChromeElements + rows * nativeElementsPerRow;

	assert.equal(nativeElementsPerRow, 7);
	assert.equal(nativeChromeElements, 42);
	assert.equal(nativeElementTotal(1000), 7042);
	assert.equal(nativeElementTotal(10000), 70042);
	assert.equal(nativeElementTotal(7308), 51198);
	assert.ok(!visibleCreateControls.some(({ rows }) => rows === 7308));
});

test('keeps the Native startup receipt behind render ACK, two frames, and semantic state', () => {
	const entry = fs.readFileSync(path.join(appRoot, 'index.ts'), 'utf8');
	const renderAckBody = extractNestedBlock(entry, 'void rendering.then(');
	const firstFrameBody = extractNestedBlock(renderAckBody, 'lynx.requestAnimationFrame(');
	const secondFrameBody = extractNestedBlock(firstFrameBody, 'lynx.requestAnimationFrame(');
	const snapshotRead = secondFrameBody.indexOf('__LYNX_BENCH_SNAPSHOT__?.()');
	const missingSnapshotBlock = findNestedBlock(secondFrameBody, 'if (postState === undefined)');
	const receiptDeclaration = secondFrameBody.indexOf('const receipt: NativeStartupReceipt =');
	const receiptBlock = findNestedBlock(secondFrameBody, 'const receipt: NativeStartupReceipt =');
	const receiptPublication = secondFrameBody.indexOf('__LYNX_BENCH_STARTUP__ = receipt');
	const commitAck = renderAckBody.indexOf('commitAckMs = Date.now()');
	const firstFrame = renderAckBody.indexOf('lynx.requestAnimationFrame(');

	assert.notEqual(commitAck, -1);
	assert.ok(commitAck < firstFrame);
	assert.notEqual(snapshotRead, -1);
	assert.ok(snapshotRead < missingSnapshotBlock.start);
	assert.ok(missingSnapshotBlock.end < receiptDeclaration);
	assert.ok(receiptBlock.end < receiptPublication);
	assert.match(missingSnapshotBlock.body, /__LYNX_BENCH_ERROR__/);
	assert.match(missingSnapshotBlock.body, /\breturn;/);
	assert.match(receiptBlock.body, /\bpostState,/);
	assert.match(secondFrameBody, /protocol: 'lynx-native-startup-v1'/);
	assert.match(secondFrameBody, /kind: 'octane-root\.render'/);
	assert.match(secondFrameBody, /acknowledged: true/);
	assert.match(secondFrameBody, /renderEvidence: \{ kind: 'native-animation-frame', frames: 2 \}/);
	assert.equal((entry.match(/__LYNX_BENCH_STARTUP__ = receipt/g) ?? []).length, 1);
	for (const [field, expression] of Object.entries({
		rowCount: 'current.length',
		firstId: 'current[0]?.id ?? null',
		secondId: 'current[1]?.id ?? null',
		thirdId: 'current[2]?.id ?? null',
		row998Id: 'current[998]?.id ?? null',
		firstLabel: 'current[0]?.label ?? null',
		selectedId: 'selectedRef.current ?? null',
	})) {
		assert.ok(appSource.includes(`${field}: ${expression}`), `missing ${field} snapshot evidence`);
	}
});
